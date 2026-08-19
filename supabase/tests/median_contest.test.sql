-- Yap Fantasy — median contest suite
--
-- THE ONE THING THIS PROVES: the whole base is scored against the MEDIAN, and
-- swapping it for the average would be caught here rather than in week 4 of the
-- beta.
--
-- The fixture is built so the two answers disagree about the caller. Nine
-- entrants score 10, 20, 100, 105, 110, 115, 120, 400 and 420. The median is
-- 110 and the mean is 155.56, and the caller is on 120 — a WIN against the
-- median and a LOSS against the mean. A `median_record` that quietly started
-- averaging would still return a plausible number and a plausible letter; it
-- would return the wrong letter, and only a fixture that separates the two can
-- tell. The suite asserts the separation itself before it asserts anything
-- else, so the test cannot rot into one that passes either way.
--
-- The long right tail (400, 420) is not decoration. It is what a real week
-- looks like — a handful of huge scores dragging the mean well above the middle
-- — and it is the reason the median was chosen.
--
-- It also proves the property the contest rests on: WINS AND LOSSES BALANCE.
-- The suite walks all nine managers, calling the function as each of them in
-- turn, and asserts four wins, four losses and the one genuine tie an odd field
-- produces. That is a fact about every manager at once, and it cannot be
-- checked from any single caller's row.
--
-- Everything is synthetic — its own team, players, cards, games and two weeks
-- of its own — so the suite does not depend on which real fixtures have been
-- ingested, and does not go stale as the season moves.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/median_contest.test.sql

begin;

do $$
declare
  v_season constant integer  := 2026;
  v_type   constant smallint := 2;
  -- Weeks of their own, high enough that no real slate is in scope. One is
  -- over, one is still being played — the difference decides whether there is
  -- a result at all.
  v_done   constant integer := 98;
  v_live   constant integer := 97;

  -- Sorted, so the median is visibly the fifth of nine. The caller is index 7.
  v_scores constant numeric[] := array[10, 20, 100, 105, 110, 115, 120, 400, 420];
  v_me     constant integer := 7;

  v_expected_median  constant numeric := 110.00;
  v_expected_average constant numeric := 155.56;   -- 1400 / 9

  v_team   uuid;
  v_player uuid;
  v_card   uuid;
  v_ci     uuid;
  v_lineup uuid;
  v_user   uuid;
  v_users  uuid[] := '{}';

  v_row    record;
  v_wins   integer := 0;
  v_losses integer := 0;
  v_ties   integer := 0;
  i        integer;
