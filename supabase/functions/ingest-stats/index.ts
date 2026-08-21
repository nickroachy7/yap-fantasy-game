/**
 * Stat ingestion (build plan task 14).
 *
 * The vendor's /stats endpoint has no week parameter, so the pipeline is:
 *   /games?weeks[] -> game ids -> /stats?game_ids[] -> stat_lines -> fantasy_points
 *
 * Raw payloads land in stat_lines.raw untouched; points are computed separately
 * and keyed by rules_version, so a scoring change is a recompute, never a
 * re-ingest.
 *
 * Body: { season?: number, seasonType?: 1|2|3, weeks?: number[], finalOnly?: boolean }
 */
import { createClient } from '@supabase/supabase-js';
import { BalldontlieProvider } from '../_shared/balldontlie.ts';
import { scoreStatLine, type ScoringRules } from '../_shared/scoring.ts';
import type { SeasonType, StatsProvider } from '../_shared/stats-provider.ts';

const CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * PostgREST caps a select at 1000 rows by default and returns no signal that it
 * truncated. Every read-back that can exceed 1000 rows must page explicitly —
 * a silent cap here under-scores a week and looks like a clean run.
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
    const seasonType: SeasonType = (body.seasonType ?? 2) as SeasonType;
    const weeks: number[] | undefined = body.weeks;
    // Only completed games by default: an in-progress game's stats are partial,
    // and re-ingesting it later would be wasted work.
    const finalOnly: boolean = body.finalOnly ?? true;

    const provider: StatsProvider = new BalldontlieProvider(
      Deno.env.get('BALLDONTLIE_API_KEY')!,
    );

    // ---- 1. games ----------------------------------------------------------
    const games = await provider.listGames({ season, seasonType, weeks });
    if (games.length === 0) {
      return json({ ok: true, note: 'no games matched', season, seasonType, weeks }, 200);
    }

    const { data: teamRows } = await supabase.from('teams').select('id, external_id');
    const teamIdByExternal = new Map<number, string>(
      (teamRows ?? []).map((t) => [t.external_id, t.id]),
    );

    for (const batch of chunk(games, CHUNK)) {
      const { error } = await supabase.from('games').upsert(
        batch.map((g) => ({
          external_id: g.externalId,
          season: g.season,
          week: g.week,
          season_type: g.seasonType,
          home_team_id: g.homeTeamExternalId ? teamIdByExternal.get(g.homeTeamExternalId) ?? null : null,
          visitor_team_id: g.visitorTeamExternalId ? teamIdByExternal.get(g.visitorTeamExternalId) ?? null : null,
          starts_at: g.startsAt,
          status: g.status,
          status_state: g.statusState,
          home_score: g.homeScore,
          visitor_score: g.visitorScore,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'external_id' },
      );
      if (error) throw error;
    }

    /**
     * Which games to ask for stats about.
     *
     * `finalOnly` targets finished games and nothing else — the nightly
     * backfill's job. The gameday sweep passes false, and that used to mean
     * EVERY game in the week, including the fourteen that do not kick off until
     * Sunday. That was affordable at one sweep every five minutes and is not at
     * one a minute: it asks the provider about games that cannot have stats,
     * then reads back and rescores every line in the week on each pass, so the
     * work grows with the week while the useful part of it does not.
     *
     * A game that has not started cannot have a box score. Targeting the ones
     * that have — plus anything already final, whose start time we might not
     * hold — is the same answer for a fraction of the work. Early on a Thursday
     * that is 1 game rather than 16.
     */
    const nowMs = Date.now();
    const hasStarted = (startsAt: string | null) => {
      if (!startsAt) return false;
      const t = Date.parse(startsAt);
      return Number.isFinite(t) && t <= nowMs;
    };
    const targetGames = finalOnly
      ? games.filter((g) => g.statusState === 'final')
      : games.filter((g) => g.statusState === 'final' || hasStarted(g.startsAt));

    if (targetGames.length === 0) {
      return json({
        ok: true,
        note: 'no completed games to ingest',
        games_seen: games.length,
        season, seasonType, weeks,
      });
    }

    // ---- 2. stat lines -----------------------------------------------------
    const lines = await provider.listStatLines(
      targetGames.map((g) => g.externalId),
      seasonType,
    );
    if (lines.length === 0) {
      // Zero rows only means something is WRONG when stats were actually owed —
      // i.e. at least one targeted game has finished. The gameday sweep calls
      // this with finalOnly:false every 5 minutes, and in the window between
      // kickoff and the provider publishing its first box score, zero rows is
      // the correct answer. Alerting unconditionally would cry wolf on exactly
      // the days that matter.
      const finished = targetGames.filter((g) => g.statusState === 'final').length;
      if (finished > 0) {
        return json({
          error: 'zero stat lines despite completed games — provider shape may have drifted',
          games_targeted: targetGames.length,
          games_final: finished,
        }, 502);
      }
      return json({
        ok: true,
        note: 'no stat lines yet — no targeted game has finished',
        season,
        season_type: seasonType,
        weeks: weeks ?? 'all',
        games_seen: games.length,
        games_targeted: targetGames.length,
        ms: Date.now() - startedAt,
      });
    }

    // Resolve provider ids to our uuids.
    const gameIdByExternal = new Map<number, string>();
    for (const batch of chunk(games.map((g) => g.externalId), 500)) {
      const rows = await selectAllPages<{ id: string; external_id: number }>((from, to) =>
        supabase.from('games').select('id, external_id').in('external_id', batch)
          .order('external_id', { ascending: true }).range(from, to)
      );
      for (const g of rows) gameIdByExternal.set(g.external_id, g.id);
    }

    const playerExternalIds = [...new Set(lines.map((l) => l.playerExternalId))];
    const playerIdByExternal = new Map<number, string>();
    for (const batch of chunk(playerExternalIds, 500)) {
      const rows = await selectAllPages<{ id: string; external_id: number }>((from, to) =>
        supabase.from('players').select('id, external_id').in('external_id', batch)
          .order('external_id', { ascending: true }).range(from, to)
      );
      for (const p of rows) playerIdByExternal.set(p.external_id, p.id);
    }

    const rows = lines
      .filter((l) => playerIdByExternal.has(l.playerExternalId) && gameIdByExternal.has(l.gameExternalId))
      .map((l) => ({
        player_id: playerIdByExternal.get(l.playerExternalId)!,
        game_id: gameIdByExternal.get(l.gameExternalId)!,
        team_id: l.teamExternalId ? teamIdByExternal.get(l.teamExternalId) ?? null : null,
        season: l.season,
        week: l.week,
        season_type: l.seasonType,
        raw: l.raw,
        ingested_at: new Date().toISOString(),
      }));

    const skipped = lines.length - rows.length;

    for (const batch of chunk(rows, CHUNK)) {
      const { error } = await supabase
        .from('stat_lines')
        .upsert(batch, { onConflict: 'player_id,game_id' });
      if (error) throw error;
    }

    // ---- 3. points ---------------------------------------------------------
    const { data: ruleRow, error: ruleErr } = await supabase
      .from('scoring_rules')
      .select('version, rules')
      .eq('is_active', true)
      .single();
    if (ruleErr) throw ruleErr;

    const rules = ruleRow.rules as unknown as ScoringRules;

    // Read back the ids we just wrote so points key to real rows.
    const gameUuids = targetGames
      .map((g) => gameIdByExternal.get(g.externalId))
      .filter((id): id is string => Boolean(id));

    const scored: Array<{ stat_line_id: string; rules_version: number; points: number }> = [];
    for (const batch of chunk(gameUuids, 50)) {
      const rows = await selectAllPages<{ id: string; raw: unknown }>((from, to) =>
        supabase.from('stat_lines').select('id, raw').in('game_id', batch)
          .order('id', { ascending: true }).range(from, to)
      );
      for (const row of rows) {
        scored.push({
          stat_line_id: row.id,
          rules_version: ruleRow.version,
          points: scoreStatLine(row.raw as Record<string, unknown>, rules),
        });
      }
    }

    // Every stat line we wrote for these games must have a score. If this trips,
    // a read was truncated and the week is under-scored.
    if (scored.length < rows.length) {
      return json({
        error: 'scored fewer lines than ingested — a read-back was truncated',
        stat_lines: rows.length,
        scored: scored.length,
      }, 500);
    }

    for (const batch of chunk(scored, CHUNK)) {
      const { error } = await supabase
        .from('fantasy_points')
        .upsert(batch, { onConflict: 'stat_line_id,rules_version' });
      if (error) throw error;
    }

    return json({
      ok: true,
      season,
      season_type: seasonType,
      weeks: weeks ?? 'all',
      games_seen: games.length,
      games_ingested: targetGames.length,
      stat_lines: rows.length,
      stat_lines_skipped: skipped,
      scored: scored.length,
      rules_version: ruleRow.version,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('ingest-stats failed', err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
