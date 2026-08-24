-- Yap Fantasy — live scoring suite
--
-- The promise this suite exists to hold to, in the words it was asked for:
--
--   "The row should show the points increasing as the player actually records
--    fantasy points. If the user's card is in the starting lineup, the TFP
--    should increase as well. If it isn't in the starting lineup, the card
--    should not add TFP but still show the player's final score."
--
-- Three separate claims, and each one is a different way to lose a user's
-- trust if it inverts:
--
--   1. A STARTED card's total moves while the game is being played. If this
--      fails the whole feature is invisible and nobody can tell the app from a
--      broken one.
--   2. A BENCHED card's total does not move, no matter what its player does.
--      If this fails the game has no cost to sitting someone, and the lineup
--      decision — the entire loop — stops meaning anything.
--   3. TIER does not move until the week is over. If this fails a card
--      promotes to silver in the third quarter and demotes on Tuesday when the
--      provider takes back a catch, which is the one number in this game that
--      must never be handed over and then withdrawn.
--
-- Synthetic week 90, far outside any real slate, on the same reasoning as
-- `lineup_abuse`: a suite pinned to a real preseason week expires the moment
-- that week does.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/live_scoring.test.sql

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','9a000000-0000-0000-0000-000000000001',
        'authenticated','authenticated','live@t.local','',now(),now(),now());

-- Week 90 has two games: one being played, one still to come. That combination
-- is what makes the week incomplete, and an incomplete week is the whole
-- subject of this file.
--
-- Weeks 88 and 89 are finished, and exist so the two cards can arrive at this
-- week with a history. THE HISTORY HAS TO BE REAL. The first draft of this
-- suite simply wrote `career_fp = 195` onto the fixture cards, and score_week
-- immediately replaced it with 18 — correctly, because career_fp is not a
-- stored total that gets added to, it is a SUM of every slot the card has ever
-- filled, recomputed from those slots on every pass. That is the property that
-- makes the sweep idempotent (see 20260818030000), and it means the only way to
-- give a card 195 points is to have earned them in a lineup.
--
-- Worth keeping in mind beyond this file: any row whose career_fp was written
-- directly — `scripts/seed-demo-managers.sql` does exactly this — holds a
-- figure that will be overwritten the first time that card is started.
insert into public.games (external_id, season, week, season_type, starts_at, status_state)
values (990001, 2026, 90, 1, now() - interval '40 minutes', 'in_progress'),
       (990002, 2026, 90, 1, now() + interval '2 days',     'scheduled'),
       (990003, 2026, 89, 1, now() - interval '8 days',     'final'),
       (990004, 2026, 88, 1, now() - interval '15 days',    'final');

do $$
declare
  v_user     uuid := '9a000000-0000-0000-0000-000000000001';
  v_game     uuid;
  v_starter  uuid;   -- card_instance that is in the lineup
  v_bench    uuid;   -- card_instance that is not
  v_p_start  uuid;   -- their players
  v_p_bench  uuid;
  v_lineup   uuid;
  v_version  integer;
  v_career   numeric;
  v_settled  numeric;
  v_tier     text;
  v_final    timestamptz;
  v_scored   timestamptz;
  checks     int := 0;
