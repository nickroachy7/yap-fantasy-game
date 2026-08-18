-- Yap Fantasy — RLS isolation test (build plan task 10)
--
-- Proves user A cannot read user B's roster, wallet, or ledger, and cannot
-- write game state at all. Runs inside a transaction that is rolled back, so
-- it is safe against any environment including production.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.test.sql
-- Any failed assertion raises, which makes psql exit non-zero.

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'user_a@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'user_b@test.local', '', now(), now(), now());

insert into public.teams (external_id, abbreviation) values (9001, 'TST');

insert into public.players (external_id, first_name, last_name, position, team_id)
values (9001, 'Test', 'Player', 'QB', (select id from public.teams where external_id = 9001));

insert into public.cards (player_id, season, rarity)
values ((select id from public.players where external_id = 9001), 2026, 'rare');

insert into public.card_instances (user_id, card_id, career_fp)
values
  ('11111111-1111-1111-1111-111111111111', (select id from public.cards limit 1), 300),
  ('22222222-2222-2222-2222-222222222222', (select id from public.cards limit 1), 300);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  visible_total   int;
  visible_foreign int;
  ledger_foreign  int;
  balance_foreign int;
  own_fp          numeric;
begin
  select count(*) into visible_total   from public.card_instances;
  select count(*) into visible_foreign from public.card_instances
    where user_id = '22222222-2222-2222-2222-222222222222';
  select count(*) into ledger_foreign  from public.gems_ledger
    where user_id = '22222222-2222-2222-2222-222222222222';
  select count(*) into balance_foreign from public.gem_balances
    where user_id = '22222222-2222-2222-2222-222222222222';

  if visible_total <> 1 then
    raise exception 'FAIL: user A sees % card_instances, expected exactly 1', visible_total;
  end if;
  if visible_foreign <> 0 then
    raise exception 'FAIL: user A can read % of user B''s card_instances', visible_foreign;
  end if;
  if ledger_foreign <> 0 then
    raise exception 'FAIL: user A can read user B''s gems_ledger';
  end if;
  if balance_foreign <> 0 then
    raise exception 'FAIL: user A can read user B''s gem_balance';
  end if;

  begin
    insert into public.gems_ledger (user_id, amount, reason)
    values ('11111111-1111-1111-1111-111111111111', 999999, 'admin_adjust');
    raise exception 'FAIL: user A minted their own gems';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.card_instances (user_id, card_id)
    values ('11111111-1111-1111-1111-111111111111', (select id from public.cards limit 1));
    raise exception 'FAIL: user A granted themselves a card';
  exception
    when insufficient_privilege then null;
  end;

  -- UPDATE and DELETE differ from INSERT: with no policy, RLS filters the rows
  -- away silently rather than raising. So assert on the data, not on an error --
  -- a test that only catches the exception would pass against a table that had
  -- an over-permissive UPDATE policy.
  update public.card_instances set career_fp = 999999
   where user_id = '11111111-1111-1111-1111-111111111111';
  select career_fp into own_fp from public.card_instances
   where user_id = '11111111-1111-1111-1111-111111111111';
  if own_fp is distinct from 300 then
    raise exception 'FAIL: user A levelled their own card to %', own_fp;
  end if;

  delete from public.card_instances;
  select count(*) into visible_total from public.card_instances;
  if visible_total <> 1 then
    raise exception 'FAIL: user A deleted card instances';
  end if;

  raise notice 'PASS: RLS isolation holds for user A';
end $$;

reset role;
rollback;
