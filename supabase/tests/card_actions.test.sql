-- Yap Fantasy — `card_actions`, the read the pack reveal draws its buttons from
--
-- This function writes nothing, so the usual "can it mint currency" questions
-- do not apply to it. The thing that CAN go wrong is subtler and worse: it can
-- disagree with the functions it describes. A reveal that offers "Add to set
-- +4" for a set that is already full, or a "Quick sell 8" on a card sell_card
-- will refuse, is a button that fails when pressed — and the player has already
-- decided by then.
--
-- So every assertion here is an AGREEMENT assertion. It is never enough that
-- the report says false; the write function has to refuse for the matching
-- reason in the same breath, and where it says true the write has to succeed.
--
-- What must hold:
--   1. it is scoped to the caller — another player's card is not described,
--      and neither is a signed-out caller's anything;
--   2. `sell_value` is the price sell_card actually pays, and `sellable`
--      tracks its three refusals;
--   3. `pays` is the coins commit_card_to_set actually pays, to the coin;
--   4. `burns_this_copy` names the copy `commit_candidate` would really take;
--   5. `slot_filled` and `set_complete` each predict the specific refusal the
--      commit raises, and `can_commit` is their conjunction.
--
-- Same conventions as card_sets.test.sql: fixtures inserted as the owner, every
-- assertion run as `authenticated` with a jwt claim, whole thing rolled back.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/card_actions.test.sql

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '61111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'opener@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '62222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'other@test.local',  '', now(), now(), now());

insert into public.coin_balances (user_id, balance) values
  ('61111111-1111-1111-1111-111111111111', 100),
  ('62222222-2222-2222-2222-222222222222', 100)
on conflict (user_id) do update set balance = 100;

insert into public.teams (external_id, abbreviation, full_name, conference, division)
values (9401, 'ACT', 'Actions Test Club', 'AFC', 'SOUTH');

insert into public.players (external_id, first_name, last_name, position, position_abbreviation, team_id)
select 9400 + n, 'Action', 'Number' || n, 'QB', 'QB', (select id from public.teams where external_id = 9401)
  from generate_series(1, 4) n;

insert into public.cards (player_id, season, rarity)
select p.id, 2026, 'common'
  from public.players p
 where p.external_id between 9401 and 9404;

-- FOUR members requiring TWO. The gap is the whole point: it lets the set fill
-- up while two member cards are still outside it, which is the only way to
-- test "already complete" against a card that is genuinely a member.
insert into public.card_sets (id, code, name, family, subtitle, season, required_count, commit_payout_pct, sort_order)
values ('63333333-3333-3333-3333-333333333333', 'actions-set-2026', 'Actions Test Set', 'team', 'AFC South', 2026, 2, 50, 998);

insert into public.card_set_members (set_id, card_id)
select '63333333-3333-3333-3333-333333333333', c.id
  from public.cards c
  join public.players p on p.id = c.player_id
 where p.external_id between 9401 and 9404;

create temporary table act_cards on commit drop as
select row_number() over (order by p.external_id) as n, c.id
  from public.cards c
  join public.players p on p.id = c.player_id
 where p.external_id between 9401 and 9404;

grant select on act_cards to authenticated;

-- ------------------------------------------------------------ the collection
--
-- Card 1 twice, so `burns_this_copy` has a wrong answer available. The second
-- copy earns 10 points rather than 0 for exactly the reason card_sets.test.sql
-- gives: tied copies push the choice onto commit_candidate's uuid tiebreak and
-- the suite starts passing by coin flip.
--
-- BOTH POINT COLUMNS, same as that suite: the tier trigger derives from
-- `settled_fp`, so career_fp alone leaves every fixture bronze and the "richer
-- copy" would not be richer at all.
insert into public.card_instances (id, user_id, card_id, career_fp, settled_fp)
values ('64444444-0000-0000-0000-0000000000c1',
        '61111111-1111-1111-1111-111111111111',
        (select id from act_cards where n = 1), 0, 0),
       ('64444444-0000-0000-0000-0000000000c2',
        '61111111-1111-1111-1111-111111111111',
        (select id from act_cards where n = 1), 10, 10),
       ('64444444-0000-0000-0000-0000000000c3',
        '61111111-1111-1111-1111-111111111111',
        (select id from act_cards where n = 2), 0, 0),
       ('64444444-0000-0000-0000-0000000000c4',
        '61111111-1111-1111-1111-111111111111',
        (select id from act_cards where n = 3), 0, 0),
       -- The rival's copy of card 4, which the opener must never be told about.
       ('64444444-0000-0000-0000-0000000000c5',
        '62222222-2222-2222-2222-222222222222',
        (select id from act_cards where n = 4), 0, 0);

