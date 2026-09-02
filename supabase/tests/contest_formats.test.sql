-- Yap Fantasy — win conditions and payout curves
--
-- THE ONE THING THIS PROVES: the four ways a contest can be won and the four
-- ways its pool can be split are independent, and every combination settles to
-- an answer that fits inside the pool.
--
-- ---------------------------------------------------------------------------
-- WHY IT IS ITS OWN SUITE
-- ---------------------------------------------------------------------------
--
-- `contest_prizes.test.sql` owns the LEDGER side — that a pool tracks the fees,
-- that a refund withdraws from it, that settlement is exactly-once. Nothing
-- here touches the wallet. This suite owns the two pure functions underneath
-- it, `contest_results` and `contest_payouts`, because they are where a
-- re-tuning goes wrong silently: a bad split still pays somebody, still
-- balances, and still looks like a working contest.
--
-- ---------------------------------------------------------------------------
-- THE FIXTURE IS ONE FIELD, READ SIX WAYS
-- ---------------------------------------------------------------------------
--
-- Five entrants scoring 50, 40, 30, 20 and 10, in a week that is final. One
-- field, six contests over it, differing only in how they are decided and how
-- they pay. That is deliberate: every assertion below is then a statement about
-- the RULE, with the scores held constant, and a change that breaks one rule
-- cannot hide behind a change in the field.
--
-- The scores are ten apart and in rank order so that "who is rank 3" is never
-- in doubt and a tie can never appear by accident. Ties are their own case and
-- they get their own contest at the end, where two entrants share first place
-- and the payout must still fit in the pool — the property that made
-- `contest_payouts` normalise by the weights that exist rather than by a
-- nominal denominator.
--
-- ---------------------------------------------------------------------------
-- WHAT WOULD HAVE CAUGHT THE BUG THIS SUITE WAS WRITTEN AFTER
-- ---------------------------------------------------------------------------
--
-- Section 6. A contest with `hearts_at_risk = 0` and `hearts_on_win = 1` — The
-- Warm-Up's shape — reached settlement and moved nothing, because both
-- `set_lineup` and `settle_run_week` asked "does this risk a heart" when they
-- meant "does this move hearts". It recorded a win and paid no heart, silently.
--
-- Everything is synthetic — its own team, player, cards, games and a week of
-- its own — so the suite does not depend on which real fixtures have been
-- ingested and does not go stale as the season moves.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/contest_formats.test.sql

begin;

-- ---------------------------------------------------------------- fixtures

-- A week of its own, high enough that no real slate is in scope, and FINAL —
-- every assertion here is about a settled week, and `contest_results` returns
-- null for every entrant until the last whistle.
insert into public.teams (external_id, abbreviation, full_name)
values (993001, 'ZWC', 'Win Condition Test Team');

insert into public.games (external_id, season, week, season_type, starts_at,
                          status_state, home_team_id, visitor_team_id)
select 993001, 2026, 87, 1, now() - interval '2 days', 'final', t.id, t.id
  from public.teams t where t.external_id = 993001;

do $$
declare
  v_team    uuid;
  v_player  uuid;
  v_card    uuid;
  v_user    uuid;
  v_lineup  uuid;
  v_ci      uuid;
  -- Ten apart and in rank order: rank is never ambiguous and no tie can appear
  -- by accident. Ties are section 5's job.
  v_scores  constant numeric[] := array[50, 40, 30, 20, 10];
  v_users   uuid[] := '{}';
  v_contest uuid;
  v_code    text;
  i         integer;
