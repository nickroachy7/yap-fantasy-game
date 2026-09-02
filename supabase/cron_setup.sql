-- Yap Fantasy — scheduled jobs (build plan task 12)
--
-- Not a migration: it references Vault secrets that are created once per
-- environment, so it is applied deliberately rather than on every db push.
--
-- Prerequisites (once per project):
--   1. Extensions: see migration 20260818015000_enable_cron_and_net.sql
--   2. Vault secrets:
--        select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),
--                                   'sync_secret', 'Scheduler shared secret');
--        select vault.create_secret('<publishable key>', 'anon_key', '…');
--      The sync secret is generated inside the database on purpose — no copy
--      exists in env vars, source, or logs. The Edge Function checks it via
--      public.verify_sync_secret().
--
-- Rotate the secret with:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'sync_secret'),
--     encode(extensions.gen_random_bytes(32), 'hex'));
-- No redeploy needed: both sides read from Vault.

select cron.unschedule('sync-reference-nightly')
where exists (select 1 from cron.job where jobname = 'sync-reference-nightly');

-- 09:15 UTC = 05:15 ET: after every game is final, before anyone opens the app.
select cron.schedule(
  'sync-reference-nightly',
  '15 9 * * *',
  $job$
  select net.http_post(
    url     := 'https://ygrmsleanavyewfbhlth.functions.supabase.co/sync-reference',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_secret')
    ),
    timeout_milliseconds := 300000
  );
  $job$
);

-- Verify a run:
--   select id, status_code, content::text from net._http_response order by id desc limit 5;

-- ---------------------------------------------------------------------------
-- WEEKLY PAYOUTS
-- ---------------------------------------------------------------------------
--
-- The faucet was written months before anything called it: `coins_ledger` held
-- ZERO 'weekly_grant' and ZERO 'weekly_score_reward' rows because no job here
-- ever ran them. This is that job.
--
-- HOURLY, not weekly, and the frequency is the point. `settle_week_payouts`
-- pays only weeks whose every game is final, and every payout under it is keyed
-- and idempotent — so running it often is free, and it means payday lands
-- within an hour of the last whistle rather than on a fixed day that is either
-- too early for Monday night or a day late for everyone else.
--
-- Runs at :20 to stay clear of the minute-by-minute scoring sweep and of the
-- 09:15 reference sync, so a week is never settled off half-ingested stats.
select cron.unschedule('settle-week-payouts')
where exists (select 1 from cron.job where jobname = 'settle-week-payouts');

select cron.schedule(
  'settle-week-payouts',
  '20 * * * *',
  $job$ select public.settle_week_payouts(); $job$
);

-- Verify:
--   select * from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'settle-week-payouts')
--    order by start_time desc limit 5;
--   select reason, count(*), sum(amount) from public.coins_ledger group by reason;

-- ---------------------------------------------------------------------------
-- NOT HERE: rotate-daily-set, ensure-week-contests
-- ---------------------------------------------------------------------------
--
-- Two jobs are scheduled in the migrations that introduced them rather than in
-- this file: the hourly daily-set rotation (20260824233000_daily_set_rotates)
-- and the nightly lobby materialisation, `ensure-week-contests`
-- (20260902020000_a_new_week_gets_its_lobby_by_itself). It needs
-- no Vault secret, so it does not need the deliberate per-environment
-- application this file exists for — and the bug it fixes was precisely a
-- rotation that never ran because nothing had scheduled it — and the second is
-- the same bug in the lobby. Listed here so that this file is still the answer
-- to "what is scheduled".
--
--   select jobname, schedule from cron.job order by jobname;