create temporary table act_copies on commit drop as
select * from (values
  ('cheap', '64444444-0000-0000-0000-0000000000c1'::uuid),
  ('rich',  '64444444-0000-0000-0000-0000000000c2'::uuid),
  ('two',   '64444444-0000-0000-0000-0000000000c3'::uuid),
  ('three', '64444444-0000-0000-0000-0000000000c4'::uuid),
  ('rival', '64444444-0000-0000-0000-0000000000c5'::uuid)
) as v(label, id);

grant select on act_copies to authenticated;

-- ---------------------------------------------------------------- signed out
set local role authenticated;

do $$
declare r jsonb;
begin
  r := public.card_actions(array(select id from act_copies));
  if r <> '[]'::jsonb then
    raise exception 'FAIL: a signed-out caller was told about % cards', jsonb_array_length(r);
  end if;
end;
$$;

-- ------------------------------------------------------- scoped to the owner
set local request.jwt.claims = '{"sub":"61111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare r jsonb; v_rival uuid;
begin
  select id into v_rival from act_copies where label = 'rival';

  r := public.card_actions(array(select id from act_copies));
  if jsonb_array_length(r) <> 4 then
    raise exception 'FAIL: five ids asked about, % described, expected the callers 4',
      jsonb_array_length(r);
  end if;
  if exists (select 1 from jsonb_array_elements(r) e
              where (e ->> 'card_instance_id')::uuid = v_rival) then
    raise exception 'FAIL: another players card was described';
  end if;

  -- A id that is not a card at all is dropped rather than raising.
  if public.card_actions(array['00000000-0000-0000-0000-0000000000ff'::uuid]) <> '[]'::jsonb then
    raise exception 'FAIL: an unknown id produced a description';
  end if;
end;
$$;

-- ------------------------------------------- what it says before anything is done
do $$
declare
  e        jsonb;
  s        jsonb;
  v_cheap  uuid;
  v_rich   uuid;
  v_price  integer;
begin
  select id into v_cheap from act_copies where label = 'cheap';
  select id into v_rich  from act_copies where label = 'rich';
  select sell_value into v_price from public.tier_thresholds where tier = 'bronze';

  select value into e
    from jsonb_array_elements(public.card_actions(array[v_cheap, v_rich])) value
   where (value ->> 'card_instance_id')::uuid = v_cheap;

  if (e ->> 'sell_value')::integer <> v_price then
    raise exception 'FAIL: sell_value reads % where the bronze price is %',
      e ->> 'sell_value', v_price;
  end if;
  if (e ->> 'sellable')::boolean is not true then
    raise exception 'FAIL: a held, unsold, unstarted card reported as unsellable';
  end if;

  -- The cheapest copy is the one that would burn, and the richer one is not.
  if (e ->> 'burns_this_copy')::boolean is not true then
    raise exception 'FAIL: the cheapest copy did not report itself as the one that burns';
  end if;

  select value into e
    from jsonb_array_elements(public.card_actions(array[v_cheap, v_rich])) value
   where (value ->> 'card_instance_id')::uuid = v_rich;
  if (e ->> 'burns_this_copy')::boolean is not false then
    raise exception 'FAIL: the 10-point copy claimed it would be the one burnt';
  end if;

  -- One set, open, paying half the bronze price.
  s := e -> 'sets' -> 0;
  if jsonb_array_length(e -> 'sets') <> 1 or s ->> 'code' <> 'actions-set-2026' then
    raise exception 'FAIL: the card reported % sets, expected the one it is in',
      jsonb_array_length(e -> 'sets');
  end if;
  if (s ->> 'pays')::integer <> floor(v_price * 0.5)::integer then
    raise exception 'FAIL: the commit is advertised at % where 50%% of % is %',
      s ->> 'pays', v_price, floor(v_price * 0.5);
  end if;
  if (s ->> 'can_commit')::boolean is not true
     or (s ->> 'slot_filled')::boolean is not false
     or (s ->> 'set_complete')::boolean is not false then
    raise exception 'FAIL: an empty set read as closed: %', s;
  end if;
  if (s ->> 'committed')::integer <> 0 or (s ->> 'required')::integer <> 2 then
    raise exception 'FAIL: the set reads % of %, expected 0 of 2',
      s ->> 'committed', s ->> 'required';
  end if;
