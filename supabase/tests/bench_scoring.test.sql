-- Yap Fantasy — bench scoring suite
--
-- ONE RULE, PROVED FROM BOTH SIDES: a card earns fantasy points only in the
-- weeks it was STARTED. A card sitting on the bench earns nothing, no matter
-- how well the player behind it played.
--
-- This is already how score_week is built — it sums `lineup_slots` and never
-- looks at a card that has not filled one — but nothing asserted it, and the
-- failure mode is silent and expensive: career_fp drives tier, tier drives
-- sell value, and a benched card quietly climbing to gold would be a currency
-- bug discovered by a player, not by us.
--
-- The benched player deliberately outscores the started one. If the rule ever
-- inverts, the bench card does not merely gain points — it gains MORE of them
-- than the starter, so the assertion cannot be satisfied by accident.
--
-- Everything is synthetic (its own team, players, game and week) so the suite
-- does not depend on which real fixtures have been ingested, and does not go
-- stale the way a hardcoded "week 3 has not kicked off yet" does.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/bench_scoring.test.sql

begin;

do $$
declare
  v_user    constant uuid := 'cccccccc-0000-0000-0000-000000000001';
  -- A week of its own, so no real lineup or stat line is in scope.
  v_season  constant integer  := 2026;
  v_type    constant smallint := 2;
  v_week    constant integer  := 99;

  v_team    uuid;
  v_game    uuid;
  v_starter_player uuid;
  v_bench_player   uuid;
  v_starter_card   uuid;
  v_bench_card     uuid;
  v_starter_ci     uuid;
  v_bench_ci       uuid;
  v_lineup         uuid;
  v_rules   integer;
  v_sl      uuid;

  v_fp      numeric;
  v_starts  integer;
  v_tier    public.card_tier;
  v_total   numeric;
  v_first   numeric;
begin
  select version into v_rules from public.scoring_rules where is_active limit 1;
  if v_rules is null then
    raise exception 'FAIL: no active scoring rules — cannot score anything';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
          'bench@t.local', '', now(), now(), now());

  -- ---- synthetic fixtures ------------------------------------------------
  -- High external ids: the provider's own ids are far below these, so this
  -- cannot collide with anything sync-reference has ingested or will ingest.
  insert into public.teams (external_id, abbreviation, full_name)
  values (990001, 'ZZZ', 'Test Team') returning id into v_team;

  insert into public.players (external_id, team_id, first_name, last_name,
                              position, position_abbreviation)
  values (990001, v_team, 'Bench', 'Starter', 'Quarterback', 'QB')
  returning id into v_starter_player;

  insert into public.players (external_id, team_id, first_name, last_name,
                              position, position_abbreviation)
  values (990002, v_team, 'Bench', 'Sitter', 'Quarterback', 'QB')
  returning id into v_bench_player;

  insert into public.games (external_id, season, week, season_type,
                            home_team_id, visitor_team_id, starts_at, status_state)
  values (990001, v_season, v_week, v_type, v_team, v_team, now() - interval '1 day', 'final')
  returning id into v_game;

  insert into public.cards (player_id, season) values (v_starter_player, v_season)
  returning id into v_starter_card;
  insert into public.cards (player_id, season) values (v_bench_player, v_season)
  returning id into v_bench_card;

  insert into public.card_instances (user_id, card_id) values (v_user, v_starter_card)
  returning id into v_starter_ci;
  insert into public.card_instances (user_id, card_id) values (v_user, v_bench_card)
  returning id into v_bench_ci;

  -- ---- both players produce; the BENCHED one produces more ---------------
  insert into public.stat_lines (player_id, game_id, team_id, season, week, season_type)
  values (v_starter_player, v_game, v_team, v_season, v_week, v_type) returning id into v_sl;
  insert into public.fantasy_points (stat_line_id, rules_version, points)
  values (v_sl, v_rules, 20.00);

  insert into public.stat_lines (player_id, game_id, team_id, season, week, season_type)
  values (v_bench_player, v_game, v_team, v_season, v_week, v_type) returning id into v_sl;
  insert into public.fantasy_points (stat_line_id, rules_version, points)
  values (v_sl, v_rules, 45.00);   -- more than the starter, on purpose

  -- ---- a lineup that starts ONE of the two -------------------------------
  -- Written directly rather than through set_lineup(): this suite is about
  -- score_week, and going through the write path would tie it to whichever
  -- real week happens not to have kicked off yet.
  insert into public.lineups (user_id, season, season_type, week)
  values (v_user, v_season, v_type, v_week) returning id into v_lineup;

  insert into public.lineup_slots (lineup_id, slot, card_instance_id)
  values (v_lineup, 'QB', v_starter_ci);

  perform public.score_week(v_season, v_type, v_week);

  -- ---- the starter earned exactly what his player scored -----------------
  select career_fp, lineup_starts into v_fp, v_starts
    from public.card_instances where id = v_starter_ci;
  if v_fp is distinct from 20.00 then
    raise exception 'FAIL: started card earned %, expected 20.00', v_fp;
  end if;
  if v_starts <> 1 then
    raise exception 'FAIL: started card recorded % starts, expected 1', v_starts;
  end if;

  -- ---- the bench earned NOTHING, despite outscoring him ------------------
  select career_fp, lineup_starts, tier into v_fp, v_starts, v_tier
    from public.card_instances where id = v_bench_ci;
  if v_fp <> 0 then
    raise exception 'FAIL: benched card earned % — the bench must earn nothing', v_fp;
  end if;
  if v_starts <> 0 then
    raise exception 'FAIL: benched card recorded % starts, expected 0', v_starts;
  end if;
  if v_tier <> 'bronze' then
    raise exception 'FAIL: benched card reached % tier off zero points', v_tier;
  end if;

  -- ---- the week's total counts the starter only --------------------------
  select total_points into v_total from public.lineups where id = v_lineup;
  if v_total is distinct from 20.00 then
    raise exception 'FAIL: lineup total is %, expected 20.00 (bench must not add)', v_total;
  end if;

  -- ---- and it is still true on the second sweep --------------------------
  -- The live job runs every 5 minutes on gamedays. An incrementing design
  -- would inflate the starter here and is exactly what score_week's
  -- recompute-from-slots shape exists to prevent.
  v_first := 20.00;
  perform public.score_week(v_season, v_type, v_week);

  select career_fp into v_fp from public.card_instances where id = v_starter_ci;
  if v_fp is distinct from v_first then
    raise exception 'FAIL: re-sweep moved the starter from % to %', v_first, v_fp;
  end if;

  select career_fp into v_fp from public.card_instances where id = v_bench_ci;
  if v_fp <> 0 then
    raise exception 'FAIL: re-sweep credited the bench with %', v_fp;
  end if;

  raise notice 'PASS: bench earns nothing (starter 20.0 / bench 0.0 off a 45.0 game), and re-sweeping changes neither';
end $$;

rollback;
