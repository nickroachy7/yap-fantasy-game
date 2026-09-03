-- ---------------------------------------------------------------------------
-- The market weight goes to 100%, and the reason is legibility rather than
-- accuracy.
--
-- At 60/40 the price was the board blended with last season's points per game,
-- and the 40% routinely reordered the top of the list:
--
--     rank 3   Ja'Marr Chase   19.6 FP/G in 2025   415 coins
--     rank 4   Puka Nacua      23.4 FP/G in 2025   474 coins
--
-- Neither number is wrong. The board says Chase is the better bet from here,
-- last season says Nacua was the better player, and the price was splitting the
-- difference. But it is printed in a column sorted by rank, where the third best
-- player in football selling for less than the fourth reads as a bug — and it
-- has now been asked about three times, which is the measure that matters for a
-- number a player is meant to act on.
--
-- At 100% the ladder is strictly monotonic: 500 489 478 467 456 446 436 426 416
-- 407 ... 288 at rank 25, 165 at 50, 73 at 100, 21 at 200. Zero inversions
-- across all 769 ranked players, asserted below rather than eyeballed.
--
-- WHAT IS GIVEN UP. Measured production no longer touches a preseason price, so
-- Justin Jefferson prices 11th at 397 on the back of an 11.9 FP/G season. The
-- defence is that the board already knows: a consensus ranking is forward
-- looking and put him 11th having watched the same season we did. We are
-- deferring to its judgement rather than adding our own on top.
--
-- THE DECAY IS UNCHANGED AND STILL MATTERS. The weight is
-- `market_blend_bps * k/(k+games)`, so 100% is what a player is worth before he
-- has played. From week one real production re-enters — half the weight by four
-- games, two thirds by eight — and the ladder will loosen again, on purpose. A
-- preseason board is a guess, and once there are Sundays the guess should stop
-- outranking them. The strict ordering is a property of September, not a
-- promise for December.
-- ---------------------------------------------------------------------------

update public.game_config
   set value = 10000,
       description = 'Weight given to the market ranking when a player has NO games this season, in hundredths of a percent (10000 = 100%). Before a snap is played the board alone sets the price, so a card ranked higher always sells for more. Decays by value_prior_games as real games arrive, which is when measured production re-enters.'
 where key = 'market_blend_bps';

-- The ordering is the whole point of the change, so it is asserted. `db push`
-- has no transaction, and a weight that silently failed to land would look
-- exactly like a weight that did.
do $$
declare
  v_season     integer;
  v_inversions integer;
begin
  select season into v_season from public.current_slate();
  if v_season is null then return; end if;

  perform public.refresh_player_values(v_season);
  perform public.apply_market_blend(v_season);

  select count(*) into v_inversions from (
    select public.sale_value('bronze', pv.value_score, 0) coins,
           lag(public.sale_value('bronze', pv.value_score, 0))
             over (order by r.overall_rank) prev
      from public.player_values pv
      join public.player_rankings r
        on r.player_id = pv.player_id
       and r.season    = v_season
       and r.format    = 'ppr'
     where pv.season = v_season
  ) t where t.coins > t.prev;

  if v_inversions > 0 then
    raise exception 'market weight is 100%% but % ranked players still price above the man in front of them', v_inversions;
  end if;
end $$;
