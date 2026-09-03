-- Yap Fantasy — card_prices
--
-- Price is now continuous: a tier gives a card its band, and the player's own
-- production places it inside that band (20260902060000). That is a real
-- function rather than a lookup table, and a function has more ways to be wrong
-- than a table does.
--
-- Five properties, each of them a bug we would otherwise find by reading a
-- complaint rather than a test:
--
--   1. EVERY CARD HAS A PRICE AT EVERY TIER. A missing row makes the callers'
--      inner join drop the card, and a card you cannot sell is worse than a card
--      that sells cheap.
--   2. STARTING A CARD NEVER MAKES IT CHEAPER. The whole game is "play the card
--      to grow it"; a price that falls as a copy climbs inverts that.
--   3. A CARD WITH NO SIGNAL IS NEVER PRICED BELOW WHAT IT WAS. 40% of the pool
--      has no 2025 production and this migration promised them nothing lost.
--      NOTHING LOST, not nothing changed: the floor has since been raised from
--      8 to 12 (20260903050345), and a promise that forbids a gift is a promise
--      nobody keeps. See property 4 below, which is the one-way version.
--   4. THE SCALE MEANS THE SAME THING AT EVERY POSITION. Asserted the way it
--      actually failed the first time: the median kicker must not out-price a
--      top-twenty receiver.
--   5. BUYING TO SELL LOSES, at every pack, under that pack's own odds and
--      against the live `packs` rows rather than numbers copied into a comment.
--
-- Then the same thing end to end, through the RPCs a player actually touches.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/card_prices.test.sql

begin;

do $$
declare
  v_bad     integer;
  v_copies  integer;
  v_floor   integer;
  v_pk_med  integer;
  v_wr20    integer;
  v_prev    integer;
  v_here    integer;
  v_pack    record;
  t         record;
