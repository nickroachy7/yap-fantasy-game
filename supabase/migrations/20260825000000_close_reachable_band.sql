-- The reachable team rungs come down to 160 a club, and the reason is not the
-- one the last three migrations have been arguing about.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS BEING PRICED, AND AGAINST WHAT
-- ---------------------------------------------------------------------------
--
-- Every figure on this ladder since 20260819235600 has been set against ONE
-- rule: a card must not yield more in set rewards than the pack that dealt it
-- cost, 20 gems a card at 100 for five. 20260824234000 restated it and left the
-- reachable band at 400 a club, noting that 32 x 400 = 12,800 gems came back
-- out of 6,000 gems of packs and that closing it meant roughly 160.
--
-- 160 is what this migration does. But the arithmetic behind it is not the
-- arithmetic in that note, and the difference matters more than the number.
--
-- ---------------------------------------------------------------------------
-- THERE IS NO PACK COST TO PRICE AGAINST
-- ---------------------------------------------------------------------------
--
-- 20260824220000 shipped a FREE daily pack: three cards, every day, no gems.
-- Over a ~120-day season that is 360 cards, and nobody in any of the pricing
-- notes has counted them.
--
-- Coupon-collecting over the 976-card pool, 30.5 cards to a club, 32 clubs:
--
--   360 free cards  ->  9.5 distinct cards from EVERY club
--
-- The 10% rung wants 4 and the 25% rung wants 8. So a player who buys nothing
-- at all, ever, clears BOTH rungs on ALL THIRTY-TWO clubs in one season purely
-- by opening the free pack. The reachable band is not a loop that pack-buying
-- can farm — it is a straight faucet with no cost side whatsoever, and at 400 a
-- club it printed 12,800 gems a season for logging in.
--
-- That is why the ceiling rule could not see it: the rule compares rewards to
-- pack spend, and the spend here is zero. Divide by that and every answer is
-- infinite.
--
-- ---------------------------------------------------------------------------
-- SO WHAT IS 160 PRICED AGAINST INSTEAD
-- ---------------------------------------------------------------------------
--
-- The other faucet. `grant_weekly_gems` pays 250 a week, which over an 18-week
-- season is 4,500 gems for turning up. That is the game's stated value of a
-- season of participation, and the set band is the same kind of thing — an
-- unavoidable reward for playing rather than a return on an investment.
--
--   32 clubs x 160 = 5,120 gems a season
--
-- against the weekly grant's 4,500. The two are now the same order, which is
-- the relationship they should have had all along. At 400 the band paid 12,800
-- — nearly three times the entire weekly grant — and it was the largest faucet
-- in the game while being documented as a reward for collecting.
--
-- THE SPLIT, 60 AND 100. The 10% rung lands at 4 cards, which the free pack
-- alone reaches inside a fortnight, so it is the first reward most players will
-- ever collect and it is worth having arrive early. The 25% rung at 8 cards is
-- the one a season is built around. 60 then 100 puts the taste first and the
-- weight second without either being a number nobody notices.
--
-- THE LADDER TOTAL FALLS, 9,100 -> 8,860, and that is the point rather than a
-- side effect. 20260824234000 was explicitly a redistribution and held the
-- total fixed; this is a REDUCTION, and moving the 240 up into the 75% and 100%
-- rungs to keep the total round would be parking it behind rungs nobody
-- reaches — which is the exact thing 20260824201000 was written to undo.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT FIX, WITH THE FIGURES, BECAUSE IT IS THE SAME HOLE
-- ---------------------------------------------------------------------------
--
-- THE 40% AND 50% RUNGS ARE WORSE THAN THE BAND WAS, and they are reachable in
-- ONE season once the free pack is counted. Draws needed to reach a rung on
-- every club, less the 360 the free pack gives, priced at 100 gems per 5 cards,
-- less what the commits themselves pay back at 4 gems a bronze:
--
--   rung  cards  draws  bought  gem cost  commit back  budget/club  PAYS NOW
--    40%     13    534     174     3,480        1,664           57       500
--    50%     16    714     354     7,080        2,048          157       700
--
-- So the 40% rung pays roughly NINE times what it can afford to, and the 50%
-- rung four and a half. A player who opens the free pack daily and buys 35
-- packs clears 40% on all 32 clubs: 32 x (160 + 500) = 21,120 gems out of 3,480
-- gems of packs.
--
-- THEY ARE LEFT ALONE HERE DELIBERATELY. The brief was the reachable band, and
-- re-pricing half a ladder is a balance decision rather than a bug fix — the
-- numbers above are the whole of what is needed to make it, and it is one
-- UPDATE against this table when it is made. Nothing in the beta reaches 40% in
-- the eighteen weeks before it ends, so the clock on it is the second season,
-- not this one.

update public.card_set_ladder_defaults
   set reward_gems = v.gems
  from (values (10, 60), (25, 100)) as v(pct, gems)
 where family = 'team'
   and threshold_pct = v.pct;

-- ---------------------------------------------------------------- apply now
--
-- `rebuild_card_sets` re-prices `card_set_milestones` from the defaults, which
-- is what carries this onto the 32 sets that already exist.
--
-- ANYBODY ALREADY PAID KEEPS WHAT THEY WERE PAID. `set_milestone_claims` is
-- never rewritten, and `my_sets` reports the frozen figure on a claimed rung
-- rather than today's — so a player who collected 300 at the 25% rung this
-- morning still reads 300, and only the unclaimed rungs move.
do $$
declare
  v_season integer;
begin
  for v_season in select distinct season from public.cards where is_mintable order by 1 loop
    perform public.rebuild_card_sets(v_season);
  end loop;
end;
$$;
