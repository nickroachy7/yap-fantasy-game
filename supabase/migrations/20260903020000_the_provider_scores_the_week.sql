-- The provider scores the week
--
-- ---------------------------------------------------------------------------
-- WE WROTE A SCORING ENGINE ON A FALSE PREMISE
-- ---------------------------------------------------------------------------
--
-- `/stats` returns raw counting stats and no fantasy points. That is true, it is
-- recorded in the provider adapter, and it is why this codebase has carried a
-- hand-written scoring engine and two versions of a rules table since day one.
--
-- What nobody checked is `/fantasy/weekly_stats`, which returns points per
-- player per week under three named formats with the full rule definitions
-- inline. It was missed the same way the projections endpoint was missed: the
-- endpoint census probed bare paths and never probed the `/fantasy/` namespace.
--
-- ---------------------------------------------------------------------------
-- OUR ENGINE WAS RIGHT ABOUT ALMOST EVERYTHING, AND WRONG ABOUT KICKERS
-- ---------------------------------------------------------------------------
--
-- Measured against `ppr` on 2025 week 1 across 302 matched lines, 269 agreed to
-- the cent. Of the 33 that did not:
--
--   17 skill-position lines, every gap EXACTLY 3.00 — our three yardage bonuses
--      (300 passing, 100 rushing, 100 receiving), which their format does not
--      have. A difference of taste, and ours was defensible.
--
--   16 kicker lines, average gap −1.20 and max 5.00 — and this one was not
--      taste. We paid a flat 3 for any field goal. They pay 3/4/5/6 by distance
--      and −1 for a miss. We were underpaying every kicker in the game.
--
-- ---------------------------------------------------------------------------
-- AND WE CANNOT FIX THE KICKERS OURSELVES, WHICH IS WHAT SETTLES IT
-- ---------------------------------------------------------------------------
--
-- The obvious repair is to teach our engine the distance tiers. It is not
-- available to us: `/stats` does not emit distance-bucketed field goals. A
-- stored kicker line holds `field_goals_made`, `field_goal_attempts`,
-- `field_goal_pct` and `long_field_goal_made` — the LONGEST make, which tells
-- you nothing about the other two. There is no arrangement of those fields that
-- reproduces 3/4/5/6, so no version of our engine can score a kicker correctly
-- from what we store.
--
-- So this is not a preference for the provider. It is the only source that can
-- produce a correct number, and a scoring engine that is right about four
-- positions out of five is not a scoring engine.
--
-- ---------------------------------------------------------------------------
-- WHY IT IS SAFE TO DO THIS TODAY AND WILL NOT BE IN TWO WEEKS
-- ---------------------------------------------------------------------------
--
-- Changing the ruleset re-denominates every stored point, and stored points are
-- what the tier ladder (50/200/600) and every sell price are calibrated
-- against. Measured before deciding: 854 card instances, career FP on 15 of
-- them, 107.1 points in the entire game, 16.6 on the biggest single card, and
-- ZERO cards above bronze — nobody within thirty points of the silver
-- threshold. A rescore today moves no tier, no price and no payout.
--
-- The 2026 regular season starts 2026-09-13. After the first real week this
-- stops being a no-op and becomes an economy re-denomination. Anyone
-- contemplating a similar swap later should run `sum(career_fp)` first: that
-- number is the cost.
--
-- ---------------------------------------------------------------------------
-- THE RULES ARE STILL DATA, AND THIS ROW IS STILL THE AUTHORITY
-- ---------------------------------------------------------------------------
--
-- `fantasy_points.rules_version` explains every stored point, so the provider's
-- format needs a version of its own or the rows it produces are unexplainable.
-- v3 IS their `ppr`, transcribed: the offensive subset, DST rules omitted
-- because this game has no DST slot, no bonuses because they have none.
--
-- It is DOCUMENTATION OF WHAT WAS APPLIED, not an instruction to apply it. The
-- number written to `fantasy_points` is the provider's `total_points`, taken
-- whole; `scoreStatLine` can still reproduce the skill-position half of this
-- from our stored raw and is worth keeping for exactly that check, but it
-- cannot reproduce the kicker half and must never be used to fill a gap.
--
-- v1 and v2 stay, unchanged and inactive, as the honest record of what they
-- were. `fantasy_points` rows keyed to them are rewritten by the rescore rather
-- than reinterpreted.

insert into public.scoring_rules (version, name, rules, is_active)
values (
  3,
  'balldontlie PPR (provider-scored)',
  jsonb_build_object(
    'perStat', jsonb_build_object(
      -- passing
      'passing_yards', 0.04,
      'passing_touchdowns', 4,
      'passing_interceptions', -2,
      'passing_two_point_conversions', 2,
      -- rushing
      'rushing_yards', 0.1,
      'rushing_touchdowns', 6,
      'rushing_two_point_conversions', 2,
      -- receiving, full PPR
      'receptions', 1,
      'receiving_yards', 0.1,
      'receiving_touchdowns', 6,
      'receiving_two_point_conversions', 2,
      -- turnovers
      'fumbles_lost', -2,
      -- kicking. THE HALF OUR RAW CANNOT REPRODUCE — see the header. Recorded
      -- so the row explains the points, not so anything recomputes them.
      'extra_points_made', 1,
      'field_goals_made_0_to_39', 3,
      'field_goals_made_40_to_49', 4,
      'field_goals_made_50_to_59', 5,
      'field_goals_made_60_plus', 6,
      'field_goals_missed', -1,
      -- non-offensive scores credited to the player who scored them
      'kick_return_touchdowns', 6,
      'punt_return_touchdowns', 6,
      'blocked_kick_return_touchdowns', 6,
      'fumble_return_touchdowns', 6,
      'interception_return_touchdowns', 6,
      'offensive_fumble_recovery_touchdowns', 6,
      'one_point_safeties', 1,
      'two_point_returns', 2
    ),
    -- THEIR FORMAT HAS NONE, and ours had three. Dropping them is the deliberate
    -- half of this change: a projection carries the provider's total, so keeping
    -- a local bonus would mean the forecast and the result were computed under
    -- different rules and could never be compared honestly.
    'bonuses', '[]'::jsonb
  ),
  false
)
on conflict (version) do update
  set name = excluded.name,
      rules = excluded.rules;

-- IT IS INSERTED INACTIVE, AND THAT IS THE IMPORTANT PART OF THIS FILE.
--
-- A dozen views and RPCs resolve points as
--   `fp.rules_version = (select version from scoring_rules where is_active)`
-- — the player directory, the profile, the game log, season stats, the sell
-- price. Flipping `is_active` to 3 in this migration would point every one of
-- them at a version that has no rows yet, and the whole app would read as
-- though nobody had ever scored: not an error, not a failed migration, just
-- zeroes and nulls everywhere.
--
-- So the order is: register the ruleset here, backfill v3 points with
-- `sync-fantasy`, and activate in `20260903030000` — which refuses to run
-- until the rows exist. `db push` has no transaction, so the split into
-- separate migrations is the guarantee, not the comment.

comment on table public.scoring_rules is
  'Versioned scoring rulesets. v3 is balldontlie''s own PPR format, registered here and activated by 20260903030000 once provider points have been backfilled; its points are taken from /fantasy/weekly_stats rather than computed, because our stored /stats payload cannot reproduce distance-tiered field goals. v1 and v2 are the retired hand-written rulesets.';
