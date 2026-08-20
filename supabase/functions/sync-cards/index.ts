/**
 * Card template seeding.
 *
 * `cards` is the player *template* table — one row per fantasy-relevant active
 * player per season. `card_instances` (the owned copy) is a different table and
 * is never touched here.
 *
 * Rarity assignment is still an open product decision, so this function only
 * ever creates the row and leaves `rarity` / `rarity_source` at their column
 * defaults ('common' / 'fallback'). Existing rows are never updated, which is
 * what makes a re-run safe once rarity is being set by something else.
 *
 * Once the templates are written it calls `rebuild_card_sets`, which folds any
 * new card into its team set, and then `rebuild_daily_set`, which ensures the
 * day's daily exists and retires yesterday's. Both calls are best-effort: see
 * the notes at the call sites for why their failure must not fail the sync.
 *
 * Body: { season?: number }  (defaults to the current UTC year)
 */
import { createClient } from '@supabase/supabase-js';

const CHUNK = 500;

const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'PK'] as const;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * PostgREST caps a select at 1000 rows by default and returns no signal that it
 * truncated. Every read-back that can exceed 1000 rows must page explicitly —
 * there are ~968 fantasy-relevant players today, so a single unpaged select is
 * one roster expansion away from silently seeding a partial set.
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

    // ---- 1. eligible players ----------------------------------------------
    // Count first, with the identical filter, so the paged read below has
    // something to be checked against.
    const { count: eligibleCount, error: countErr } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .in('position_abbreviation', FANTASY_POSITIONS);
    if (countErr) throw countErr;
    if (eligibleCount === null) {
      return json({ error: 'eligible-player count unavailable' }, 500);
    }
    if (eligibleCount === 0) {
      return json({
        error: 'zero fantasy-relevant active players — players table may be unpopulated',
        season,
      }, 502);
    }

    const eligiblePlayers = await selectAllPages<{ id: string }>((from, to) =>
      supabase.from('players').select('id')
        .eq('is_active', true)
        .in('position_abbreviation', FANTASY_POSITIONS)
        .order('id', { ascending: true }).range(from, to)
    );

    // The bug this guards against is silent: a truncated read seeds a partial
    // set and still reports a clean run. Refuse to write rather than half-seed.
    if (eligiblePlayers.length !== eligibleCount) {
      return json({
        error: 'eligible-player read did not match its count — a read was truncated',
        eligible_count: eligibleCount,
        eligible_read: eligiblePlayers.length,
      }, 500);
    }

    // ---- 2. existing templates for this season -----------------------------
    const { count: existingCount, error: existingCountErr } = await supabase
      .from('cards')
      .select('player_id', { count: 'exact', head: true })
      .eq('season', season);
    if (existingCountErr) throw existingCountErr;

    const existingRows = await selectAllPages<{ player_id: string }>((from, to) =>
      supabase.from('cards').select('player_id')
        .eq('season', season)
        .order('player_id', { ascending: true }).range(from, to)
    );

    if (existingCount !== null && existingRows.length !== existingCount) {
      return json({
        error: 'existing-card read did not match its count — a read was truncated',
        existing_count: existingCount,
        existing_read: existingRows.length,
      }, 500);
    }

    const existing = new Set(existingRows.map((c) => c.player_id));
    const missing = eligiblePlayers.filter((p) => !existing.has(p.id));

    // ---- 3. create the missing templates -----------------------------------
    // ignoreDuplicates leans on `unique (player_id, season)`: a concurrent run
    // (or a row created between the read and the write) is skipped rather than
    // overwritten, so an already-assigned rarity can never be reset to default.
    let created = 0;
    for (const batch of chunk(missing, CHUNK)) {
      // Count what the insert actually returned, not what we asked it to write:
      // a skipped duplicate must not be reported as a creation. Batches are
      // CHUNK (< 1000) rows, so this read-back cannot be truncated.
      const { data, error } = await supabase.from('cards').upsert(
        batch.map((p) => ({ player_id: p.id, season })),
        { onConflict: 'player_id,season', ignoreDuplicates: true },
      ).select('id');
      if (error) throw error;
      created += (data ?? []).length;
    }

    // ---- 4. fold the new templates into their sets -------------------------
    // Set membership is built from this pool, so a card created above belongs
    // to a team set that does not yet know about it. The rebuild is idempotent
    // and only ever ADDS members (see the function's own comment), so calling
    // it on every run is the cheapest way to keep the two in step — there is no
    // other trigger for it.
    //
    // ITS FAILURE MUST NOT FAIL THE SYNC. Creating the templates is the job;
    // stale set membership is a page that undercounts by a card or two until
    // the next nightly run, which is a far smaller problem than a card sync
    // that reports an error after having already written its rows.
    let setsRebuilt: unknown = null;
    const { data: rebuild, error: rebuildError } = await supabase.rpc('rebuild_card_sets', {
      p_season: season,
    });
    if (rebuildError) console.error('rebuild_card_sets failed', rebuildError);
    else setsRebuilt = rebuild;

    // TODAY'S DAILY, ensured on the same run and for the same reason: this is
    // the only thing that wakes up nightly, and a daily set that does not exist
    // is a Sets tab with an empty top section.
    //
    // ROLLED FORWARD RATHER THAN CAUGHT UP. Only today's is built — a run that
    // was missed for three days does not backfill three dailies, because a
    // daily nobody could clear on the day is not a reward, it is a claim
    // waiting to be found. `rebuild_daily_set` retires anything older itself.
    //
    // The date is the server's, deliberately: the rotation is a pure function
    // of it (`daily_set_position`), so the set a day produces has to be decided
    // in one place and this is not that place.
    let dailyBuilt: unknown = null;
    const today = new Date().toISOString().slice(0, 10);
    const { data: daily, error: dailyError } = await supabase.rpc('rebuild_daily_set', {
      p_season: season,
      p_day: today,
    });
    if (dailyError) console.error('rebuild_daily_set failed', dailyError);
    else dailyBuilt = daily;

    return json({
      ok: true,
      season,
      eligible: eligiblePlayers.length,
      created,
      existing: existingRows.length,
      sets: setsRebuilt,
      sets_error: rebuildError ? String(rebuildError.message ?? rebuildError) : null,
      daily: dailyBuilt,
      daily_error: dailyError ? String(dailyError.message ?? dailyError) : null,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('sync-cards failed', err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