begin
  -- 1. Every owned copy prices, and nothing prices null or under the floor.
  select value into v_floor from public.game_config where key = 'sale_base_floor_coins';
  select count(*) into v_copies from public.card_instances;
  select count(*) into v_bad from public.card_prices;
  if v_bad <> v_copies then
    raise exception 'FAIL: card_prices returns % rows against % copies', v_bad, v_copies;
  end if;
  select count(*) into v_bad from public.card_prices
   where sell_value is null or sell_value < v_floor;
  if v_bad > 0 then
    raise exception 'FAIL: % copies price at null or below the floor of %', v_bad, v_floor;
  end if;

  -- 2. THE PARTS MUST ADD UP. sale = (base + points) x tier multiplier, and the
  --    view publishes all three so a screen can show its working. If the parts
  --    and the total ever disagree, the screen is lying about a number that
  --    reaches somebody's balance.
  select count(*) into v_bad
    from public.card_prices cp
   where abs(cp.sell_value
             - floor((cp.base_coins + cp.fp_coins) * cp.sale_multiplier)) > 1;
  if v_bad > 0 then
    raise exception
      'FAIL: on % copies the published parts do not reconstruct the total', v_bad;
  end if;

  -- 3. STARTING A CARD NEVER MAKES IT CHEAPER. A copy holds one tier, so this is
  --    asked of the formula on a fixed player and fixed points: walk the ladder
  --    and the answer must never fall.
  v_prev := -1;
  for t in select tier from public.tier_thresholds order by sort_order loop
    v_here := public.sale_value(t.tier, 0.5, 120);
    if v_here < v_prev then
      raise exception
        'FAIL: the same card is worth % at % against % one tier below — climbing would cost you',
        v_here, t.tier, v_prev;
    end if;
    v_prev := v_here;
  end loop;

  -- 4. THE NO-CLAW-BACK PROMISE, WHICH IS A FLOOR AND NOT AN EQUALITY.
  --
  --    This was written as `sale_value('bronze', 0, 0) = tier_thresholds.sell_value`
  --    on the day the formula replaced the flat ladder, when the two were the
  --    same number by construction. It failed on 2026-09-03 — and it failed
  --    because the floor went UP: `20260903050345` raised it from 8 to 12 so
  --    976 players had more than 57 integer prices to fit into. An assertion
  --    that fires when nobody lost anything is an assertion that will be
  --    deleted the third time it cries wolf.
  --
  --    So it is two checks now, and each says something the other cannot:
  --
  --      the CONTRACT   a card with no player value and no points prices at
  --                     the configured floor exactly. That is what the floor
  --                     IS, and it is the assertion that catches the formula
  --                     drifting off its own bottom rung.
  --      the PROMISE    and that floor is never below the old flat ladder's
  --                     bronze rung. One-way, because raising it is a gift and
  --                     lowering it is a claw-back out of everybody's shelf.
  --
  --    `tier_thresholds.sell_value` is a museum piece — `20260902060000`
  --    marked it superseded and said not to join it for price — and this is
  --    deliberately the one place it is still read: as the historical number
  --    the promise was made against, never as today's answer.
  if public.sale_value('bronze', 0, 0) <> v_floor then
    raise exception 'FAIL: a card with no value and no points prices at % against a floor of %',
      public.sale_value('bronze', 0, 0), v_floor;
  end if;
  if v_floor < (select sell_value from public.tier_thresholds where tier = 'bronze') then
    raise exception 'FAIL: the floor is % against the old flat ladder''s % — that is a claw-back',
      v_floor, (select sell_value from public.tier_thresholds where tier = 'bronze');
  end if;

  -- 5. THE KICKER TEST, written from the failure rather than the fix: the first
  --    cut normalised on the position maximum alone and the median kicker priced
  --    38 against Justin Jefferson's 30. Replacement level is what corrects it.
  --    Asked of the BASE alone, at bronze with no points, so it measures the
  --    player scale and nothing else.
  select max(public.sale_value('bronze', pv.value_score, 0)) into v_pk_med
    from public.player_values pv
   where pv.season = 2026 and pv.position_abbreviation = 'PK'
     and pv.pos_rank > pv.pos_pool / 3;
  select min(public.sale_value('bronze', pv.value_score, 0)) into v_wr20
    from public.player_values pv
   where pv.season = 2026 and pv.position_abbreviation = 'WR' and pv.pos_rank <= 20;

  if v_pk_med is not null and v_wr20 is not null and v_pk_med >= v_wr20 then
    raise exception
      'FAIL: a bottom-two-thirds kicker prices at % against a top-20 receiver''s % — the position scales are not comparable',
      v_pk_med, v_wr20;
  end if;
  raise notice 'card_prices: worst top-20 WR %, best bottom-two-thirds PK % — scales agree',
    v_wr20, v_pk_med;

  -- 6. BUYING TO SELL LOSES. Every pulled card mints at BRONZE with zero settled
  --    points, so a pack returns the BASE and nothing else — which is why the
  --    points half of the formula cannot open a loop no matter how it is tuned.
  --    Measured over the cards actually in each band, against the live odds.
  for v_pack in
    select p.code, p.coin_cost,
           sum((p.odds ->> band.rarity)::numeric / 100 * band.avg_base) * p.card_count as ret
      from public.packs p
      join (
        select c.rarity::text as rarity,
               avg(public.sale_value('bronze', coalesce(pv.value_score, 0), 0)) as avg_base
          from public.cards c
          left join public.player_values pv
                 on pv.player_id = c.player_id and pv.season = c.season
         where c.season = 2026 and c.is_mintable
         group by 1
      ) band on p.odds ? band.rarity
     where p.coin_cost > 0
     group by p.code, p.coin_cost, p.card_count
  loop
    if v_pack.ret >= v_pack.coin_cost then
      raise exception
        'FAIL: pack % costs % and returns % if every card is dumped — that is a money loop',
        v_pack.code, v_pack.coin_cost, round(v_pack.ret, 1);
    end if;
    raise notice 'card_prices: pack % costs %, dumps for % — a % percent loss',
      v_pack.code, v_pack.coin_cost, round(v_pack.ret, 1),
      round(100 - v_pack.ret / v_pack.coin_cost * 100);
  end loop;

  raise notice 'card_prices: complete, additive, monotone, floored at the old ladder, and unfarmable';
end;
$$;

-- --------------------------------------------- the curve, on the real league
--
-- Not an assertion on particular players — they change every season — but on the
-- SHAPE the feature exists to produce: within one position, players separate
-- into distinct prices, and the ranking still reaches the price even though it
-- is no longer the only thing in it. See the note on the group check below for
-- why "the ranking reaches price" is not the same as "price falls with rank".
do $$
declare
  v_pos       text := 'WR';
  v_prices    integer[];
  v_distinct  integer;
  v_top_gap   integer;
  v_next_gap  integer;
  v_top_worst integer;
  v_rest_best integer;
