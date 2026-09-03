-- ---------------------------------------------------------------------------
-- Value for the players the blend cannot see.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A SECOND PASS AND NOT A REWRITE OF refresh_player_values
-- ---------------------------------------------------------------------------
--
-- The obvious reading of "use the API's rankings for the value system" is to
-- replace the blend with the board. Measured on 2025, that is a downgrade, and
-- the numbers are not close. Predicting a player's 2025 points per game, over
-- the 332 players who had both a 2024 record and a 2025 preseason ranking
-- (Spearman, because one predictor is itself a rank):
--
--     prior-season PPG   0.841      <- what the blend uses in September
--     market ranking     0.760
--
-- The blend's own header records 0.761 for its full form, so this is the same
-- ballpark measured a different way, and the board does not beat it. Swapping
-- would have traded a measured system for a worse one and called it progress.
--
-- BUT THE BOARD SEES PLAYERS THE BLEND IS BLIND TO, and that is the whole
-- reason this file exists. Of 442 players who played six games in 2025, 110 had
-- no prior season at all. Today every one of them scores 0 and prices at the
-- floor — the third overall pick and a camp body are worth exactly the same
-- coins, which is the most obviously wrong thing on the sell sheet. 104 of
-- those 110 carry a ranking, and on that population alone the board scores:
--
--     market ranking on players with no prior   0.594
--
-- 0.594 against nothing is not a close call either.
--
-- So the blend keeps everyone it can measure and this fills the hole. The two
-- never compete for the same player: the fallback fires only where
-- `prior_ppg is null and current_games = 0`, which is exactly the set the blend
-- scores as zero for want of evidence rather than on the evidence.
--
-- ---------------------------------------------------------------------------
-- QUANTILE MAPPING, SO THE TWO SCALES ARE ONE SCALE
-- ---------------------------------------------------------------------------
--
-- A rank cannot be dropped into `value_score` directly. The blend's score is
-- `(ppg - replacement) / (best - replacement)` clamped to 0..1, which is
-- heavily bottom-clustered — most of a position sits near replacement and a
-- handful run away with it. A rank percentile is uniform by construction. Map
-- one onto the other naively and the median rookie lands at 0.5 among players
-- whose median is nearer 0.15, and every unproven player out-prices proven
-- ones.
--
-- So the rank is turned into a percentile WITHIN ITS POSITION, and that
-- percentile is read off the distribution of value scores the blend already
-- produced FOR THAT POSITION. A rookie ranked better than 80% of his position's
-- ranked players receives the value score at the 80th percentile of that
-- position's scored players. The output is drawn from the same distribution it
-- is being mixed into, so the two populations are comparable by construction
-- rather than by a constant somebody tuned.
--
-- `source` says which pass wrote the row, so this is auditable in one query
-- rather than inferable from a null.
-- ---------------------------------------------------------------------------

alter table public.player_values
  drop constraint if exists player_values_source_check;
alter table public.player_values
  add constraint player_values_source_check
  check (source in ('prior_season', 'blended', 'ranking'));

comment on column public.player_values.source is
  'Which pass wrote value_score: prior_season or blended from refresh_player_values, ranking from apply_ranking_fallback where the blend had no evidence at all.';

create or replace function public.apply_ranking_fallback(
  p_season integer default null,
  p_format text    default 'ppr'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_season  integer;
  v_written integer;
begin
  v_season := coalesce(p_season, (select season from public.current_slate()));
  if v_season is null then
    return jsonb_build_object('skipped', 'no slate');
  end if;

  with
  -- The blend's own output, per position, is the distribution being mapped
  -- onto. Only rows it actually MEASURED — including the zeros it assigned for
  -- want of evidence would be mapping onto the hole this is filling.
  scored as (
    select position_abbreviation as pos, value_score
      from public.player_values
     where season = v_season
       and source in ('prior_season', 'blended')
       and value_score > 0
  ),
  -- Where each ranked player sits inside his own position, 1.0 = best.
  ranked as (
    select pv.player_id,
           pv.position_abbreviation as pos,
           percent_rank() over (
             partition by pv.position_abbreviation
             order by r.overall_rank desc
           ) as pct
      from public.player_values pv
      join public.player_rankings r
        on r.player_id = pv.player_id
       and r.season    = v_season
       and r.format    = p_format
     where pv.season = v_season
       and pv.prior_ppg is null
       and pv.current_games = 0
  ),
  mapped as (
    select k.player_id,
           k.pos,
           coalesce((
             select percentile_cont(k.pct) within group (order by s.value_score)
               from scored s
              where s.pos = k.pos
           ), 0)::numeric(6,5) as value_score
      from ranked k
  )
  update public.player_values pv
     set value_score = m.value_score,
         source      = 'ranking',
         updated_at  = now()
    from mapped m
   where pv.player_id = m.player_id
     and pv.season    = v_season;

  get diagnostics v_written = row_count;

  return jsonb_build_object(
    'season',  v_season,
    'format',  p_format,
    'written', v_written
  );
end;
$function$;

comment on function public.apply_ranking_fallback(integer, text) is
  'Second pass over player_values: gives a value score, mapped from the market ranking onto the position''s own score distribution, to players the blend has no evidence for. Never touches a player the blend could measure.';

revoke all on function public.apply_ranking_fallback(integer, text) from public, anon, authenticated;

comment on table public.player_values is
  'What a player is worth this season, 0..1, measured inside his own position between replacement level and the best in the league. Drives card_prices. Written by refresh_player_values(), then by apply_ranking_fallback() for the players it had no evidence for.';
