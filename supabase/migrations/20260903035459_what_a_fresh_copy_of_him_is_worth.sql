-- ---------------------------------------------------------------------------
-- A price the DIRECTORY can print, which `card_prices` cannot be.
--
-- `card_prices` is keyed on `card_instance_id` and is right to be: two of its
-- three inputs — the tier and the points settled — belong to the COPY, not to
-- the footballer. The directory has no copy in hand. It is a list of players,
-- and the question it is being asked is "what is a card of this man worth",
-- which is a different question with a real answer.
--
-- BRONZE WITH NOTHING EARNED is that answer. Bronze's `sale_multiplier` is
-- 1.00, so this is not one tier's price among four — it is the base every tier
-- is a multiple of, and a reader comparing two players is comparing the only
-- part of the price that is about the player at all.
--
-- It is deliberately NOT the average of what copies actually sell for. That
-- number moves with who happens to hold what, so a player would get dearer
-- because somebody promoted a card of him, which is a fact about an owner
-- rather than about a footballer.
--
-- `security_invoker`, like `card_prices`, so the view cannot become a way to
-- read `player_values` past its own policy.
-- ---------------------------------------------------------------------------
create or replace view public.player_base_price
with (security_invoker = on) as
  select pv.player_id,
         pv.season,
         public.sale_value('bronze', pv.value_score, 0) as base_coins,
         pv.value_score,
         -- Carried so a screen can say WHY a price is what it is: 'ranking'
         -- means nobody has measured him and the market is doing the talking.
         pv.source
    from public.player_values pv;

comment on view public.player_base_price is
  'What a FRESH copy of a player is worth: sale_value at bronze with nothing earned. Per player, unlike card_prices, which is per owned copy because tier and settled points belong to the copy. Bronze because its sale_multiplier is 1.00, so this is the base every tier is a multiple of.';

grant select on public.player_base_price to authenticated;
