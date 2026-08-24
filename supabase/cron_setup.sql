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
-- The faucet was written months before anything called it: `gems_ledger` held
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
--   select reason, count(*), sum(amount) from public.gems_ledger group by reason;
