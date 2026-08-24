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
--
-- SAT ON SILVER'S FLOOR RATHER THAN ON A NUMBER. This was a hardcoded 250,
-- which was comfortably silver under the ladder in force when it was written
-- and is GOLD under the one shipped in `reachable_tier_ladder` — so the suite
-- started asserting silver's 40 against a gold card's 150 and failed on a
-- change to figures it was never meant to be testing. Reading the floor out of
-- `tier_thresholds` is what makes the fixture survive the next tuning pass, and
-- it is the same discipline card_actions.test.sql already follows.
--
-- BOTH POINT COLUMNS. `card_instances_sync_tier` derives tier from `settled_fp`
-- (20260821140000), not career_fp, so that a live in-game swing cannot promote a
-- card and then take it back. These fixtures are settled history — no week of
-- theirs is in play — so the two figures are equal. Setting only career_fp inserts
-- every copy at a default settled_fp of 0 and the whole fixture reads bronze.
insert into public.card_instances (id, user_id, card_id, career_fp, settled_fp)
select '33333333-3333-3333-3333-333333333333',
       '31111111-1111-1111-1111-111111111111',
       (select id from public.cards where player_id = (select id from public.players where external_id = 9101)),
       t.min_career_fp, t.min_career_fp
  from public.tier_thresholds t
 where t.tier = 'silver';

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

-- ---------------------------------------------------------------- sell_cards
--
-- The bulk sale is a LOOP over the single one, so what has to be proved here is
-- not the rules — they are asserted above — but that the loop does not lose
-- them. Three things:
--
--   1. it sells every card it can and reports the total actually paid;
--   2. ONE REFUSAL DOES NOT FAIL THE REST, which is the whole reason the
--      per-card savepoint exists, and the refused card is named with its
--      reason rather than silently dropped;
--   3. the ceiling is enforced, so a runaway client cannot ask for ten
--      thousand sales in one statement.
do $$
declare
  v_a      uuid;
  v_b      uuid;
  v_locked uuid;
  v_before integer;
  v_after  integer;
  r        jsonb;
  ok       boolean := false;
  v_season integer; v_type smallint; v_week integer;
begin
  -- The owner, explicitly. The block above finishes on whichever claim its last
  -- assertion needed, and a bulk sale run as somebody else would refuse every
  -- card for ownership and "pass" this suite by failing for the wrong reason.
  perform set_config('request.jwt.claims',
    json_build_object('sub', '31111111-1111-1111-1111-111111111111')::text, true);

  -- Three fresh copies of the fixture's card: two to sell, one parked in an
  -- unscored lineup so it must refuse while the others go through.
  insert into public.card_instances (user_id, card_id, career_fp, settled_fp)
  values ('31111111-1111-1111-1111-111111111111', (select id from public.cards where player_id = (select id from public.players where external_id = 9101)), 0, 0)
  returning id into v_a;
  insert into public.card_instances (user_id, card_id, career_fp, settled_fp)
  values ('31111111-1111-1111-1111-111111111111', (select id from public.cards where player_id = (select id from public.players where external_id = 9101)), 0, 0)
  returning id into v_b;
  insert into public.card_instances (user_id, card_id, career_fp, settled_fp)
  values ('31111111-1111-1111-1111-111111111111', (select id from public.cards where player_id = (select id from public.players where external_id = 9101)), 0, 0)
  returning id into v_locked;

  select season, season_type, week into v_season, v_type, v_week from public.upcoming_slate();
  perform public.set_lineup(v_season, v_type, v_week,
    jsonb_build_array(jsonb_build_object('slot', 'QB', 'card_instance_id', v_locked)));

  select balance into v_before from public.gem_balances
   where user_id = '31111111-1111-1111-1111-111111111111';

  r := public.sell_cards(array[v_a, v_locked, v_b]);

  select balance into v_after from public.gem_balances
   where user_id = '31111111-1111-1111-1111-111111111111';

  if (r ->> 'sold')::integer <> 2 then
    raise exception 'FAIL: % of 3 sold, expected the 2 that were sellable', r ->> 'sold';
  end if;
  if (r ->> 'skipped')::integer <> 1 then
    raise exception 'FAIL: % skipped, expected the 1 in a lineup', r ->> 'skipped';
  end if;
  -- The refusal is NAMED, and for the right reason. A bulk action that dropped
  -- a card silently would be worse than one that refused outright.
  if (r -> 'refusals' -> 0 ->> 'card_instance_id')::uuid <> v_locked then
    raise exception 'FAIL: the wrong card was refused: %', r -> 'refusals';
  end if;
  if (r -> 'refusals' -> 0 ->> 'reason') not like '%not been scored%' then
    raise exception 'FAIL: the starter was refused for the wrong reason: %',
      r -> 'refusals' -> 0 ->> 'reason';
  end if;
  -- The gems reported are the gems that landed.
  if v_after - v_before <> (r ->> 'paid')::integer then
    raise exception 'FAIL: reported % paid, wallet moved %',
      r ->> 'paid', v_after - v_before;
  end if;
  if (r ->> 'balance')::integer <> v_after then
    raise exception 'FAIL: reported balance % against a wallet holding %',
      r ->> 'balance', v_after;
  end if;
  -- And the two that sold really are gone.
  if exists (select 1 from public.card_instances
              where id in (v_a, v_b) and sold_at is null) then
    raise exception 'FAIL: a card reported as sold is still held';
  end if;
  -- While the refused one is untouched, not half-sold.
  if (select sold_at from public.card_instances where id = v_locked) is not null then
    raise exception 'FAIL: the refused card was sold anyway';
  end if;

  -- The ceiling.
  begin
    perform public.sell_cards(
      (select array_agg(v_a) from generate_series(1, 65)));
  exception when others then
    ok := sqlerrm like '%too many cards%';
    if not ok then raise exception 'FAIL: the ceiling refused for the wrong reason: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: 65 cards were accepted in one request'; end if;

  -- An empty request is a refusal, not a no-op that reports zero sales.
  ok := false;
  begin
    perform public.sell_cards(array[]::uuid[]);
  exception when others then
    ok := sqlerrm like '%no cards were named%';
    if not ok then raise exception 'FAIL: an empty list refused for the wrong reason: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: an empty list was accepted'; end if;

  raise notice 'sell_cards: all assertions passed';
end $$;

rollback;
