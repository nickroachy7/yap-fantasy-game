-- Yap Fantasy — the tier-floored weekly set, and the widened team ladder
--
-- The weekly exists to be the one set junk cannot clear. Every assertion below
-- is ultimately about that single property, approached from the four places a
-- floor has to hold at once — because a floor enforced in `commit_card_to_set`
-- alone is a set whose button lies, and the failure would be a player tapping
-- Add on a card the screen told them they held.
--
-- The things that must hold:
--   1. a copy under the floor CANNOT be committed, and is refused for the tier
--      rather than for some other rule that happens to also say no;
--   2. the refusal tells the two cases apart — "you hold none" and "you hold
--      three and they are all bronze" send a player to different places;
--   3. `commit_candidate` burns the cheapest ELIGIBLE copy, never the cheapest
--      copy: the whole mistake worth preventing here is a floor that reaches
--      past a silver and takes a gold;
--   4. what the screen counts is what the server will accept — `set_checklist`
--      and `my_sets.ready` both apply the floor, so a number on a button is
--      never a refusal in waiting;
--   5. an unfloored set is completely unchanged by any of it.
--
-- Plus the team ladder's new shape, which is a redistribution and has to be
-- provable as one: six rungs, the same 9,100 gems, and no two rungs landing on
-- the same card count at any roster size the league actually has.
--
-- THE ROLE SWITCHING IS NOT DECORATION. Every read runs as `authenticated`,
-- because RLS does not apply to the table owner and the owner is who psql
-- connects as. Setup runs as the owner. Same pattern as card_sets.
--
-- Runs inside a transaction that is rolled back, so it is safe against any
-- environment including production.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/weekly_sets.test.sql

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '71111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'weekly@test.local', '', now(), now(), now());

insert into public.gem_balances (user_id, balance) values
  ('71111111-1111-1111-1111-111111111111', 100)
on conflict (user_id) do update set balance = 100;

insert into public.teams (external_id, abbreviation, full_name, conference, division)
values (9401, 'WKY', 'Weekly Test Club', 'AFC', 'NORTH');

-- Five players. Their roles below:
--   1  held only as BRONZE      — the refusal the floor exists for
--   2  held as bronze AND gold  — the copy the floor must not reach past
--   3  held as silver           — the plain accepted case
--   4  not held at all          — "you hold none", which must not be confused
--                                 with "you hold one and it is too low"
--   5  held only as BRONZE, and never committed to anything, so the inventory's
--      own offer for him can be asserted at any point in the suite
insert into public.players (external_id, first_name, last_name, position, position_abbreviation, team_id)
select 9400 + n, 'Weekly', 'Number' || n, 'QB', 'QB', (select id from public.teams where external_id = 9401)
  from generate_series(1, 5) n;

insert into public.cards (player_id, season, rarity)
select p.id, 2026, 'common'
  from public.players p
 where p.external_id between 9401 and 9405;

create temporary table wk_cards on commit drop as
select row_number() over (order by p.external_id) as n, c.id
  from public.cards c
  join public.players p on p.id = c.player_id
 where p.external_id between 9401 and 9405;

grant select on wk_cards to authenticated;

-- A FLOORED SET AND AN UNFLOORED ONE OVER THE SAME FOUR CARDS. Every floor
-- assertion below is paired against the unfloored twin, which is what makes the
-- results attributable to the floor rather than to anything else about the
-- fixture.
insert into public.card_sets (id, code, name, family, subtitle, season, required_count, sort_order, min_tier)
values
  ('73333333-3333-3333-3333-333333333333', 'test-weekly-2026', 'Test Weekly', 'weekly', 'Week of test', 2026, 3, 999, 'silver'),
  ('74444444-4444-4444-4444-444444444444', 'test-open-2026',   'Test Open',   'team',   'AFC North',    2026, 3, 999, null);

