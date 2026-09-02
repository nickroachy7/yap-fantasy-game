/**
 * The provider's fantasy numbers — the forecast and the result.
 *
 * ---------------------------------------------------------------------------
 * TWO ENDPOINTS, ONE FUNCTION, BECAUSE THEY ARE ONE CLAIM IN TWO TENSES
 * ---------------------------------------------------------------------------
 *
 *   /fantasy/projections  — what a player is expected to do in a week that has
 *                           not been played. Lands in `projections`.
 *   /fantasy/weekly_stats — what he actually did. Lands in `fantasy_points`,
 *                           keyed to the provider's own ruleset (v3).
 *
 * They could have been two functions and it would have been worse. The whole
 * value of taking both from this provider is that they are scored under ONE
 * format, so a `PROJ` and a score on the same row are directly comparable — and
 * two functions is two places for the format constant to drift. `PPR_FORMAT`
 * lives in the adapter and both paths read the same rows through it.
 *
 * ---------------------------------------------------------------------------
 * WHY THE RESULT PATH DOES NOT GO NEAR `scoreStatLine`
 * ---------------------------------------------------------------------------
 *
 * `ingest-stats` still writes `stat_lines` and still computes points with our
 * engine, and it must keep doing so — those raw payloads are the record and the
 * engine is the only thing that can score a week the provider has not published
 * fantasy numbers for yet.
 *
 * But when the provider HAS published, its number wins, and this function
 * overwrites. Not because the provider is more trustworthy in general, but for
 * one concrete reason set out in `20260903020000`: `/stats` does not emit
 * distance-bucketed field goals, so our engine cannot score a kicker correctly
 * from anything we store. It is not a tie being broken on taste.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REFUSES TO DO
 * ---------------------------------------------------------------------------
 *
 *  1. Invent a projection. A player the provider did not project gets no row,
 *     and the board keeps drawing `PROJ —`, which is what that dash has always
 *     been for.
 *  2. Score a DST. The endpoint returns 32 team defences a week; this game has
 *     no slot for one, and `fantasyRow` drops any row without a player id.
 *  3. Match on position. `/fantasy/*` says `K` where `/players` says `PK` for
 *     the same man — join on the player id or lose every kicker.
 *  4. Write a point it did not receive. A row whose PPR total is null is
 *     skipped rather than stored as nought: an unscored week and a week scoring
 *     nothing are different facts and the board draws them differently.
 *
 * Body: { season?: number, weeks?: number[], mode?: 'both'|'points'|'projections' }
 * Defaults to the current season and, with no weeks given, every week the
 * provider currently publishes projections for.
 */
import { createClient } from '@supabase/supabase-js';
import { BalldontlieProvider } from '../_shared/balldontlie.ts';
import type {
  ProviderFantasyPoints,
  ProviderProjection,
  StatsProvider,
} from '../_shared/stats-provider.ts';

const CHUNK = 500;
/** The provider's own ruleset, registered by `20260903020000`. */
const PROVIDER_RULES_VERSION = 3;
/** The regular season. Projections are not published for any other. */
const REGULAR_SEASON = 2;
/** An NFL regular season is 18 weeks and has been since 2021. */
const LAST_WEEK = 18;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * PostgREST caps a select at 1000 rows and says nothing about it — the failure
 * that already cost this codebase a silently under-scored week. Every read-back
 * that can exceed 1000 rows pages explicitly.
 */
const PAGE = 1000;

