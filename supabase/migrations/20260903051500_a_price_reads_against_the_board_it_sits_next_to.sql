-- ---------------------------------------------------------------------------
-- The value blend goes LEAGUE-WIDE, and this reverses the framing the previous
-- migration argued for. It is worth being clear that it is not a correction.
--
-- `20260903042820` measured predictors WITHIN position, because that is how
-- `value_score` is defined, and concluded the market ranking belonged in the
-- blend. All of that stands. What it did not ask is what a price should MEAN,
-- and that is a design question rather than an accuracy one.
--
-- Priced per position, the answer to "what is this card worth" was "how good is
-- he for a quarterback". That is defensible and it read badly next to the
-- board, because the board is one list and the price beside it was answering a
-- different question on every row:
--
--     Josh Allen      overall 26   QB1    64 coins   the joint dearest card
--     Trey McBride    overall 21   TE1    64 coins   in the game
--     Ja'Marr Chase   overall  3   WR1    56
--     Jahmyr Gibbs    overall  1   RB1    54   <- the best player, cheaper
--     Brandon Aubrey  overall 119  PK1    44
--
-- Nothing there is a bug. Every one of those numbers is the correct answer to
-- the within-position question. They are simply unreadable printed down a
-- column sorted by overall rank, which is where they are printed.
--
-- So both halves of the blend go league-wide: the market's own overall rank,
-- and points per game across every position rather than inside one. The
-- ranking already prices positional scarcity — Allen is 26th BECAUSE one
-- quarterback per lineup makes him less scarce than a back — so a global ladder
-- is not throwing scarcity away, it is deferring to the market's version of it
-- instead of computing our own.
--
-- WHAT IT COSTS. The best quarterback, tight end and kicker stop pricing like
-- position kings: Allen and McBride 64 -> ~46, Aubrey 44 -> ~26. A kicker is
-- now a cheap card you are nonetheless required to field every week, which is
-- what a kicker is.
--
-- THE ECONOMY IS UNCHANGED, which is the check that mattered. The blended
-- percentile is still read back off the distribution of measured value scores,
-- so this reorders inside a fixed envelope: mean score 0.1795 either way, pool
-- value 12,468 -> 12,380 coins, a fifth of one percent.
--
-- THE ORDER IS NOT PERFECTLY MONOTONIC IN RANK AND SHOULD NOT BE. The top
-- twenty walk 64 64 54 64 64 57 64 52 50 43 33 52 ... — the dips are the 40%
-- production weight doing its job. Justin Jefferson ranks 11th and scored 11.9
-- FP/G last year, so he prices at 33 while the man ranked behind him prices at
-- 52. A price that tracked the board exactly would be the board with a coin
-- glyph on it, and would have nothing to say the board does not.
--
-- If it wants to track more tightly, `game_config.market_blend_bps` is the
-- knob and needs no migration. Measured at 1.0 the ordering barely tightens —
-- 769 players map into 57 integer prices, so ties, not weighting, are what
-- stops a price column from being a rank column.
-- ---------------------------------------------------------------------------
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
  -- `ppg` rather than `value_score` for the production side, and that is the
  -- other half of going global: `value_score` is normalised inside a position,
  -- so a league-wide percentile OF it would be comparing five different scales.
  -- Points per game is one scale for everybody.
  measured as (
    select player_id, value_score, current_games,
           coalesce(blended_ppg, prior_ppg) as ppg
      from public.player_values
     where season = v_season
       and (prior_ppg is not null or current_games > 0)
  ),
  by_value as (
    select player_id,
           percent_rank() over (order by ppg) as p_value
      from measured
  ),
  by_rank as (
    select pv.player_id,
           pv.current_games,
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
  ),
  mapped as (
    select c.player_id,
           c.p_value is null as rank_only,
           coalesce((
             select percentile_cont(c.w * c.p_rank + (1 - c.w) * coalesce(c.p_value, 0))
                      within group (order by m.value_score)
               from measured m
           ), 0)::numeric(6,5) as value_score
      from combined c
  )
  update public.player_values pv
     set value_score = m.value_score,
         source      = case when m.rank_only then 'ranking' else 'market' end,
         updated_at  = now()
    from mapped m
   where pv.player_id = m.player_id
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
  'Second pass over player_values: blends the market''s league-wide ranking with league-wide points per game, weighted market_w * k/(k+games), and maps the result onto the distribution of measured value scores. LEAGUE-WIDE rather than per position, so a card''s price reads against the board it is printed beside.';

revoke all on function public.apply_market_blend(integer, text) from public, anon, authenticated;
