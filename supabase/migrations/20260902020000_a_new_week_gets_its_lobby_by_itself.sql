-- `ensure_all_contests()` was built to be run after a schedule sync, and
-- nothing ran it.
--
-- ---------------------------------------------------------------------------
-- THE GAP
-- ---------------------------------------------------------------------------
--
-- `20260901050000` made the lobby a catalogue precisely so that a week arriving
-- later would get one. Its own header says what was wrong with the old way:
--
--     A WEEK THAT ARRIVES LATER GETS NOTHING. `ensure_free_contest` creates the
--     free contest lazily, so the free row self-heals and the lobby does not.
--
-- It then built `ensure_all_contests()`, commented it "run after a schedule
-- sync so a newly-slated week gets its lobby", called it ONCE at the bottom of
-- the migration, and left it there. Every 2026 regular-season week is
-- materialised, so the lobby is complete today and the gap is invisible — which
-- is the only reason it survived review.
--
-- But `sync-reference` runs nightly and re-slates games. A week added or moved
-- by a schedule change gets a free contest (lazily, from `set_lineup`) and
-- eight empty spaces where the lobby should be, with no error anywhere. The
-- mechanism for fixing that exists and has no caller.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS IN A MIGRATION AND NOT IN `cron_setup.sql`
-- ---------------------------------------------------------------------------
--
-- `cron_setup.sql` is the answer to "what is scheduled", and it is applied by
-- hand per environment because its jobs need Vault secrets — they reach out
-- over `net.http_post` to an Edge Function and have to authenticate.
--
-- This one does not. `ensure_all_contests()` is a plain database function, so
-- the job is a `select` and needs no secret, no Edge Function, and no deploy.
-- That puts it under the rule `cron_setup.sql` states at its own foot, for
-- `rotate-daily-set`:
--
--     It needs no Vault secret, so it does not need the deliberate
--     per-environment application this file exists for — and the bug it fixes
--     was precisely a rotation that never ran because nothing had scheduled it.
--
-- Which is this bug, one system over. A job that must not be forgotten does not
-- belong in a file somebody has to remember to apply.
--
-- ---------------------------------------------------------------------------
-- DAILY AT 09:45 UTC
-- ---------------------------------------------------------------------------
--
-- Fifteen minutes after `sync-reference` at 09:15, whose own timeout is five
-- minutes — so the schedule has finished landing before this reads it. It is
-- also clear of the three jobs already on the hour: the scoring sweep at :00,
-- the daily-set rotation at :10, and the payout settle at :20.
--
-- DAILY RATHER THAN HOURLY, unlike its neighbours. Those are settling money and
-- rotating something on screen, where an hour of staleness is felt. A slate
-- changes when the NFL changes it, which is a nightly fact — and the only
-- source that would move it is the nightly sync this trails.
--
-- IT IS SAFE TO RUN AGAINST A FULLY MATERIALISED SEASON, which is what it will
-- do almost every night. `ensure_week_contests` inserts `on conflict (code) do
-- nothing` and skips any week that has kicked off, so a no-op night writes
-- nothing and touches no contest anybody is playing in.

select cron.unschedule('ensure-week-contests')
where exists (select 1 from cron.job where jobname = 'ensure-week-contests');

select cron.schedule(
  'ensure-week-contests',
  '45 9 * * *',
  $cron$ select public.ensure_all_contests(); $cron$
);

-- Assert the job is actually there. The failure this migration exists to fix
-- was a function nobody called; shipping it as a schedule nobody registered
-- would be the same bug wearing a different hat.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'ensure-week-contests') then
    raise exception 'ensure-week-contests did not schedule';
  end if;
end $$;
