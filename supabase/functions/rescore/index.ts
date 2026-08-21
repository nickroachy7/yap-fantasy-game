/**
 * Recompute fantasy_points for stored stat lines under a given ruleset.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS HAS TO EXIST
 * ---------------------------------------------------------------------------
 *
 * The whole point of keeping rules as versioned data is stated in
 * 20260818021000: "changing them is an INSERT of a new version plus a recompute
 * against stored stat_lines.raw — never a re-ingest." The insert was possible
 * from day one. The recompute was not: the scorer lives in TypeScript, and the
 * only thing that had ever run it was `ingest-stats`, which computes points
 * exclusively for games it has just fetched. So a rules change could reach this
 * week and had no way at all to reach the 32,000 lines behind it, and the only
 * workaround was to re-fetch three seasons from the provider — the exact thing
 * the design says never to do.
 *
 * This is that missing half. It reads `raw` back out of the database, scores it,
 * and writes `fantasy_points` keyed to the version it was told to use. It makes
 * no provider call at all.
 *
 * ---------------------------------------------------------------------------
 * IT TAKES A VERSION, AND USUALLY NOT THE ACTIVE ONE
 * ---------------------------------------------------------------------------
 *
 * `score_week` joins `fantasy_points` on the ACTIVE rules version. So flipping
 * `is_active` to a version that has not been computed yet would make every
 * lineup in the database read zero — a LEFT JOIN to rows that do not exist —
 * until this had run to completion. The order that avoids that window is:
 *
 *   1. insert the new version with is_active = false
 *   2. rescore against it explicitly, here
 *   3. only then flip is_active
 *
 * which is why `version` is a parameter and not simply read from the table.
 *
 * Body: { version?: number, season?: number }
 *   version — defaults to the active ruleset.
 *   season  — optional narrowing; omit to do every line ever stored.
 */
import { createClient } from '@supabase/supabase-js';
import { scoreStatLine, type ScoringRules } from '../_shared/scoring.ts';

/** Rows per read. PostgREST caps a select at 1000 and says nothing when it does. */
const PAGE = 1000;
/** Rows per write. Large enough to be few round trips, small enough to not time out. */
const CHUNK = 500;

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
    const season: number | undefined = body.season;

    const { data: ruleRow, error: ruleErr } = await (
      typeof body.version === 'number'
        ? supabase.from('scoring_rules').select('version, rules, name').eq('version', body.version).single()
        : supabase.from('scoring_rules').select('version, rules, name').eq('is_active', true).single()
    );
    if (ruleErr) throw ruleErr;

    const rules = ruleRow.rules as unknown as ScoringRules;
    const version = ruleRow.version as number;

    /*
     * Paged by ID rather than by offset.
     *
     * `range()` with a growing offset re-runs the whole sort on every request
     * and, worse, is not stable against concurrent writes — the gameday sweep is
     * upserting stat lines while this runs, and a row inserted behind the cursor
     * shifts every later page by one, silently skipping a line. Seeking on a
     * primary key that is already unique cannot skip or repeat.
     */
    let after = '00000000-0000-0000-0000-000000000000';
    let scanned = 0;
    let written = 0;

    for (;;) {
      let q = supabase
        .from('stat_lines')
        .select('id, raw')
        .gt('id', after)
        .order('id', { ascending: true })
        .limit(PAGE);
      if (typeof season === 'number') q = q.eq('season', season);

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as { id: string; raw: Record<string, unknown> }[];
      if (rows.length === 0) break;

      const scored = rows.map((r) => ({
        stat_line_id: r.id,
        rules_version: version,
        points: scoreStatLine(r.raw, rules),
      }));

      for (let i = 0; i < scored.length; i += CHUNK) {
        const { error: upErr } = await supabase
          .from('fantasy_points')
          .upsert(scored.slice(i, i + CHUNK), { onConflict: 'stat_line_id,rules_version' });
        if (upErr) throw upErr;
      }

      scanned += rows.length;
      written += scored.length;
      after = rows[rows.length - 1].id;

      // A short page is the last page — the seek returned everything left.
      if (rows.length < PAGE) break;
    }

    return json({
      ok: true,
      rules_version: version,
      rules_name: ruleRow.name,
      season: season ?? 'all',
      stat_lines_scanned: scanned,
      points_written: written,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('rescore failed', err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