end;
$$;

-- ---------------------------------------- the advertised coins are the coins paid
do $$
declare
  e         jsonb;
  v_cheap   uuid;
  v_advert  integer;
  v_before  integer;
  v_after   integer;
  r         jsonb;
begin
  select id into v_cheap from act_copies where label = 'cheap';

  select (value -> 'sets' -> 0 ->> 'pays')::integer into v_advert
    from jsonb_array_elements(public.card_actions(array[v_cheap])) value;

  select balance into v_before from public.coin_balances
   where user_id = '61111111-1111-1111-1111-111111111111';

  r := public.commit_card_to_set('actions-set-2026', (select id from act_cards where n = 1));

  select balance into v_after from public.coin_balances
   where user_id = '61111111-1111-1111-1111-111111111111';

  if v_after - v_before <> v_advert then
    raise exception 'FAIL: the button promised % coins and % landed', v_advert, v_after - v_before;
  end if;
  -- And it took the copy the report named.
  if (r ->> 'card_instance_id')::uuid <> v_cheap then
    raise exception 'FAIL: the commit burnt % where the report named %',
      r ->> 'card_instance_id', v_cheap;
  end if;
end;
$$;

-- ------------------------------------------ a filled slot, reported and refused
do $$
declare
  e       jsonb;
  s       jsonb;
  v_rich  uuid;
  v_cheap uuid;
  ok      boolean := false;
begin
  select id into v_rich  from act_copies where label = 'rich';
  select id into v_cheap from act_copies where label = 'cheap';

  -- The surviving copy of the same player: his slot is filled now.
  select value into e
    from jsonb_array_elements(public.card_actions(array[v_rich])) value;
  s := e -> 'sets' -> 0;

  if (s ->> 'slot_filled')::boolean is not true then
    raise exception 'FAIL: the slot just filled still reads open';
  end if;
  if (s ->> 'can_commit')::boolean is not false then
    raise exception 'FAIL: a second copy was offered for a slot already filled';
  end if;
  if (s ->> 'committed')::integer <> 1 then
    raise exception 'FAIL: the set reads % committed after one commit', s ->> 'committed';
  end if;

  -- And the commit really does refuse, for that reason.
  begin
    perform public.commit_card_to_set('actions-set-2026', (select id from act_cards where n = 1));
  exception when others then
    ok := sqlerrm like '%already in this set%';
    if not ok then
      raise exception 'FAIL: the refused second commit was blocked by the wrong rule: %', sqlerrm;
    end if;
  end;
  if not ok then raise exception 'FAIL: one slot took two copies'; end if;

  -- The burnt copy is out of the collection, is not sellable, and sell_card
  -- agrees. `held` is the field the reveal uses to stop drawing buttons on it,
  -- and it must not be inferred from `sellable` — a starter is unsellable and
  -- still held.
  select value into e
    from jsonb_array_elements(public.card_actions(array[v_cheap])) value;
  if (e ->> 'held')::boolean is not false then
    raise exception 'FAIL: a burnt copy still reads as held';
  end if;
  if (e ->> 'sellable')::boolean is not false then
    raise exception 'FAIL: a committed copy still reads as sellable';
  end if;

  -- And the copy that survived the commit is still held, which is the whole
  -- reason the field exists: committing a player you own a spare of does not
  -- take the card out of your hand.
  select value into e
    from jsonb_array_elements(public.card_actions(array[v_rich])) value;
  if (e ->> 'held')::boolean is not true then
    raise exception 'FAIL: the surviving copy was reported as gone';
  end if;

  ok := false;
  begin
    perform public.sell_card(v_cheap);
  exception when others then
    ok := sqlerrm like '%committed to a set%';
    if not ok then
      raise exception 'FAIL: selling a committed copy was blocked by the wrong rule: %', sqlerrm;
    end if;
  end;
  if not ok then raise exception 'FAIL: a committed copy was sold'; end if;