begin
  select id into v_team from public.teams where external_id = 993001;

  insert into public.players (external_id, first_name, last_name,
                              position_abbreviation, team_id)
  values (993001, 'Win', 'Condition', 'WR', v_team)
  returning id into v_player;

  insert into public.cards (player_id, season)
  values (v_player, 2026) returning id into v_card;

  -- SIX CONTESTS OVER ONE FIELD. Only the last two columns differ where the
  -- rule is the same, which is the whole point of the fixture: `dbl` and `gpp`
  -- are both "top 40%" and are different products.
  insert into public.contests (code, kind, format_code, season, season_type, week, name,
                               entry_fee_coins, prize_pool_bps, win_condition,
                               win_rank, win_pct, target_points, payout_curve,
                               hearts_at_risk, hearts_on_win)
  values
    -- Beat 35: two of the five clear it, and it would resolve for one entrant.
    ('test:target:87', 'lobby', 'flex3', 2026, 1, 87, 'T Target',
     0, 0, 'target', null, null, 35.00, 'flat', 0, 0),
    -- Top 40% of five is two places (floor), paid evenly. A double-up.
    ('test:dbl:87', 'lobby', 'flex3', 2026, 1, 87, 'T Double',
     100, 9000, 'top_pct', null, 40, null, 'flat', 0, 0),
    -- The same two places, paid steeply. A tournament.
    ('test:gpp:87', 'lobby', 'flex3', 2026, 1, 87, 'T Tournament',
     100, 9000, 'top_pct', null, 40, null, 'steep', 0, 0),
    -- One place, everything.
    ('test:wta:87', 'lobby', 'flex3', 2026, 1, 87, 'T Duel',
     100, 9000, 'top_n', 1, null, null, 'winner_take_all', 0, 0),
    -- Top 10% of five floors to nought and is lifted to one place.
    ('test:tiny:87', 'lobby', 'flex3', 2026, 1, 87, 'T Tiny Share',
     100, 9000, 'top_pct', null, 10, null, 'flat', 0, 0),
    -- Risks nothing, pays a heart. The Warm-Up's shape — section 6.
    ('test:warm:87', 'lobby', 'flex3', 2026, 1, 87, 'T Warm Up',
     0, 0, 'target', null, null, 35.00, 'flat', 0, 1),
    -- A SECOND top-40% row, identical to `dbl`, existing only so section 2 has
    -- a field it may shrink. Sections that mutate the fixture must not mutate a
    -- fixture another section reads — the first draft shrank `dbl` and section
    -- 3 then asserted a split of an empty contest.
    ('test:shrink:87', 'lobby', 'flex3', 2026, 1, 87, 'T Shrinking',
     0, 0, 'top_pct', null, 40, null, 'flat', 0, 0);

  -- Five managers, each with one card, entered in every contest with the same
  -- score. `total_points` is written directly: this suite is about how a score
  -- is JUDGED, and routing it through the scoring sweep would make a scoring
  -- change look like a payout bug.
  for i in 1 .. array_length(v_scores, 1) loop
    v_user := ('87878787-0000-0000-0000-00000000000' || i)::uuid;
    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, created_at, updated_at)
    values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'wc' || i || '@test.invalid', '', now(), now())
    on conflict (id) do nothing;
    insert into public.coin_balances (user_id, balance)
    values (v_user, 10000) on conflict (user_id) do update set balance = 10000;
    v_users := v_users || v_user;

    foreach v_code in array array['test:target:87','test:dbl:87','test:gpp:87',
                                  'test:wta:87','test:tiny:87','test:warm:87',
                                  'test:shrink:87']
    loop
      select id into v_contest from public.contests where code = v_code;

      insert into public.card_instances (user_id, card_id)
      values (v_user, v_card) returning id into v_ci;

      insert into public.lineups (user_id, season, season_type, week, contest_id,
                                  total_points, scored_at)
      values (v_user, 2026, 1, 87, v_contest, v_scores[i], now())
      returning id into v_lineup;

      -- A lineup with no slots is not an entrant, so the slot is required for
      -- this field to exist at all.
      insert into public.lineup_slots (lineup_id, slot, card_instance_id)
      values (v_lineup, 'FLEX1', v_ci);

      -- The pool is read from the LEDGER, never from fee x entrants, so a fee
      -- has to actually be recorded for the paid contests to have one.
      insert into public.coins_ledger (user_id, amount, reason, reference_id,
                                       idempotency_key)
      select v_user, -c.entry_fee_coins, 'contest_entry', v_lineup,
             format('contest_entry:%s', v_lineup)
        from public.contests c
       where c.id = v_contest and c.entry_fee_coins > 0;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. A TARGET NEEDS NO FIELD.
-- ---------------------------------------------------------------------------
do $$
declare
  v_contest uuid;
  v_w       integer;
  v_l       integer;
  v_null    integer;
  v_solo    integer;
  v_res     text;
