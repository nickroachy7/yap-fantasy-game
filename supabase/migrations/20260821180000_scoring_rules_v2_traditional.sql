-- Version 2: traditional scoring, seeded INACTIVE.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT IN v1
-- ---------------------------------------------------------------------------
--
-- `fumbles_touchdowns` is the provider's catch-all counter for a non-offensive
-- touchdown, not a fumble-specific one, and it fires ALONGSIDE the specific
-- field rather than instead of it. Across three seasons of stored lines:
--
--     58 of 58  interception-return TDs also carry fumbles_touchdowns
--      5 of 12  kick-return TDs do
--      7 of 22  punt-return TDs do
--         35    rows carry it alone — the genuine fumble recoveries
--
-- v1 scored `fumbles_touchdowns` and `interception_touchdowns` at 6 apiece, so
-- every pick-six paid 12. It surfaced as two linebackers finishing fourth and
-- fifth in 2026 preseason week 3 on exactly 12.00 each, ahead of every skill
-- player in both games.
--
-- Nothing that can be STARTED was ever mis-scored by it: all 58 doubled rows
-- belong to CB, LB, S and DT, and `lineup_slot_config` admits only QB, RB, WR,
-- TE and PK. What it corrupted was every surface that ranks players by points —
-- the scoreboard's leaders, the directory, the profiles. Eight rows (6 WR, 2 RB)
-- carrying a return TD plus the catch-all are the only rosterable over-credits,
-- at 6 points each.
--
-- ---------------------------------------------------------------------------
-- THE FIX IS A SUBTRACTION
-- ---------------------------------------------------------------------------
--
-- Traditional fantasy does not score individual defensive players at all — a
-- pick-six belongs to a DST unit, not to the cornerback. Both defensive fields
-- leave the ruleset and the double-count leaves with them, with no new rule
-- shape and no deduplication logic to get wrong later. Return touchdowns keep
-- their 6 through the two specific fields, which is what a returner earns.
--
-- Everything else is byte-for-byte v1. Kicking stays flat at 3 because this feed
-- publishes `field_goals_made` and `long_field_goal_made` and nothing between,
-- so the distance tiers traditional scoring uses cannot be computed — a kicker
-- with four made and a long of 48 has three field goals of unknown distance, and
-- tiering on the long alone would pay 4 for all four. The yardage bonuses stay
-- because they are a game decision rather than part of this defect; they are the
-- one deliberate deviation from traditional here, and superseding them costs one
-- more row.
--
-- ---------------------------------------------------------------------------
-- WHY is_active IS FALSE
-- ---------------------------------------------------------------------------
--
-- `score_week` joins `fantasy_points` on the active version. Activating a
-- version nothing has been computed against would resolve every lineup in the
-- database to zero through a LEFT JOIN to rows that do not exist, and would keep
-- doing so until a recompute finished. So: seed inactive, recompute against
-- version 2 explicitly with the `rescore` function, activate only then. The
-- activation is 20260821190000 and must not be applied before the recompute has
-- run.

insert into public.scoring_rules (version, name, rules, is_active)
values (
  2,
  'Traditional PPR with yardage bonuses',
  '{
     "perStat": {
       "passing_yards": 0.04,
       "passing_touchdowns": 4,
       "passing_interceptions": -2,
       "rushing_yards": 0.1,
       "rushing_touchdowns": 6,
       "receptions": 1,
       "receiving_yards": 0.1,
       "receiving_touchdowns": 6,
       "fumbles_lost": -2,
       "field_goals_made": 3,
       "extra_points_made": 1,
       "kick_return_touchdowns": 6,
       "punt_return_touchdowns": 6
     },
     "bonuses": [
       { "stat": "passing_yards",   "atLeast": 300, "points": 3 },
       { "stat": "rushing_yards",   "atLeast": 100, "points": 3 },
       { "stat": "receiving_yards", "atLeast": 100, "points": 3 }
     ]
   }'::jsonb,
  false
)
on conflict (version) do update
  set rules = excluded.rules,
      name  = excluded.name;

comment on table public.scoring_rules is
  'Versioned rulesets. fantasy_points is keyed by version, so a rules change is a recompute (supabase/functions/rescore) against stored stat_lines.raw, never a re-ingest. Activate a version only once it has been computed — score_week joins on the active one.';
