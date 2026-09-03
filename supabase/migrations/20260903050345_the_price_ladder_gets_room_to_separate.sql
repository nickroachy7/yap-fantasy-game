-- ---------------------------------------------------------------------------
-- The top of the price ladder had no room to say anything, for two reasons
-- that both look like tuning and are really arithmetic.
--
-- ONE: 976 PLAYERS INTO 57 INTEGER PRICES. The band was floor 8 to ceiling 64,
-- so the entire league had to fit in 56 coins — about 0.07 coins per rank.
-- Adjacent ranks could not round to different numbers however the weights were
-- set, which is why an earlier attempt to make price track the board more
-- tightly barely moved the ordering. The band is now 12 to 500.
--
-- TWO: A GENTLE CURVE IS FLAT AT THE TOP, which is the part that is genuinely
-- counter-intuitive. Price was `floor + range * pct^2`, and the slope of that
-- at pct = 1 is 2 * range — spread across 976 players, the ten best footballers
-- alive landed within a coin of each other. Modelled at a 250 ceiling the top
-- three still came out 250 / 249 / 249. Raising the ceiling alone never fixes
-- this; the exponent has to be steep enough that the last percentile of the
-- distribution is worth real money. It is ^18 now.
--
-- THREE, AND THIS ONE WAS A DEFECT rather than a setting: five players priced
-- at exactly the ceiling. `value_score` was a quantile map onto the
-- distribution of scores the blend produced, and that distribution has a lump
-- at 1.0 — `refresh_player_values` normalises each position so its best player
-- scores exactly 1, so five positions put five players there. Every percentile
-- above the lump mapped onto it, and the five best cards in the game shared one
-- price.
--
-- The map is gone. `value_score` is now simply WHERE A PLAYER STANDS IN THE
-- LEAGUE, 0..1 — the blended percentile written straight down. Nothing collides
-- because a percentile over distinct inputs is distinct, and the shape of the
-- ladder is decided in one place, `value_curve_bps`, instead of being half the
-- curve and half an artefact of another function's normalisation.
--
-- WHAT IT DOES TO THE ECONOMY, and this is the part to watch. Sale value
-- roughly doubles: mean 12.7 -> 28 coins, pool 12,380 -> 27,079. The top of the
-- board now reads 476 475 415 474 445 434 460 382 342 266, which is what the
-- change was for. Nothing else denominated in coins has moved with it —
-- `score_coins_per_point_bps`, the set reward ladder and pack prices are all
-- still on the old scale, so selling is currently worth about twice what it was
-- against every other way of earning. That is a deliberate hand-off rather than
-- an oversight: which of those should follow is a game-balance decision, not a
-- pricing one.
--
-- The order is still not monotonic in rank and still should not be — Jefferson
-- is 11th on the board and 140 coins on 11.9 FP/G last season, against 380 for
-- the man ranked behind him. That is the production weight, and it is the only
-- thing on the row the ranking does not already say.
-- ---------------------------------------------------------------------------

update public.game_config set value = 12,
  description = 'What a card with no player value at all sells for. The bottom of every sale.'
 where key = 'sale_base_floor_coins';

update public.game_config set value = 500,
  description = 'What the best player in football is worth before tier and points. Raised from 64 so the ladder has room to separate adjacent ranks — at 64 the top five all rounded to the same integer.'
 where key = 'sale_base_ceiling_coins';

update public.game_config set value = 1800,
  description = 'Exponent on value_score when pricing, in hundredths: 1800 = ^18. Steep on purpose — a gentle curve is FLAT at the top, so the ten best players in football priced within a coin of each other.'
 where key = 'value_curve_bps';

create or replace function public.apply_market_blend(
  p_season integer default null,
  p_format text    default 'ppr'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_season   integer;
  v_market_w numeric;
  v_k        numeric;
  v_written  integer;
  v_rank_only integer;
begin
  v_season := coalesce(p_season, (select season from public.current_slate()));
  if v_season is null then
    return jsonb_build_object('skipped', 'no slate');
  end if;

  select max(value) filter (where key = 'market_blend_bps')::numeric / 10000,
         max(value) filter (where key = 'value_prior_games')::numeric
    into v_market_w, v_k
    from public.game_config
   where key in ('market_blend_bps', 'value_prior_games');

  v_market_w := coalesce(v_market_w, 0.60);
  v_k        := coalesce(v_k, 4);

  with
  measured as (
    select player_id, current_games, coalesce(blended_ppg, prior_ppg) as ppg
      from public.player_values
     where season = v_season
       and (prior_ppg is not null or current_games > 0)
  ),
  by_value as (
    select player_id, percent_rank() over (order by ppg) as p_value
      from measured
  ),
  by_rank as (
    select pv.player_id, pv.current_games,
           percent_rank() over (order by r.overall_rank desc) as p_rank
      from public.player_values pv
      join public.player_rankings r
        on r.player_id = pv.player_id
       and r.season    = v_season
       and r.format    = p_format
     where pv.season = v_season
  ),
  combined as (
    select k.player_id,
           v.p_value,
           case
             when v.p_value is null then 1.0
             else v_market_w * (v_k / (v_k + k.current_games))
           end as w,
           k.p_rank
      from by_rank k
      left join by_value v on v.player_id = k.player_id
  )
  -- THE PERCENTILE IS THE SCORE. No quantile map — see the header: mapping onto
  -- the blend's own distribution is what put five players on one price.
  update public.player_values pv
     set value_score = least(1, greatest(0,
           c.w * c.p_rank + (1 - c.w) * coalesce(c.p_value, 0)))::numeric(6,5),
         source      = case when c.p_value is null then 'ranking' else 'market' end,
         updated_at  = now()
    from combined c
   where pv.player_id = c.player_id
     and pv.season    = v_season;

  get diagnostics v_written = row_count;

  select count(*) into v_rank_only
    from public.player_values
   where season = v_season and source = 'ranking';

  return jsonb_build_object(
    'season', v_season, 'format', p_format,
    'written', v_written, 'rank_only', v_rank_only,
    'market_weight_at_zero_games', v_market_w, 'k', v_k
  );
end;
$function$;

comment on function public.apply_market_blend(integer, text) is
  'Second pass over player_values: value_score becomes where a player stands in the league, 0..1 — the market ranking blended with league-wide points per game, weighted market_w * k/(k+games). No quantile map: the percentile IS the score, so no two players collide and game_config.value_curve_bps alone decides the shape of the price ladder.';

revoke all on function public.apply_market_blend(integer, text) from public, anon, authenticated;
