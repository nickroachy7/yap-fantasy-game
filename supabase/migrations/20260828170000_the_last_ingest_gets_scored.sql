-- The last ingest of a slate has never been scored.
--
-- `gameday_sweep` fires ingestion through pg_net, which is ASYNC, and then
-- immediately calls score_week. The response lands a second or two later, well
-- inside the minute, so every tick scores the PREVIOUS tick's ingest. That one
-- tick of lag is deliberate and harmless while the sweep keeps ticking.
--
-- It stops being harmless at the boundary. The moment `slate_is_live()` goes
-- false the sweep stands down, and the ingest fired by the last live tick is
-- left with nothing behind it to apply. Those points are simply never scored.
--
-- Normally nobody notices, and that is what makes it dangerous. The 6-hour
-- correction window means the last live tick happens six hours after the last
-- game went final, by which point the stats have not moved in hours and the
-- orphaned ingest is identical to the one before it. The bug is real on every
-- single slate and shows a difference on almost none of them.
--
-- On 2026-08-28 it finally showed one. Scoring had been dead since 02:17 (see
-- 20260828150000), and by the time the constraint was fixed at 14:31 the last
-- game had been over for twelve hours. That recovery tick found the slate still
-- "live" only because our own `games.status_state` was stale, ingested twelve
-- hours of finals — and then marked those games final, which made the slate not
-- live, which stood the sweep down at 14:32 holding an ingest nobody would ever
-- score. Justin Herbert's card sat at -1.64 while his fantasy_points row said
-- 4.96. Ty Simpson's said 9.76 and his lineup showed 0.52. A contest was
-- ranked, and displayed, on numbers the database had already superseded.
--
-- The fix is to make standing down conditional on having nothing left to apply,
-- which is the thing "stand down" was always supposed to mean. Before a
-- stood-down tick returns, it compares the newest fantasy_points for the slate
-- against the last time its lineups were scored. If points are newer, it scores
-- once and says so.
--
-- Why this shape:
--
--   * It asks the real question — "is there scored data I have not applied?" —
--     rather than a proxy like "did an ingest fire recently". A proxy would
--     miss a response that landed late; this cannot, because it re-asks every
--     tick until the answer is no.
--   * It is self-limiting. score_week sets `lineups.scored_at = now()`, so the
--     catch-up makes its own condition false. One tick, not a loop.
--   * It is not restricted to the boundary case. Any way points can get ahead
--     of scoring — a slow provider, a late correction, an outage like this one
--     — resolves on the next tick instead of waiting for the next kickoff.
--   * It does NOT re-ingest. A stood-down sweep still calls no provider; it
--     only applies what has already been fetched and scored. The stand-down is
--     still doing its job of not hammering the vendor on a Tuesday.
--
-- The `v_lineups > 0` guard matters: with no lineups in the week there is
-- nothing to score, score_week would never set `scored_at`, and the condition
-- would stay true forever. That would turn a quiet Tuesday into a permanent
-- catch-up loop.

-- A stood-down tick that scored is neither 'swept' (it called no provider) nor
-- 'stood_down' (it did work). Naming it keeps a gap in this table meaning what
-- it has always meant.
--
-- 'backfill' is carried over from 20260821170000_backfill_week.sql, which had
-- already widened this vocabulary. Restating the whole list is how this
-- constraint has always been amended, and it is worth reading the CURRENT
-- definition rather than the original migration before touching it again.
alter table public.sweep_log drop constraint if exists sweep_log_outcome_check;
alter table public.sweep_log add constraint sweep_log_outcome_check
  check (outcome in ('no_slate','stood_down','swept','backfill','caught_up'));

create or replace function public.gameday_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  s          record;
  v_live     boolean;
  v_score    jsonb;
  v_req      bigint;
  v_began    timestamptz := clock_timestamp();
  v_result   jsonb;
  v_ingested timestamptz;
  v_applied  timestamptz;
  v_lineups  integer;
