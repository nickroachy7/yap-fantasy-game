-- Yap Fantasy — committing cards to a set, and the milestone ladder it pays
--
-- Two functions here can create currency out of game state — `commit_card_to_set`
-- pays for a card it destroys, `claim_set_reward` pays for progress — so they
-- get the same treatment `open_pack` and `sell_card` already get: every refusal
-- is asserted on its SPECIFIC reason, because a test that only checks "it
-- failed" passes just as happily when the caller was stopped by the wrong rule.
--
-- The things that must hold:
--   1. committing BURNS the copy: it leaves the collection, cannot be started,
--      cannot be sold, and cannot be taken back;
--   2. it burns the LEAST valuable copy you hold and never your best — the one
--      mistake here would cost somebody a gold card on a mis-tap;
--   3. one copy per slot: three copies of a player fill his slot once;
--   4. the ladder pays each rung EXACTLY ONCE, sweeps every rung reached since
--      the last claim, and pays nothing when nothing new has been reached;
--   5. a set cannot be over-committed past its requirement;
--   6. none of it leaks: another user's commits are invisible and unusable.
--
-- THE LADDER UNDER TEST IS THIS FILE'S OWN, not the one rebuild_card_sets
-- seeds. A suite asserting against the production figures would fail every time
-- somebody tuned them, which is exactly the change those figures exist to make
-- cheap.
--
-- THE ROLE SWITCHING IS NOT DECORATION. Every read runs as `authenticated`,
-- because RLS does not apply to the table owner and the owner is who psql
-- connects as. An earlier draft asserted isolation while still connected as the
-- owner and "failed" against a view that was perfectly correct. Setup and the
-- writes between stages run as the owner; every assertion runs as authenticated.
-- Same pattern as rls_isolation.
--
-- Runs inside a transaction that is rolled back, so it is safe against any
-- environment including production.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/card_sets.test.sql

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '51111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'collector@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '52222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'rival@test.local',     '', now(), now(), now());

insert into public.coin_balances (user_id, balance) values
  ('51111111-1111-1111-1111-111111111111', 100),
  ('52222222-2222-2222-2222-222222222222', 100)
on conflict (user_id) do update set balance = 100;

-- A set of its own, so the suite does not depend on how many cards the real
-- pool holds. All six players are quarterbacks, which matters only for the
-- lineup stage at the end.
insert into public.teams (external_id, abbreviation, full_name, conference, division)
values (9301, 'SET', 'Set Test Club', 'AFC', 'NORTH');

insert into public.players (external_id, first_name, last_name, position, position_abbreviation, team_id)
select 9300 + n, 'Member', 'Number' || n, 'QB', 'QB', (select id from public.teams where external_id = 9301)
  from generate_series(1, 6) n;

insert into public.cards (player_id, season, rarity)
select p.id, 2026, 'common'
  from public.players p
 where p.external_id between 9301 and 9306;

-- FIVE members, requiring FOUR. The gap is what makes "already complete"
-- testable: a member card has to still be outside the set when the bar is met.
-- Card 6 is outside the set entirely, so "not in this set" is asserted against
-- a card that genuinely exists.
insert into public.card_sets (id, code, name, family, subtitle, season, required_count, sort_order)
values ('53333333-3333-3333-3333-333333333333', 'test-set-2026', 'Test Set', 'team', 'AFC North', 2026, 4, 999);

insert into public.card_set_members (set_id, card_id)
select '53333333-3333-3333-3333-333333333333', c.id
  from public.cards c
  join public.players p on p.id = c.player_id
 where p.external_id between 9301 and 9305;

-- Four rungs on a requirement of four, so each lands on a whole card:
-- 25% -> 1, 50% -> 2, 75% -> 3, 100% -> 4. The amounts are deliberately
-- unequal, so a sweep that paid the WRONG pair of rungs cannot pass by adding
-- up to the right total.
insert into public.card_set_milestones (set_id, threshold_pct, reward_coins) values
  ('53333333-3333-3333-3333-333333333333',  25,  10),
  ('53333333-3333-3333-3333-333333333333',  50,  20),
  ('53333333-3333-3333-3333-333333333333',  75,  30),
  ('53333333-3333-3333-3333-333333333333', 100, 100);

create temporary table set_test_cards on commit drop as
select row_number() over (order by p.external_id) as n, c.id
  from public.cards c
  join public.players p on p.id = c.player_id
 where p.external_id between 9301 and 9306;

-- The stages below read this while acting as `authenticated`, and a temp table
-- is owned by the connecting role like any other. Without the grant the first
-- assertion fails with "permission denied for table set_test_cards" from inside
-- an exception handler, which reads as the function under test refusing for the
-- wrong reason.
grant select on set_test_cards to authenticated;

-- ---------------------------------------------------------------- signed out
set local role authenticated;

do $$
declare ok boolean := false; r jsonb;
begin
  begin
    r := public.commit_card_to_set('test-set-2026', (select id from set_test_cards where n = 1));
  exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: anonymous caller was allowed to commit'; end if;

  ok := false;
  begin r := public.claim_set_reward('test-set-2026'); exception when others then ok := true; end;
  if not ok then raise exception 'FAIL: anonymous caller was allowed to claim'; end if;
end;
$$;