end;
$$;

-- -------------------------------------- a full set, reported and then refused
do $$
declare
  e      jsonb;
  s      jsonb;
  v_three uuid;
  ok     boolean := false;
begin
  select id into v_three from act_copies where label = 'three';

  -- Second commit takes the set to its requirement of two.
  perform public.commit_card_to_set('actions-set-2026', (select id from act_cards where n = 2));

  select value into e
    from jsonb_array_elements(public.card_actions(array[v_three])) value;
  s := e -> 'sets' -> 0;

  if (s ->> 'set_complete')::boolean is not true then
    raise exception 'FAIL: a set at its requirement does not read complete';
  end if;
  if (s ->> 'can_commit')::boolean is not false then
    raise exception 'FAIL: a full set was still offering a commit';
  end if;
  -- The set is still LISTED. Dropping it would leave the client unable to tell
  -- "full" from "this card belongs to nothing".
  if jsonb_array_length(e -> 'sets') <> 1 then
    raise exception 'FAIL: a full set vanished from the report instead of saying it was full';
  end if;

  begin
    perform public.commit_card_to_set('actions-set-2026', (select id from act_cards where n = 3));
  exception when others then
    ok := sqlerrm like '%already complete%';
    if not ok then
      raise exception 'FAIL: the full set refused for the wrong reason: %', sqlerrm;
    end if;
  end;
  if not ok then raise exception 'FAIL: a set was committed to past its requirement'; end if;
end;
$$;

-- ------------------------------------- a starter is not sellable, and says so
--
-- Aimed at the UPCOMING week for the same reason sell_card.test.sql aims there:
-- a past week is already locked, so set_lineup would refuse for the lock and
-- the assertion would never reach the rule under test.
do $$
declare
  e       jsonb;
  v_three uuid;
  v_season integer; v_type smallint; v_week integer;
  ok      boolean := false;
begin
  select id into v_three from act_copies where label = 'three';
  select season, season_type, week into v_season, v_type, v_week from public.upcoming_slate();

  perform public.set_lineup(v_season, v_type, v_week,
    jsonb_build_array(jsonb_build_object('slot', 'QB', 'card_instance_id', v_three)));

  select value into e
    from jsonb_array_elements(public.card_actions(array[v_three])) value;

  if (e ->> 'sellable')::boolean is not false then
    raise exception 'FAIL: a card standing in an unscored lineup reads as sellable';
  end if;
  if (e ->> 'held')::boolean is not true then
    raise exception 'FAIL: a starter reads as no longer held';
  end if;

  begin
    perform public.sell_card(v_three);
  exception when others then
    ok := sqlerrm like '%not been scored%';
    if not ok then
      raise exception 'FAIL: selling a starter was blocked by the wrong rule: %', sqlerrm;
    end if;
  end;
  if not ok then raise exception 'FAIL: a starter was sold out from under a live lineup'; end if;

  raise notice 'card_actions: all assertions passed';
end;
$$;

rollback;