begin
  -- The BASE at diamond: the widest the player component ever gets. Asked of
  -- sale_value with no points, so this measures the curve alone rather than
  -- whatever these particular players happen to have earned.
  select array_agg(public.sale_value('diamond', pv.value_score, 0) order by pv.pos_rank)
    into v_prices
    from public.player_values pv
   where pv.season = 2026
     and pv.position_abbreviation = v_pos
     and pv.pos_rank <= 10;

  -- If the curve cannot separate ten players at its widest, it cannot separate
  -- them anywhere.
  select count(distinct x) into v_distinct from unnest(v_prices) x;
  if v_distinct < 8 then
    raise exception
      'FAIL: the top ten % price to only % distinct values at diamond — the curve is too flat to rank anyone',
      v_pos, v_distinct;
  end if;

  /* RANK CARRIES INTO PRICE — as a GROUP, not player by player.
   *
   * This used to require the top ten to price in descending rank order, and it
   * was right to when `value_score` was a map onto the ranking and nothing
   * else. It is now wrong by design. `20260903050345` blended production into
   * the score and said so in as many words:
   *
   *   "The order is still not monotonic in rank and still should not be —
   *    Jefferson is 11th on the board and 140 coins on 11.9 FP/G last season,
   *    against 380 for the man ranked behind him. That is the production
   *    weight, and it is the only thing on the row the ranking does not
   *    already say."
   *
   * On 2026-09-03 the WR ten read 653 624 669 596 403 385 473 411 259 569:
   * Chase outprices Nacua from a rank below him, and Lamb at ten outprices
   * five men above him. A test demanding descent would force the blend back
   * out — it would be pinning the absence of the feature.
   *
   * What must still be true is that the ranking has not stopped mattering, and
   * the honest form of that is a separation between groups: every one of the
   * position's top ten prices above everyone outside its top THIRD. Measured
   * the day this was written, the worst of the ten was 259 against a best of
   * 175 below the line — comfortable, and it fails exactly when rank has
   * stopped reaching price at all. */
  select min(public.sale_value('diamond', pv.value_score, 0)) into v_top_worst
    from public.player_values pv
   where pv.season = 2026 and pv.position_abbreviation = v_pos and pv.pos_rank <= 10;
  select max(public.sale_value('diamond', pv.value_score, 0)) into v_rest_best
    from public.player_values pv
   where pv.season = 2026 and pv.position_abbreviation = v_pos
     and pv.pos_rank > pv.pos_pool / 3;

  if v_top_worst is null or v_rest_best is null then
    raise exception 'FAIL: % has no top ten or no field below it to compare', v_pos;
  end if;
  if v_top_worst <= v_rest_best then
    raise exception
      'FAIL: the cheapest top-ten % prices at % against % outside the top third — rank has stopped reaching price',
      v_pos, v_top_worst, v_rest_best;
  end if;

  v_top_gap  := v_prices[1] - v_prices[2];
  v_next_gap := v_prices[2] - v_prices[3];
  raise notice
    'card_prices: top ten % at diamond = % — % distinct, #1-#2 gap %, #2-#3 gap %, worst of ten % vs % below the top third',
    v_pos, v_prices, v_distinct, v_top_gap, v_next_gap, v_top_worst, v_rest_best;
end;
$$;

-- ------------------------------------------------- the same thing, end to end
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000',
        '3c111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
        'pricer@test.local', '', now(), now(), now());

insert into public.teams (external_id, abbreviation) values (9401, 'PRC');

-- Two receivers, identical in everything the price is allowed to see except what
-- they produced. Same position, same team, same season, same tier, neither ever
-- started. One is given the best season at his position and the other none, so
-- the two ends of the curve are both exercised.
insert into public.players (external_id, first_name, last_name, position, position_abbreviation, team_id)
values (9401, 'Camp', 'Body', 'WR', 'WR', (select id from public.teams where external_id = 9401)),
       (9402, 'Real', 'Star', 'WR', 'WR', (select id from public.teams where external_id = 9401));