insert into public.card_set_members (set_id, card_id)
select s.id, c.id
  from public.card_sets s
  cross join public.cards c
  join public.players p on p.id = c.player_id
 where s.code in ('test-weekly-2026', 'test-open-2026')
   and p.external_id between 9401 and 9405;

insert into public.card_set_milestones (set_id, threshold_pct, reward_gems) values
  ('73333333-3333-3333-3333-333333333333', 100, 250),
  ('74444444-4444-4444-4444-444444444444', 100, 100);

-- The copies.
--
-- TIER IS NOT SET HERE, IT IS EARNED HERE. `card_instances_sync_tier` fires
-- BEFORE INSERT and derives `tier` from `settled_fp` against
-- `tier_thresholds`, so a fixture that wrote `tier` directly would have it
-- silently overwritten with bronze and every floor assertion below would pass
-- for the wrong reason. The fixture therefore states the POINTS and lets the
-- trigger reach the tier, which is also the only way a copy gets a tier in the
-- real game — you start it, it scores, it climbs.
--
-- `career_fp` is set alongside because `commit_candidate` orders on it. The two
-- move together in play, so the fixture keeps them consistent: a copy with more
-- settled points has more career points.
--
--   50 -> silver, 200 -> gold (see tier_thresholds).
insert into public.card_instances (user_id, card_id, settled_fp, career_fp, acquired_at)
values
  ('71111111-1111-1111-1111-111111111111', (select id from wk_cards where n = 1),  10,  10, now()),
  ('71111111-1111-1111-1111-111111111111', (select id from wk_cards where n = 2),  20,  20, now()),
  ('71111111-1111-1111-1111-111111111111', (select id from wk_cards where n = 2), 300, 300, now()),
  ('71111111-1111-1111-1111-111111111111', (select id from wk_cards where n = 3),  80,  80, now()),
  ('71111111-1111-1111-1111-111111111111', (select id from wk_cards where n = 5),  30,  30, now());

-- The fixture is only meaningful if the trigger landed where it was meant to,
-- and a wrong tier here would look exactly like a broken floor further down.
do $$
declare v record;
begin
  for v in
    select ci.tier, ci.settled_fp, w.n
      from public.card_instances ci
      join wk_cards w on w.id = ci.card_id
     order by w.n, ci.settled_fp
  loop
    if (v.settled_fp >= 200 and v.tier <> 'gold')
       or (v.settled_fp >= 50 and v.settled_fp < 200 and v.tier <> 'silver')
       or (v.settled_fp < 50 and v.tier <> 'bronze') then
      raise exception 'FAIL: fixture copy of player % at % points came out %, so the tier ladder is not what this suite assumes',
        v.n, v.settled_fp, v.tier;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------- the floor

set local role authenticated;
set local request.jwt.claims = '{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  ok boolean; msg text; r jsonb;
  v_pick uuid; v_tier public.card_tier;