begin
  select id into v_game from public.games where external_id = 990001;
  select version into v_version from public.scoring_rules where is_active limit 1;

  -- Two QBs, so both cards are legal in the one slot the lineup uses and the
  -- only difference between them is whether they were started.
  select c.id, c.player_id into v_starter, v_p_start
    from public.cards c join public.players p on p.id = c.player_id
   where c.season = 2026 and p.position_abbreviation = 'QB'
     and c.id not in (select card_id from public.card_instances)
   order by c.id limit 1;

  select c.id, c.player_id into v_bench, v_p_bench
    from public.cards c join public.players p on p.id = c.player_id
   where c.season = 2026 and p.position_abbreviation = 'QB'
     and c.id not in (select card_id from public.card_instances)
     and c.player_id <> v_p_start
   order by c.id offset 1 limit 1;

  if v_starter is null or v_bench is null then
    raise exception 'FAIL: fixture needs two unowned 2026 QB cards';
  end if;

  insert into public.card_instances (user_id, card_id)
  values (v_user, v_starter), (v_user, v_bench);

  select ci.id into v_starter from public.card_instances ci
   where ci.user_id = v_user and ci.card_id = v_starter;
  select ci.id into v_bench from public.card_instances ci
   where ci.user_id = v_user and ci.card_id = v_bench;

  /* 195 points apiece, five short of the GOLD threshold at 200, earned in a
   * finished week each. Chosen so the 18 points scored below are unambiguously
   * enough to promote — the test can then assert that promotion does NOT
   * happen yet, which is a far stronger statement than asserting it against a
   * card that was never close.
   *
   * 200 was the SILVER line when this was written; 20260821250000 re-cut the
   * ladder to 50/200/600 and it is the gold line now. The figures are left
   * alone because what they encode — five short of a threshold, then eighteen
   * over it — is the whole point of the fixture, and only the names of the two
   * tiers either side of it have moved.
   *
   * A week each rather than one shared week: `lineups` is unique per user and
   * week, and there is one QB slot, so two cards cannot both have started in
   * the same one. */
  insert into public.lineups (user_id, season, season_type, week, submitted_at, scored_at, finalized_at)
  values (v_user, 2026, 1::smallint, 89, now() - interval '9 days', now() - interval '8 days', now() - interval '8 days')
  returning id into v_lineup;
  insert into public.lineup_slots (lineup_id, slot, card_instance_id, points)
  values (v_lineup, 'QB', v_starter, 195);

  insert into public.lineups (user_id, season, season_type, week, submitted_at, scored_at, finalized_at)
  values (v_user, 2026, 1::smallint, 88, now() - interval '16 days', now() - interval '15 days', now() - interval '15 days')
  returning id into v_lineup;
  insert into public.lineup_slots (lineup_id, slot, card_instance_id, points)
  values (v_lineup, 'QB', v_bench, 195);

  insert into public.lineups (user_id, season, season_type, week, submitted_at)
  values (v_user, 2026, 1::smallint, 90, now() - interval '1 day')
  returning id into v_lineup;

  insert into public.lineup_slots (lineup_id, slot, card_instance_id)
  values (v_lineup, 'QB', v_starter);

  /* One sweep at kickoff, before the provider has published anything. This is
   * a real state the job sits in for several minutes every gameday, and it is
   * also what rolls the fixture's earned history onto the cards: step 3 of
   * score_week sums EVERY slot the card has filled, not just this week's.
   *
   * Note it must be week 90 that is scored and not 88 or 89. Step 1 recomputes
   * the target week's slot points from its stat lines, so asking it to score a
   * historical week with no stat lines in this transaction would zero exactly
   * the history being set up. */
  perform public.score_week(2026, 1::smallint, 90);

  if (select career_fp from public.card_instances where id = v_starter) <> 195 then
    raise exception 'FAIL: fixture card did not arrive on 195 earned points, got %',
      (select career_fp from public.card_instances where id = v_starter);
  end if;
  if (select tier::text from public.card_instances where id = v_starter) <> 'silver' then
    raise exception 'FAIL: fixture card should be silver on 195 fp, got %',
      (select tier::text from public.card_instances where id = v_starter);
  end if;
  checks := checks + 1;

  /* BOTH players produce, and produce identically. The bench card's player is
   * having exactly the same game as the starter's — which is the case that
   * makes claim 2 worth asserting. If the engine credited on ownership rather
   * than on being started, these two cards would be indistinguishable. */
  insert into public.stat_lines (player_id, game_id, season, week, season_type, raw)
  values (v_p_start, v_game, 2026, 90, 1::smallint, '{"passing_yards": 250, "passing_touchdowns": 2}'::jsonb),
         (v_p_bench, v_game, 2026, 90, 1::smallint, '{"passing_yards": 250, "passing_touchdowns": 2}'::jsonb);

  -- 250 * 0.04 + 2 * 4 = 18. Written out rather than run through the scorer so
  -- this suite tests the ROLLUP and not the arithmetic, which scoring.test.ts
  -- already owns.
  insert into public.fantasy_points (stat_line_id, rules_version, points)
  select sl.id, v_version, 18
    from public.stat_lines sl
   where sl.game_id = v_game;

  /* ---- mid-game -------------------------------------------------------- */

  if public.week_is_complete(2026, 1::smallint, 90) then
    raise exception 'FAIL: week with a game still to come was called complete';
  end if;
  checks := checks + 1;

  perform public.score_week(2026, 1::smallint, 90);

  select career_fp, settled_fp, tier::text
    into v_career, v_settled, v_tier
    from public.card_instances where id = v_starter;

  -- CLAIM 1. The started card's total has moved, mid-game, unprompted.
  if v_career <> 213 then
    raise exception 'FAIL claim 1: started card should read 195 + 18 = 213 live, got %', v_career;
  end if;
  checks := checks + 1;

  -- CLAIM 3. Its tier has not, even though 213 clears gold at 200.
  if v_settled <> 195 then
    raise exception 'FAIL claim 3: settled_fp moved during a live week, got %', v_settled;
  end if;
  if v_tier <> 'silver' then
    raise exception 'FAIL claim 3: card promoted to % in the middle of a game', v_tier;
  end if;
  checks := checks + 1;

  -- CLAIM 2. The benched card's player had the identical game and the card
  -- earned nothing for it.
  select career_fp, settled_fp, tier::text
    into v_career, v_settled, v_tier
    from public.card_instances where id = v_bench;
  if v_career <> 195 or v_settled <> 195 then
    raise exception 'FAIL claim 2: benched card was credited — career % settled %', v_career, v_settled;
  end if;
  checks := checks + 1;

  -- The lineup has been scored but is not over, and those are two columns.
  select scored_at, finalized_at into v_scored, v_final
    from public.lineups where id = v_lineup;
  if v_scored is null then
    raise exception 'FAIL: lineup was never stamped as scored mid-game';
  end if;
  if v_final is not null then
    raise exception 'FAIL: lineup called final while a game is still to be played';
  end if;
  checks := checks + 1;

  /* ---- the week ends --------------------------------------------------- */

  update public.games set status_state = 'final'
   where season = 2026 and season_type = 1 and week = 90;

  if not public.week_is_complete(2026, 1::smallint, 90) then
    raise exception 'FAIL: every game final but the week is not complete';
  end if;
  checks := checks + 1;

  perform public.score_week(2026, 1::smallint, 90);

  select career_fp, settled_fp, tier::text
    into v_career, v_settled, v_tier
    from public.card_instances where id = v_starter;

  -- Now, and only now, the two totals converge and the tier follows.
  if v_career <> 213 or v_settled <> 213 then
    raise exception 'FAIL: totals did not converge when the week ended — career % settled %',
      v_career, v_settled;
  end if;
  checks := checks + 1;

  if v_tier <> 'gold' then
    raise exception 'FAIL: card on 213 settled points did not promote, still %', v_tier;
  end if;
  checks := checks + 1;

  select finalized_at into v_final from public.lineups where id = v_lineup;
  if v_final is null then
    raise exception 'FAIL: completed week never stamped finalized_at';
  end if;
  checks := checks + 1;

  -- The benched card is still untouched, which is the claim that has to hold
  -- at the end as well as in the middle.
  if (select career_fp from public.card_instances where id = v_bench) <> 195 then
    raise exception 'FAIL claim 2: benched card gained points once the week ended';
  end if;
  checks := checks + 1;

  /* ---- idempotence ------------------------------------------------------
   * The sweep now runs once a minute, so score_week is called thousands of
   * times against a finished week. An incrementing implementation would inflate
   * every card on the second pass; this is the assertion that says it does not. */
  perform public.score_week(2026, 1::smallint, 90);
  perform public.score_week(2026, 1::smallint, 90);

  select career_fp, settled_fp into v_career, v_settled
    from public.card_instances where id = v_starter;
  if v_career <> 213 or v_settled <> 213 then
    raise exception 'FAIL: re-running score_week changed the total — career % settled %',
      v_career, v_settled;
  end if;
  checks := checks + 1;

  -- finalized_at is stamped once and kept. A later correction sweep must not
  -- advance it, or "when did this week close" becomes "when did we last look".
  if (select finalized_at from public.lineups where id = v_lineup) <> v_final then
    raise exception 'FAIL: finalized_at moved on a later sweep';
  end if;
  checks := checks + 1;

  raise notice 'OK — % assertions across the live scoring arc', checks;
end $$;

rollback;