insert into public.cards (player_id, season, rarity)
values ((select id from public.players where external_id = 9401), 2026, 'common'),
       ((select id from public.players where external_id = 9402), 2026, 'common');

-- Written straight into player_values rather than faked through stat lines: this
-- suite is testing the PRICE, and refresh_player_values has its own inputs.
-- Rarity is identical and deliberately 'common' for both, which is the point —
-- price must move on the score alone now, not on the band.
insert into public.player_values
  (player_id, season, position_abbreviation, prior_ppg, prior_games, current_ppg,
   current_games, blended_ppg, replacement_ppg, best_ppg, value_score,
   pos_rank, pos_pool, source)
values
  ((select id from public.players where external_id = 9401), 2026, 'WR',
   0, 17, null, 0, 0, 3, 23, 0.00000, 400, 402, 'prior_season'),
  ((select id from public.players where external_id = 9402), 2026, 'WR',
   23, 17, null, 0, 23, 3, 23, 1.00000, 1, 402, 'prior_season');

insert into public.coin_balances (user_id, balance)
values ('3c111111-1111-1111-1111-111111111111', 0)
on conflict (user_id) do update set balance = 0;

insert into public.card_instances (id, user_id, card_id)
values ('3c333333-0000-0000-0000-000000000001',
        '3c111111-1111-1111-1111-111111111111',
        (select c.id from public.cards c join public.players p on p.id = c.player_id
          where p.external_id = 9401)),
       ('3c333333-0000-0000-0000-000000000002',
        '3c111111-1111-1111-1111-111111111111',
        (select c.id from public.cards c join public.players p on p.id = c.player_id
          where p.external_id = 9402));

do $$
declare
  v_user   constant uuid := '3c111111-1111-1111-1111-111111111111';
  v_scrub  constant uuid := '3c333333-0000-0000-0000-000000000001';
  v_star   constant uuid := '3c333333-0000-0000-0000-000000000002';

  v_quoted_scrub integer;
  v_quoted_star  integer;
  v_paid_scrub   integer;
  v_paid_star    integer;
  v_floor        integer;
  v_ceiling      integer;
  v_balance      integer;
  v_ledger       integer;
  v_view         integer;
  r              jsonb;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user)::text, true);

  select max(value) filter (where key = 'sale_base_floor_coins'),
         max(value) filter (where key = 'sale_base_ceiling_coins')
    into v_floor, v_ceiling
    from public.game_config;

  -- WHAT THE BUTTON SAYS. card_actions is what the collection screen renders,
  -- read before either sale so a quote cannot be back-filled from the result.
  select (value ->> 'sell_value')::integer into v_quoted_scrub
    from jsonb_array_elements(public.card_actions(array[v_scrub, v_star])) value
   where (value ->> 'card_instance_id')::uuid = v_scrub;
  select (value ->> 'sell_value')::integer into v_quoted_star
    from jsonb_array_elements(public.card_actions(array[v_scrub, v_star])) value
   where (value ->> 'card_instance_id')::uuid = v_star;

  if v_quoted_scrub is null or v_quoted_star is null then
    raise exception 'FAIL: card_actions did not quote both copies';
  end if;

  -- THE ENDS OF THE CURVE. A zero score is the floor exactly; a perfect score is
  -- the ceiling exactly. Anything else means the interpolation is off at the
  -- boundaries, which is where an off-by-one in a price hides.
  if v_quoted_scrub <> v_floor then
    raise exception 'FAIL: a zero-score card quotes % against a bronze floor of %',
      v_quoted_scrub, v_floor;
  end if;
  if v_quoted_star <> v_ceiling then
    raise exception 'FAIL: a perfect-score card quotes % against a bronze ceiling of %',
      v_quoted_star, v_ceiling;
  end if;

  -- Same tier, same rarity, same everything else. The only difference the price
  -- may see is what the player did.
  if v_quoted_star <= v_quoted_scrub then
    raise exception
      'FAIL: the best receiver in the league quotes % against a scrub''s % at the same tier and rarity',
      v_quoted_star, v_quoted_scrub;
  end if;

  -- The collection view must agree with the button.
  select sell_value into v_view from public.my_collection where id = v_star;
  if v_view <> v_quoted_star then
    raise exception 'FAIL: my_collection says % where card_actions says %',
      v_view, v_quoted_star;
  end if;

  -- WHAT THE WALLET DOES. Each sale must pay exactly what it quoted.
  r := public.sell_card(v_scrub);
  v_paid_scrub := (r ->> 'sold_for')::integer;
  if v_paid_scrub <> v_quoted_scrub then
    raise exception 'FAIL: scrub quoted % and paid %', v_quoted_scrub, v_paid_scrub;
  end if;

  r := public.sell_card(v_star);
  v_paid_star := (r ->> 'sold_for')::integer;
  if v_paid_star <> v_quoted_star then
    raise exception 'FAIL: star quoted % and paid %', v_quoted_star, v_paid_star;
  end if;
  if (r ->> 'pos_rank')::integer <> 1 then
    raise exception 'FAIL: sell_card reported pos_rank % for the best player at his position',
      r ->> 'pos_rank';
  end if;

  -- Balance, ledger and the frozen price on the card must all agree. Three
  -- separate writes in one function, and a two-input price is a fresh chance for
  -- one of them to drift.
  select balance into v_balance from public.coin_balances where user_id = v_user;
  if v_balance <> v_paid_scrub + v_paid_star then
    raise exception 'FAIL: balance is % after selling % + %',
      v_balance, v_paid_scrub, v_paid_star;
  end if;

  select coalesce(sum(amount), 0)::integer into v_ledger
    from public.coins_ledger where user_id = v_user and reason = 'card_sale';
  if v_ledger <> v_balance then
    raise exception 'FAIL: ledger totals % against a balance of %', v_ledger, v_balance;
  end if;

  if (select sold_for from public.card_instances where id = v_star) <> v_paid_star then
    raise exception 'FAIL: sold_for was not frozen at the price paid';
  end if;

  raise notice
    'card_prices: bronze scrub sold for %, bronze league-best sold for % — quoted, viewed, paid and ledgered alike',
    v_paid_scrub, v_paid_star;