begin
  -- 3. THE CHEAPEST ELIGIBLE COPY, NOT THE CHEAPEST COPY. Player 2 is held as
  -- both a bronze (career_fp 20) and a gold (300). Unfloored, the bronze is the
  -- candidate. Floored at silver, the bronze is not a candidate at all and the
  -- gold is the only one left — so this is also the assertion that a floor can
  -- reach past a cheap copy and take an expensive one, which is the single most
  -- expensive mistake this feature could make and the reason the warning copy
  -- names the tier.
  select public.commit_candidate((select id from wk_cards where n = 2)) into v_pick;
  select tier into v_tier from public.card_instances where id = v_pick;
  if v_tier <> 'bronze' then
    raise exception 'FAIL: with no floor the candidate was %, expected the bronze', v_tier;
  end if;

  select public.commit_candidate((select id from wk_cards where n = 2), 'silver') into v_pick;
  select tier into v_tier from public.card_instances where id = v_pick;
  if v_tier <> 'gold' then
    raise exception 'FAIL: with a silver floor the candidate was %, expected the gold', v_tier;
  end if;

  -- A floor nothing satisfies returns nothing rather than falling back.
  if public.commit_candidate((select id from wk_cards where n = 1), 'silver') is not null then
    raise exception 'FAIL: a bronze-only holding produced a candidate under a silver floor';
  end if;

  -- 1 + 2. THE TWO REFUSALS, TOLD APART. Player 1 is held, as bronze only.
  ok := false;
  begin
    r := public.commit_card_to_set('test-weekly-2026', (select id from wk_cards where n = 1));
  exception when others then ok := true; msg := sqlerrm;
  end;
  if not ok then
    raise exception 'FAIL: a bronze was accepted into a silver-floored set';
  end if;
  if msg not like '%silver%' or msg not like '%bronze%' then
    raise exception 'FAIL: the refusal was "%", which does not name the tier wanted or the tier held', msg;
  end if;

  -- Player 4 is not held at all. Same set, same floor, different sentence —
  -- and if these two ever collapse into one message, a player who needs to
  -- START a card they own gets told to go and find one.
  ok := false;
  begin
    r := public.commit_card_to_set('test-weekly-2026', (select id from wk_cards where n = 4));
  exception when others then ok := true; msg := sqlerrm;
  end;
  if not ok then
    raise exception 'FAIL: a card held in no copy at all was accepted';
  end if;
  if msg like '%silver%' then
    raise exception 'FAIL: "you hold none" was reported as a tier problem: "%"', msg;
  end if;

  -- 5. THE UNFLOORED TWIN IS UNCHANGED. Same bronze, same card, other set.
  r := public.commit_card_to_set('test-open-2026', (select id from wk_cards where n = 1));
  if (r ->> 'tier') <> 'bronze' then
    raise exception 'FAIL: the unfloored set burnt a % copy, expected the bronze', r ->> 'tier';
  end if;
end;
$$;

-- ------------------------------------------------- what the screen advertises

do $$
declare
  v_ready integer; v_held integer; v_tier public.card_tier; v_rows integer;
begin
  -- 4. `my_sets.ready` UNDER THE FLOOR. Four members. The caller holds a copy
  -- of three of them, but only two of those three (player 2's gold, player 3's
  -- silver) are silver or better. A `ready` of 3 here would be the set telling
  -- somebody they have three slots they can fill when one of them would be
  -- refused.
  select ready into v_ready from public.my_sets where code = 'test-weekly-2026';
  if v_ready <> 2 then
    raise exception 'FAIL: a silver-floored set reported % ready, expected 2', v_ready;
  end if;

  -- The unfloored twin counts the same collection differently, and must: it
  -- accepts bronzes. Player 1 was committed to it above, which fills that slot,
  -- leaving players 2, 3 and 5.
  select ready into v_ready from public.my_sets where code = 'test-open-2026';
  if v_ready <> 3 then
    raise exception 'FAIL: the unfloored set reported % ready, expected 3', v_ready;
  end if;

  -- `set_checklist` PRICES THE COPY IT WOULD REALLY BURN. Player 2 must show
  -- the gold, because that is what the floor leaves, and the sheet says out
  -- loud what it is about to destroy.
  select held, commit_tier into v_held, v_tier
    from public.set_checklist('test-weekly-2026')
   where card_id = (select id from wk_cards where n = 2);
  if v_tier <> 'gold' then
    raise exception 'FAIL: the checklist offered a % copy of player 2, expected the gold', v_tier;
  end if;
  if v_held <> 1 then
    raise exception 'FAIL: the checklist counted % copies of player 2, expected 1 eligible', v_held;
  end if;

  -- A FLOORED CHECKLIST IS SIEVED TO WHAT YOU CAN ACT ON. Four members, two of
  -- them holdable under the floor, so two rows — not four. The real weekly's
  -- membership is the whole mintable pool, and sending all of it so a player
  -- can find the handful they hold a silver of is the difference between a
  -- screen that opens and one that does not.
  select count(*) into v_rows from public.set_checklist('test-weekly-2026');
  if v_rows <> 2 then
    raise exception 'FAIL: the floored checklist returned % rows, expected the 2 actionable ones', v_rows;
  end if;

  -- The unfloored one still returns its whole membership, because a team
  -- roster IS a checklist and the names missing from it are the chase.
  select count(*) into v_rows from public.set_checklist('test-open-2026');
  if v_rows <> 5 then
    raise exception 'FAIL: the unfloored checklist returned % rows, expected all 5 members', v_rows;
  end if;
