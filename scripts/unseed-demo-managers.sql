-- Remove the demo managers seeded by `seed-demo-managers.sql`.
--
-- One DELETE is the whole teardown. Every table that references a user cascades
-- on delete — profiles, card_instances, lineups (and lineup_slots through
-- them), coins_ledger, coin_balances, set_milestone_claims — so nothing can be
-- left orphaned by removing the `auth.users` rows.
--
-- The predicate is the demo namespace and nothing else. It cannot reach a real
-- account: a live user's id would have to begin `d0d0d0d0-` to match.
--
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/unseed-demo-managers.sql

begin;

delete from auth.users where id::text like 'd0d0d0d0-%';

commit;

-- Should be zero.
select count(*) as demo_accounts_remaining
  from public.profiles where id::text like 'd0d0d0d0-%';
