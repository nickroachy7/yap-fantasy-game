/**
 * balldontlie NFL adapter — the ONLY file that knows this vendor exists.
 * Everything else depends on `StatsProvider`. See stats-provider.ts.
 *
 * Vendor facts encoded here, all verified against the live API on 2026-08-17:
 *   - Base is /nfl/v1. Auth is a bare `Authorization: <key>` (no "Bearer").
 *   - Pagination is cursor-based via meta.next_cursor, per_page max 100.
 *   - /stats accepts game_ids[] but NOT weeks[]; only /games takes weeks[].
 *   - /stats returns no fantasy points — but /fantasy/weekly_stats DOES, and
 *     /fantasy/projections does the same for weeks not yet played. Both carry
 *     `total_points` per named scoring format. An earlier note here said
 *     "scoring is ours"; it was true of /stats and false of the API, and it is
 *     why this codebase carried a hand-written scoring engine for two weeks.
 *     See `PPR_FORMAT` below and `ProviderFantasyPoints`.
 *   - The `/fantasy/*` routes report kickers as `K`; `/players` reports the same
 *     man as `PK`. Join on player id, never on position.
 *   - Array params use the `key[]=value` repeated form.
 *   - GOAT tier is 600 req/min.
 */

import type {
  GameQuery,
  ProviderDepthRow,
  ProviderFantasyPoints,
  ProviderGame,
  ProviderInjury,
  ProviderPlayer,
  ProviderProjection,
  ProviderRanking,
  ProviderSalary,
  ProviderSeasonStat,
  ProviderStanding,
  ProviderStatLine,
  ProviderTeam,
  SalaryQuery,
  SeasonType,
  StatsProvider,
} from './stats-provider.ts';

const BASE_URL = 'https://api.balldontlie.io/nfl/v1';
const MAX_PER_PAGE = 100;
/** Stay well inside the 600/min GOAT ceiling without over-engineering caching. */
const MIN_REQUEST_INTERVAL_MS = 110;
/** Keep request URLs short enough that no proxy truncates them. */
const GAME_ID_CHUNK = 25;
const MAX_RETRIES = 4;

/**
 * The provider format we score under, chosen 2026-09-02.
 *
 * `ppr` rather than `half_ppr` or `standard` because full PPR is what this game
 * already paid — our own ruleset gave a reception a whole point — so adopting it
 * changed nothing about how a catch is valued. What it DID change is kickers
 * (theirs is 3/4/5/6 by distance, ours was a flat 3) and our three yardage
 * bonuses, which their format does not have and which we gave up to get a
 * number that can never disagree with the projection printed above it.
 *
 * A CONSTANT, NOT A SETTING. If this ever becomes configurable it has to become
 * configurable in `scoring_rules` — the table is the authority for what version
 * a stored point was computed under, and a format chosen at call time would
 * make stored rows unexplainable.
 */
const PPR_FORMAT = 'ppr';

/**
 * Pull the scored formats off a `/fantasy/*` row.
 *
 * The two endpoints spell the same array differently — `fantasy_points` on a
 * result, `projections` on a projection — which is the only difference between
 * them and is not worth two parsers.
 */
function formatPoints(row: Record<string, any>): Record<string, number> {
  const list = row.fantasy_points ?? row.projections ?? [];
  const out: Record<string, number> = {};
  for (const entry of Array.isArray(list) ? list : []) {
    const key = entry?.scoring_format?.key;
    const points = toNumber(entry?.total_points);
    if (typeof key === 'string' && points !== null) out[key] = points;
  }
  return out;
}

/**
 * The half of a `/fantasy/*` row that a result and a projection share.
 *
 * Returns null for a row with no player, which is how DST arrives — the API
 * scores 32 team defences a week and this game has no slot for one. Dropping
 * them here rather than at the call site means neither ingester has to know
 * that DST exists.
 */
function fantasyRow(row: Record<string, any>): ProviderFantasyPoints | null {
  const playerExternalId = toNumber(row?.player?.id);
  if (playerExternalId === null) return null;

  const byFormat = formatPoints(row);
  const week = toNumber(row.week);
  if (week === null) return null;

  return {
    playerExternalId,
    gameExternalId: toNumber(row?.game?.id),
    season: toNumber(row.season) ?? 0,
    week,
    points: byFormat[PPR_FORMAT] ?? null,
    byFormat,
    position: typeof row.position === 'string' ? row.position : null,
  };
}