end;
$$;

-- --------------------------------------------------- what the inventory offers
--
-- `card_actions` is the fifth place the floor has to hold and the least obvious
-- one: a weekly's membership is the whole pool, so EVERY copy in an inventory
-- gains an offer for it. `bulk.ts` routes a multi-select straight off
-- `can_commit`, so a floor missing here is a bulk add built to be refused.
do $$
declare
  v_copy uuid; v_offer jsonb;
begin
  -- Player 5: held as a bronze and nothing else.
  select id into v_copy
    from public.card_instances
   where card_id = (select id from wk_cards where n = 5);

  select o into v_offer
    from jsonb_array_elements(
           (public.card_actions(array[v_copy]) -> 0) -> 'sets') o
   where o ->> 'code' = 'test-weekly-2026';

  if v_offer is null then
    raise exception 'FAIL: the weekly was not offered at all for a card that is a member of it';
  end if;
  if (v_offer ->> 'can_commit')::boolean then
    raise exception 'FAIL: the inventory offered a live weekly commit for a bronze-only holding';
  end if;
  if (v_offer ->> 'pays')::integer <> 0 then
    raise exception 'FAIL: the weekly quoted % gems for a copy it would not accept',
      (v_offer ->> 'pays')::integer;
  end if;
  if (v_offer ->> 'min_tier') <> 'silver' then
    raise exception 'FAIL: the offer did not carry the floor, so the client cannot say why it is dark';
  end if;

  -- The unfloored twin, same card, same copy: still live, still priced off the
  -- bronze at 8 x 50%. This is what makes the assertions above attributable to
  -- the floor rather than to anything else about player 5.
  select o into v_offer
    from jsonb_array_elements(
           (public.card_actions(array[v_copy]) -> 0) -> 'sets') o
   where o ->> 'code' = 'test-open-2026';

  if not (v_offer ->> 'can_commit')::boolean then
    raise exception 'FAIL: the unfloored set refused a bronze it should accept';
  end if;
  if (v_offer ->> 'pays')::integer <> 4 then
    raise exception 'FAIL: the unfloored set quoted % gems for a bronze, expected 4',
      (v_offer ->> 'pays')::integer;
  end if;

  -- Player 3's silver: the weekly accepts it, and quotes the silver's own
  -- 40 x 50%. A floored offer priced off the wrong copy would show 4 here.
  select id into v_copy
    from public.card_instances
   where card_id = (select id from wk_cards where n = 3);

  select o into v_offer
    from jsonb_array_elements(
           (public.card_actions(array[v_copy]) -> 0) -> 'sets') o
   where o ->> 'code' = 'test-weekly-2026';

  if not (v_offer ->> 'can_commit')::boolean then
    raise exception 'FAIL: the weekly refused a silver';
  end if;
  if (v_offer ->> 'pays')::integer <> 20 then
    raise exception 'FAIL: the weekly quoted % gems for a silver, expected 20',
      (v_offer ->> 'pays')::integer;
  end if;
end;
$$;

-- ------------------------------------------------------------ the commit runs