-- ------------------------------------------------------- nothing held at all
set local request.jwt.claims = '{"sub":"51111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare ok boolean := false; r jsonb; v record;
begin
  select committed, ready, total_cards, required_count, total_reward, claimable_coins,
         next_at, next_reward
    into v from public.my_sets where code = 'test-set-2026';

  if v.committed <> 0 or v.ready <> 0 then
    raise exception 'FAIL: an empty collection read as % committed / % ready', v.committed, v.ready;
  end if;
  if v.total_cards <> 5 or v.required_count <> 4 then
    raise exception 'FAIL: the set reported % members requiring %, expected 5 and 4',
      v.total_cards, v.required_count;
  end if;
  if v.total_reward <> 160 then
    raise exception 'FAIL: the ladder totals %, expected 160', v.total_reward;
  end if;
  if v.claimable_coins <> 0 then
    raise exception 'FAIL: % coins were claimable with nothing committed', v.claimable_coins;
  end if;
  -- The first rung, before anything has been done about it.
  if v.next_at <> 1 or v.next_reward <> 10 then
    raise exception 'FAIL: the next rung reads % cards for % coins, expected 1 for 10',
      v.next_at, v.next_reward;
  end if;

  begin
    r := public.commit_card_to_set('test-set-2026', (select id from set_test_cards where n = 1));
  exception when others then
    ok := sqlerrm like '%do not hold a copy%';
    if not ok then raise exception 'FAIL: empty collection blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: a card nobody holds was committed'; end if;

  ok := false;
  begin
    r := public.claim_set_reward('test-set-2026');
  exception when others then
    ok := sqlerrm like '%nothing to claim%';
    if not ok then raise exception 'FAIL: an untouched ladder was blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: a set paid out with nothing committed'; end if;
end;
$$;

-- ------------------------------------------------- three copies, one of them gold
--
-- THE STAGE THAT MATTERS. Three copies of card 1, and committing must take the
-- cheapest of them:
--
--   0 fp   bronze   <- this one
--  10 fp   bronze
-- 800 fp   gold
--
-- THE MIDDLE COPY EARNS ITS 10 POINTS. It was 0 in the first draft, which tied
-- it with the copy under test on career_fp and pushed the decision onto
-- `commit_candidate`'s id tiebreak — a gen_random_uuid(), so the suite passed
-- or failed by coin flip and did so on the second run. A test of "takes the
-- cheapest" has to have exactly one cheapest.
reset role;
-- BOTH POINT COLUMNS. `card_instances_sync_tier` derives tier from `settled_fp`
-- (20260821140000), not career_fp, so that a live in-game swing cannot promote a
-- card and then take it back. These fixtures are settled history — no week of
-- theirs is in play — so the two figures are equal. Setting only career_fp inserts
-- every copy at a default settled_fp of 0 and the whole fixture reads bronze.
insert into public.card_instances (id, user_id, card_id, career_fp, settled_fp)
values ('54444444-0000-0000-0000-00000000000b',
        '51111111-1111-1111-1111-111111111111',
        (select id from set_test_cards where n = 1), 0, 0),
       -- 300, not the 800 this was written with. 20260821250000 re-cut the
       -- ladder to 50/200/600, which promoted 800 fp from gold to DIAMOND and
       -- broke the assertion below that names this copy gold. 300 is gold under
       -- the current ladder; all this copy has to be is worth more than the
       -- bronze one, so that "the commit takes the least valuable copy" has
       -- something to choose between.
       ('54444444-0000-0000-0000-00000000000f',
        '51111111-1111-1111-1111-111111111111',
        (select id from set_test_cards where n = 1), 300, 300);
-- A third copy, so "three copies fill one slot" is a real case rather than an
-- assumed one.
insert into public.card_instances (user_id, card_id, career_fp, settled_fp)
values ('51111111-1111-1111-1111-111111111111',
        (select id from set_test_cards where n = 1), 10, 10);
-- And one copy of card 6, which is not in the set.
insert into public.card_instances (user_id, card_id)
values ('51111111-1111-1111-1111-111111111111', (select id from set_test_cards where n = 6));
set local role authenticated;

do $$
declare
  v_bronze constant uuid := '54444444-0000-0000-0000-00000000000b';
  v_gold   constant uuid := '54444444-0000-0000-0000-00000000000f';
  ok boolean := false; r jsonb; v record; v_bal integer; v_quote integer;