begin
  -- Settle the previous tick(s) before doing anything new. Wrapped so a change
  -- in pg_net's internals can never take the scoring path down with it —
  -- bookkeeping must not be able to break the job it is bookkeeping for.
  begin
    update public.sweep_log sl
       set ingest_status   = r.status_code,
           ingest_timed_out = r.timed_out,
           ingest_error     = r.error_msg,
           ingest_body      = case
                             when r.content is null then null
                             when left(ltrim(r.content), 1) in ('{','[')
                               then r.content::jsonb
                             else jsonb_build_object('raw', left(r.content, 2000))
                           end
      from net._http_response r
     where r.id = sl.ingest_request_id
       and sl.ingest_request_id is not null
       and sl.ingest_status is null
       and sl.ingest_timed_out is null;
  exception when others then
    null;
  end;

  select * into s from public.current_slate();
  if s is null then
    v_result := jsonb_build_object('skipped', 'no slate');
    begin
      insert into public.sweep_log (outcome, duration_ms)
      values ('no_slate',
              (extract(epoch from clock_timestamp() - v_began) * 1000)::integer);
    exception when others then null;
    end;
    return v_result;
  end if;

  select public.slate_is_live() into v_live;
  if not v_live then
    -- Nothing is live, so no provider call. But scoring lags ingestion by a
    -- tick, and the ingest fired by the last LIVE tick has had no tick behind
    -- it to apply. Do not stand down while points are newer than the scoring
    -- that was supposed to consume them.
    select max(fp.computed_at) into v_ingested
      from public.fantasy_points fp
      join public.stat_lines sl on sl.id = fp.stat_line_id
     where sl.season      = s.season
       and sl.season_type = s.season_type
       and sl.week        = s.week;

    select count(*), max(l.scored_at) into v_lineups, v_applied
      from public.lineups l
     where l.season      = s.season
       and l.season_type = s.season_type
       and l.week        = s.week;

    if v_lineups > 0
       and v_ingested is not null
       and (v_applied is null or v_ingested > v_applied) then

      v_score := public.score_week(s.season, s.season_type, s.week);

      v_result := jsonb_build_object(
        'caught_up', true, 'season', s.season, 'season_type', s.season_type,
        'week', s.week, 'points_at', v_ingested, 'scored_at_was', v_applied,
        'scored', v_score
      );
      begin
        insert into public.sweep_log (season, season_type, week, outcome,
                                      scored, duration_ms)
        values (s.season, s.season_type, s.week, 'caught_up', v_score,
                (extract(epoch from clock_timestamp() - v_began) * 1000)::integer);
      exception when others then null;
      end;
      return v_result;
    end if;

    v_result := jsonb_build_object('skipped', 'nothing live', 'season', s.season, 'week', s.week);
    begin
      insert into public.sweep_log (season, season_type, week, outcome, duration_ms)
      values (s.season, s.season_type, s.week, 'stood_down',
              (extract(epoch from clock_timestamp() - v_began) * 1000)::integer);
    exception when others then null;
    end;
    return v_result;
  end if;

  select net.http_post(
    url     := 'https://ygrmsleanavyewfbhlth.functions.supabase.co/ingest-stats',
    body    := jsonb_build_object('season', s.season, 'seasonType', s.season_type,
                                  'weeks', jsonb_build_array(s.week), 'finalOnly', false),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_secret')
    ),
    timeout_milliseconds := 120000
  ) into v_req;

  v_score := public.score_week(s.season, s.season_type, s.week);

  v_result := jsonb_build_object(
    'season', s.season, 'season_type', s.season_type, 'week', s.week,
    'ingest_request', v_req, 'scored', v_score
  );

  begin
    insert into public.sweep_log (season, season_type, week, outcome,
                                  ingest_request_id, scored, duration_ms)
    values (s.season, s.season_type, s.week, 'swept', v_req, v_score,
            (extract(epoch from clock_timestamp() - v_began) * 1000)::integer);
  exception when others then null;
  end;

  return v_result;
end;
$$;

revoke execute on function public.gameday_sweep() from public, anon, authenticated;

comment on function public.gameday_sweep() is
  'One sweep tick. Ingests and scores while the slate is live; once it is not, still applies any points newer than the last scoring (the async ingest fired by the final live tick) before standing down.';
