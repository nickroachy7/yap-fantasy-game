-- ---------------------------------------------------------------------------
-- The market ranking stops being a fallback and becomes an input.
--
-- ---------------------------------------------------------------------------
-- THE EARLIER MEASUREMENT WAS TAKEN IN THE WRONG FRAME
-- ---------------------------------------------------------------------------
--
-- `20260903033528` refused to let the board replace the blend, on this:
--
--     prior-season PPG   0.841
--     market ranking     0.760      (Spearman, 2025, n=332)
--
-- Those numbers are real and they are the wrong test. They rank every player
-- against every other player, and `value_score` does not: it is defined
-- "inside his own position between replacement level and the best in the
-- league". Most of that 0.841 was quarterbacks separating from tight ends —
-- a difference the value system already handles by construction, and therefore
-- one the predictor should get no credit for.
--
-- Measured the way the system actually works, ranking WITHIN position, on the
-- same 332 players:
--
--     prior-season PPG alone   0.5914
--     market ranking alone     0.6085     <- the board is already ahead
--     0.4 prior / 0.6 market   0.6220     <- and both together beat either
--
-- The optimum is flat from 0.2 to 0.6 (0.6185-0.6220), so the weight is robust
-- rather than fitted — the same shape the blend's own `k` sweep has.
--
-- The lesson worth keeping is not "the market won". It is that a predictor must
-- be scored in the frame the decision is made in. The first measurement was
-- careful, reproducible, and answered a question nobody was asking.
--
-- ---------------------------------------------------------------------------
-- WHY THE WEIGHT DECAYS
-- ---------------------------------------------------------------------------
--
-- A consensus board is a PRESEASON artefact. It is published before a snap is
-- taken and it is not revised as the season runs, so every week it ages while
-- the thing it was guessing about becomes observable. Holding it at 60% in
-- December would mean pricing a player on what August thought of him over what
-- sixteen Sundays actually showed.
--
-- So it fades exactly as the prior season already does, on the same constant:
--
--     w_market = market_blend_bps * k / (k + current_games)      k = 4
--
--     games   0     4     8    17
--     weight  .60   .30   .20  .11
--
-- At zero games it carries its measured weight, which is the September case and
-- the one that matters for a beta opening on the 13th. `value_prior_games` is
-- reused rather than given a twin, because the two are the same claim: how much
-- evidence it takes before a preseason opinion stops being the best one going.
--
-- ---------------------------------------------------------------------------
-- QUANTILE MAPPING KEEPS THE PRICES WHERE THEY WERE
-- ---------------------------------------------------------------------------
--
-- The blended percentile is read back off the distribution of scores the blend
-- itself produced for that position, so this REORDERS players without inflating
-- them. Measured over all 976: the mean score moves 0.145 -> 0.180, but the
-- pool's total sale value moves only +6.2% (11,736 -> 12,468 coins), because
-- `value_curve_bps` squares the low end. 487 players up, 179 down, 310
-- unranked and untouched. That is a redistribution, which is what a better
-- ordering should be.
--
-- `source` says which pass wrote a row: 'market' where measured production and
-- the board were blended, 'ranking' where the board is the only signal there
-- is. That distinction is the whole audit trail — one query says how much of
-- the economy is priced on evidence and how much on opinion.
--
-- SUPERSEDES `apply_ranking_fallback`, which was this with the weight pinned at
-- 1.0 and applied only to players who had nothing else. It is dropped rather
-- than left beside this one: two writers of `value_score` disagreeing about the
-- same player is the failure this file exists to avoid. Dropping a function
-- loses its ACL, so the revoke below is not decoration.
-- ---------------------------------------------------------------------------

insert into public.game_config (key, value, description) values
  ('market_blend_bps', 6000,
   'Weight given to the market ranking when a player has NO games this season, in hundredths of a percent (6000 = 60%). Decays by value_prior_games as real games arrive.')
on conflict (key) do update set value = excluded.value, description = excluded.description;

alter table public.player_values
  drop constraint if exists player_values_source_check;
alter table public.player_values
  add constraint player_values_source_check
  check (source in ('prior_season', 'blended', 'ranking', 'market'));

comment on column public.player_values.source is
  'Which pass last wrote value_score: prior_season or blended from refresh_player_values; ranking where the market is the ONLY signal; market where it was blended with measured production.';

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
  -- Players the blend could actually MEASURE. Their scores are both the thing
  -- being blended and the distribution the result is mapped back onto, so the
  -- output keeps the shape the value system already had.
  measured as (
    select player_id, position_abbreviation as pos, value_score, current_games
      from public.player_values
     where season = v_season
       and (prior_ppg is not null or current_games > 0)
  ),
  by_value as (
    select player_id, pos,
           percent_rank() over (partition by pos order by value_score) as p_value
      from measured
  ),
  -- The percentile is over EVERY ranked player in the position, never over the
  -- subset being written. Narrowing before the window is the bug
  -- `20260903033612` was written to fix.
  by_rank as (
    select pv.player_id,
           pv.position_abbreviation as pos,
           pv.current_games,
           percent_rank() over (
             partition by pv.position_abbreviation
             order by r.overall_rank desc
           ) as p_rank
      from public.player_values pv
      join public.player_rankings r
        on r.player_id = pv.player_id
       and r.season    = v_season
       and r.format    = p_format
     where pv.season = v_season
  ),
  combined as (
    select k.player_id,
           k.pos,
           v.p_value,
           -- No measurement at all means the board is the only thing there is,
           -- which is the old fallback's case and takes the full weight.
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
              where m.pos = c.pos
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
  'Second pass over player_values: folds the market ranking into every ranked player''s value, weighted market_w * k/(k+games) so a preseason board fades as real games arrive. Measured in-position on 2025 (n=332): prior alone 0.591, ranking alone 0.609, 40/60 blend 0.622.';

revoke all on function public.apply_market_blend(integer, text) from public, anon, authenticated;

drop function if exists public.apply_ranking_fallback(integer, text);