begin
  -- The tiers the trigger derived, so the payout below is not asserted against
  -- a number this file made up.
  if (select tier from public.card_instances where id = v_bronze) <> 'bronze'
     or (select tier from public.card_instances where id = v_gold) <> 'gold' then
    raise exception 'FAIL: the fixture copies are not bronze and gold';
  end if;

  -- Three copies of one card is ONE actionable slot, not three.
  select committed, ready into v from public.my_sets where code = 'test-set-2026';
  if v.ready <> 1 then
    raise exception 'FAIL: three copies of one card reported % ready slots', v.ready;
  end if;

  -- A card that is not in this set is refused as such.
  begin
    r := public.commit_card_to_set('test-set-2026', (select id from set_test_cards where n = 6));
  exception when others then
    ok := sqlerrm like '%not in this set%';
    if not ok then raise exception 'FAIL: a non-member was blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: a card outside the set was committed to it'; end if;

  /* WHAT THE BUTTON QUOTED, read before the press.
   *
   * This block used to assert the commit paid `4`, with a comment saying
   * "bronze sells for 8, the set pays 50% of it" — and it broke on 2026-09-03
   * when `20260903050345` raised the price floor from 8 to 12 and a commit
   * started paying 6. Nothing was wrong: a constant copied out of the price
   * ladder had gone stale, which is what constants copied out of another
   * table do.
   *
   * The invariant that does not go stale is the one a player actually cares
   * about — THE COMMIT PAYS WHAT THE CHECKLIST QUOTED IT AT. That is the
   * number on the screen they pressed, and it is worth more as an assertion
   * than any figure, because it fails when the quote and the payment part
   * company rather than when somebody re-tunes a price. */
  v_quote := (select commit_value from public.set_checklist('test-set-2026')
               where card_id = (select id from set_test_cards where n = 1));
  if coalesce(v_quote, 0) <= 0 then
    raise exception 'FAIL: the checklist quoted % to commit a card the player holds', v_quote;
  end if;
  v_bal := (select balance from public.coin_balances where user_id = auth.uid());

  -- The commit itself.
  r := public.commit_card_to_set('test-set-2026', (select id from set_test_cards where n = 1));

  if (r ->> 'card_instance_id')::uuid <> v_bronze then
    raise exception 'FAIL: the commit burnt % — it must take the least valuable copy', r ->> 'card_instance_id';
  end if;
  if (r ->> 'tier') <> 'bronze' then
    raise exception 'FAIL: the commit reported tier %, expected bronze', r ->> 'tier';
  end if;
  if (select is_held from public.card_instances where id = v_gold) is not true then
    raise exception 'FAIL: the gold copy was destroyed';
  end if;
  -- The quote is the payment, and the payment is the whole of the movement.
  if (r ->> 'paid')::integer <> v_quote then
    raise exception 'FAIL: the checklist quoted % and the commit paid %',
      v_quote, r ->> 'paid';
  end if;
  if (select balance from public.coin_balances where user_id = auth.uid()) <> v_bal + v_quote then
    raise exception 'FAIL: balance is % after a % coin commit on %',
      (select balance from public.coin_balances where user_id = auth.uid()), v_quote, v_bal;
  end if;
  if (select count(*) from public.coins_ledger where reason = 'set_commit') <> 1 then
    raise exception 'FAIL: the commit did not write exactly one ledger row';
  end if;

  -- BURNT. Out of the collection, and no longer held.
  if (select is_held from public.card_instances where id = v_bronze) is not false then
    raise exception 'FAIL: a committed copy is still held';
  end if;
  if exists (select 1 from public.my_collection where id = v_bronze) then
    raise exception 'FAIL: a committed copy is still in the collection';
  end if;

  -- One slot filled, the two remaining copies of the same card no longer
  -- actionable, and the first rung crossed.
  select committed, ready, claimable_coins, next_at, next_reward
    into v from public.my_sets where code = 'test-set-2026';
  if v.committed <> 1 then
    raise exception 'FAIL: one commit read as % committed', v.committed;
  end if;
  if v.ready <> 0 then
    raise exception 'FAIL: a filled slot still reported % ready', v.ready;
  end if;
  if v.claimable_coins <> 10 then
    raise exception 'FAIL: one commit made % coins claimable, expected 10', v.claimable_coins;
  end if;
  if v.next_at <> 2 or v.next_reward <> 20 then
    raise exception 'FAIL: the next rung reads % cards for % coins, expected 2 for 20',
      v.next_at, v.next_reward;
  end if;

  -- The same card cannot be committed twice, and the refusal costs nothing.
  v_bal := (select balance from public.coin_balances where user_id = auth.uid());
  ok := false;
  begin
    r := public.commit_card_to_set('test-set-2026', (select id from set_test_cards where n = 1));
  exception when others then
    ok := sqlerrm like '%already in this set%';
    if not ok then raise exception 'FAIL: a second commit was blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: one card filled its slot twice'; end if;
  if (select balance from public.coin_balances where user_id = auth.uid()) <> v_bal then
    raise exception 'FAIL: a refused commit still paid out';
  end if;

  -- A committed copy cannot be sold. It is in a set; paying for it again would
  -- be paying twice for one card.
  ok := false;
  begin
    r := public.sell_card(v_bronze);
  exception when others then
    ok := sqlerrm like '%committed to a set%';
    if not ok then raise exception 'FAIL: selling a committed card was blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: a committed card was sold'; end if;

  -- The checklist agrees with the view.
  if (select count(*) from public.set_checklist('test-set-2026') where committed) <> 1 then
    raise exception 'FAIL: the checklist did not mark exactly one slot filled';
  end if;
  if (select commit_value from public.set_checklist('test-set-2026')
       where card_id = (select id from set_test_cards where n = 2)) <> 0 then
    raise exception 'FAIL: a card you do not hold quoted a commit value';
  end if;

  -- ---- the first rung ----------------------------------------------------
  /* The rung AMOUNTS stay hardcoded, and that is the distinction worth keeping:
   * 10 / 20 / 30 / 100 are this set's own ladder, seeded by this file at the
   * top, so they are facts the suite owns. What it does not own is the price of
   * a card — so balances are asserted as MOVEMENTS from wherever the last step
   * left them. */
  v_bal := (select balance from public.coin_balances where user_id = auth.uid());
  r := public.claim_set_reward('test-set-2026');
  if (r ->> 'reward_coins')::integer <> 10 or (r ->> 'rungs')::integer <> 1 then
    raise exception 'FAIL: the first claim paid % over % rungs, expected 10 over 1',
      r ->> 'reward_coins', r ->> 'rungs';
  end if;
  if (select balance from public.coin_balances where user_id = auth.uid()) <> v_bal + 10 then
    raise exception 'FAIL: balance is % after a 10 coin rung on %',
      (select balance from public.coin_balances where user_id = auth.uid()), v_bal;
  end if;

  -- NOTHING NEW SINCE. A second press must not pay the same rung again.
  ok := false;
  begin
    r := public.claim_set_reward('test-set-2026');
  exception when others then
    ok := sqlerrm like '%nothing to claim%';
    if not ok then raise exception 'FAIL: a repeat claim was blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: the same rung was claimed twice'; end if;
  if (select balance from public.coin_balances where user_id = auth.uid()) <> v_bal + 10 then
    raise exception 'FAIL: a refused claim still moved the balance';
  end if;
  -- The paid rung reports what actually landed, not what it is priced at.
  if (select claimed_coins from public.my_sets where code = 'test-set-2026') <> 10 then
    raise exception 'FAIL: the claimed total reads %, expected 10',
      (select claimed_coins from public.my_sets where code = 'test-set-2026');
  end if;
end;
$$;

-- --------------------------------------------- a card inside an unscored lineup
reset role;
insert into public.card_instances (id, user_id, card_id)
values ('54444444-0000-0000-0000-000000000002',
        '51111111-1111-1111-1111-111111111111',
        (select id from set_test_cards where n = 2));