begin
  select id into v_contest from public.contests where code = 'test:target:87';

  -- 1a. Two of five clear 35, three do not, and NOBODY has a null result. The
  --     null is the case that matters: under every field-relative condition a
  --     thin field returns "no result", and a target is the answer to that.
  select count(*) filter (where result = 'W'),
         count(*) filter (where result = 'L'),
         count(*) filter (where result is null)
    into v_w, v_l, v_null
    from public.contest_results(v_contest);

  if v_w <> 2 or v_l <> 3 or v_null <> 0 then
    raise exception 'FAIL: target gave %W/%L/%null, expected 2/3/0', v_w, v_l, v_null;
  end if;

  -- 1b. THE BOUNDARY IS INCLUSIVE. A target of 35 and a score of exactly 35 is
  --     a win — "beat 35" is drawn as a bar to reach, and a player who lands on
  --     it having read that must not lose.
  update public.lineups set total_points = 35.00
   where contest_id = v_contest
     and user_id = '87878787-0000-0000-0000-000000000003';

  select result into v_res from public.contest_results(v_contest)
   where user_id = '87878787-0000-0000-0000-000000000003';
  if v_res <> 'W' then
    raise exception 'FAIL: a score exactly on the target settled as %, expected W', v_res;
  end if;
  update public.lineups set total_points = 30.00
   where contest_id = v_contest
     and user_id = '87878787-0000-0000-0000-000000000003';

  -- 1c. AND IT RESOLVES FOR A SINGLE ENTRANT. This is the property the whole
  --     condition exists for: a four-tester beta where a contest paying three
  --     of a field of three settled as nothing at all.
  delete from public.lineups
   where contest_id = v_contest
     and user_id <> '87878787-0000-0000-0000-000000000001';

  select count(*) into v_solo from public.contest_results(v_contest);
  select result into v_res from public.contest_results(v_contest);
  if v_solo <> 1 or v_res <> 'W' then
    raise exception 'FAIL: a lone entrant on 50 v 35 gave % rows, result %', v_solo, v_res;
  end if;

  raise notice 'contest formats: the target passed';
end $$;

-- ---------------------------------------------------------------------------
-- 2. top_pct SCALES WITH THE FIELD, FLOORS, AND KEEPS ONE PLACE.
-- ---------------------------------------------------------------------------
do $$
declare
  v_dbl    uuid;
  v_tiny   uuid;
  v_shrink uuid;
  v_w      integer;
  v_null   integer;
begin
  select id into v_dbl    from public.contests where code = 'test:dbl:87';
  select id into v_tiny   from public.contests where code = 'test:tiny:87';
  select id into v_shrink from public.contests where code = 'test:shrink:87';

  -- 2a. FLOOR, NOT CEIL. 40% of five is 2.0 exactly; the interesting case is
  --     that a share is never rounded UP into paying more of the field than it
  --     advertised, so the assertion is that two win and three lose.
  select count(*) filter (where result = 'W') into v_w
    from public.contest_results(v_dbl);
  if v_w <> 2 then
    raise exception 'FAIL: top 40%% of five paid %, expected 2', v_w;
  end if;

  -- 2b. A SHARE THAT FLOORS TO NOUGHT STILL PAYS ONE. 10% of five is 0.5, and
  --     a contest that collected fees and pays nobody is a rake wearing a
  --     game's name.
  select count(*) filter (where result = 'W') into v_w
    from public.contest_results(v_tiny);
  if v_w <> 1 then
    raise exception 'FAIL: top 10%% of five paid %, expected 1', v_w;
  end if;

  -- 2c. THE PLACES MOVE WITH THE FIELD. The same contest, two entrants: 40% of
  --     two is 0.8, floors to nought, lifts to one. One winner, one loser —
  --     still a contest.
  delete from public.lineups
   where contest_id = v_shrink
     and user_id in ('87878787-0000-0000-0000-000000000003',
                     '87878787-0000-0000-0000-000000000004',
                     '87878787-0000-0000-0000-000000000005');

  select count(*) filter (where result = 'W'),
         count(*) filter (where result is null)
    into v_w, v_null
    from public.contest_results(v_shrink);
  if v_w <> 1 or v_null <> 0 then
    raise exception 'FAIL: top 40%% of two gave %W and %null, expected 1/0', v_w, v_null;
  end if;

  -- 2d. AND A FIELD OF ONE IS NOT A CONTEST. Every field-relative condition
  --     keeps this floor: one entrant would be "top 40%" of themselves, win by
  --     turning up, and take 90% of their own fee back.
  delete from public.lineups
   where contest_id = v_shrink
     and user_id = '87878787-0000-0000-0000-000000000002';

  select count(*) filter (where result is null) into v_null
    from public.contest_results(v_shrink);
  if v_null <> 1 then
    raise exception 'FAIL: a lone entrant in a top_pct contest got a result';
  end if;

  raise notice 'contest formats: the share passed';