async function selectAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await build(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data: authorised, error: authErr } = await supabase.rpc('verify_sync_secret', {
      candidate: req.headers.get('x-sync-secret') ?? '',
    });
    if (authErr) throw authErr;
    if (authorised !== true) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const season: number = body.season ?? new Date().getUTCFullYear();
    const mode: string = body.mode ?? 'both';
    const weeks: number[] = Array.isArray(body.weeks) && body.weeks.length > 0
      ? body.weeks
      : Array.from({ length: LAST_WEEK }, (_, i) => i + 1);

    const provider: StatsProvider = new BalldontlieProvider(
      Deno.env.get('BALLDONTLIE_API_KEY')!,
    );

    /* ---- id maps ---------------------------------------------------------
     * ON EXTERNAL ID, NEVER ON NAME OR POSITION. The provider's `K` against our
     * `PK` is the reason this is stated twice in this file: a position join
     * would drop every kicker in the game and look like a clean run.          */
    const players = await selectAllPages<{ id: string; external_id: number }>((from, to) =>
      supabase.from('players').select('id, external_id').range(from, to)
    );
    const playerByExternal = new Map(players.map((p) => [p.external_id, p.id]));

    const games = await selectAllPages<{ id: string; external_id: number }>((from, to) =>
      supabase.from('games').select('id, external_id').eq('season', season).range(from, to)
    );
    const gameByExternal = new Map(games.map((g) => [g.external_id, g.id]));

    const summary = {
      season,
      weeks: weeks.length,
      projectionsWritten: 0,
      pointsWritten: 0,
      unknownPlayers: 0,
      weeksWithNoProjection: [] as number[],
      weeksWithNoResult: [] as number[],
    };

    for (const week of weeks) {
      /* ---- projections -------------------------------------------------- */
      if (mode === 'both' || mode === 'projections') {
        let rows: ProviderProjection[] = [];
        try {
          rows = await provider.listProjections(season, week);
        } catch {
          /* A week the provider has not published is not an error — it is most
             of the season, most of the time. Recorded and skipped. */
          rows = [];
        }

        const mapped = rows.flatMap((row) => {
          const playerId = playerByExternal.get(row.playerExternalId);
          if (!playerId) {
            summary.unknownPlayers += 1;
            return [];
          }
          // A row with no PPR total is skipped rather than stored as nought.
          if (row.points === null) return [];

          return [{
            player_id: playerId,
            game_id: row.gameExternalId ? gameByExternal.get(row.gameExternalId) ?? null : null,
            season: row.season,
            week: row.week,
            season_type: REGULAR_SEASON,
            projected_points: row.points,
            points_by_format: row.byFormat,
            raw: row.raw,
            provider_position: row.position,
            collected_at: null,
          }];
        });

        if (mapped.length === 0) {
          summary.weeksWithNoProjection.push(week);
        } else {
          for (const batch of chunk(mapped, CHUNK)) {
            const { error } = await supabase
              .from('projections')
              .upsert(batch, { onConflict: 'player_id,season,week,season_type' });
            if (error) throw error;
            summary.projectionsWritten += batch.length;
          }
        }
      }

      /* ---- results ------------------------------------------------------ */
      if (mode === 'both' || mode === 'points') {
        let rows: ProviderFantasyPoints[] = [];
        try {
          rows = await provider.listWeeklyFantasyPoints(season, week);
        } catch {
          rows = [];
        }

        const scored = rows.filter((r) => r.points !== null);
        if (scored.length === 0) {
          summary.weeksWithNoResult.push(week);
          continue;
        }

        /* THE POINT HANGS OFF A STAT LINE, NOT OFF A PLAYER-WEEK, because
           `fantasy_points` is keyed to `stat_lines.id` — the raw payload is the
           thing a point is ABOUT. So a provider number can only be stored for a
           week we have already ingested stats for, which is the correct
           dependency: a score with no stat line behind it is a number with no
           working shown. Weeks are ingested first by `ingest-stats`.        */
        const lines = await selectAllPages<{ id: string; player_id: string }>((from, to) =>
          supabase
            .from('stat_lines')
            .select('id, player_id')
            .eq('season', season)
            .eq('week', week)
            .eq('season_type', REGULAR_SEASON)
            .range(from, to)
        );
        const lineByPlayer = new Map(lines.map((l) => [l.player_id, l.id]));

        const points = scored.flatMap((row) => {
          const playerId = playerByExternal.get(row.playerExternalId);
          if (!playerId) {
            summary.unknownPlayers += 1;
            return [];
          }
          const statLineId = lineByPlayer.get(playerId);
          if (!statLineId) return [];

          return [{
            stat_line_id: statLineId,
            rules_version: PROVIDER_RULES_VERSION,
            points: row.points,
            computed_at: new Date().toISOString(),
          }];
        });

        for (const batch of chunk(points, CHUNK)) {
          const { error } = await supabase
            .from('fantasy_points')
            .upsert(batch, { onConflict: 'stat_line_id,rules_version' });
          if (error) throw error;
          summary.pointsWritten += batch.length;
        }
      }
    }

    return json({ ok: true, ...summary, ms: Date.now() - startedAt });
  } catch (error) {
    return json({ error: String(error instanceof Error ? error.message : error) }, 500);
  }
});