insert into public.lineups (id, user_id, season, season_type, week)
values ('55555555-5555-5555-5555-555555555555',
        '51111111-1111-1111-1111-111111111111', 2026, 1, 1);
insert into public.lineup_slots (lineup_id, slot, card_instance_id)
values ('55555555-5555-5555-5555-555555555555', 'QB', '54444444-0000-0000-0000-000000000002');
set local role authenticated;

-- A STARTER CAN BE COMMITTED, AND THE SLOT IT WAS STANDING IN IS FREED.
--
-- This block used to assert the opposite: that committing a card sitting in an
-- unscored lineup was REFUSED. 20260821230000 reversed that deliberately — the
-- slot belongs to us, so emptying it in the same transaction as the burn is a
-- better remedy than refusing an action the player clearly meant. The test was
-- written a few hours before that migration and kept asserting the old rule.
do $$
declare r jsonb; v_slots integer; v_inst uuid;
begin
  select id into v_inst from public.card_instances
   where id = '54444444-0000-0000-0000-000000000002';

  r := public.commit_card_to_set('test-set-2026', (select id from set_test_cards where n = 2));

  if (r ->> 'card_instance_id')::uuid <> v_inst then
    raise exception 'FAIL: the commit took % rather than the started copy', r ->> 'card_instance_id';
  end if;

  -- The half that makes this safe rather than merely permissive: the lineup
  -- must not be left naming a card that no longer exists to be scored.
  select count(*) into v_slots
    from public.lineup_slots
   where lineup_id = '55555555-5555-5555-5555-555555555555';
  if v_slots <> 0 then
    raise exception 'FAIL: committing a starter left % slots holding it', v_slots;
  end if;

  if (select is_held from public.card_instances where id = v_inst) is not false then
    raise exception 'FAIL: the committed copy is still held';
  end if;
end;
$$;

-- Hand over the rest of the set. The lineup slot no longer needs releasing —
-- the commit above freed it, which is the behaviour that block now checks.
reset role;
insert into public.card_instances (user_id, card_id)
values ('51111111-1111-1111-1111-111111111111', (select id from set_test_cards where n = 3)),
       ('51111111-1111-1111-1111-111111111111', (select id from set_test_cards where n = 4)),
       ('51111111-1111-1111-1111-111111111111', (select id from set_test_cards where n = 5));
set local role authenticated;

