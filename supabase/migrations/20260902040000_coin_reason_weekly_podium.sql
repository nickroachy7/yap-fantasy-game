-- A ledger reason for the free contest's podium.
--
-- Its own migration, following `20260826010000_gem_reason_contest_prize` and
-- the three before it. `alter type ... add value` cannot be used by a statement
-- in the same transaction that added it, so the value lands alone and the
-- function that writes it arrives in the next migration.

alter type public.coin_reason add value if not exists 'weekly_podium';