end;
$$;


-- ------------------------------------------------ it keeps itself accurate
--
-- THE POINT OF THE WHOLE FEATURE, and the one thing no static assertion above
-- can show: that a season being played moves the prices, on its own, with
-- nobody running anything.
--
-- Three things are proved here, in order:
--   1. Before any game of the new season is final, a player sits on his prior
--      season and `source` says so.
--   2. A week going final moves him — toward what he is doing NOW, weighted by
--      how many games that is, and the price follows without anything being
--      recomputed, because card_prices is a view.
--   3. A game still in progress moves NOTHING. This is the guard that stops
--      every starter's price dipping at kickoff, and it is asserted by leaving a
--      game non-final and re-running.
--
-- And the job itself: pg_cron must actually hold the schedule. The first cut of
-- this migration guarded the schedule call with to_regproc() instead of
-- to_regprocedure(), which returns null for an overloaded name — so the job was
-- silently never created and the migration still reported success. That is
-- exactly the failure this assertion exists to catch.

do $$
declare
  v_job integer;
begin
  select count(*)::integer into v_job
    from cron.job
   where jobname = 'refresh-player-values' and active;
  if v_job <> 1 then
    raise exception
      'FAIL: refresh-player-values is not scheduled — prices would freeze on the day this shipped';
  end if;
  raise notice 'card_prices: refresh-player-values is on the clock';
end;
$$;

do $$
declare
  v_season  constant integer  := 2026;
  v_type    constant smallint := 2;
  v_week    constant integer  := 97;
  v_week2   constant integer  := 98;

  v_team    uuid;
  v_player  uuid;
  v_card    uuid;
  v_owner   constant uuid := '3c111111-1111-1111-1111-111111111111';
  v_game    uuid;
  v_rules   integer;
  v_sl      uuid;

  v_before  numeric;
  v_after   numeric;
  v_frozen  numeric;
  v_src     text;
  v_games   integer;
  v_px_before integer;
  v_px_after  integer;