end $$;

-- ---------------------------------------------------------------------------
-- 3. THE CURVES SPLIT ONE POOL FOUR WAYS.
-- ---------------------------------------------------------------------------
do $$
declare
  v_gpp    uuid;
  v_wta    uuid;
  v_pool   integer;
  v_first  integer;
  v_second integer;
  v_count  integer;
  v_total  integer;
begin
  select id into v_gpp from public.contests where code = 'test:gpp:87';
  select id into v_wta from public.contests where code = 'test:wta:87';

  -- Five entries at 100 with a 90% pool is 450.
  v_pool := public.contest_prize_pool(v_gpp);
  if v_pool <> 450 then
    raise exception 'FAIL: five entries at 100 and 90%% gave a pool of %, expected 450', v_pool;
  end if;

  -- 3a. STEEP IS 1 : 1/2 over two places, so first takes two thirds. 300/150
  --     out of 450 — and the point of asserting both is that a curve which
  --     silently fell back to `flat` would pay 225/225 and still balance.
  select coins into v_first  from public.contest_payouts(v_gpp) where rnk = 1;
  select coins into v_second from public.contest_payouts(v_gpp) where rnk = 2;
  if v_first <> 300 or v_second <> 150 then
    raise exception 'FAIL: steep split was %/%, expected 300/150', v_first, v_second;
  end if;

  -- 3b. THE SAME FIELD AND THE SAME RULE, PAID FLAT, IS A DIFFERENT PRODUCT.
  --     `test:dbl:87` is top 40% like the tournament and pays its two winners
  --     the same. This is the assertion that the curve is genuinely independent
  --     of the win condition rather than decoration on it.
  select coins into v_first  from public.contest_payouts(
    (select id from public.contests where code = 'test:dbl:87')) where rnk = 1;
  select coins into v_second from public.contest_payouts(
    (select id from public.contests where code = 'test:dbl:87')) where rnk = 2;
  if v_first is null or v_first <> v_second then
    raise exception 'FAIL: a flat double-up split %/%, expected equal shares',
      v_first, v_second;
  end if;

  -- 3c. WINNER TAKE ALL PAYS ONE ROW AND THE WHOLE POOL. Not "most of it":
  --     a duel with a remainder left in the rake is a duel that lied.
  select count(*), coalesce(sum(coins), 0) into v_count, v_total
    from public.contest_payouts(v_wta);
  if v_count <> 1 or v_total <> public.contest_prize_pool(v_wta) then
    raise exception 'FAIL: winner-take-all paid % rows totalling %, pool is %',
      v_count, v_total, public.contest_prize_pool(v_wta);
  end if;

  raise notice 'contest formats: the curves passed';
end $$;

-- ---------------------------------------------------------------------------
-- 4. NO CURVE EVER PAYS OUT MORE THAN THE POOL.
-- ---------------------------------------------------------------------------
--
-- Asserted over every contest in the fixture at once rather than one at a time,
-- because it is the invariant that must hold for combinations nobody wrote a
-- case for. A new curve added later is covered by this the day it is seeded.
do $$
declare r record;
begin
  for r in
    select c.code,
           public.contest_prize_pool(c.id) as pool,
           coalesce((select sum(p.coins) from public.contest_payouts(c.id) p), 0) as paid
      from public.contests c
     where c.season = 2026 and c.season_type = 1 and c.week = 87
  loop
    if r.paid > r.pool then
      raise exception 'FAIL: % paid % out of a pool of %', r.code, r.paid, r.pool;
    end if;
  end loop;

  raise notice 'contest formats: nothing overpays passed';
end $$;

-- ---------------------------------------------------------------------------
-- 5. A SHARED PLACE CANNOT OVERPAY.
-- ---------------------------------------------------------------------------
--
-- `rank()` lets ties share a place — two entries level at the top are both rank
-- 1 and rank 2 is vacant — so a split with a fixed denominator would hand out
-- two first prizes. `contest_payouts` normalises by the weights that exist,
-- which cannot. Worth its own section because it is the failure that would only
-- appear on the one Sunday two people tied.
do $$
declare
  v_wta   uuid;
  v_pool  integer;
  v_count integer;
  v_total integer;
