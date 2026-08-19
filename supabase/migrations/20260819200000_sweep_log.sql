-- A durable trace of what the gameday sweep actually did.
--
-- Preseason week 3 (Aug 21-24) is the last-but-one window of live NFL data
-- before Sept 9. The rehearsal is only worth running if you can still answer,
-- on Monday, what happened on Saturday night. Today you cannot:
--
--   * `cron.job_run_details.return_message` is the literal string `1 row` for
--     all 336 sweeps so far. pg_cron records that the job returned, never WHAT
--     it returned — so that table can prove the sweep RAN but can never say
--     whether it called the provider or correctly stood down.
--   * `net._http_response` holds the only other evidence, and `pg_net.ttl` is
--     **6 hours**. Saturday's responses are gone by Sunday lunchtime. There are
--     10 rows in it right now.
--
-- So the sweep logs itself. One row per tick, skips included: 288 rows a day is
-- nothing, and logging only the interesting ticks would make a gap ambiguous
-- between "stood down correctly" and "cron never fired". A hole in this table
-- means the scheduler missed, which is exactly the alarm worth having.

create table if not exists public.sweep_log (
  id                bigint generated always as identity primary key,
  ran_at            timestamptz not null default now(),
  season            integer,
  season_type       smallint,
  week              integer,
  -- 'no_slate'   — no week has kicked off yet (or ever); nothing to do.
  -- 'stood_down' — a slate exists but nothing is live. The CORRECT answer on a
  --                Tuesday, and the one the 6h correction window governs.
  -- 'swept'      — provider called and score_week run.
  outcome           text not null check (outcome in ('no_slate','stood_down','swept')),
  ingest_request_id bigint,
  ingest_status     integer,
  ingest_timed_out  boolean,
  ingest_error      text,
  ingest_body       jsonb,
  scored            jsonb,
  duration_ms       integer
);

create index if not exists sweep_log_ran_at_idx on public.sweep_log (ran_at desc);

-- Pending = a request was fired but its response has not been copied across yet.
-- Partial, because after a busy weekend the vast majority of rows are settled
-- and the backfill below should never scan them.
create index if not exists sweep_log_pending_idx on public.sweep_log (id)
  where ingest_request_id is not null and ingest_status is null
    and ingest_timed_out is null;

-- Supabase's default privileges hand `anon` and `authenticated` SELECT on
-- anything created in `public`. This is operational data; nobody signed in
-- needs it. (Same default that already produced two findings — see
-- docs/security-posture.md.)
revoke all on public.sweep_log from anon, authenticated;

comment on table public.sweep_log is
  'One row per gameday_sweep tick. Outlives pg_net''s 6h TTL and pg_cron''s return_message, which records only "1 row".';

-- ---------------------------------------------------------------- the sweep
--
-- Two changes to the body, and NOTHING else: the ingest/score behaviour, the
-- short-circuit conditions and the return value are all byte-for-byte what they
-- were in 20260818040000. This runs against live games in two days; it is the
-- wrong moment to tidy anything.
--
--  1. Every exit path writes a sweep_log row.
--  2. Each tick first copies any still-unresolved pg_net response into the log.
--     That is what makes the record durable: the response is captured well
--     inside its 6-hour TTL by the sweep 5 minutes later, so the evidence
--     survives even though net._http_response has long since dropped it.
create or replace function public.gameday_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  s        record;
  v_live   boolean;
  v_score  jsonb;
  v_req    bigint;
  v_began  timestamptz := clock_timestamp();
  v_result jsonb;
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

-- ---------------------------------------------------------------- reading it
-- What the runbook actually opens. Newest first, one line per tick.
create or replace view public.sweep_health
with (security_invoker = on) as
select sl.ran_at,
       sl.outcome,
       sl.season, sl.season_type, sl.week,
       sl.ingest_status,
       sl.ingest_timed_out,
       sl.ingest_error,
       sl.ingest_body->>'message'                as ingest_message,
       (sl.scored->>'slots_scored')::integer     as slots_scored,
       sl.duration_ms,
       -- A swept tick whose response never arrived is the shape of a timeout.
       (sl.outcome = 'swept'
        and sl.ingest_request_id is not null
        and sl.ingest_status is null
        and sl.ingest_timed_out is null
        and sl.ran_at < now() - interval '15 minutes') as response_never_landed
  from public.sweep_log sl
 order by sl.ran_at desc;

revoke all on public.sweep_health from anon, authenticated;
