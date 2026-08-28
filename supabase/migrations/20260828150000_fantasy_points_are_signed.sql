-- A week can score negative, so a career can too.
--
-- `career_fp >= 0` was written on 2026-08-18, when career_fp was assumed to be a
-- number that only ever climbed. The scoring rules say otherwise and always did:
-- an interception is -2 and a lost fumble is -2, so a starter who throws a pick
-- on nine passing yards is legitimately below zero for that week.
--
-- On 2026-08-27 that finally happened in production. Justin Herbert, started at
-- QB in preseason week 4, was sitting at 9 passing yards (0.36) when the sweep
-- last succeeded at 02:16 UTC. He then lost a fumble, the recompute produced
-- 0.36 - 2.00 = -1.64, and the check rejected it.
--
-- The damage was not one card. score_week rolls career_fp for EVERY card in one
-- `update ... from (aggregate)` statement, so a single out-of-range row aborts
-- the whole statement, gameday_sweep() propagates the error, and the per-minute
-- cron dies. Scoring stopped dead for every user for twelve hours — no stat
-- moved, no game went final, no week settled — because one quarterback fumbled.
--
-- Dropping the constraints, rather than clamping the aggregate at zero with a
-- greatest(0, ...), is the deliberate choice: clamping would keep the sweep
-- alive while quietly showing a card more points than it earned, and the tier
-- ladder would read that inflated number. Nothing needs the floor. The tier
-- trigger already handles a value below every threshold by falling back to
-- bronze, and tier_thresholds.min_career_fp keeps its own `>= 0` check because
-- a *threshold* below zero really would be meaningless.
alter table public.card_instances
  drop constraint if exists card_instances_career_fp_check,
  drop constraint if exists card_instances_settled_fp_check;
