-- A pack that costs more and deals better players.
--
-- ---------------------------------------------------------------------------
-- THIS IS ENTIRELY DATA, AND THAT IS THE INTERESTING PART
-- ---------------------------------------------------------------------------
--
-- `open_pack` is not touched. It already rolls a rarity band from `packs.odds`
-- and then draws a card from that band, and `cards.rarity` is ALREADY derived
-- from 2025 regular-season production, ranked within position group (see
-- 20260819100000_assign_card_rarity.sql). So "higher odds of pulling players who
-- performed well last year" is, mechanically, already what a rarity band means.
-- All that was missing was a second row in `packs` that leans on the good end.
--
-- The pool it draws from, for reference:
--
--   common   687      uncommon 143      rare 86      epic 40      legendary 20
--
-- ---------------------------------------------------------------------------
-- PRICING: 400 GEMS, AND WHY NOT MORE GENEROUS
-- ---------------------------------------------------------------------------
--
-- The Standard pack is 100 gems for 5 cards at 2.5% epic and 0.5% legendary, so
-- 0.15 epic-or-better per pack — 0.0015 per gem. If the Pro pack beat that rate
-- by much, Standard would be strictly dominated for anybody who could afford
-- Pro, and a shop with a dead item on the shelf is a shop with one item.
--
--   Pro, 5 cards at 400 gems, 13.5% epic-or-better
--     = 0.675 per pack = 0.0017 per gem
--
-- About 12% better than Standard per gem. That is the whole edge, and it is
-- deliberately small: what you are really buying is VARIANCE REDUCTION, not
-- expectation. Standard hands you five commons most of the time; Pro is 92% to
-- contain a rare or better and 52% to contain an epic or better. The feeling of
-- the pack changes far more than its EV does.
--
--   legendary per pack   Standard 0.025  ->  1 in 4,000 gems
--                        Pro      0.175  ->  1 in 2,286 gems
--
-- ---------------------------------------------------------------------------
-- WHY A PREMIUM PACK GOT GOOD THE DAY THE ROSTER CAP SHIPPED
-- ---------------------------------------------------------------------------
--
-- Worth writing down, because it is the reason this is worth building now and
-- would not have been last week. Under a cap of 30, opening a pack COSTS FIVE
-- ROSTER SLOTS. Cards per gem stops being the thing a player is buying and
-- QUALITY PER SLOT becomes it. The Pro pack is the answer to a question the cap
-- is what made anybody ask.
--
-- ---------------------------------------------------------------------------
-- NO RARITY FLOOR, DELIBERATELY
-- ---------------------------------------------------------------------------
--
-- A guaranteed rare-or-better would need `open_pack` redefined, and that is the
-- one function in this schema that mints cards — it is not what should be
-- rewritten two weeks before kickoff for a feel improvement. The odds already
-- deliver 92% rare-or-better; the all-common Pro pack happens 0.24% of the
-- time, which is roughly one pack in 400. If that one pack turns out to be the
-- thing people talk about, the floor is a small change to make later.

insert into public.packs (code, name, gem_cost, card_count, odds, guaranteed_positions, once_per_user, is_active)
values (
  'pro',
  'Pro Pack',
  400,
  5,
  -- Sums to 100 so the weights read as percentages. open_pack normalises by the
  -- sum regardless, but a column somebody will hand-tune should be readable
  -- without arithmetic.
  '{"common": 30, "uncommon": 30, "rare": 26.5, "epic": 10, "legendary": 3.5}'::jsonb,
  '{}'::jsonb,
  false,
  true
)
on conflict (code) do update
  set name       = excluded.name,
      gem_cost   = excluded.gem_cost,
      card_count = excluded.card_count,
      odds       = excluded.odds,
      is_active  = excluded.is_active;