do $$
declare ok boolean := false; r jsonb; v record; v_bal integer; v_paid integer;
begin
  -- Card 2 went in above, as a starter whose slot was freed by the commit. It
  -- used to be committed here instead, because the block above expected the
  -- attempt to be refused. Three are committed either way — 1, 2 and 3 — which
  -- is what the two rungs below are counted against.
  /* Movements, not constants, for the same reason as the block above: what a
     commit pays is the price ladder's business and it has moved once already. */
  v_bal := (select balance from public.coin_balances where user_id = auth.uid());
  r := public.commit_card_to_set('test-set-2026', (select id from set_test_cards where n = 3));
  v_paid := (r ->> 'paid')::integer;

  -- ---- TWO RUNGS AT ONCE -------------------------------------------------
  -- Three committed crosses both the 50% and the 75% bars, and one press must
  -- collect both.
  select claimable_coins into v from public.my_sets where code = 'test-set-2026';
  if v.claimable_coins <> 50 then
    raise exception 'FAIL: three commits made % claimable, expected 50 (20 + 30)', v.claimable_coins;
  end if;

  r := public.claim_set_reward('test-set-2026');
  if (r ->> 'rungs')::integer <> 2 or (r ->> 'reward_coins')::integer <> 50 then
    raise exception 'FAIL: the sweep paid % over % rungs, expected 50 over 2',
      r ->> 'reward_coins', r ->> 'rungs';
  end if;
  -- The two commits this block has made, plus the 50 the sweep just paid. (The
  -- second commit is card 2's, made by the lineup block above; both are already
  -- in `v_bal`'s successor by the time this reads.)
  if (select balance from public.coin_balances where user_id = auth.uid()) <> v_bal + v_paid + 50 then
    raise exception 'FAIL: balance is %, expected % (% + % commit + 50 swept)',
      (select balance from public.coin_balances where user_id = auth.uid()),
      v_bal + v_paid + 50, v_bal, v_paid;
  end if;
  -- ONE LEDGER ROW PER RUNG, not one for the sweep: a 25% tranche and a 100%
  -- tranche have to stay distinguishable in the audit trail.
  if (select count(*) from public.coins_ledger where reason = 'set_reward') <> 3 then
    raise exception 'FAIL: the ladder wrote % ledger rows, expected 3',
      (select count(*) from public.coins_ledger where reason = 'set_reward');
  end if;

  -- ---- the top rung ------------------------------------------------------
  v_bal := (select balance from public.coin_balances where user_id = auth.uid());
  r := public.commit_card_to_set('test-set-2026', (select id from set_test_cards where n = 4));
  v_paid := (r ->> 'paid')::integer;

  select committed, complete, next_at into v from public.my_sets where code = 'test-set-2026';
  if v.committed <> 4 or not v.complete then
    raise exception 'FAIL: four commits read as % committed, complete=%', v.committed, v.complete;
  end if;
  if v.next_at is not null then
    raise exception 'FAIL: a finished ladder still points at a rung of % cards', v.next_at;
  end if;

  -- OVER-COMMITTING IS REFUSED, even though a fifth member is held and its
  -- slot is empty. Past the bar a commit pays half of what the sell button
  -- pays and buys nothing, because there is no rung above 100%.
  ok := false;
  begin
    r := public.commit_card_to_set('test-set-2026', (select id from set_test_cards where n = 5));
  exception when others then
    ok := sqlerrm like '%already complete%';
    if not ok then raise exception 'FAIL: over-commit was blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: a card was burnt into an already-complete set'; end if;

  r := public.claim_set_reward('test-set-2026');
  if (r ->> 'reward_coins')::integer <> 100 or (r ->> 'rungs')::integer <> 1 then
    raise exception 'FAIL: the top rung paid % over % rungs, expected 100 over 1',
      r ->> 'reward_coins', r ->> 'rungs';
  end if;
  -- The commit above, plus the 100 the top rung pays.
  if (select balance from public.coin_balances where user_id = auth.uid()) <> v_bal + v_paid + 100 then
    raise exception 'FAIL: balance is %, expected % (% + % commit + 100 rung)',
      (select balance from public.coin_balances where user_id = auth.uid()),
      v_bal + v_paid + 100, v_bal, v_paid;
  end if;
  -- The whole ladder, and no more.
  select claimed_coins, claimable_coins, total_reward into v
    from public.my_sets where code = 'test-set-2026';
  if v.claimed_coins <> 160 or v.claimable_coins <> 0 or v.total_reward <> 160 then
    raise exception 'FAIL: ladder totals read claimed=% claimable=% total=%, expected 160/0/160',
      v.claimed_coins, v.claimable_coins, v.total_reward;
  end if;

  ok := false;
  begin
    r := public.claim_set_reward('test-set-2026');
  exception when others then
    ok := sqlerrm like '%nothing to claim%';
    if not ok then raise exception 'FAIL: an exhausted ladder was blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: an exhausted ladder paid out again'; end if;

  -- COMPLETION IS MONOTONIC. There is no way back under the bar: committed
  -- copies cannot be sold, started or un-committed.
  if not (select complete from public.my_sets where code = 'test-set-2026') then
    raise exception 'FAIL: a finished set stopped reading complete';
  end if;

  -- An unknown set is refused as such, not as an empty ladder.
  ok := false;
  begin
    r := public.claim_set_reward('no-such-set');
  exception when others then
    ok := sqlerrm like '%no such set%';
    if not ok then raise exception 'FAIL: an unknown set was blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: an unknown set code was claimable'; end if;
end;
$$;

-- ------------------------------------------- a committed card cannot be started
--
-- The other half of the burn, and the one whose failure is silent: without the
-- `is_held` guard in set_lineup you could commit a card and then name it in a
-- lineup, and the slot would score nothing with no error anywhere.
--
-- A future week of its own, so the assertion neither depends on where the real
-- season has got to nor rots after it.
reset role;
insert into public.games (external_id, season, week, season_type, starts_at, status)
values (990001, 2026, 99, 1, now() + interval '7 days', 'scheduled');
set local role authenticated;

do $$
declare
  v_burnt constant uuid := '54444444-0000-0000-0000-00000000000b';
  v_held  constant uuid := '54444444-0000-0000-0000-00000000000f';
  ok boolean := false; v_lineup uuid;
begin
  begin
    v_lineup := public.set_lineup(2026, 1::smallint, 99,
      jsonb_build_array(jsonb_build_object('slot', 'QB', 'card_instance_id', v_burnt)));
  exception when others then
    ok := sqlerrm like '%does not belong to you%';
    if not ok then raise exception 'FAIL: a burnt starter was blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: a card committed to a set was started in a lineup'; end if;

  -- BOTH HALVES. The same payload with the copy that is still held must work,
  -- or the assertion above proves only that set_lineup rejects everything.
  v_lineup := public.set_lineup(2026, 1::smallint, 99,
    jsonb_build_array(jsonb_build_object('slot', 'QB', 'card_instance_id', v_held)));
  if v_lineup is null then
    raise exception 'FAIL: a held card could not be started either';
  end if;
end;
$$;

-- ------------------------------------------------------------ the rival sees
--
-- If my_sets were definer-rights this would read 4 and every set in the game
-- would look finished to everybody.
set local request.jwt.claims = '{"sub":"52222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare ok boolean := false; r jsonb; v record;
begin
  select committed, ready, claimable_coins, claimed_coins into v
    from public.my_sets where code = 'test-set-2026';
  if v.committed <> 0 or v.ready <> 0 then
    raise exception 'FAIL: my_sets showed a rival % committed / % ready out of another user''s cards',
      v.committed, v.ready;
  end if;
  if v.claimable_coins <> 0 or v.claimed_coins <> 0 then
    raise exception 'FAIL: my_sets showed a rival somebody else''s ladder (% claimable, % claimed)',
      v.claimable_coins, v.claimed_coins;
  end if;
  if (select count(*) from public.set_checklist('test-set-2026') where committed) <> 0 then
    raise exception 'FAIL: the checklist showed a rival somebody else''s commits';
  end if;

  ok := false;
  begin
    r := public.claim_set_reward('test-set-2026');
  exception when others then
    ok := sqlerrm like '%nothing to claim%';
    if not ok then raise exception 'FAIL: the rival was blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: a rival claimed off somebody else''s commits'; end if;

  -- And cannot commit a card they do not hold, even into a slot that is open
  -- for them.
  ok := false;
  begin
    r := public.commit_card_to_set('test-set-2026', (select id from set_test_cards where n = 5));
  exception when others then
    ok := sqlerrm like '%do not hold a copy%';
    if not ok then raise exception 'FAIL: the rival was blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: a rival committed a card they do not own'; end if;
  if (select balance from public.coin_balances where user_id = auth.uid()) <> 100 then
    raise exception 'FAIL: a refused commit paid the rival anyway';
  end if;

  raise notice 'card_sets: commit and ladder assertions passed';
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- FILLING A SET IN ONE GO
--
-- Its own player and its own set, so the balances the stages above assert to
-- the coin are not disturbed by a bulk run in the middle of them.
--
-- The two things that matter: one card the rules refuse must not fail the
-- others, and the array must stop at the requirement rather than burning
-- everything it was handed.
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '61111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'bulk@test.local', '', now(), now(), now());
-- A wallet already exists: handle_new_user opens one on sign-up.
insert into public.coin_balances (user_id, balance) values ('61111111-1111-1111-1111-111111111111', 0)
on conflict (user_id) do update set balance = 0;

insert into public.teams (external_id, abbreviation, full_name) values (9401, 'BLK', 'Bulk Test Club');
insert into public.players (external_id, first_name, last_name, position, position_abbreviation, team_id)
select 9400 + n, 'Bulk', 'Number' || n, 'QB', 'QB', (select id from public.teams where external_id = 9401)
  from generate_series(1, 5) n;
insert into public.cards (player_id, season, rarity)
select p.id, 2026, 'common' from public.players p where p.external_id between 9401 and 9405;

-- FIVE members, requiring THREE, and one of the five parked in an unscored
-- lineup. Sending all five must add three, skip the lineup one by name, and
-- refuse the rest for being past the bar.
insert into public.card_sets (id, code, name, family, subtitle, season, required_count, sort_order)
values ('63333333-3333-3333-3333-333333333333', 'bulk-set-2026', 'Bulk Set', 'team', 'AFC North', 2026, 3, 998);
insert into public.card_set_members (set_id, card_id)
select '63333333-3333-3333-3333-333333333333', c.id
  from public.cards c join public.players p on p.id = c.player_id
 where p.external_id between 9401 and 9405;
insert into public.card_set_milestones (set_id, threshold_pct, reward_coins) values
  ('63333333-3333-3333-3333-333333333333',  25,  5),
  ('63333333-3333-3333-3333-333333333333',  50, 10),
  ('63333333-3333-3333-3333-333333333333',  75, 15),
  ('63333333-3333-3333-3333-333333333333', 100, 50);

insert into public.card_instances (id, user_id, card_id)
select ('64444444-0000-0000-0000-00000000000' || n)::uuid,
       '61111111-1111-1111-1111-111111111111',
       c.id
  from generate_series(1, 5) n
  join public.players p on p.external_id = 9400 + n
  join public.cards c on c.player_id = p.id;

-- The SECOND card in the array order is the one in a lineup. Since
-- 20260821230000 that is no longer a refusal — the commit frees the slot — so
-- it now proves the opposite: a STARTER can be bulk-committed, mid-run, and the
-- lineup it was standing in does not keep it. The mid-run REFUSAL that this
-- fixture used to provide is supplied below by a non-member card spliced into
-- the middle of the array instead.
insert into public.lineups (id, user_id, season, season_type, week)
values ('65555555-5555-5555-5555-555555555555', '61111111-1111-1111-1111-111111111111', 2026, 1, 1);
insert into public.lineup_slots (lineup_id, slot, card_instance_id)
values ('65555555-5555-5555-5555-555555555555', 'QB', '64444444-0000-0000-0000-000000000002');

set local role authenticated;
set local request.jwt.claims = '{"sub":"61111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_ids uuid[];
  r jsonb; ok boolean := false; v record; v_fill integer; v_hi integer;
begin
  select array_agg(c.id order by p.external_id) into v_ids
    from public.cards c join public.players p on p.id = c.player_id
   where p.external_id between 9401 and 9405;

  -- Splice a card that is not in this set into the middle of the run, so that a
  -- refusal is still proved to happen mid-array and not merely at the end. The
  -- cards after it must still go in; a bulk action that abandoned its tail on
  -- the first refusal would pass every other assertion in this block.
  v_ids := v_ids[1:1]
        || array[(select id from set_test_cards where n = 6)]
        || v_ids[2:5];

  /* WHAT ONE CARD IS QUOTED AT, read while they are all still uncommitted.
   *
   * Not the SUM of the quotes: this set requires three of its five members, so
   * the fill stops at the bar and two of the quotable cards are never taken.
   * Summing them would assert a payment for cards that correctly did not go in.
   *
   * Every member here is a zero-signal fixture copy, so the checklist quotes
   * them all the same number — which the guard below states rather than
   * assumes, because a fixture that quietly stopped being uniform would make
   * the arithmetic underneath it meaningless. */
  select min(commit_value), max(commit_value) into v_fill, v_hi
    from public.set_checklist('bulk-set-2026')
   where not committed and commit_value is not null;
  if v_fill is null or v_fill <= 0 or v_fill <> v_hi then
    raise exception 'FAIL: the fixture quotes % to % per card — the fill arithmetic below needs one price',
      v_fill, v_hi;
  end if;

  r := public.commit_cards_to_set('bulk-set-2026', v_ids);

  -- Three in, three refused: the non-member, and two that arrived after the bar.
  if (r ->> 'added')::integer <> 3 then
    raise exception 'FAIL: the fill added %, expected 3', r ->> 'added';
  end if;
  if (r ->> 'skipped')::integer <> 3 then
    raise exception 'FAIL: the fill skipped %, expected 3', r ->> 'skipped';
  end if;
  /* WHAT THE FILL PAID, against what it was quoted.
   *
   * This was `12`, with a comment reading "five bronze copies at 8 coins, half
   * of it each" — a price copied out of the ladder, which went stale the day
   * the floor moved from 8 to 12. The checklist is asked instead, so the
   * assertion is about the batch honouring its own quote rather than about the
   * price of a card in September.
   *
   * Balance rather than a delta here: this account starts the block at zero and
   * the fill is the only thing that has paid it. */
  if (r ->> 'paid')::integer <> (r ->> 'added')::integer * v_fill then
    raise exception 'FAIL: the fill paid % for % cards quoted at % each',
      r ->> 'paid', r ->> 'added', v_fill;
  end if;
  /* AND THE TOTAL IS THE SUM OF ITS PARTS. The batch reports one figure and
     also reports every card it took; a total that drifted from the cards
     behind it would be invisible to every other assertion here, and it is the
     figure that reaches a balance. */
  if (r ->> 'paid')::integer <> (
       select coalesce(sum((x ->> 'paid')::integer), 0)
         from jsonb_array_elements(r -> 'cards') x
     ) then
    raise exception 'FAIL: the fill reported % against % across the cards it names',
      r ->> 'paid',
      (select coalesce(sum((x ->> 'paid')::integer), 0) from jsonb_array_elements(r -> 'cards') x);
  end if;
  if (select balance from public.coin_balances where user_id = auth.uid())
       <> (r ->> 'paid')::integer then
    raise exception 'FAIL: balance is %, expected the % the fill paid',
      (select balance from public.coin_balances where user_id = auth.uid()), r ->> 'paid';
  end if;

  -- EACH REFUSAL SAYS WHY. A bulk action that dropped cards silently would be
  -- worse than one that refused outright.
  if not exists (
    select 1 from jsonb_array_elements(r -> 'refusals') x
     where x ->> 'reason' like '%not in this set%'
  ) then
    raise exception 'FAIL: the non-member was not reported as such: %', r -> 'refusals';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(r -> 'refusals') x
     where x ->> 'reason' like '%already complete%'
  ) then
    raise exception 'FAIL: the past-the-bar card was not reported as such: %', r -> 'refusals';
  end if;

  -- THE CARD IN THE LINEUP SURVIVED. It is the whole reason a refusal must not
  -- take the transaction with it.
  -- The started copy went in, and the lineup does not still name it. Both
  -- halves matter: a lineup left pointing at a burnt card is a slot that scores
  -- nothing with no error anywhere.
  if (select is_held from public.card_instances where id = '64444444-0000-0000-0000-000000000002')
     is not false then
    raise exception 'FAIL: the started copy was not committed by the bulk fill';
  end if;
  if exists (
    select 1 from public.lineup_slots
     where lineup_id = '65555555-5555-5555-5555-555555555555'
       and card_instance_id = '64444444-0000-0000-0000-000000000002'
  ) then
    raise exception 'FAIL: the bulk fill burnt a starter without freeing its slot';
  end if;

  select committed, complete, claimable_coins into v from public.my_sets where code = 'bulk-set-2026';
  if v.committed <> 3 or not v.complete then
    raise exception 'FAIL: the fill left the set at % of 3, complete=%', v.committed, v.complete;
  end if;
  -- One fill crossed all four rungs at once.
  if v.claimable_coins <> 80 then
    raise exception 'FAIL: a filled set has % claimable, expected 80', v.claimable_coins;
  end if;

  -- A second fill has nothing left to do and says so per card rather than
  -- raising: the set is complete, so every card comes back refused.
  r := public.commit_cards_to_set('bulk-set-2026', v_ids);
  if (r ->> 'added')::integer <> 0 then
    raise exception 'FAIL: a second fill added % cards to a complete set', r ->> 'added';
  end if;

  -- An empty array is a caller bug, not a no-op.
  ok := false;
  begin
    r := public.commit_cards_to_set('bulk-set-2026', '{}'::uuid[]);
  exception when others then
    ok := sqlerrm like '%no cards were named%';
    if not ok then raise exception 'FAIL: an empty fill was blocked by the wrong rule: %', sqlerrm; end if;
  end;
  if not ok then raise exception 'FAIL: an empty fill was accepted'; end if;

  raise notice 'card_sets: bulk fill assertions passed';
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- The rebuild is idempotent, never shrinks a set, makes a team set its whole
-- roster, and leaves every set with a ladder it can climb.
-- ---------------------------------------------------------------------------
do $$
declare
  v_before integer;
  v_after  integer;
  v_sets   integer;
