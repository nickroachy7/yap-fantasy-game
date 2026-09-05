-- ===========================================================================
-- THE SHOP IS PRICED IN ROUND HUNDREDS
-- ===========================================================================
--
--     Base       100   4 cards
--     Pro        300   6 cards
--     All-Pro    600   6 cards
--     Elite    1,200   6 cards
--
-- 160/250/600/1,400 were arithmetic — each one derived from its pack's
-- expected sell value at a target ratio — and arithmetic makes bad prices. A
-- shelf a player can hold in their head is worth more than four numbers each
-- tuned to two significant figures.
--
-- ---------------------------------------------------------------------------
-- BASE DROPS TO FOUR CARDS, AND THAT IS THE PRICE OF THE ROUND HUNDRED
-- ---------------------------------------------------------------------------
--
-- A SIX-CARD BASE PACK CANNOT COST 100. Measured against the live catalogue
-- before this ran, it deals 105 coins of sell value on average — so buying one
-- and dumping the contents nets five coins, every time, for ever. That is the
-- buy-and-dump loop `20260903124500` doubled prices to close, reopened by a
-- rounder number.
--
-- AND NO ODDS TABLE SAVES IT, which is the part worth writing down because it
-- is the obvious next idea. Push Base to a hundred per cent depth — the worst
-- pack the tier system can express — and six cards are still worth 82, or 82%
-- of a 100-coin price. Six cards is simply more than 100 coins buys.
--
-- So the card count gives instead: four cards at 100 returns 70, which is the
-- same 70% sink every other rung on the shelf runs. Base also stays the best
-- value per card on the shelf at 25, against Pro's 50 — the cheap pack should
-- be the cheap pack.
--
-- WHAT IT COSTS is the constant six, and that was an argument worth losing
-- rather than one that was wrong: holding the count still made the ladder read
-- as "the same six cards, better odds", and Base now reads as "fewer cards AND
-- worse odds". The compensation is that its per-card rates are untouched — the
-- four numbers printed on the card do not move, only how many draws they get.
--
-- ---------------------------------------------------------------------------
-- THE OTHER THREE ONLY MOVE IN PRICE
-- ---------------------------------------------------------------------------
--
-- Expected sell value against price, from the tier means (elite 335, starter
-- 168, bench 59, depth 14) and stated so the next retune can check its work:
--
--     Base      100   4 cards    EV  70    70%
--     Pro       300   6 cards    EV 156    52%
--     All-Pro   600   6 cards    EV 383    64%
--     Elite   1,200   6 cards    EV 897    75%
--
-- Elite is the thinnest at 75% and is the one to watch: `player_values` is
-- recomputed as the season runs, and its guaranteed elite is the slot most
-- exposed to that. Under 100% is the line; 75% is comfortable and not roomy.
-- ===========================================================================

-- FOUR CARDS. See the note above for why this is not a taste decision.
update public.packs
   set coin_cost  = 100,
       card_count = 4
 where code = 'base';

update public.packs set coin_cost = 300  where code = 'pro';
update public.packs set coin_cost = 600  where code = 'allpro';
update public.packs set coin_cost = 1200 where code = 'elite';