begin
  select version into v_rules from public.scoring_rules where is_active limit 1;

  insert into public.teams (external_id, abbreviation) values (9501, 'BLD')
  returning id into v_team;
  insert into public.players (external_id, first_name, last_name, position,
                              position_abbreviation, team_id)
  values (9501, 'Blend', 'Subject', 'WR', 'WR', v_team)
  returning id into v_player;
  insert into public.cards (player_id, season, rarity)
  values (v_player, v_season, 'common') returning id into v_card;

  -- A prior season worth having: one game, but the min-games floor means it is
  -- read as a modest rate rather than as that rate sustained.
  insert into public.games (external_id, season, week, season_type,
                            home_team_id, visitor_team_id, starts_at, status_state)
  values (995001, v_season - 1, 1, v_type, v_team, v_team,
          now() - interval '400 days', 'final')
  returning id into v_game;
  insert into public.stat_lines (player_id, game_id, team_id, season, week, season_type)
  values (v_player, v_game, v_team, v_season - 1, 1, v_type) returning id into v_sl;
  insert into public.fantasy_points (stat_line_id, rules_version, points)
  values (v_sl, v_rules, 80);

  perform public.refresh_player_values(v_season);

  select value_score, source, current_games
    into v_before, v_src, v_games
    from public.player_values where player_id = v_player and season = v_season;

  if v_src <> 'prior_season' then
    raise exception 'FAIL: source is % before any game of the new season is final', v_src;
  end if;
  if v_games <> 0 then
    raise exception 'FAIL: current_games is % before any game of the new season is final', v_games;
  end if;

  -- A copy of the card, so there is a price to watch move. Bronze, unstarted:
  -- the base is the whole of it, which is what isolates the value score.
  insert into public.card_instances (id, user_id, card_id)
  values ('3c333333-0000-0000-0000-000000000003', v_owner, v_card);

  select sell_value into v_px_before
    from public.card_prices where card_instance_id = '3c333333-0000-0000-0000-000000000003';

  -- 3 FIRST, because it is the assertion most easily fooled by doing it last:
  -- a game IN PROGRESS must change nothing at all.
  insert into public.games (external_id, season, week, season_type,
                            home_team_id, visitor_team_id, starts_at, status_state)
  values (995002, v_season, v_week, v_type, v_team, v_team,
          now() - interval '1 hour', 'in')
  returning id into v_game;
  insert into public.stat_lines (player_id, game_id, team_id, season, week, season_type)
  values (v_player, v_game, v_team, v_season, v_week, v_type) returning id into v_sl;
  insert into public.fantasy_points (stat_line_id, rules_version, points)
  values (v_sl, v_rules, 40);

  perform public.refresh_player_values(v_season);
  select value_score, source, current_games
    into v_frozen, v_src, v_games
    from public.player_values where player_id = v_player and season = v_season;

  if v_games <> 0 or v_src <> 'prior_season' or v_frozen is distinct from v_before then
    raise exception
      'FAIL: a game still in progress moved the value (% -> %, % games, source %) — prices would dip at every kickoff',
      v_before, v_frozen, v_games, v_src;
  end if;
  if (select sell_value from public.card_prices
       where card_instance_id = '3c333333-0000-0000-0000-000000000003') <> v_px_before then
    raise exception 'FAIL: a game still in progress moved the price';
  end if;

  -- 2. Now let the week finish. Same points, same player — only the status moves.
  update public.games set status_state = 'final' where external_id = 995002;

  perform public.refresh_player_values(v_season);
  select value_score, source, current_games
    into v_after, v_src, v_games
    from public.player_values where player_id = v_player and season = v_season;

  if v_src <> 'blended' then
    raise exception 'FAIL: source is % after a completed game, expected blended', v_src;
  end if;
  if v_games <> 1 then
    raise exception 'FAIL: current_games is % after one completed game', v_games;
  end if;
  if v_after <= v_before then
    raise exception
      'FAIL: a 40-point week did not raise the value (% -> %) — the blend is not reaching the score',
      v_before, v_after;
  end if;

  -- And the price followed, with nothing recomputed: card_prices is a view.
  select sell_value into v_px_after
    from public.card_prices where card_instance_id = '3c333333-0000-0000-0000-000000000003';
  if v_px_after <= v_px_before then
    raise exception 'FAIL: value rose % -> % but the price did not (% -> %)',
      v_before, v_after, v_px_before, v_px_after;
  end if;

  raise notice
    'card_prices: a finished week moved the score % -> % and the price % -> %, with an unfinished one moving neither',
    round(v_before, 3), round(v_after, 3), v_px_before, v_px_after;
end;
$$;

rollback;