begin
  if not exists (select 1 from public.cards where is_mintable and season = 2026) then
    raise notice 'card_sets: no 2026 pool here, skipping the rebuild assertions';
    return;
  end if;

  select count(*) into v_before from public.card_set_members;
  -- TEAM ONLY. The position family is retired and a rebuild deactivates it on
  -- purpose, so counting it here would make the deactivation look like the bug
  -- the next assertion is watching for.
  select count(*) into v_sets
    from public.card_sets
   where season = 2026 and is_active and family = 'team';

  perform public.rebuild_card_sets(2026);

  select count(*) into v_after from public.card_set_members;

  -- MEMBERSHIP IS A PRINTED CHECKLIST and is never withdrawn, not even from a
  -- retired family: the position sets keep every row they had, they simply
  -- stop being offered.
  if v_after < v_before then
    raise exception 'FAIL: a rebuild removed % membership rows', v_before - v_after;
  end if;
  if (select count(*) from public.card_sets
       where season = 2026 and is_active and family = 'team') < v_sets then
    raise exception 'FAIL: a rebuild deactivated team sets that already had members';
  end if;

  -- THE RETIREMENT IS PART OF THE CONTRACT, so it is asserted rather than
  -- merely tolerated. A position set that came back would put the trickle back
  -- with it.
  if exists (
    select 1 from public.card_sets
     where family = 'position' and is_active
  ) then
    raise exception 'FAIL: a position set is still active after a rebuild';
  end if;

  -- Nothing may ask for more cards than it holds.
  if exists (
    select 1
      from public.card_sets s
      join (select set_id, count(*) as total from public.card_set_members group by set_id) m
        on m.set_id = s.id
     where s.season = 2026
       and s.required_count > m.total
  ) then
    raise exception 'FAIL: a set requires more cards than it contains';
  end if;

  -- A TEAM SET IS ITS WHOLE ROSTER. This is the rule the ladder's pricing
  -- assumes; a team set quietly requiring six again would make the 100% rung
  -- farmable in a fortnight.
  if exists (
    select 1
      from public.card_sets s
      join (select set_id, count(*) as total from public.card_set_members group by set_id) m
        on m.set_id = s.id
     where s.season = 2026
       and s.family = 'team'
       and s.required_count <> m.total
  ) then
    raise exception 'FAIL: a team set does not require its whole roster';
  end if;

  -- EVERY ACTIVE SET CARRIES ITS FAMILY'S WHOLE LADDER, and the ladder is read
  -- from `card_set_ladder_defaults` rather than pinned at a number here.
  --
  -- It used to assert exactly four, which is what the team ladder had until it
  -- was resliced into six for the same total (see
  -- 20260824234000_team_ladder_more_rungs.sql). A count in this file makes
  -- every future reslice look like a regression, which is precisely what the
  -- header of this suite says not to do: the defaults table exists so those
  -- figures can move, and what must hold is that a rebuild reproduces it
  -- faithfully — no rung dropped, none invented.
  if exists (
    select 1
      from public.card_sets s
     where s.season = 2026 and s.is_active
       and exists (select 1 from public.card_set_ladder_defaults d where d.family = s.family)
       and (select count(*) from public.card_set_milestones ml where ml.set_id = s.id)
           <> (select count(*) from public.card_set_ladder_defaults d where d.family = s.family)
  ) then
    raise exception 'FAIL: an active set does not carry its family''s full ladder';
  end if;

  -- And the rungs are the SAME rungs, at the same prices. A count alone would
  -- pass on a set carrying six rungs that were the wrong six.
  if exists (
    select 1
      from public.card_sets s
      join public.card_set_ladder_defaults d on d.family = s.family
     where s.season = 2026 and s.is_active
       and not exists (
         select 1 from public.card_set_milestones ml
          where ml.set_id = s.id
            and ml.threshold_pct = d.threshold_pct
            and ml.reward_coins = d.reward_coins
       )
  ) then
    raise exception 'FAIL: a set''s ladder does not match its family''s defaults';
  end if;

  raise notice 'card_sets: rebuild assertions passed';