do $$
declare r jsonb; v_bronze uuid;
begin
  select id into v_bronze
    from public.card_instances
   where card_id = (select id from wk_cards where n = 2)
     and tier = 'bronze';

  r := public.commit_card_to_set('test-weekly-2026', (select id from wk_cards where n = 2));
  if (r ->> 'tier') <> 'gold' then
    raise exception 'FAIL: the weekly burnt a % copy, expected the gold', r ->> 'tier';
  end if;
  -- 150 at gold, at the standard 50% commit share.
  if (r ->> 'paid')::integer <> 75 then
    raise exception 'FAIL: committing a gold paid %, expected 75', (r ->> 'paid')::integer;
  end if;

  -- THE BRONZE IS UNTOUCHED. The floor decides which copy is eligible; it must
  -- not quietly consume the ones that are not.
  if not (select is_held from public.card_instances where id = v_bronze) then
    raise exception 'FAIL: the ineligible bronze copy was burnt as well';
  end if;
end;
$$;

-- --------------------------------------------------------- the season's shape

reset role;

do $$
declare
  v_rungs integer; v_total integer; v_first integer; v_reward integer;
  v_band integer;
  v_size integer; v_counts integer[];
begin
  -- The production ladder, which this suite reads rather than sets: the point
  -- of the change is the SHAPE, and a fixture ladder could not assert it.
  select count(*), sum(reward_gems), min(threshold_pct)
    into v_rungs, v_total, v_first
    from public.card_set_ladder_defaults
   where family = 'team';

  if v_rungs <> 6 then
    raise exception 'FAIL: the team ladder has % rungs, expected 6', v_rungs;
  end if;

  -- THE REACHABLE BAND IS THE FIGURE THAT MATTERS, and it is asserted on its
  -- own rather than folded into the total.
  --
  -- The 10% and 25% rungs are the only two a season actually reaches, and the
  -- FREE daily pack reaches both on all 32 clubs at zero gem cost — 360 cards a
  -- season is 9.5 distinct from every club against the 8 that 25% wants. So
  -- this band has no cost side at all: whatever it pays, it pays for turning
  -- up, 32 times over. At 160 a club that is 5,120 gems a season against the
  -- weekly grant's 4,500, which is the faucet it is priced beside. See
  -- 20260825000000_close_reachable_band.sql.
  select coalesce(sum(reward_gems), 0) into v_band
    from public.card_set_ladder_defaults
   where family = 'team' and threshold_pct <= 25;

  if v_band <> 160 then
    raise exception 'FAIL: the reachable team band pays % a club, expected 160 — that is % gems a season across 32 clubs, free',
      v_band, v_band * 32;
  end if;

  -- The total follows from the band and is asserted so that a re-tune cannot
  -- quietly move the cut somewhere else: dropping the band and adding the same
  -- 240 back onto the 75% and 100% rungs would satisfy the check above while
  -- parking the money behind rungs nobody reaches.
  if v_total <> 8860 then
    raise exception 'FAIL: the team ladder totals % gems, expected 8,860', v_total;
  end if;

  if v_first <> 10 then
    raise exception 'FAIL: the first team rung is at %%%, expected 10', v_first;
  end if;

  -- NO TWO RUNGS ON THE SAME CARD COUNT, at any roster size the league has.
  -- Rungs are stored as percentages and resolved with ceil() against the
  -- requirement, so two of them can collapse onto one card count on a small
  -- enough set — and a collapsed pair pays twice for a single commit.
  for v_size in 27..33 loop
    select array_agg(distinct ceil(v_size * threshold_pct / 100.0)::integer)
      into v_counts
      from public.card_set_ladder_defaults
     where family = 'team';

    if array_length(v_counts, 1) <> 6 then
      raise exception 'FAIL: on a %-card roster the six team rungs land on only % distinct card counts (%)',
        v_size, array_length(v_counts, 1), v_counts;
    end if;
  end loop;

  -- The weekly's own bracket. Three silver sell for 120 and pay 60 into a set
  -- at 50%, so a reward at or under 60 loses to the sell button and the set has
  -- no reason to exist. There is no farming ceiling to assert against: packs
  -- deal bronze, so no amount of gems buys a silver. See the migration header.
  select reward_gems into v_reward
    from public.card_set_ladder_defaults
   where family = 'weekly' and threshold_pct = 100;

  if v_reward is null then
    raise exception 'FAIL: the weekly family has no ladder default';
  end if;
  if v_reward <= 60 then
    raise exception 'FAIL: the weekly pays % gems, which loses to selling the three copies', v_reward;
  end if;
