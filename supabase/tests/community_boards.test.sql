-- Yap Fantasy — community boards suite
--
-- THE ONE THING THIS PROVES: every board returns THE WHOLE COMMUNITY, not just
-- the caller.
--
-- That is the failure mode these five functions exist to avoid, and it is a
-- silent one. `lineups`, `card_instances` and `set_milestone_claims` are all
-- RLS-scoped to their owner, so an invoker-rights version of any of these — or
-- a definer version that later loses its `security definer` in a refactor —
-- returns exactly one row: the caller's, ranked first, with a plausible number
-- beside it. Nothing about that looks broken. You would find out when a second
-- beta tester asked why they were alone on the leaderboard.
--
-- So the suite seeds THREE managers and calls every board as ONE of them,
-- asserting the other two come back. A scoping regression fails here.
--
-- IT ALSO SEPARATES THE ANSWERS THE BOARDS COULD PLAUSIBLY GIVE, the same
-- discipline `median_contest` uses on the mean and the median:
--
--   * The collection board is fixtured so VALUE and CARD COUNT rank the three
--     managers in exactly OPPOSITE orders — ten bronze against one diamond. A
--     board that quietly counted cards would still return three plausible rows
--     in a plausible order; it would return the wrong order, and only a fixture
--     that inverts the two can tell.
--   * The best-week board gets a manager who posts his best score TWICE, so
--     "which week" has a right answer (the earlier one) rather than an
--     arbitrary one.
--   * The cards board gets a sold copy and a committed copy, both scoring more
--     than anything held. Either one appearing means `is_held` has stopped
--     being the predicate for "still yours".
--   * The record board is checked LETTER FOR LETTER against `median_record`,
--     because the two compute the same medians from the same rows and a screen
--     that disagreed with the contest card would be worse than no screen.
--
-- Everything is synthetic — its own team, players, cards, sets and three weeks
-- of its own, all at ids far above the provider's — so the suite does not depend
-- on which real fixtures have been ingested and does not go stale as the season
-- moves. Assertions are RELATIVE (this manager outranks that one) rather than
-- absolute ranks, because real accounts share these boards and a real player
-- with a big collection would otherwise break the suite by playing the game.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/community_boards.test.sql

begin;

do $$
declare
  v_season constant integer  := 2026;
  v_type   constant smallint := 2;
  -- Weeks of their own, high enough that no real slate is in scope. All three
  -- are over: the record board grades finished weeks only.
  --
  -- THREE weeks, not two, because the field is three managers and an ODD field
  -- means the middle score ties the median every week. Over two weeks that
  -- leaves two of the three with identical records and nothing to order them
  -- by; over three, each manager collects a different mix of W, L and T.
  v_wk_hi  constant integer := 96;
  v_wk_mid constant integer := 95;
  v_wk_lo  constant integer := 94;

  v_a constant uuid := 'eeeeeee0-0000-0000-0000-000000000001';
  v_b constant uuid := 'eeeeeee0-0000-0000-0000-000000000002';
  v_c constant uuid := 'eeeeeee0-0000-0000-0000-000000000003';

  v_team    uuid;
  v_p1      uuid;
  v_p2      uuid;
  v_card1   uuid;
  v_card2   uuid;
  v_set_t   uuid;
  v_set_d   uuid;
  v_ci      uuid;
  v_lineup  uuid;

  v_rank_a  bigint;
  v_rank_b  bigint;
  v_rank_c  bigint;
  v_row     record;
  v_expect       bigint;
  v_expect_a     bigint;
  v_expect_sets  bigint;
  v_n       integer;
  i         integer;

  -- One helper value reused by the lineup writer below.
  v_pts     numeric;

  -- The 5b cross-check walks the managers and tallies each one's own weeks.
  v_who     uuid;
  v_w       bigint;
  v_l       bigint;
  v_t       bigint;