interface PagedResponse<T> {
  data: T[];
  meta?: { next_cursor?: number | null; per_page?: number };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export class BalldontlieProvider implements StatsProvider {
  #apiKey: string;
  #lastRequestAt = 0;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('BALLDONTLIE_API_KEY is not set in Edge Function secrets.');
    }
    this.#apiKey = apiKey;
  }

  /** Serialises requests to a fixed minimum spacing, then retries on 429/5xx. */
  async #request<T>(path: string, params: URLSearchParams): Promise<PagedResponse<T>> {
    const url = `${BASE_URL}${path}?${params.toString()}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const since = Date.now() - this.#lastRequestAt;
      if (since < MIN_REQUEST_INTERVAL_MS) {
        await sleep(MIN_REQUEST_INTERVAL_MS - since);
      }
      this.#lastRequestAt = Date.now();

      const response = await fetch(url, {
        headers: { Authorization: this.#apiKey, Accept: 'application/json' },
      });

      if (response.ok) {
        return (await response.json()) as PagedResponse<T>;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_RETRIES) {
        const body = await response.text().catch(() => '');
        // Never interpolate the key into an error: these surface in logs.
        throw new Error(
          `balldontlie ${path} failed: ${response.status} ${response.statusText} ${body.slice(0, 200)}`,
        );
      }

      const retryAfter = Number(response.headers.get('retry-after'));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 2 ** attempt * 500;
      await sleep(backoff);
    }

    throw new Error(`balldontlie ${path}: exhausted retries`);
  }

  /** Walks every cursor page and returns the flattened result. */
  async #paginate<T>(path: string, params: URLSearchParams): Promise<T[]> {
    const out: T[] = [];
    let cursor: number | null | undefined;
    // Hard stop so a malformed cursor can never spin forever.
    for (let page = 0; page < 500; page++) {
      const query = new URLSearchParams(params);
      query.set('per_page', String(MAX_PER_PAGE));
      if (cursor != null) query.set('cursor', String(cursor));

      const body = await this.#request<T>(path, query);
      out.push(...(body.data ?? []));

      cursor = body.meta?.next_cursor;
      if (cursor == null) break;
    }
    return out;
  }

  async listTeams(): Promise<ProviderTeam[]> {
    const rows = await this.#paginate<Record<string, any>>('/teams', new URLSearchParams());
    return rows.map((t) => ({
      externalId: t.id,
      abbreviation: t.abbreviation,
      location: t.location ?? null,
      name: t.name ?? null,
      fullName: t.full_name ?? null,
      conference: t.conference ?? null,
      division: t.division ?? null,
    }));
  }

  async listActivePlayers(): Promise<ProviderPlayer[]> {
    const rows = await this.#paginate<Record<string, any>>('/players/active', new URLSearchParams());
    return rows.map((p) => ({
      externalId: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      position: p.position ?? null,
      positionAbbreviation: p.position_abbreviation ?? null,
      jerseyNumber: p.jersey_number ?? null,
      height: p.height ?? null,
      weight: p.weight ?? null,
      college: p.college ?? null,
      experience: p.experience ?? null,
      age: toNumber(p.age),
      teamExternalId: p.team?.id ?? null,
    }));
  }

  async listGames(query: GameQuery): Promise<ProviderGame[]> {
    const params = new URLSearchParams();
    params.append('seasons[]', String(query.season));
    params.append('season_type[]', String(query.seasonType));
    for (const week of query.weeks ?? []) {
      params.append('weeks[]', String(week));
    }

    const rows = await this.#paginate<Record<string, any>>('/games', params);
    return rows.map((g) => ({
      externalId: g.id,
      season: g.season,
      week: toNumber(g.week),
      seasonType: query.seasonType,
      homeTeamExternalId: g.home_team?.id ?? null,
      visitorTeamExternalId: g.visitor_team?.id ?? null,
      startsAt: g.date ?? null,
      status: g.status ?? null,
      statusState: g.status_state ?? null,
      homeScore: toNumber(g.home_team_score),
      visitorScore: toNumber(g.visitor_team_score),
    }));
  }

  async listStatLines(
    gameExternalIds: number[],
    seasonType: SeasonType,
  ): Promise<ProviderStatLine[]> {
    if (gameExternalIds.length === 0) return [];

    const out: ProviderStatLine[] = [];
    for (let i = 0; i < gameExternalIds.length; i += GAME_ID_CHUNK) {
      const chunk = gameExternalIds.slice(i, i + GAME_ID_CHUNK);
      const params = new URLSearchParams();
      params.set('season_type', String(seasonType));
      for (const id of chunk) params.append('game_ids[]', String(id));

      const rows = await this.#paginate<Record<string, any>>('/stats', params);
      for (const row of rows) {
        // Strip the nested entities; keep every stat key verbatim.
        const { player, team, game, ...stats } = row;
        if (!player?.id || !game?.id) continue;

        out.push({
          playerExternalId: player.id,
          gameExternalId: game.id,
          teamExternalId: team?.id ?? null,
          season: game.season,
          week: toNumber(game.week),
          seasonType,
          raw: stats,
        });
      }
    }
    return out;
  }

  async listSeasonStats(season: number): Promise<ProviderSeasonStat[]> {
    const params = new URLSearchParams();
    // Required and singular upstream: omitting it is a 400, and there is no
    // seasons[] variant, so a career is one call per season.
    params.set('season', String(season));

    const rows = await this.#paginate<Record<string, any>>('/season_stats', params);
    const out: ProviderSeasonStat[] = [];
    for (const row of rows) {
      // Strip the nested player; keep every stat key verbatim. `season` and
      // `postseason` are lifted to columns but deliberately left in raw too, so
      // a row is still self-describing if it is read on its own.
      const { player, ...stats } = row;
      if (!player?.id) continue;

      out.push({
        playerExternalId: player.id,
        season: toNumber(row.season) ?? season,
        postseason: row.postseason === true,
        gamesPlayed: toNumber(row.games_played),
        raw: stats,
      });
    }
    return out;
  }

  async listStandings(season: number): Promise<ProviderStanding[]> {
    const params = new URLSearchParams();
    params.set('season', String(season));

    const rows = await this.#paginate<Record<string, any>>('/standings', params);
    return rows
      .filter((r) => r.team?.id)
      .map((r) => ({
        teamExternalId: r.team.id,
        season: toNumber(r.season) ?? season,
        wins: toNumber(r.wins),
        losses: toNumber(r.losses),
        ties: toNumber(r.ties),
        pointsFor: toNumber(r.points_for),
        pointsAgainst: toNumber(r.points_against),
        pointDifferential: toNumber(r.point_differential),
        playoffSeed: toNumber(r.playoff_seed),
        winStreak: toNumber(r.win_streak),
        overallRecord: r.overall_record ?? null,
        conferenceRecord: r.conference_record ?? null,
        divisionRecord: r.division_record ?? null,
        homeRecord: r.home_record ?? null,
        roadRecord: r.road_record ?? null,
      }));
  }

  /**
   * What every player actually scored in a week that has been played.
   *
   * ONE REQUEST PER WEEK, walked to the last cursor — about 640 rows, of which
   * ~32 are DST and dropped. There is no `weeks[]` form here any more than
   * there is on `/stats`, so a backfill is a loop over weeks by the caller.
   */
  async listWeeklyFantasyPoints(season: number, week: number): Promise<ProviderFantasyPoints[]> {
    const params = new URLSearchParams({ season: String(season), week: String(week) });
    const rows = await this.#paginate<Record<string, any>>('/fantasy/weekly_stats', params);
    return rows.map(fantasyRow).filter((r): r is ProviderFantasyPoints => r !== null);
  }

  /**
   * What every player is EXPECTED to score in a week that has not been played.
   *
   * Same shape, same format, same request pattern — see `ProviderProjection`
   * for why a projection and a result deliberately differ only in tense.
   *
   * `raw` keeps the 44 projected stat fields. We do not score them: `points` is
   * the provider's own PPR total, computed under the same ruleset as the result
   * that will replace it, which is the only way the two are comparable without
   * a second implementation to keep in step.
   */
  async listProjections(season: number, week: number): Promise<ProviderProjection[]> {
    const params = new URLSearchParams({ season: String(season), week: String(week) });
    const rows = await this.#paginate<Record<string, any>>('/fantasy/projections', params);

    const out: ProviderProjection[] = [];
    for (const row of rows) {
      const base = fantasyRow(row);
      if (!base) continue;
      out.push({ ...base, raw: (row.stats ?? {}) as Record<string, unknown> });
    }
    return out;
  }

  /**
   * The market's board for a season — every player, every format.
   *
   * One walk of `/fantasy/rankings`, which returns each player once with a
   * `rankings[]` array inside him rather than one row per format. Flattened
   * here so the caller gets rows it can upsert directly.
   *
   * `position_rank` arrives as a float and is passed through as one. See
   * `ProviderRanking` for why only `overall_rank` is trustworthy.
   */
  async listRankings(season: number): Promise<ProviderRanking[]> {
    const params = new URLSearchParams({ season: String(season) });
    const rows = await this.#paginate<Record<string, any>>('/fantasy/rankings', params);

    const out: ProviderRanking[] = [];
    for (const row of rows) {
      const pid = row.player?.id;
      if (typeof pid !== 'number') continue;
      for (const r of (row.rankings ?? []) as Record<string, any>[]) {
        if (typeof r?.overall_rank !== 'number' || typeof r?.type !== 'string') continue;
        out.push({
          playerExternalId: pid,
          season,
          format: r.type,
          overallRank: r.overall_rank,
          positionRank: typeof r.position_rank === 'number' ? r.position_rank : null,
          auctionValue: typeof r.auction_value === 'number' ? r.auction_value : null,
        });
      }
    }
    return out;
  }

  /**
   * One club's depth chart, folded.
   *
   * THE FEED REPEATS A MAN AT CONSECUTIVE DEPTHS — 121 rows for 100 distinct
   * (slot, player) pairs on a single club, e.g. one running back listed at both
   * RB4 and RB5. Taking the MINIMUM is what turns that back into a chart: it is
   * his best claim on the slot, and it is stable, where taking the last row
   * seen would depend on page order.
   *
   * Rows with no depth are dropped rather than defaulted. A player the provider
   * cannot place is not "first choice", and inventing a 1 for him would put him
   * above men it did place.
   */
  async listTeamDepth(teamExternalId: number): Promise<ProviderDepthRow[]> {
    const rows = await this.#paginate<Record<string, any>>(
      `/teams/${teamExternalId}/roster`,
      new URLSearchParams(),
    );

    const best = new Map<string, ProviderDepthRow>();
    for (const row of rows) {
      const pid = row.player?.id;
      const slot = typeof row.position === 'string' ? row.position : null;
      const depth = row.depth;
      if (typeof pid !== 'number' || !slot || typeof depth !== 'number') continue;

      const key = `${slot}:${pid}`;
      const seen = best.get(key);
      if (seen && seen.depth <= depth) continue;
      best.set(key, {
        teamExternalId,
        playerExternalId: pid,
        slot,
        depth,
        injuryStatus: typeof row.injury_status === 'string' ? row.injury_status : null,
      });
    }
    return [...best.values()];
  }

  async listInjuries(): Promise<ProviderInjury[]> {
    const rows = await this.#paginate<Record<string, any>>(
      '/player_injuries',
      new URLSearchParams(),
    );
    return rows
      .filter((i) => i.player?.id)
      .map((i) => ({
        playerExternalId: i.player.id,
        status: i.status ?? null,
        comment: i.comment ?? null,
        date: i.date ?? null,
      }));
  }

  async listSalaries(query: SalaryQuery): Promise<ProviderSalary[]> {
    // Salaries hang off slates, so resolve the week's slates first.
    const slateParams = new URLSearchParams();
    slateParams.append('seasons[]', String(query.season));
    if (query.week != null) slateParams.append('weeks[]', String(query.week));

    const slates = await this.#paginate<Record<string, any>>('/dfs/slates', slateParams);
    if (slates.length === 0) return [];

    const out: ProviderSalary[] = [];
    for (const slate of slates) {
      const params = new URLSearchParams();
      params.append('slate_ids[]', String(slate.id));

      const draftables = await this.#paginate<Record<string, any>>('/dfs/draftables', params);
      for (const d of draftables) {
        // entity_type can be 'team' (DST); those have no player to key on.
        if (!d.player_id || typeof d.salary !== 'number') continue;
        out.push({
          playerExternalId: d.player_id,
          slateId: d.slate_id ?? slate.id ?? null,
          provider: slate.provider ?? 'draftkings',
          salary: d.salary,
          position: d.position ?? null,
        });
      }
    }
    return out;
  }
}