end;
$$;

-- ------------------------------------------------------------- the rotation

do $$
declare
  v_today date := public.daily_set_day();
  v_monday date;
  v_set uuid; v_req smallint; v_floor public.card_tier;
  v_prior uuid; v_prior_active boolean;
  v_members integer;
begin
  if not exists (select 1 from public.cards where is_mintable and season = 2026) then
    raise notice 'weekly_sets: no 2026 pool here, skipping the rotation stage';
    return;
  end if;

  -- PURE IN THE DATE, the same property `daily_set_position` is asserted on:
  -- the week a day belongs to has to be reproducible or a backfill and a live
  -- run disagree about which set somebody's cards went into.
  v_monday := public.weekly_set_monday(v_today);
  if v_monday <> public.weekly_set_monday(v_today) then
    raise exception 'FAIL: weekly_set_monday is not stable';
  end if;
  if extract(isodow from v_monday) <> 1 then
    raise exception 'FAIL: weekly_set_monday returned %, which is not a Monday', v_monday;
  end if;
  -- Every day of one week resolves to the same Monday, which is the whole job.
  if public.weekly_set_monday(v_monday + 6) <> v_monday then
    raise exception 'FAIL: Sunday resolved to a different week from its Monday';
  end if;
  if public.weekly_set_monday(v_monday + 7) <> v_monday + 7 then
    raise exception 'FAIL: the next Monday did not start a new week';
  end if;

  -- Last week's, so that retirement is testable against something real.
  perform public.rebuild_weekly_set(2026, v_monday - 7);
  select id into v_prior
    from public.card_sets where family = 'weekly' and opens_on = v_monday - 7;
  if v_prior is null then
    raise exception 'FAIL: last week''s weekly was not built';
  end if;

  -- IDEMPOTENT. It runs hourly, so every run after the first of a week has to
  -- be a no-op rather than a second membership.
  perform public.rebuild_weekly_set(2026, v_today);
  perform public.rebuild_weekly_set(2026, v_today);

  select id, required_count, min_tier into v_set, v_req, v_floor
    from public.card_sets where family = 'weekly' and opens_on = v_monday;
  if v_set is null then
    raise exception 'FAIL: this week''s weekly was not built';
  end if;
  if v_req <> 3 then
    raise exception 'FAIL: a weekly asks for % cards, not 3', v_req;
  end if;
  if v_floor <> 'silver' then
    raise exception 'FAIL: a weekly floors at %, expected silver', v_floor;
  end if;

  select count(*) into v_members from public.card_set_members where set_id = v_set;
  if v_members <> (select count(*) from public.cards where season = 2026 and is_mintable) then
    raise exception 'FAIL: the weekly holds % members, expected the whole mintable pool', v_members;
  end if;

  -- Last week's is retired, not deleted: cards were burnt into it and
  -- set_milestone_claims is never rewritten.
  select is_active into v_prior_active from public.card_sets where id = v_prior;
  if v_prior_active then
    raise exception 'FAIL: last week''s weekly is still active';
  end if;
  if not exists (select 1 from public.card_sets where id = v_prior) then
    raise exception 'FAIL: last week''s weekly was deleted rather than retired';
  end if;

  -- The daily rotation's own day function, which the weekly borrows. Eastern
  -- rather than UTC, so a daily does not expire during Sunday night football.
  if public.daily_set_day() <> (now() at time zone 'America/New_York')::date then
    raise exception 'FAIL: daily_set_day is not the Eastern date';
  end if;
end;
$$;

rollback;