-- ---------------------------------------------------------------------------
-- PROVIDER FANTASY NUMBERS — THE FORECAST AND THE RESULT
-- ---------------------------------------------------------------------------
--
-- `sync-fantasy` pulls both halves of `/fantasy/*`: the week's projections
-- (`PROJ` on every lineup row) and the provider's own scored points, which are
-- the authority for `fantasy_points` under rules v3. See
-- `20260903020000_the_provider_scores_the_week.sql` for why the provider scores
-- and we no longer do.
--
-- TWICE, AND THE TWO RUNS WANT DIFFERENT THINGS.
--
-- PROJECTIONS ARE PERISHABLE AND GO STALE UPWARD. A forecast published on
-- Tuesday is worth less every day a beat reporter files, and the row that
-- matters most is the one a player reads on Sunday morning while setting a
-- lineup. So they are refreshed DAILY, early, before anyone opens the app —
-- and the upsert replaces in place rather than accumulating a history, because
-- the board wants the current claim and `collected_at` says how fresh it is.
--
-- RESULTS ARE NOT PERISHABLE, THEY ARE LATE. The provider publishes fantasy
-- points some time after the last whistle, which is well after our own
-- minute-by-minute sweep has already scored the week from raw stats. So the
-- points run is the SECOND pass: it overwrites our engine's number with the
-- provider's once that is available. A week is not wrong in the meantime, it is
-- provisional — see the runbook.
--
-- BOTH RUNS ARE IDEMPOTENT, which is what makes a daily schedule free. The
-- projections upsert is keyed on (player, season, week, season_type) and the
-- points upsert on (stat_line_id, rules_version); re-running rewrites the same
-- rows with the same values.
--
-- IT NAMES A WEEK WINDOW, AND IT HAS TO — this is not a preference.
--
-- The first version passed no `weeks` at all, on the reasoning that the
-- function walks all 18 and an unpublished week costs nothing. It cost 150
-- seconds: an Edge Function is killed at `IDLE_TIMEOUT`, and a full 18-week
-- projection walk reached week 11 before the platform closed the socket. The
-- run reported nothing, because the process that would have reported it was
-- gone. A schedule that fails silently two thirds of the way through is worse
-- than one that fails loudly.
--
-- THE WINDOW IS THE CURRENT WEEK AND THE TWO AFTER IT, which is also the only
-- window worth refreshing daily. A projection for week 14 published in
-- September is noise; it will be rewritten a dozen times before anyone reads
-- it, and the row that matters is the one for the week whose lineup is being
-- set. Weeks further out are still fetched — just by the weekly backfill below
-- rather than every morning.
--
-- `lineup_slate()` supplies the week — NOT `current_slate()`, and the two are
-- different on purpose. `current_slate()` is the last week to have KICKED OFF,
-- which is what the scoring sweep wants; `lineup_slate()` is the week people are
-- setting lineups FOR, which is what a projection is about. On the day this was
-- written they disagreed: `current_slate()` said preseason week 4 and
-- `lineup_slate()` said regular week 1, so keying on the former would have
-- refreshed regular-season weeks 4, 5 and 6 while every player on the app was
-- looking at week 1.
--
-- Null (no slate) falls back to week 1, which is correct in the only situation
-- that produces a null: the season has not started.

select cron.unschedule('sync-fantasy-daily')
where exists (select 1 from cron.job where jobname = 'sync-fantasy-daily');

-- 09:40 UTC = 05:40 ET. After `sync-reference-nightly` at :15 so the players
-- table is current before we try to match provider ids against it, and clear of
-- the payouts job at :20.
select cron.schedule(
  'sync-fantasy-daily',
  '40 9 * * *',
  $job$
  select net.http_post(
    url     := 'https://ygrmsleanavyewfbhlth.functions.supabase.co/sync-fantasy',
    body    := (
      with slate as (select * from public.lineup_slate() limit 1)
      select jsonb_build_object(
        'season', coalesce((select season from slate),
                           extract(year from now() at time zone 'America/New_York')::int),
        'weeks',  (select jsonb_agg(w) from generate_series(
                     coalesce((select week from slate), 1),
                     coalesce((select week from slate), 1) + 2
                   ) as w)
      )
    ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_secret')
    ),
    timeout_milliseconds := 900000
  );
  $job$
);

-- The far weeks, once a week rather than once a day.
--
-- Splits the rest of the season off the daily job so neither run approaches the
-- 150s ceiling that killed the first full-season walk. Sunday 08:50 UTC is
-- before the daily jobs and before any kickoff.
--
-- IT IS DELIBERATELY DUMB ABOUT WHICH WEEKS. It asks for 4..18 every time and
-- lets the upsert sort it out — weeks already covered by the daily window are
-- simply rewritten with the same values, and weeks the provider has not
-- published return nothing. Computing a precise complement of the daily window
-- would be arithmetic in a cron body to save writes that cost nothing.

select cron.unschedule('sync-fantasy-weekly-tail')
where exists (select 1 from cron.job where jobname = 'sync-fantasy-weekly-tail');

select cron.schedule(
  'sync-fantasy-weekly-tail',
  '50 8 * * 0',
  $job$
  select net.http_post(
    url     := 'https://ygrmsleanavyewfbhlth.functions.supabase.co/sync-fantasy',
    body    := jsonb_build_object(
      'season', coalesce((select season from public.lineup_slate() limit 1),
                         extract(year from now() at time zone 'America/New_York')::int),
      'mode',   'projections',
      'weeks',  (select jsonb_agg(w) from generate_series(4, 18) as w)
    ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_secret')
    ),
    timeout_milliseconds := 900000
  );
  $job$
);
