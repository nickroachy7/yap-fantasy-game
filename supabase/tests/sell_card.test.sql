-- Yap Fantasy — sell_card guards
--
-- Selling is the only path that turns an owned card back into gems, and it is
-- the only path that can both destroy an asset and create currency in one call.
-- Every refusal below is therefore worth a test, and each asserts on the SPECIFIC
-- reason — an earlier run of this suite "passed" because an intruder with no
-- wallet was stopped by the missing-wallet check before the ownership check was
-- ever reached, which proves nothing about ownership at all.
--
-- Runs inside a transaction that is rolled back, so it is safe against any
-- environment including production.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sell_card.test.sql

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '31111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'seller@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '32222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'intruder@test.local', '', now(), now(), now());

insert into public.teams (external_id, abbreviation) values (9101, 'SEL');
insert into public.players (external_id, first_name, last_name, position, position_abbreviation, team_id)
values (9101, 'Sell', 'Subject', 'QB', 'QB', (select id from public.teams where external_id = 9101));
insert into public.cards (player_id, season, rarity)
values ((select id from public.players where external_id = 9101), 2026, 'common');

-- Both users are funded, so an ownership refusal cannot be mistaken for a
-- missing-wallet refusal.
insert into public.gem_balances (user_id, balance) values
  ('31111111-1111-1111-1111-111111111111', 100),
  ('32222222-2222-2222-2222-222222222222', 100)
on conflict (user_id) do update set balance = 100;

-- A silver card, so the payout under test is not the bronze default.
-- BOTH POINT COLUMNS. `card_instances_sync_tier` derives tier from `settled_fp`
-- (20260821140000), not career_fp, so that a live in-game swing cannot promote a
-- card and then take it back. These fixtures are settled history — no week of
-- theirs is in play — so the two figures are equal. Setting only career_fp inserts
-- every copy at a default settled_fp of 0 and the whole fixture reads bronze.
insert into public.card_instances (id, user_id, card_id, career_fp, settled_fp)
values ('33333333-3333-3333-3333-333333333333',
        '31111111-1111-1111-1111-111111111111',
        (select id from public.cards where player_id = (select id from public.players where external_id = 9101)),
        250, 250);

do $$
declare
  v_card  uuid := '33333333-3333-3333-3333-333333333333';
  v_owner uuid := '31111111-1111-1111-1111-111111111111';
  v_other uuid := '32222222-2222-2222-2222-222222222222';
  v_price integer;
  v_slots  integer;
  v_season integer;
  v_type   smallint;
  v_week   integer;
  r        jsonb;
  ok       boolean;
begin
  select sell_value into v_price from public.tier_thresholds where tier = 'silver';

  -- 1. An unauthenticated caller cannot sell.
  perform set_config('request.jwt.claims', NULL, true);
  ok := false;
  begin r := public.sell_card(v_card); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: anonymous caller was allowed to sell'; end if;

  -- 2. A funded stranger is refused for OWNERSHIP, not for anything else.
  perform set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  ok := false;
  begin
    r := public.sell_card(v_card);
  exception when others then
    ok := sqlerrm like '%does not belong to you%';
    if not ok then raise exception 'FAIL: stranger blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: a stranger sold a card they do not own'; end if;
  if (select balance from public.gem_balances where user_id = v_other) <> 100 then
    raise exception 'FAIL: a failed sale still paid the caller';
  end if;

  -- 3. A card in an unscored lineup cannot be sold.
  insert into public.lineups (id, user_id, season, season_type, week)
  values ('34444444-4444-4444-4444-444444444444', v_owner, 2026, 1, 1);
  insert into public.lineup_slots (lineup_id, slot, card_instance_id)
  values ('34444444-4444-4444-4444-444444444444', 'QB', v_card);

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  ok := false;
  begin
    r := public.sell_card(v_card);
  exception when others then
    ok := sqlerrm like '%not been scored%';
    if not ok then raise exception 'FAIL: in-lineup card blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: sold a card that is in an unscored lineup'; end if;

  -- 4. Once the week is scored, the owner may sell — and is paid the tier price.
  update public.lineups set scored_at = now()
   where id = '34444444-4444-4444-4444-444444444444';
  select count(*) into v_slots from public.lineup_slots where card_instance_id = v_card;

  r := public.sell_card(v_card);
  if (r->>'sold_for')::integer <> v_price then
    raise exception 'FAIL: paid % for a silver card, expected %', r->>'sold_for', v_price;
  end if;
  if (select balance from public.gem_balances where user_id = v_owner) <> 100 + v_price then
    raise exception 'FAIL: balance did not move by the sale price';
  end if;
  if (select count(*) from public.gems_ledger
       where reason = 'card_sale' and reference_id = v_card) <> 1 then
    raise exception 'FAIL: sale was not written to the ledger exactly once';
  end if;

  -- 5. THE ONE THAT MATTERS. lineup_slots is ON DELETE CASCADE, so a hard delete
  --    here would erase this card from every week it ever started and silently
  --    rewrite past scoring. A sale must leave that history alone.
  if (select count(*) from public.lineup_slots where card_instance_id = v_card) <> v_slots then
    raise exception 'FAIL: selling destroyed lineup history';
  end if;

  -- 6. Gone from the collection, still in the table.
  if exists (select 1 from public.my_collection where id = v_card) then
    raise exception 'FAIL: a sold card is still in my_collection';
  end if;

  -- 7. Not sellable twice.
  ok := false;
  begin
    r := public.sell_card(v_card);
  exception when others then
    ok := sqlerrm like '%already been sold%';
    if not ok then raise exception 'FAIL: double sale blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: the same card was sold twice'; end if;

  -- 8. And it cannot be started after being sold.
  --    Deliberately aimed at the UPCOMING week, not a past one: a past week is
  --    already locked, so set_lineup would refuse it for the lock and this
  --    assertion would pass without ever exercising the sold-card rule.
  select season, season_type, week into v_season, v_type, v_week
    from public.upcoming_slate();
  ok := false;
  begin
    perform public.set_lineup(v_season, v_type, v_week,
      jsonb_build_array(jsonb_build_object('slot', 'QB', 'card_instance_id', v_card)));
  exception when others then
    ok := sqlerrm like '%does not belong to you%';
    if not ok then raise exception 'FAIL: sold card rejected by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: a sold card was accepted into a lineup'; end if;

  raise notice 'sell_card: all assertions passed';
end $$;

rollback;
