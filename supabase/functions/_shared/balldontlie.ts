/**
 * balldontlie NFL adapter — the ONLY file that knows this vendor exists.
 * Everything else depends on `StatsProvider`. See stats-provider.ts.
 *
 * Vendor facts encoded here, all verified against the live API on 2026-08-17:
 *   - Base is /nfl/v1. Auth is a bare `Authorization: <key>` (no "Bearer").
 *   - Pagination is cursor-based via meta.next_cursor, per_page max 100.
 *   - /stats accepts game_ids[] but NOT weeks[]; only /games takes weeks[].
 *   - /stats returns no fantasy points. Scoring is ours.
 *   - Array params use the `key[]=value` repeated form.
 *   - GOAT tier is 600 req/min.
 */

import type {
  GameQuery,
  ProviderGame,
  ProviderInjury,
  ProviderPlayer,
  ProviderSalary,
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
