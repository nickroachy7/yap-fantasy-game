-- Put the tier ladder within reach of a season.
--
-- It was bronze 0, silver 200, gold 750, diamond 2500, and those numbers were
-- never checked against what a card can actually earn. A card only scores while
-- it is in your lineup, so its whole income is (points per start) x (starts),
-- and the season is 18 weeks long.
--
-- What a start is worth, measured from the 2025 regular season under the active
-- rules — mean fantasy points per game played:
--
--     QB 13.7    RB 8.2    PK 7.7    WR 7.1    TE 5.9
--
-- You start your best, not the average, so call a card you would actually field
-- 11-14 a week and an elite quarterback 20+. A full season of starting ONE card
-- every single week is therefore about:
--
--     elite QB ~360     good WR ~215     ordinary starter ~145
--
-- Against that, silver at 200 was a whole season of a good player just to leave
-- the bottom rung — the first step on a four-step ladder taking longer than the
-- beta itself. Gold at 750 was three or four seasons. Diamond at 2500 was over a
-- decade of starting the same card every week: not rare, unreachable, and a
-- rung nobody would ever see is not a chase, it is decoration.
--
-- The new ladder is set in STARTS, because that is the unit a player feels:
--
--     silver    50   ~4-5 starts        a few weeks in
--     gold     200   ~18 starts         a full season of a good card
--     diamond  600   ~50 starts         two to three seasons, or one great one
--
-- Diamond stays rare on purpose. The best possible case — an elite quarterback
-- started every week without exception — reaches it midway through a SECOND
-- season. A good receiver takes three. Nobody diamonds a card in the beta, and
-- that is the intent: gold is the season's achievement, diamond is the thing
-- you are still chasing when the season ends.
--
-- Sell values are deliberately untouched (8 / 40 / 150 / 500). They are the
-- reward for reaching a rung and re-pricing them would take back what this
-- gives. It does make silver a more common sale — a silver pays 40 against a
-- 100-gem pack — which is worth watching once real weeks are scored, and is
-- the reason this note records the arithmetic rather than just the numbers.

update public.tier_thresholds set min_career_fp =  50 where tier = 'silver';
update public.tier_thresholds set min_career_fp = 200 where tier = 'gold';
update public.tier_thresholds set min_career_fp = 600 where tier = 'diamond';

-- Re-tier what already exists. `sync_card_tier` is a BEFORE trigger, so it runs
-- on insert and update and has no opinion about the thresholds having moved
-- underneath it — every existing row would otherwise keep the tier it was given
-- under the old ladder. Writing the column to itself is enough to fire it, and
-- the trigger is the single place the mapping lives either way.
update public.card_instances set settled_fp = settled_fp;
