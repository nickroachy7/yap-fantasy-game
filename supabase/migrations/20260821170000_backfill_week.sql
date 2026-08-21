-- A way to re-ingest a week that is not currently live.
--
-- ---------------------------------------------------------------------------
-- THE GAP
-- ---------------------------------------------------------------------------
--
-- The runbook's "manual kick" (D6) is `select public.gameday_sweep();`, and it
-- cannot do this job. `gameday_sweep` short-circuits on `slate_is_live()` before
-- it makes any HTTP call — which is the correct behaviour for a scheduled tick
-- and is what keeps an idle Tuesday free — but it means the documented way to
-- force an ingest returns `{"skipped":"nothing live"}` in every circumstance
-- where you would actually want to force one.
--
-- Those circumstances are real and the runbook already lists several: a missed
-- scheduler window, a provider outage that resolved after the six-hour
-- correction window closed, a shape change that needed a redeploy before the
-- data could land. Last night's two games are a fourth — their last ingest was
-- 07:55, the sweep stood down at 08:00, and any stat correction published this
-- morning has nowhere to enter the database until the next kickoff drags the
-- whole week back through the pipe at 23:00.
--
-- ---------------------------------------------------------------------------
-- WHAT IT IS, AND WHAT IT DELIBERATELY IS NOT
-- ---------------------------------------------------------------------------
--
-- It is `gameday_sweep`'s body with the liveness gate removed and the week
-- named explicitly instead of derived. Everything else is identical on purpose:
-- same endpoint, same `finalOnly:false`, same vault secrets, same sweep_log
-- row, same `score_week`. A backfill that took a different path to the database
-- than the sweep does would be capable of producing a state the sweep cannot,
-- and then the two would have to be debugged separately.
--
-- It is NOT scheduled and never will be. The gate it removes is the only thing
-- standing between this project and a provider bill for polling an empty
-- Tuesday, so the function that removes it has to be one a person runs on
-- purpose, with a week in their hand.
--
-- ---------------------------------------------------------------------------
-- PG_NET IS ASYNC, SO ONE CALL IS NOT ENOUGH
-- ---------------------------------------------------------------------------
--
-- `net.http_post` queues a request and returns an id immediately; the rows land
-- while this function is already finishing. So the `score_week` at the end
-- scores whatever the PREVIOUS fetch left behind, not the one just fired.
--
-- That is not a flaw to work around — it is the same property the sweep runs on
-- ("score_week() is idempotent, so the overlap between the two is harmless by
-- design", 20260818040000), and at one tick a minute the lag is invisible.
-- Run by hand it is visible, so: CALL IT, WAIT FOR THE RESPONSE, CALL IT AGAIN.
-- The second call ingests nothing new and scores what the first one fetched.
-- The return value carries the request id so the wait can be watched:
--
--   select public.backfill_week(2026, 1::smallint, 3);
--   -- ~20s later, check the response landed:
--   select ingest_status, ingest_body->>'stat_lines'
--     from public.sweep_log where ingest_request_id = <id>;
--   select public.backfill_week(2026, 1::smallint, 3);

-- 'backfill' joins the outcome vocabulary rather than reusing 'swept'. A hole in
-- sweep_log means the scheduler missed, and that alarm only works if every row
-- in it was written by the scheduler — a hand-run tick filed as 'swept' would
-- paper over exactly the gap the table exists to expose.
alter table public.sweep_log drop constraint if exists sweep_log_outcome_check;
alter table public.sweep_log add constraint sweep_log_outcome_check
  check (outcome in ('no_slate', 'stood_down', 'swept', 'backfill'));

create or replace function public.backfill_week(
  p_season      integer,
  p_season_type smallint,
  p_week        integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  v_score  jsonb;
  v_req    bigint;
  v_games  integer;
  v_began  timestamptz := clock_timestamp();
begin
  -- Refuse a week that does not exist rather than firing a request that can
  -- only come back empty. The provider would answer "no games matched" and the
  -- caller would have to work out whether that meant a bad week number or a
  -- broken feed.
  select count(*) into v_games
    from public.games g
   where g.season = p_season and g.season_type = p_season_type and g.week = p_week;

  if v_games = 0 then
    return jsonb_build_object('error', 'no such week', 'season', p_season,
                              'season_type', p_season_type, 'week', p_week);
  end if;

  -- Settle any still-open response first, exactly as the sweep does, so a
  -- backfill run between two sweeps does not leave a pending row behind it.
  begin
    update public.sweep_log sl
       set ingest_status    = r.status_code,
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

  select net.http_post(
    url     := 'https://ygrmsleanavyewfbhlth.functions.supabase.co/ingest-stats',
    body    := jsonb_build_object('season', p_season, 'seasonType', p_season_type,
                                  'weeks', jsonb_build_array(p_week), 'finalOnly', false),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_secret')
    ),
    timeout_milliseconds := 120000
  ) into v_req;

  v_score := public.score_week(p_season, p_season_type, p_week);

  begin
    insert into public.sweep_log (season, season_type, week, outcome,
                                  ingest_request_id, scored, duration_ms)
    values (p_season, p_season_type, p_week, 'backfill', v_req, v_score,
            (extract(epoch from clock_timestamp() - v_began) * 1000)::integer);
  exception when others then null;
  end;

  return jsonb_build_object(
    'season', p_season, 'season_type', p_season_type, 'week', p_week,
    'games_in_week', v_games,
    'ingest_request', v_req,
    'scored', v_score,
    'note', 'ingest is async — re-run once the response lands to score what it fetched'
  );
end;
$$;

revoke execute on function public.backfill_week(integer, smallint, integer)
  from public, anon, authenticated;

comment on function public.backfill_week(integer, smallint, integer) is
  'Re-ingest and rescore a named week regardless of whether it is live. gameday_sweep''s body without the slate_is_live() gate. Run by hand only — never schedule it.';