begin
  -- ---- synthetic fixtures ------------------------------------------------
  insert into public.teams (external_id, abbreviation, full_name)
  values (992001, 'ZBD', 'Boards Test Team') returning id into v_team;

  insert into public.players (external_id, team_id, first_name, last_name,
                              position, position_abbreviation)
  values (992001, v_team, 'Boards', 'Aaa', 'Quarterback', 'QB') returning id into v_p1;
  insert into public.players (external_id, team_id, first_name, last_name,
                              position, position_abbreviation)
  values (992002, v_team, 'Boards', 'Bbb', 'Running Back', 'RB') returning id into v_p2;

  insert into public.cards (player_id, season) values (v_p1, v_season) returning id into v_card1;
  insert into public.cards (player_id, season) values (v_p2, v_season) returning id into v_card2;

  -- All three weeks final: `board_record` grades a week only when every fixture
  -- in it is, exactly as `median_record` does.
  insert into public.games (external_id, season, week, season_type,
                            home_team_id, visitor_team_id, starts_at, status_state)
  values (992001, v_season, v_wk_hi,  v_type, v_team, v_team, now() - interval '2 days',  'final'),
         (992002, v_season, v_wk_mid, v_type, v_team, v_team, now() - interval '9 days',  'final'),
         (992003, v_season, v_wk_lo,  v_type, v_team, v_team, now() - interval '16 days', 'final');

  -- Three managers. `on_auth_user_created` writes the profile; the display name
  -- is overwritten so the rows are identifiable and so no board's name tiebreak
  -- depends on whatever the trigger derived from an email.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
          'boards-a@t.local', '', now(), now(), now()),
         ('00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated',
          'boards-b@t.local', '', now(), now(), now()),
         ('00000000-0000-0000-0000-000000000000', v_c, 'authenticated', 'authenticated',
          'boards-c@t.local', '', now(), now(), now());

  update public.profiles set display_name = 'zzboards_a' where id = v_a;
  update public.profiles set display_name = 'zzboards_b' where id = v_b;
  update public.profiles set display_name = 'zzboards_c' where id = v_c;

  -- ---- collections, fixtured so VALUE and COUNT disagree ------------------
  -- A: ten bronze (0 fp)      -> 10 cards,  80 coins
  -- B: two gold (800 fp)      ->  2 cards, 300 coins
  -- C: one diamond (3000 fp)  ->  1 card,  500 coins
  -- Value ranks C > B > A. Count ranks A > B > C. Exactly inverted.
  -- BOTH POINT COLUMNS. `card_instances_sync_tier` derives tier from `settled_fp`
  -- (20260821140000), not career_fp, so that a live in-game swing cannot promote a
  -- card and then take it back. These fixtures are settled history — no week of
  -- theirs is in play — so the two figures are equal. Setting only career_fp inserts
  -- every copy at a default settled_fp of 0 and the whole fixture reads bronze.
  for i in 1 .. 10 loop
    insert into public.card_instances (user_id, card_id, career_fp, settled_fp)
    values (v_a, v_card1, 0, 0);
  end loop;

  -- 300 rather than the 800 this was written with. The tier ladder became
  -- 50/200/600 in 20260821250000, which promoted 800 fp from gold to DIAMOND
  -- and quietly made B's two copies worth as much as anything in the fixture —
  -- so the ranking this file exists to check had nothing left to check. 300 is
  -- gold under the current ladder, which is what 800 meant when it was chosen.
  insert into public.card_instances (user_id, card_id, career_fp, settled_fp, lineup_starts)
  values (v_b, v_card1, 300, 300, 10), (v_b, v_card2, 300, 300, 10);

  insert into public.card_instances (user_id, card_id, career_fp, settled_fp, lineup_starts)
  values (v_c, v_card1, 3000, 3000, 20);

  -- The two copies that must not count ANYWHERE, both scoring more than every
  -- held copy above. A sold card and a burnt one are gone from the game.
  insert into public.card_instances (user_id, card_id, career_fp, settled_fp, lineup_starts, sold_at, sold_for)
  values (v_a, v_card2, 5000, 5000, 40, now(), 500);

  insert into public.card_sets (code, name, family, season, required_count, sort_order)
  values ('zz-boards-team-2026', 'Boards Test Team', 'team', v_season, 4, 9001)
  returning id into v_set_t;
  insert into public.card_sets (code, name, family, season, required_count, sort_order)
  values ('zz-boards-daily-2026', 'Boards Daily', 'daily', v_season, 3, 9002)
  returning id into v_set_d;

  insert into public.card_instances (user_id, card_id, career_fp, settled_fp, lineup_starts,
                                     committed_at, committed_to, committed_for)
  values (v_c, v_card2, 4000, 4000, 30, now(), v_set_t, 250);

  -- ---- three scored weeks each -------------------------------------------
  --   week 96: A  50, B 120, C 200  -> median 120 -> A L, B T, C W
  --   week 95: A 100, B  30, C  60  -> median  60 -> A W, B L, C T
  --   week 94: A 100, B  90, C  70  -> median  90 -> A W, B T, C L
  --
  -- which tallies to three different records and three different rates:
  --   A 2-1-0 (.667)   B 0-1-2 (.333)   C 1-1-1 (.500)
  --
  -- A's two hundreds are the SAME SCORE in two different weeks, so "best week"
  -- has to choose between them. The earlier one is the right choice: the first
  -- time you post a number is when you posted it, and matching it later does
  -- not move the record.
  for i in 1 .. 9 loop
    v_pts := (array[50, 120, 200, 100, 30, 60, 100, 90, 70])[i];
    insert into public.lineups (user_id, season, season_type, week, total_points, scored_at)
    values ((array[v_a, v_b, v_c, v_a, v_b, v_c, v_a, v_b, v_c])[i],
            v_season, v_type,
            (array[v_wk_hi, v_wk_hi, v_wk_hi,
                   v_wk_mid, v_wk_mid, v_wk_mid,
                   v_wk_lo, v_wk_lo, v_wk_lo])[i],
            v_pts, now())
    returning id into v_lineup;

    -- A lineup with no slots is not an entrant to the median. Every one of
    -- these is a real entry, so every one gets a slot.
    select id into v_ci from public.card_instances
     where user_id = (array[v_a, v_b, v_c, v_a, v_b, v_c, v_a, v_b, v_c])[i] and is_held limit 1;
    insert into public.lineup_slots (lineup_id, slot, card_instance_id)
    values (v_lineup, 'QB', v_ci);
  end loop;

  -- ---- set progress -------------------------------------------------------
  -- A: two rungs on a TEAM set. B: one DAILY cleared. C: nothing claimed, one
  -- card burnt — the row that only exists because board_sets unions claimers
  -- with committers.
  insert into public.set_milestone_claims (user_id, set_id, threshold_pct,
                                           committed_at_claim, reward_coins)
  values (v_a, v_set_t, 25, 1, 100),
         (v_a, v_set_t, 50, 2, 200),
         (v_b, v_set_d, 100, 3, 40);

  -- ---- call every board AS A, and look for B and C ------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  ------------------------------------------------- 1. the boundary is crossed
  -- The whole point. Each board must see all three managers when one asks.
  select count(*) into v_n from public.board_best_week(v_season, v_type, 500)
   where user_id in (v_a, v_b, v_c);
  if v_n <> 3 then
    raise exception 'FAIL 1: best-week board saw %/3 managers — it is scoped to the caller', v_n;
  end if;

  select count(*) into v_n from public.board_record(v_season, v_type, 500)
   where user_id in (v_a, v_b, v_c);
  if v_n <> 3 then
    raise exception 'FAIL 1: record board saw %/3 managers', v_n;
  end if;

  select count(*) into v_n from public.board_collection(v_season, 500)
   where user_id in (v_a, v_b, v_c);
  if v_n <> 3 then
    raise exception 'FAIL 1: collection board saw %/3 managers', v_n;
  end if;

  select count(distinct user_id) into v_n from public.board_cards(v_season, null, 500)
   where user_id in (v_a, v_b, v_c);
  if v_n <> 2 then
    raise exception 'FAIL 1: cards board saw %/2 managers holding a scoring card', v_n;
  end if;

  select count(*) into v_n from public.board_sets(500) where user_id in (v_a, v_b, v_c);
  if v_n <> 3 then
    raise exception 'FAIL 1: sets board saw %/3 managers', v_n;
  end if;
  raise notice 'PASS 1: every board returns the whole community, not just the caller';

  ------------------------------------------------- 2. collection ranks by VALUE
  select rank into v_rank_a from public.board_collection(v_season, 500) where user_id = v_a;
  select rank into v_rank_b from public.board_collection(v_season, 500) where user_id = v_b;
  select rank into v_rank_c from public.board_collection(v_season, 500) where user_id = v_c;

  if not (v_rank_c < v_rank_b and v_rank_b < v_rank_a) then
    raise exception
      'FAIL 2: collection ranked a=%, b=%, c=% — expected c<b<a. Counting cards rather than valuing them gives exactly the reverse',
      v_rank_a, v_rank_b, v_rank_c;
  end if;

  -- PRICED OFF card_prices RATHER THAN OFF A NUMBER. This suite is about WHICH
  -- copies the board counts — sold ones are gone, committed ones are frozen —
  -- and it used to encode the flat 8/40/150/500 ladder to say so. The sale is now
  -- (base + settled points) x tier multiplier, so a hardcoded total fails on a
  -- change to figures this suite was never testing. card_prices.test.sql owns
  -- what a card is worth; this one owns who is counted.
  select coalesce(sum(cp.sell_value), 0)::bigint into v_expect
    from public.card_instances ci
    join public.card_prices cp on cp.card_instance_id = ci.id
    join public.cards c on c.id = ci.card_id
   where ci.user_id = v_a and ci.sold_at is null and c.season = v_season;

  v_expect_a := v_expect;
  select * into v_row from public.board_collection(v_season, 500) where user_id = v_a;
  if v_row.held <> 10 or v_row.players <> 1 or v_row.value_coins <> v_expect then
    raise exception 'FAIL 2: A held=% players=% value=%, expected 10/1/%',
      v_row.held, v_row.players, v_row.value_coins, v_expect;
  end if;

  -- C HOLDS ONE DIAMOND AND HAS BURNT ANOTHER, and since 20260824200600 both
  -- count. That migration reversed the rule this assertion used to encode:
  -- selling REMOVES a card and committing only immobilises one, so a committed
  -- copy stays on the board frozen at the tier it went in at. `held` stays 1
  -- and `in_sets` carries the other, which is the distinction that lets the
  -- board show how much of a shelf can still grow.
  select coalesce(sum(cp.sell_value), 0)::bigint into v_expect
    from public.card_instances ci
    join public.card_prices cp on cp.card_instance_id = ci.id
    join public.cards c on c.id = ci.card_id
   where ci.user_id = v_c and ci.sold_at is null and c.season = v_season;
  select coalesce(sum(cp.sell_value), 0)::bigint into v_expect_sets
    from public.card_instances ci
    join public.card_prices cp on cp.card_instance_id = ci.id
    join public.cards c on c.id = ci.card_id
   where ci.user_id = v_c and ci.sold_at is null and ci.committed_at is not null
     and c.season = v_season;

  select * into v_row from public.board_collection(v_season, 500) where user_id = v_c;
  if v_row.value_coins <> v_expect or v_row.held <> 1 or v_row.in_sets <> 1 then
    raise exception 'FAIL 2: C value=% held=% in_sets=%, expected %/1/1 (a committed copy still counts)',
      v_row.value_coins, v_row.held, v_row.in_sets, v_expect;
  end if;
  if v_row.in_sets_coins <> v_expect_sets then
    raise exception 'FAIL 2: C in_sets_coins=%, expected %', v_row.in_sets_coins, v_expect_sets;
  end if;

  -- A's SOLD copy is the other half of the same rule and must still be absent.
  select * into v_row from public.board_collection(v_season, 500) where user_id = v_a;
  if v_row.in_sets <> 0 or v_row.value_coins <> v_expect_a then
    raise exception 'FAIL 2: A value=% in_sets=%, expected %/0 (a sold copy must not count)',
      v_row.value_coins, v_row.in_sets, v_expect_a;
  end if;
  raise notice 'PASS 2: collections rank by sell value; sold copies are gone, committed copies are frozen';

  ------------------------------------------------- 3. cards: held and scoring only
  if exists (select 1 from public.board_cards(v_season, null, 500) where career_fp >= 4000) then
    raise exception 'FAIL 3: a sold or committed copy is on the cards board — is_held is not the predicate';
  end if;

  select count(*) into v_n from public.board_cards(v_season, null, 500)
   where user_id = v_a;
  if v_n <> 0 then
    raise exception 'FAIL 3: % of A''s copies are on the cards board — unplayed copies must not tie at zero', v_n;
  end if;

  select * into v_row from public.board_cards(v_season, null, 500)
   where user_id in (v_a, v_b, v_c) order by rank limit 1;
  if v_row.user_id <> v_c or v_row.career_fp <> 3000 or v_row.tier <> 'diamond' then
    raise exception 'FAIL 3: top fixture card is %/% (%), expected C 3000 diamond',
      v_row.display_name, v_row.career_fp, v_row.tier;
  end if;
  -- fp_per_start is a rate, not a total: 3000 over 20 starts.
  if v_row.fp_per_start <> 150.0 then
    raise exception 'FAIL 3: fp_per_start = %, expected 150.0', v_row.fp_per_start;
  end if;

  -- The position filter is the cards board's only argument, so it gets a check.
  select count(*) into v_n from public.board_cards(v_season, 'RB', 500)
   where user_id in (v_a, v_b, v_c);
  if v_n <> 1 then
    raise exception 'FAIL 3: RB filter returned % fixture cards, expected 1', v_n;
  end if;
  raise notice 'PASS 3: the cards board holds only held, scoring copies, and filters by position';

  ------------------------------------------------- 4. best week, including the tie
  select * into v_row from public.board_best_week(v_season, v_type, 500) where user_id = v_a;
  if v_row.points <> 100 or v_row.week <> v_wk_lo then
    raise exception 'FAIL 4: A''s best week is %@wk%, expected 100@wk% — a tie belongs to the earlier week',
      v_row.points, v_row.week, v_wk_lo;
  end if;
  if v_row.weeks_played <> 3 then
    raise exception 'FAIL 4: A played % weeks, expected 3', v_row.weeks_played;
  end if;

  select rank into v_rank_a from public.board_best_week(v_season, v_type, 500) where user_id = v_a;
  select rank into v_rank_b from public.board_best_week(v_season, v_type, 500) where user_id = v_b;
  select rank into v_rank_c from public.board_best_week(v_season, v_type, 500) where user_id = v_c;
  if not (v_rank_c < v_rank_b and v_rank_b < v_rank_a) then
    raise exception 'FAIL 4: best week ranked a=%, b=%, c=%, expected c<b<a',
      v_rank_a, v_rank_b, v_rank_c;
  end if;
  raise notice 'PASS 4: best week takes the maximum, and a tie takes the earlier week';

  ------------------------------------------------- 5. record
  select * into v_row from public.board_record(v_season, v_type, 500) where user_id = v_a;
  -- Two wins and a loss over three graded weeks: 2/3, rounded to three places.
  if v_row.wins <> 2 or v_row.losses <> 1 or v_row.ties <> 0 or v_row.win_pct <> 0.667
     or v_row.weeks <> 3 then
    raise exception 'FAIL 5: A is %-%-% (%) over % weeks, expected 2-1-0 (0.667) over 3',
      v_row.wins, v_row.losses, v_row.ties, v_row.win_pct, v_row.weeks;
  end if;

  -- B never wins and never loses twice: two ties and a loss. A tie is half a
  -- win, so (0 + 1) / 3 — a board that ignored ties would say .000 here.
  select * into v_row from public.board_record(v_season, v_type, 500) where user_id = v_b;
  if v_row.wins <> 0 or v_row.losses <> 1 or v_row.ties <> 2 or v_row.win_pct <> 0.333 then
    raise exception 'FAIL 5: B is %-%-% (%), expected 0-1-2 (0.333)',
      v_row.wins, v_row.losses, v_row.ties, v_row.win_pct;
  end if;

  select * into v_row from public.board_record(v_season, v_type, 500) where user_id = v_c;
  if v_row.wins <> 1 or v_row.losses <> 1 or v_row.ties <> 1 or v_row.win_pct <> 0.500 then
    raise exception 'FAIL 5: C is %-%-% (%), expected 1-1-1 (0.500)',
      v_row.wins, v_row.losses, v_row.ties, v_row.win_pct;
  end if;

  select rank into v_rank_a from public.board_record(v_season, v_type, 500) where user_id = v_a;
  select rank into v_rank_b from public.board_record(v_season, v_type, 500) where user_id = v_b;
  select rank into v_rank_c from public.board_record(v_season, v_type, 500) where user_id = v_c;
  if not (v_rank_a < v_rank_c and v_rank_c < v_rank_b) then
    raise exception 'FAIL 5: record ranked a=%, b=%, c=%, expected a<c<b (by rate)',
      v_rank_a, v_rank_b, v_rank_c;
  end if;
  raise notice 'PASS 5: W-L-T is graded against the weekly median, a tie counting as half';

  ------------------------------------------------- 5b. and it agrees with the contest card
  -- `median_record` puts a W, an L or a T on the lineup screen's contest card
  -- for the CALLER; this board puts one on the leaderboard for EVERYBODY. They
  -- recompute the same medians from the same rows, so any divergence means two
  -- screens telling one manager two different things about the same week —
  -- which is worse than not shipping the board at all.
  --
  -- Checked by impersonating each manager in turn and grading their own weeks
  -- through the contest function, then comparing the tallies.
  foreach v_who in array array[v_a, v_b, v_c] loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_who, 'role', 'authenticated')::text, true);

    select count(*) filter (where result = 'W'),
           count(*) filter (where result = 'L'),
           count(*) filter (where result = 'T')
      into v_w, v_l, v_t
      from public.median_record(v_season, v_type)
     where week in (v_wk_hi, v_wk_mid, v_wk_lo);

    select * into v_row
      from public.board_record(v_season, v_type, 500)
     where user_id = v_who;

    if v_w <> v_row.wins or v_l <> v_row.losses or v_t <> v_row.ties then
      raise exception
        'FAIL 5b: for % the contest card says %-%-% but the board says %-%-%',
        v_who, v_w, v_l, v_t, v_row.wins, v_row.losses, v_row.ties;
    end if;
  end loop;

  -- Put the caller back to A for anything that follows.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  raise notice 'PASS 5b: the board and the contest card grade every week identically';

  ------------------------------------------------- 6. sets
  select * into v_row from public.board_sets(500) where user_id = v_a;
  if v_row.rungs <> 2 or v_row.sets <> 1 or v_row.completed <> 0 or v_row.dailies <> 0
     or v_row.coins <> 300 then
    raise exception 'FAIL 6: A rungs=% sets=% done=% daily=% coins=%, expected 2/1/0/0/300',
      v_row.rungs, v_row.sets, v_row.completed, v_row.dailies, v_row.coins;
  end if;

  -- A daily is not a rung. Folding the two together would rank attendance above
  -- a season-long chase within about six weeks.
  select * into v_row from public.board_sets(500) where user_id = v_b;
  if v_row.rungs <> 0 or v_row.dailies <> 1 then
    raise exception 'FAIL 6: B rungs=% dailies=%, expected 0/1 — a daily must not count as a team rung',
      v_row.rungs, v_row.dailies;
  end if;

  -- The committer with no claim: present, with a cost and nothing bought.
  select * into v_row from public.board_sets(500) where user_id = v_c;
  if v_row.rungs <> 0 or v_row.burned <> 1 or v_row.coins <> 0 then
    raise exception 'FAIL 6: C rungs=% burned=% coins=%, expected 0/1/0',
      v_row.rungs, v_row.burned, v_row.coins;
  end if;
  raise notice 'PASS 6: team rungs, dailies and burnt cards are counted separately';

  ------------------------------------------------- 7. the tier mark
  -- `board_top_tiers` is what puts a coloured tier letter on every manager's
  -- row. Same boundary as the boards: `card_instances` is RLS-scoped, so an
  -- invoker-rights version would mark the caller and leave everybody else bare
  -- — which looks like a design choice rather than a bug.
  select count(*) into v_n from public.board_top_tiers()
   where user_id in (v_a, v_b, v_c);
  if v_n <> 3 then
    raise exception 'FAIL 7: top tiers saw %/3 managers — it is scoped to the caller', v_n;
  end if;

  -- C holds one diamond and one BURNT card scoring more. The mark must follow
  -- what is still held: a manager does not keep a diamond they cashed in.
  select tier::text into v_row from public.board_top_tiers() where user_id = v_c;
  if v_row.tier <> 'diamond' then
    raise exception 'FAIL 7: C''s mark is %, expected diamond', v_row.tier;
  end if;

  -- A holds ten bronze and one SOLD card scoring 5000. Same rule.
  select tier::text into v_row from public.board_top_tiers() where user_id = v_a;
  if v_row.tier <> 'bronze' then
    raise exception 'FAIL 7: A''s mark is %, expected bronze (a sold copy must not count)', v_row.tier;
  end if;
  raise notice 'PASS 7: the tier mark reads the whole community, and only held copies';
end $$;

-- ---- 8. anon is refused ----------------------------------------------------
-- Every one of these is `security definer`, so an accidental grant to anon
-- would publish the whole community's names and holdings to anybody with the
-- publishable key. The grant is `authenticated` only, and this is the check.
do $$
declare
  v_denied integer := 0;
begin
  set local role anon;

  begin perform * from public.board_best_week(2026, 2::smallint, 1);
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform * from public.board_record(2026, 2::smallint, 1);
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform * from public.board_collection(2026, 1);
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform * from public.board_cards(2026, null, 1);
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform * from public.board_sets(1);
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform * from public.board_top_tiers();
  exception when insufficient_privilege then v_denied := v_denied + 1; end;

  reset role;

  if v_denied <> 6 then
    raise exception 'FAIL 8: only %/6 board functions refused anon', v_denied;
  end if;
  raise notice 'PASS 8: anon cannot execute any board';
end $$;

rollback;
