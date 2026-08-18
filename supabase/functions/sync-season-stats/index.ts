/**
 * Career history sync: season aggregates and team standings.
 *
 * Backfill-shaped rather than nightly. The upstream `/season_stats` endpoint
 * requires a single `season` and offers no seasons[] filter, so this loops the
 * requested seasons and pages each one — roughly 31 pages per season for a full
 * league, which is well inside the 600/min ceiling but far too slow to do from
 * a profile screen on demand. That is the whole reason these land in a table.
 *
 * Body: { seasons?: number[], from?: number, to?: number, standings?: boolean }
 * Defaults to the ten seasons ending with the previous one — the current season
 * has no aggregates until it has been played, and its numbers come from our own
 * ingested stat_lines instead.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BalldontlieProvider } from '../_shared/balldontlie.ts';
import type { StatsProvider } from '../_shared/stats-provider.ts';

const CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * PostgREST caps a select at 1000 rows and gives no signal that it truncated,
 * so an id map built from an unpaged read silently loses everyone after the
 * thousandth and their season rows are then dropped as unmatched. There are
 * 3003 players.
 */
const PAGE = 1000;

async function idMap(
  supabase: SupabaseClient,
  table: 'players' | 'teams',
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('id, external_id')
      .order('external_id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; external_id: number }[];
    for (const r of rows) out.set(r.external_id, r.id);
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
    const currentSeason: number = new Date().getUTCFullYear();
    const to: number = body.to ?? currentSeason - 1;
    const from: number = body.from ?? to - 9;
    const seasons: number[] = Array.isArray(body.seasons) && body.seasons.length > 0
      ? body.seasons
      : Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const wantStandings: boolean = body.standings ?? true;

    const provider: StatsProvider = new BalldontlieProvider(
      Deno.env.get('BALLDONTLIE_API_KEY')!,
    );

    const playerIdByExternal = await idMap(supabase, 'players');
    const teamIdByExternal: Map<number, string> = wantStandings
      ? await idMap(supabase, 'teams')
      : new Map();

    const perSeason: Record<string, unknown>[] = [];
    let totalRows = 0;
    let totalStandings = 0;
    let totalUnmatched = 0;

    for (const season of seasons) {
      const stats = await provider.listSeasonStats(season);

      // A player with season rows but no row in `players` is usually retired —
      // we sync ACTIVE players only. Counted rather than silently dropped: if
      // this number ever approaches the row count, the id mapping is broken
      // rather than the league having turned over.
      const rows = [];
      let unmatched = 0;
      for (const s of stats) {
        const playerId = playerIdByExternal.get(s.playerExternalId);
        if (!playerId) {
          unmatched += 1;
          continue;
        }
        rows.push({
          player_id: playerId,
          season: s.season,
          postseason: s.postseason,
          games_played: s.gamesPlayed,
          raw: s.raw,
          synced_at: new Date().toISOString(),
        });
      }

      for (const batch of chunk(rows, CHUNK)) {
        const { error } = await supabase
          .from('player_season_stats')
          .upsert(batch, { onConflict: 'player_id,season,postseason' });
        if (error) throw error;
      }

      let standingsWritten = 0;
      if (wantStandings) {
        const standings = await provider.listStandings(season);
        const sRows = standings
          .filter((s) => teamIdByExternal.get(s.teamExternalId))
          .map((s) => ({
            team_id: teamIdByExternal.get(s.teamExternalId)!,
            season: s.season,
            wins: s.wins,
            losses: s.losses,
            ties: s.ties,
            points_for: s.pointsFor,
            points_against: s.pointsAgainst,
            point_differential: s.pointDifferential,
            playoff_seed: s.playoffSeed,
            win_streak: s.winStreak,
            overall_record: s.overallRecord,
            conference_record: s.conferenceRecord,
            division_record: s.divisionRecord,
            home_record: s.homeRecord,
            road_record: s.roadRecord,
            synced_at: new Date().toISOString(),
          }));
        if (sRows.length > 0) {
          const { error } = await supabase
            .from('team_standings')
            .upsert(sRows, { onConflict: 'team_id,season' });
          if (error) throw error;
        }
        standingsWritten = sRows.length;
      }

      totalRows += rows.length;
      totalStandings += standingsWritten;
      totalUnmatched += unmatched;
      perSeason.push({
        season,
        returned: stats.length,
        written: rows.length,
        unmatched,
        standings: standingsWritten,
      });
    }

    // Zero rows across every requested season means the shape drifted or the
    // seasons were nonsense — either way it is not a successful backfill.
    if (totalRows === 0) {
      return json(
        {
          error: 'no season stats written — provider shape may have drifted',
          seasons,
          per_season: perSeason,
        },
        502,
      );
    }

    // Ranks are materialised, so they are stale the moment new seasons land.
    // Refreshing here rather than on a schedule keeps "synced" and "ranked"
    // from ever being separately true.
    const { error: refreshErr } = await supabase.rpc('refresh_player_season_ranks');
    if (refreshErr) throw refreshErr;

    return json({
      ok: true,
      seasons,
      players_written: totalRows,
      standings_written: totalStandings,
      unmatched_players: totalUnmatched,
      per_season: perSeason,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
