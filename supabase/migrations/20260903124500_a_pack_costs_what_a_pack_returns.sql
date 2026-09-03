-- Buying a pack to dump it was profitable, at both prices, and that is a hole
-- in the floor of the economy rather than a tuning complaint.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ACTUALLY OPEN
-- ---------------------------------------------------------------------------
--
-- Measured against the live `packs` rows, the live odds and the live price
-- ladder, on 2026-09-03:
--
--   pack       costs   dumps for   result
--   standard     100       127.9   +27.9%
--   pro          400       440.1   +10.0%
--
-- Buy, sell everything, repeat. Coins are not capped and nothing else in the
-- game is priced against a supply that can be printed, so the whole ladder
-- above it — contest fees, tier multipliers, the set reward rungs — is
-- denominated in something a player can make for free in a loop.
--
-- ---------------------------------------------------------------------------
-- IT WAS THE HAND-OFF IN `20260903050345`, COMING DUE
-- ---------------------------------------------------------------------------
--
-- That migration widened the price band from 8..64 to 12..500 so that 976
-- players had more than 57 integer prices to sit in, and it said plainly what
-- it was leaving behind:
--
--   "Sale value roughly doubles: mean 12.7 -> 28 coins, pool 12,380 -> 27,079.
--    Nothing else denominated in coins has moved with it — score_coins_per_point_bps,
--    the set reward ladder and pack prices are all still on the old scale, so
--    selling is currently worth about twice what it was against every other way
--    of earning. That is a deliberate hand-off rather than an oversight."
--
-- This is the pack-price half of that hand-off. Sale value doubled, so the
-- thing you buy WITH sale value doubles too, and the relationship between
-- opening a pack and selling what comes out is back where it was the day
-- before. The other two — the score faucet and the reward ladder — are still
-- open, and are still a game-balance decision rather than an arithmetic one.
--
-- ---------------------------------------------------------------------------
-- WHY DOUBLING RATHER THAN "JUST PAST BREAK-EVEN"
-- ---------------------------------------------------------------------------
--
-- 150 and 500 would have closed the loop today at a 15% and 12% margin, and
-- reopened it on the next move of the ladder — the band has been retuned three
-- times this week. A pack should lose enough that the margin survives a
-- re-tune, and matching the move that caused this is the size that needs no
-- separate justification:
--
--   standard  200 -> dumps 127.9  (-36%)
--   pro       800 -> dumps 440.1  (-45%)
--
-- WHO PAYS FOR IT. A player who sells is unaffected — their income doubled
-- this morning. A player who never sells is on the faucet alone, which did not
-- double, so packs cost them twice as much football. That is the real price of
-- this change and it is worth watching over the beta: if the non-selling
-- player stalls, the answer is the faucet, not the pack.
--
-- `card_prices.test.sql` asserts the loop is shut, at every pack, against these
-- rows rather than against numbers copied into a comment — which is how the
-- hole was found.

update public.packs set coin_cost = 200 where code = 'standard';
update public.packs set coin_cost = 800 where code = 'pro';

-- Assert the thing the migration is FOR, rather than that two updates ran.
-- `db push` has no transaction, so a half-applied change ships looking fine.
do $$
declare v_pack record;
begin
  for v_pack in
    select p.code, p.coin_cost,
           sum((p.odds ->> band.rarity)::numeric / 100 * band.avg_base) * p.card_count as ret
      from public.packs p
      join (
        select c.rarity::text as rarity,
               avg(public.sale_value('bronze', coalesce(pv.value_score, 0), 0)) as avg_base
          from public.cards c
          left join public.player_values pv
                 on pv.player_id = c.player_id and pv.season = c.season
         where c.season = 2026 and c.is_mintable
         group by 1
      ) band on p.odds ? band.rarity
     where p.coin_cost > 0
     group by p.code, p.coin_cost, p.card_count
  loop
    if v_pack.ret >= v_pack.coin_cost then
      raise exception 'pack % still costs % and dumps for % — the loop is open',
        v_pack.code, v_pack.coin_cost, round(v_pack.ret, 1);
    end if;
    raise notice 'pack % costs %, dumps for % — a % percent loss',
      v_pack.code, v_pack.coin_cost, round(v_pack.ret, 1),
      round(100 - v_pack.ret / v_pack.coin_cost * 100);
  end loop;
end $$;
