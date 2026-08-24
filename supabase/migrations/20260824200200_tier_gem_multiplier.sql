-- What a tier is worth on payday, and why the number is so small.
--
-- ---------------------------------------------------------------------------
-- THE CONSTRAINT THAT PICKS THE NUMBERS
-- ---------------------------------------------------------------------------
--
-- This game asks one question every week: who do you think will score the most?
-- A multiplier on gems earned is a thumb on that scale, and the size of the
-- thumb is not a taste question — it is arithmetic:
--
--   A TIER MULTIPLIER OF X% OVERRIDES EVERY LINEUP DECISION WHERE THE PLAYER'S
--   PROJECTION EDGE IS SMALLER THAN X%.
--
-- At a silver multiplier of 1.20, a silver card projecting 12 out-earns a
-- bronze projecting 14, and the game has just told the player to ignore their
-- own read of the slate. That is the core loop arguing with itself.
--
-- So the ladder below is deliberately shallow. It decides genuine coin-flips
-- and nothing more:
--
--   bronze   1.00   —
--   silver   1.10   flips only calls closer than 10%
--   gold     1.25   flips only calls closer than 14% against silver
--   diamond  1.40   flips only calls closer than 12% against gold
--
-- The widest gap in the table is diamond against bronze at 40%, which is the
-- one place to watch in the beta. "Start my proven diamond over an unproven
-- bronze" is a defensible fantasy take on its own, so it is left in; if it
-- reads as bullying, compress the top to 1.30 and nothing else has to change.
--
-- ---------------------------------------------------------------------------
-- WHY IT DOES NOT NEED TO BE BIGGER
-- ---------------------------------------------------------------------------
--
-- Tier is already the biggest number in this economy and this is its THIRD
-- payout, not its first. `sell_value` runs 8 -> 40 -> 150 -> 500, a 62x span,
-- and `board_collection` is priced directly off it. A card that climbs to
-- diamond has already paid its owner enormously. What was missing was a reason
-- to feel that climb on the Sunday it happens, week after week, rather than
-- only at the moment you sell. Seasoning, not a second dinner.
--
-- ---------------------------------------------------------------------------
-- GEMS ONLY. NEVER FANTASY POINTS.
-- ---------------------------------------------------------------------------
--
-- This multiplier must never touch `lineup_slots.points` or `total_points`. If
-- it did, a third-season player would beat a newcomer fielding the identical
-- eight players, and every head-to-head board in the game would be measuring
-- account age. Scoring is the same for everybody forever; only the payout
-- differs. Nothing in this file writes to a points column, and nothing later
-- should.

alter table public.tier_thresholds
  add column if not exists gem_multiplier numeric(4,2) not null default 1.00
    check (gem_multiplier >= 1.00 and gem_multiplier <= 3.00);

update public.tier_thresholds set gem_multiplier = 1.00 where tier = 'bronze';
update public.tier_thresholds set gem_multiplier = 1.10 where tier = 'silver';
update public.tier_thresholds set gem_multiplier = 1.25 where tier = 'gold';
update public.tier_thresholds set gem_multiplier = 1.40 where tier = 'diamond';

comment on column public.tier_thresholds.gem_multiplier is
  'What a start by a card of this tier multiplies its gem payout by. Applies to gems only and never to fantasy points — see the header of 20260824200200_tier_gem_multiplier.sql for why the ladder is this shallow.';