begin
  -- ---- synthetic fixtures ------------------------------------------------
  -- High external ids: the provider's own are far below these, so this cannot
  -- collide with anything sync-reference has ingested or will ingest.
  insert into public.teams (external_id, abbreviation, full_name)
  values (991001, 'ZMD', 'Median Test Team') returning id into v_team;

  insert into public.players (external_id, team_id, first_name, last_name,
                              position, position_abbreviation)
  values (991001, v_team, 'Median', 'Tester', 'Quarterback', 'QB')
  returning id into v_player;

  insert into public.cards (player_id, season) values (v_player, v_season)
  returning id into v_card;

  -- The finished week and the one still in progress. `median_record` reads
  -- `status_state` and nothing else, so these two values are the whole
  -- difference between "you won" and "no result yet".
  insert into public.games (external_id, season, week, season_type,
                            home_team_id, visitor_team_id, starts_at, status_state)
  values (991001, v_season, v_done, v_type, v_team, v_team, now() - interval '2 days', 'final');
  insert into public.games (external_id, season, week, season_type,
                            home_team_id, visitor_team_id, starts_at, status_state)
  values (991002, v_season, v_live, v_type, v_team, v_team, now() - interval '1 hour', 'scheduled');

  -- ---- nine managers, one lineup each, in both weeks ---------------------
  for i in 1 .. array_length(v_scores, 1) loop
    v_user := ('ddddddd0-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    v_users := v_users || v_user;

    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
            'median' || i || '@t.local', '', now(), now(), now());

    insert into public.card_instances (user_id, card_id) values (v_user, v_card)
    returning id into v_ci;

    -- Written directly rather than through set_lineup(): this suite is about
    -- what the field's middle IS, and the write path would tie it to whichever
    -- real week happens not to have kicked off yet. total_points is set here
    -- for the same reason — score_week is proved by its own suite.
    insert into public.lineups (user_id, season, season_type, week, total_points, scored_at)
    values (v_user, v_season, v_type, v_done, v_scores[i], now())
    returning id into v_lineup;
    insert into public.lineup_slots (lineup_id, slot, card_instance_id)
    values (v_lineup, 'QB', v_ci);

    insert into public.lineups (user_id, season, season_type, week, total_points, scored_at)
    values (v_user, v_season, v_type, v_live, v_scores[i], now())
    returning id into v_lineup;
    insert into public.lineup_slots (lineup_id, slot, card_instance_id)
    values (v_lineup, 'QB', v_ci);
  end loop;

  -- ---- a tenth manager who opened the screen and picked nobody -----------
  -- A lineups row with no slots. `set_lineup` writes the row before the slots
  -- and an empty payload is legal, so this state is reachable in the product.
  -- It must not count: a nought from somebody who never played would pull the
  -- middle down, and it would do so more every week as the base grows.
  v_user := 'ddddddd0-0000-0000-0000-000000000099'::uuid;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
          'median-empty@t.local', '', now(), now(), now());
  insert into public.lineups (user_id, season, season_type, week, total_points, scored_at)
  values (v_user, v_season, v_type, v_done, 0, now());

  -- ---- 0. the fixture actually separates the two answers ------------------
  -- Without this the suite could be "passing" against an averaging
  -- implementation and nobody would know.
  if v_scores[v_me] <= v_expected_median then
    raise exception 'FAIL: fixture broken — the caller does not beat the median';
  end if;
  if v_scores[v_me] >= v_expected_average then
    raise exception 'FAIL: fixture broken — the caller also beats the mean, so this suite proves nothing';
  end if;

  -- ---- 1. the finished week, read as the caller ---------------------------
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_users[v_me], 'role', 'authenticated')::text, true);

  select * into v_row from public.median_record(v_season, v_type) where week = v_done;

  if v_row is null then
    raise exception 'FAIL: no row for the finished week';
  end if;

  if v_row.entrants <> 9 then
    raise exception 'FAIL: % entrants, expected 9 — an empty lineup is being counted', v_row.entrants;
  end if;

  if v_row.median is distinct from v_expected_median then
    raise exception 'FAIL: median is %, expected % (the mean is %)',
      v_row.median, v_expected_median, v_expected_average;
  end if;

  if v_row.average is distinct from v_expected_average then
    raise exception 'FAIL: average is %, expected %', v_row.average, v_expected_average;
  end if;

  if v_row.high is distinct from 420.00 then
    raise exception 'FAIL: high is %, expected 420.00', v_row.high;
  end if;

  -- The two ends of the card's bar. `low` matters as much as `high` now that
  -- the card places the caller across the whole range rather than against an
  -- opponent: get it wrong and every fill is measured from the wrong origin.
  if v_row.low is distinct from 10.00 then
    raise exception 'FAIL: low is %, expected 10.00', v_row.low;
  end if;

  -- The property that makes the bar safe to draw without clamping: the caller
  -- is IN the field, so their score can never fall outside its range.
  if v_row.my_points < v_row.low or v_row.my_points > v_row.high then
    raise exception 'FAIL: my_points % sits outside the field range %..%',
      v_row.my_points, v_row.low, v_row.high;
  end if;

  if not v_row.final then
    raise exception 'FAIL: a week whose every fixture is final did not read as final';
  end if;

  if v_row.my_points is distinct from v_scores[v_me] then
    raise exception 'FAIL: my_points is %, expected %', v_row.my_points, v_scores[v_me];
  end if;

  -- 420 and 400 are ahead of 120, so third.
  if v_row.my_rank <> 3 then
    raise exception 'FAIL: my_rank is %, expected 3', v_row.my_rank;
  end if;

  -- Six entrants score less than 120. This is what the card's share bar
  -- divides by `entrants`, so a rank/ahead mix-up would show as "ahead of 33%"
  -- on a card whose owner is third of nine.
  if v_row.ahead <> 6 then
    raise exception 'FAIL: ahead is %, expected 6', v_row.ahead;
  end if;

  -- THE ASSERTION THE SUITE EXISTS FOR.
  if v_row.result is distinct from 'W' then
    raise exception 'FAIL: result is %, expected W — 120 beats the median (110) and loses to the mean (155.56), so this is what an averaging implementation gets wrong',
      coalesce(v_row.result, 'null');
  end if;

  -- ---- 2. the week still being played has no result yet -------------------
  select * into v_row from public.median_record(v_season, v_type) where week = v_live;

  if v_row is null then
    raise exception 'FAIL: no row for the live week';
  end if;
  if v_row.final then
    raise exception 'FAIL: a week with a scheduled fixture read as final';
  end if;
  -- The median is still live and still right; only the RESULT waits.
  if v_row.median is distinct from v_expected_median then
    raise exception 'FAIL: live median is %, expected %', v_row.median, v_expected_median;
  end if;
  if v_row.result is not null then
    raise exception 'FAIL: a live week returned result % — nobody has won anything yet', v_row.result;
  end if;

  -- ---- 3. a manager with no lineup gets the field but no line -------------
  perform set_config('request.jwt.claims',
                     json_build_object('sub', 'ddddddd0-0000-0000-0000-000000000099',
                                       'role', 'authenticated')::text, true);
  select * into v_row from public.median_record(v_season, v_type) where week = v_live;
  if v_row.my_points is not null or v_row.my_rank is not null or v_row.ahead is not null then
    raise exception 'FAIL: an empty lineup was given a line in the contest';
  end if;
  if v_row.entrants <> 9 or v_row.median is distinct from v_expected_median then
    raise exception 'FAIL: the field changed depending on who asked for it';
  end if;

  -- ---- 4. wins and losses balance across the whole base -------------------
  -- The property the contest is built on, checked the only way it can be:
  -- by asking as every manager in turn. Nine is odd, so exactly one of them
  -- IS the median and genuinely ties.
  for i in 1 .. array_length(v_users, 1) loop
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_users[i], 'role', 'authenticated')::text, true);
    select * into v_row from public.median_record(v_season, v_type) where week = v_done;
    if v_row.result = 'W' then v_wins := v_wins + 1;
    elsif v_row.result = 'L' then v_losses := v_losses + 1;
    elsif v_row.result = 'T' then v_ties := v_ties + 1;
    else raise exception 'FAIL: manager % got no result in a finished week', i;
    end if;
  end loop;

  if v_wins <> v_losses then
    raise exception 'FAIL: % wins against % losses — the median must split the field evenly',
      v_wins, v_losses;
  end if;
  if v_ties <> 1 then
    raise exception 'FAIL: % ties, expected exactly 1 (an odd field has one manager ON the median)',
      v_ties;
  end if;

  raise notice 'PASS: median 110.00 beats mean 155.56 as the opponent (caller W, not L); empty lineups excluded; live week has no result; % W / % L / % T across 9 managers',
    v_wins, v_losses, v_ties;
end $$;

rollback;
