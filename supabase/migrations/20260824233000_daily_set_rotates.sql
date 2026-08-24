-- The daily set never rotated. Nothing was ever scheduled to rotate it.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ACTUALLY WRONG
-- ---------------------------------------------------------------------------
--
-- `rebuild_daily_set` shipped in 20260821090000_daily_sets.sql as a pure
-- function of the date, correct and idempotent, with a header explaining that
-- "the same day always produces the same set" so there is "no job that can
-- drift". There was no job at all. Its only caller is the `sync-cards` Edge
-- Function, which runs when somebody invokes it, and the only cron in this
-- database was `gameday-sweep`.
--
-- So the active daily is whichever day sync-cards last ran, indefinitely. The
-- `is_active = false` retirement of yesterday's set is inside the same function
-- and therefore never fired either, which means the Sets tab has been showing
-- one stale daily under a heading that says "Today" with a date that is not.
--
-- ---------------------------------------------------------------------------
-- WHAT "TODAY" MEANS, AND WHY IT IS NOT UTC
-- ---------------------------------------------------------------------------
--
-- sync-cards passed `new Date().toISOString().slice(0, 10)` — the UTC date.
-- UTC midnight is 7 or 8pm Eastern, which is the middle of Sunday Night
-- Football. A daily set that expires while the games it is made of are still
-- being played is wrong on the one night of the week that matters most, and
-- the checklist's own copy promises otherwise: "Gone at midnight."
--
-- So the day is the US EASTERN date. This is an NFL game with a US audience;
-- Eastern midnight is what its players mean by tomorrow, and it lands after
-- Sunday night's final whistle rather than during it.
--
-- ---------------------------------------------------------------------------
-- HOURLY, AND IDEMPOTENT, RATHER THAN ONE JOB AT MIDNIGHT
-- ---------------------------------------------------------------------------
--
-- A single nightly job has to be scheduled in UTC, and Eastern midnight is
-- 04:00 UTC for half the year and 05:00 for the other half. Encoding either
-- one means the rotation is an hour wrong for six months, and encoding both
-- means it fires twice a day for the whole year.
--
-- Running hourly sidesteps the arithmetic entirely: the job asks what the
-- Eastern date is right now and ensures that day's set exists. It rolls within
-- ten minutes of Eastern midnight in both halves of the year, and every run
-- after the first is a no-op because `rebuild_daily_set` is idempotent — the
-- same posture as `settle-week-payouts`, which runs hourly for the same reason
-- and is cheap for the same reason.
--
-- A MISSED DAY SELF-HEALS. The job does not walk a calendar or track the last
-- day it ran; it ensures today's set and retires everything older. An outage
-- means yesterday's daily stays up until the next successful run, and there is
-- no backlog to replay.

-- ---------------------------------------------------------------- the day

create or replace function public.daily_set_day()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'America/New_York')::date;
$$;

comment on function public.daily_set_day() is
  'The date the game means by "today": the US Eastern date. The single definition of the daily set''s day — sync-cards and the rotation job both read it, so they cannot disagree.';

grant execute on function public.daily_set_day() to authenticated;

-- ---------------------------------------------------------------- the job

-- Takes no arguments so that the schedule cannot encode a season that will be
-- wrong next August. The season is the newest one with cards printed in it,
-- which is the same derivation `settle_week_payouts` makes from `games`.
create or replace function public.rotate_daily_set()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season integer;
  v_day    date := public.daily_set_day();
begin
  select max(season) into v_season
    from public.cards
   where is_mintable;

  -- Before the pool is seeded there is nothing to build a daily out of. Not an
  -- error: this runs every hour from the moment the extension is enabled, and
  -- an empty database should not fill cron.job_run_details with failures.
  if v_season is null then
    return jsonb_build_object('rotated', false, 'reason', 'no mintable cards');
  end if;

  return public.rebuild_daily_set(v_season, v_day) || jsonb_build_object('rotated', true);
end;
$$;

revoke execute on function public.rotate_daily_set() from public, anon, authenticated;

comment on function public.rotate_daily_set() is
  'Ensures today''s daily set exists and retires yesterday''s. Scheduled hourly; idempotent, so every run after the first of a day does nothing.';

-- ---------------------------------------------------------------- schedule
--
-- IN THE MIGRATION rather than in `supabase/cron_setup.sql`, which is where the
-- other two jobs live. That file exists because its jobs reference Vault
-- secrets that are created once per environment, so it is applied by hand —
-- and a rotation that only happens if somebody remembers to apply a file by
-- hand is the exact failure this migration is repairing. This job needs no
-- secret, so it can ship with the schema, as `gameday-sweep` already does.
--
-- :10 past, to stay clear of the minute-by-minute scoring sweep at :00 and the
-- payout settle at :20.
select cron.unschedule('rotate-daily-set')
where exists (select 1 from cron.job where jobname = 'rotate-daily-set');

select cron.schedule(
  'rotate-daily-set',
  '10 * * * *',
  $cron$ select public.rotate_daily_set(); $cron$
);

-- ---------------------------------------------------------------- apply now
--
-- The first run is an hour away and the set on screen is stale today. Doing it
-- here means the fix is visible on deploy rather than at the next hour mark.
do $$
begin
  perform public.rotate_daily_set();
end;
$$;
