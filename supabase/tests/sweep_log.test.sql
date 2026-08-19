-- Yap Fantasy — the gameday sweep leaves a durable trace
--
-- The sweep's 'swept' branch only executes while real games are in progress,
-- which in 2026 means preseason week 3 (Aug 21-24), week 4 (Aug 27-29), and
-- then nothing until Sept 9. Discovering a bug in it DURING one of those
-- windows costs the window. So this suite manufactures a live slate, runs the
-- real function, and asserts on what it recorded.
--
-- Why sweep_log exists at all: pg_cron writes the literal string `1 row` into
-- `return_message` for every successful sweep and never the returned JSONB, and
-- `net._http_response` is dropped after `pg_net.ttl` = 6 hours. Between them
-- they cannot answer "what did the sweep do on Saturday night" on Monday
-- morning. See docs/gameday-runbook.md.
--
-- Two properties make this safe against a live database:
--   * everything is inside a transaction that ROLLS BACK, and
--   * pg_net's http_post only dispatches on COMMIT, so the provider is never
--     actually called from here.
--
-- Kickoff times are shifted RELATIVE TO now() and the week under test is
-- whichever one sorts last, so the suite does not rot when the season moves on.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sweep_log.test.sql

begin;

do $$
declare
  v_season      integer;
  v_type        smallint;
  v_week        integer;
  v_slate       record;
  v_live        boolean;
  v_before      bigint;
  v_after       bigint;
  v_row         record;
  v_ret         jsonb;
begin
  ------------------------------------------------------------------- 0. setup
  -- The last week on the fixture list, whenever this is run.
  select g.season, g.season_type, g.week
    into v_season, v_type, v_week
    from public.games g
   where g.week is not null
   group by g.season, g.season_type, g.week
   order by min(g.starts_at) desc
   limit 1;

  if v_week is null then
    raise exception 'FAIL 0: no games on the fixture list at all';
  end if;

  select count(*) into v_before from public.sweep_log;

  ------------------------------------------------- 1. a slate that is standing down
  -- Push the week safely into the future first, so the stand-down branch is
  -- exercised from a known state rather than from whatever today happens to be.
  update public.games
     set starts_at = now() + interval '10 days'
   where season = v_season and season_type = v_type and week = v_week;

  v_ret := public.gameday_sweep();

  select * into v_row from public.sweep_log order by id desc limit 1;
  if v_row.outcome not in ('stood_down','no_slate') then
    raise exception 'FAIL 1: a slate 10 days out should not sweep, got %', v_row.outcome;
  end if;
  if v_row.duration_ms is null then
    raise exception 'FAIL 1: a stand-down must still be timed';
  end if;
  raise notice 'PASS 1: standing down is recorded, not silent (outcome=%)', v_row.outcome;

  ----------------------------------------------------------- 2. a live slate sweeps
  update public.games
     set starts_at = now() - interval '30 minutes'
   where season = v_season and season_type = v_type and week = v_week;

  select * into v_slate from public.current_slate();
  select public.slate_is_live() into v_live;
  if v_slate.week <> v_week or not v_live then
    raise exception 'FAIL 2 setup: expected wk% live, got wk% live=%',
      v_week, v_slate.week, v_live;
  end if;

  v_ret := public.gameday_sweep();

  select count(*) into v_after from public.sweep_log;
  if v_after <> v_before + 2 then
    raise exception 'FAIL 2: expected exactly 2 new rows across both ticks, got %',
      v_after - v_before;
  end if;

  select * into v_row from public.sweep_log order by id desc limit 1;

  if v_row.outcome <> 'swept' then
    raise exception 'FAIL 2: expected outcome swept, got %', v_row.outcome;
  end if;
  if v_row.week <> v_week then
    raise exception 'FAIL 2: logged week % but swept week %', v_row.week, v_week;
  end if;

  -- Without the request id the response can never be joined back before
  -- pg_net drops it, which defeats the whole point of the table.
  if v_row.ingest_request_id is null then
    raise exception 'FAIL 2: ingest_request_id not recorded';
  end if;

  -- The scored payload is the thing pg_cron throws away.
  if v_row.scored is null or not (v_row.scored ? 'slots_scored') then
    raise exception 'FAIL 2: score_week payload not persisted, got %', v_row.scored;
  end if;
  raise notice 'PASS 2: a live slate sweeps and records req=% scored=%',
    v_row.ingest_request_id, v_row.scored;

  ------------------------------------------------- 3. the return value is unchanged
  -- sweep_log was added to a function that runs unattended against live games.
  -- Its contract to pg_cron must not have shifted.
  if not (v_ret ? 'scored' and v_ret ? 'ingest_request' and v_ret ? 'week') then
    raise exception 'FAIL 3: gameday_sweep return shape changed: %', v_ret;
  end if;
  raise notice 'PASS 3: the returned JSONB still has its original shape';

end;
$$;

do $$
declare
  v_ret jsonb;
begin
  -- NOT VALID means existing rows are left alone but every new INSERT is
  -- rejected — precisely the "logging is broken" condition.
  begin
    alter table public.sweep_log add constraint sweep_log_break check (outcome = '__never__') not valid;
  exception when duplicate_object then null;
  end;

  v_ret := public.gameday_sweep();

  if v_ret is null then
    raise exception 'FAIL 4: gameday_sweep returned null when logging was broken';
  end if;
  raise notice 'PASS 4: sweep still returned % with the log rejecting inserts', v_ret;

  alter table public.sweep_log drop constraint sweep_log_break;
  raise notice 'ALL SWEEP LOG ASSERTIONS PASSED';
end;
$$;

rollback;