end;
$$;


-- ---------------------------------------------------------------------------
-- DAILY SETS
-- ---------------------------------------------------------------------------
--
-- The faucet, and the numbers on it are the ones the migration header argues
-- about, so they are asserted rather than trusted: three cards, one rung, and
-- a reward inside the bracket that makes a daily beat the sell button and lose
-- to the pack that dealt the cards.
do $$
declare
  v_today  constant date := date '2026-09-13';
  v_prev   constant date := date '2026-09-12';
  v_set    uuid;
  v_prior  uuid;
  v_rungs  integer;
  v_coins   integer;
  v_req    smallint;
  v_pos    text;
begin
  if not exists (select 1 from public.cards where is_mintable and season = 2026) then
    raise notice 'daily_sets: no 2026 pool here, skipping';
    return;
  end if;

  -- PURE IN THE DATE. The rotation is a function rather than stored state
  -- precisely so a backfill and a live run cannot disagree; if this ever stops
  -- holding, yesterday's set becomes unreproducible.
  if public.daily_set_position(v_today) <> public.daily_set_position(v_today) then
    raise exception 'FAIL: daily_set_position is not stable';
  end if;
  if public.daily_set_position(v_today) = public.daily_set_position(v_today + 1) then
    raise exception 'FAIL: consecutive days ask for the same position';
  end if;
  -- Five positions, five days, back to the start.
  if public.daily_set_position(v_today) <> public.daily_set_position(v_today + 5) then
    raise exception 'FAIL: the rotation is not a five-day cycle';
  end if;

  perform public.rebuild_daily_set(2026, v_prev);
  select id into v_prior
    from public.card_sets where family = 'daily' and opens_on = v_prev;
  if v_prior is null then
    raise exception 'FAIL: yesterday''s daily was not built';
  end if;

  perform public.rebuild_daily_set(2026, v_today);
  -- IDEMPOTENT. The nightly sync calls this on every run, and a re-run must not
  -- double the membership or reset a rung.
  perform public.rebuild_daily_set(2026, v_today);

  select id, required_count into v_set, v_req
    from public.card_sets where family = 'daily' and opens_on = v_today;
  if v_set is null then
    raise exception 'FAIL: today''s daily was not built';
  end if;
  if v_req <> 3 then
    raise exception 'FAIL: a daily asks for % cards, not 3', v_req;
  end if;

  select count(*), coalesce(max(reward_coins), 0) into v_rungs, v_coins
    from public.card_set_milestones where set_id = v_set;
  if v_rungs <> 1 then
    raise exception 'FAIL: a daily has % rungs, not 1', v_rungs;
  end if;

  -- THE BRACKET, restated as an assertion. Three bronze sell for 24 and pay 12
  -- into a set at 50%, and cost 60 in packs at 20 a card. A rung at or below 12
  -- is worse than selling; at or above 48 the daily can be farmed with bought
  -- packs. See the migration header.
  if v_coins <= 12 then
    raise exception 'FAIL: a daily pays % coins, which loses to the sell button', v_coins;
  end if;
  if v_coins >= 48 then
    raise exception 'FAIL: a daily pays % coins, which is farmable with packs', v_coins;
  end if;

  -- The whole position pool is the membership, so it is always clearable.
  v_pos := public.daily_set_position(v_today);
  if (select count(*) from public.card_set_members where set_id = v_set) < 3 then
    raise exception 'FAIL: the % daily has fewer than 3 members', v_pos;
  end if;
  if exists (
    select 1
      from public.card_set_members m
      join public.cards c   on c.id = m.card_id
      join public.players p on p.id = c.player_id
     where m.set_id = v_set
       and upper(p.position_abbreviation) <> v_pos
  ) then
    raise exception 'FAIL: the % daily contains another position', v_pos;
  end if;

  -- Yesterday's is retired by today's run, and retired is not deleted.
  if (select is_active from public.card_sets where id = v_prior) then
    raise exception 'FAIL: yesterday''s daily is still active';
  end if;
  if not exists (select 1 from public.card_set_members where set_id = v_prior) then
    raise exception 'FAIL: retiring yesterday''s daily removed its membership';
  end if;

  raise notice 'daily_sets: assertions passed';
end;
$$;

rollback;