begin
  select id into v_wta from public.contests where code = 'test:wta:87';

  update public.lineups set total_points = 50
   where contest_id = v_wta
     and user_id = '87878787-0000-0000-0000-000000000002';

  v_pool := public.contest_prize_pool(v_wta);
  select count(*), coalesce(sum(coins), 0) into v_count, v_total
    from public.contest_payouts(v_wta);

  if v_count <> 2 then
    raise exception 'FAIL: two tied at the top paid % rows, expected 2', v_count;
  end if;
  if v_total > v_pool then
    raise exception 'FAIL: a tie paid % out of a pool of %', v_total, v_pool;
  end if;

  raise notice 'contest formats: a shared place passed';
end $$;

-- ---------------------------------------------------------------------------
-- 6. A HEART CAN BE WON WITHOUT BEING RISKED.
-- ---------------------------------------------------------------------------
--
-- THE REGRESSION THIS SUITE EXISTS FOR. `settle_run_week` gated on
-- `hearts_at_risk > 0`, which was the same set as "moves hearts" right up until
-- a contest paid a heart without staking one. The Warm-Up is exactly that, and
-- under the old gate it recorded a win and healed nothing — silently, with the
-- lobby still advertising `+1 heart`.
do $$
declare
  v_warm    uuid;
  v_user    constant uuid := '87878787-0000-0000-0000-000000000001';
  v_run     uuid;
  v_before  smallint;
  v_after   smallint;
  v_lineup  uuid;
  v_ci      uuid;
  v_delta   smallint;
begin
  select id into v_warm from public.contests where code = 'test:warm:87';

  -- A live run, deliberately below its ceiling so a heal has somewhere to go.
  -- `runs_one_live_per_user` is a partial unique index, so the synthetic user
  -- may already own a live run from an earlier fixture; take it if so.
  select id into v_run from public.runs
   where user_id = v_user and ended_at is null;

  if v_run is null then
    insert into public.runs (user_id, hearts, max_hearts, peak_hearts)
    values (v_user, 2, 5, 3) returning id into v_run;
  else
    update public.runs set hearts = 2, max_hearts = 5, peak_hearts = 3
     where id = v_run;
  end if;

  -- The trigger stamps the run at INSERT, and these lineups were written before
  -- the run existed, so this one is re-filed the way a real entry arrives.
  delete from public.lineups where contest_id = v_warm and user_id = v_user;
  insert into public.lineups (user_id, season, season_type, week, contest_id,
                              total_points, scored_at)
  values (v_user, 2026, 1, 87, v_warm, 50, now())
  returning id into v_lineup;

  -- 6a. THE STAMP. A contest that pays a heart carries the run, even though it
  --     risks none — which is what `set_lineup`'s own gate would not have done.
  if (select run_id from public.lineups where id = v_lineup) is distinct from v_run then
    raise exception 'FAIL: an entry into a heart-paying contest carried run %, expected %',
      (select run_id from public.lineups where id = v_lineup), v_run;
  end if;

  -- A FRESH COPY. One card plays one contest a week, enforced by
  -- `lineup_slots_one_contest_per_card`, and every copy this user owns is
  -- already filed in one of the six contests above — so reusing an arbitrary
  -- one is refused by name. Minting another is what a real player does when
  -- they enter a second contest, which is the behaviour under test.
  insert into public.card_instances (user_id, card_id)
  select v_user, c.id from public.cards c
    join public.players p on p.id = c.player_id
   where p.external_id = 993001
  returning id into v_ci;

  insert into public.lineup_slots (lineup_id, slot, card_instance_id)
  values (v_lineup, 'FLEX1', v_ci);

  select hearts into v_before from public.runs where id = v_run;
  perform public.settle_run_week(2026, 1::smallint, 87);
  select hearts into v_after from public.runs where id = v_run;

  -- 6b. AND THE HEART ACTUALLY ARRIVES.
  if v_after <> v_before + 1 then
    raise exception 'FAIL: a won heart took the run from % to %, expected %',
      v_before, v_after, v_before + 1;
  end if;

  -- 6c. RECORDED AS A WIN WORTH ONE HEART, so the history says what happened
  --     rather than leaving the wallet as the only evidence.
  select hearts_delta into v_delta from public.run_contest_results
   where run_id = v_run and contest_id = v_warm;
  if v_delta is distinct from 1::smallint then
    raise exception 'FAIL: the settled row recorded a heart delta of %, expected 1', v_delta;
  end if;

  raise notice 'contest formats: a free heart passed';
end $$;

rollback;
