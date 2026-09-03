-- ---------------------------------------------------------------------------
-- A bug in the migration immediately before this one, caught by looking at the
-- output instead of at the row count.
--
-- `apply_ranking_fallback` took each unproven player's percentile with
--
--     percent_rank() over (partition by position order by overall_rank desc)
--
-- over a set that had ALREADY been filtered to the unproven. So the percentile
-- was his standing among players nobody has any evidence about, not his
-- standing in his position — and `percent_rank()` hands the best row in every
-- partition a flat 1.0. The best-ranked unproven player at each position
-- therefore received the top value score in that position, whatever his actual
-- rank. Trey Smack, a kicker ranked 410th overall, priced as the best kicker in
-- the game; a quarterback ranked 385th priced as the best quarterback.
--
-- It is worth recording what the summary said while that was true: 194 rows
-- written, no error, no constraint violated. The tell was in the distribution —
-- the fallback's mean value score came out at 0.304 against the blend's 0.182,
-- which is the header of the previous migration describing the exact failure it
-- was trying to avoid. After the fix the two sit on top of each other, 0.184
-- against 0.182, and the fallback's maximum drops from a clean 1.000 to 0.715.
--
-- The fix is to take the percentile over EVERY ranked player in the position
-- and then narrow to the unproven ones, rather than narrowing first. The window
-- and the filter had to happen in that order and did not.
-- ---------------------------------------------------------------------------
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
  scored as (
    select position_abbreviation as pos, value_score
      from public.player_values
     where season = v_season
       and source in ('prior_season', 'blended')
       and value_score > 0
  ),
  -- THE PERCENTILE IS AGAINST EVERY RANKED PLAYER IN THE POSITION, proven and
  -- unproven alike. See the header: narrowing before the window is the bug.
  cohort as (
    select pv.player_id,
           pv.position_abbreviation as pos,
           r.overall_rank,
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
  ),
  target as (
    select c.*
      from cohort c
      join public.player_values pv
        on pv.player_id = c.player_id
       and pv.season    = v_season
     where pv.prior_ppg is null
       and pv.current_games = 0
  ),
  mapped as (
    select t.player_id,
           coalesce((
             select percentile_cont(t.pct) within group (order by s.value_score)
               from scored s
              where s.pos = t.pos
           ), 0)::numeric(6,5) as value_score
      from target t
  )
  update public.player_values pv
     set value_score = m.value_score,
         source      = 'ranking',
         updated_at  = now()
    from mapped m
   where pv.player_id = m.player_id
     and pv.season    = v_season;

  get diagnostics v_written = row_count;

  return jsonb_build_object('season', v_season, 'format', p_format, 'written', v_written);
end;
$function$;

revoke all on function public.apply_ranking_fallback(integer, text) from public, anon, authenticated;
