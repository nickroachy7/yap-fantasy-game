-- The card for a contest says what it costs to lose it.
--
-- The lobby list has drawn `hearts_at_risk` since 20260825190000, and it filters
-- the free contest OUT — deliberately, because nobody chose it and nobody can
-- leave it, so it is not a thing to browse. That was harmless while the free
-- contest staked nothing. It stakes a heart now (20260825270000), and the one
-- place it is ever drawn is its card on the lineup board, which had no idea.
--
-- So the game's MAIN contest was the only one that could take a heart without
-- saying so anywhere. Entering something that can end a run without being told
-- is the worst surprise this feature has to offer, and being auto-entered into
-- it is worse still, because there was not even a tap to think twice about.
--
-- Dropped and recreated: Postgres will not let a RETURNS TABLE function change
-- its output columns in place, and the error reads like a permissions problem.

drop function if exists public.my_contest_cards(text);

CREATE OR REPLACE FUNCTION public.my_contest_cards(p_include text DEFAULT NULL::text)
 RETURNS TABLE(contest_id uuid, code text, kind contest_kind, name text, format_code text, format_name text, slot_count smallint, entry_fee_gems integer, season integer, season_type smallint, week integer, lineup_id uuid, filled integer, entrants bigint, low numeric, median numeric, average numeric, high numeric, final boolean, my_points numeric, my_rank bigint, ahead bigint, result text, hearts_at_risk smallint, hearts_on_win smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with slate as (select * from public.lineup_slate() limit 1),
  mine as (
    select c.*, l.id as lineup_id, l.total_points as my_points
      from public.contests c
      join slate s on s.season = c.season and s.season_type = c.season_type and s.week = c.week
      left join public.lineups l on l.contest_id = c.id and l.user_id = auth.uid()
     -- Entered, or the one being composed. Nothing else.
     where l.id is not null or c.code = p_include
  ),
  entries as (
    select l.contest_id, l.user_id, l.total_points as pts
      from public.lineups l
      join mine m on m.id = l.contest_id
     where exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  field as (
    select e.contest_id,
           count(*) as entrants,
           min(e.pts) as low,
           round((percentile_cont(0.5) within group (order by e.pts::double precision))::numeric, 2) as median,
           round(avg(e.pts), 2) as average,
           max(e.pts) as high
      from entries e
     group by e.contest_id
  ),
  ranked as (
    select e.contest_id, e.user_id, e.pts,
           rank() over (partition by e.contest_id order by e.pts desc) as rnk
      from entries e
  ),
  finality as (
    select bool_and(lower(coalesce(g.status_state, '')) in ('final','complete','completed')) as final
      from public.games g, slate s
     where g.season = s.season and g.season_type = s.season_type and g.week = s.week
  )
  select m.id, m.code, m.kind, m.name,
         m.format_code, f.name, f.slot_count, m.entry_fee_gems,
         m.season, m.season_type, m.week,
         m.lineup_id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = m.lineup_id), 0),
         coalesce(fl.entrants, 0), fl.low, fl.median, fl.average, fl.high,
         coalesce((select final from finality), false),
         m.my_points,
         r.rnk,
         case when r.pts is null then null
              else (select count(*) from entries x where x.contest_id = m.id and x.pts < r.pts) end,
         case
           when r.pts is null then null
           when not coalesce((select final from finality), false) then null
           when coalesce(fl.entrants, 0) < 2 then null
           when r.pts > fl.median then 'W'
           when r.pts < fl.median then 'L'
           else 'T'
         end,
         m.hearts_at_risk, m.hearts_on_win
    from mine m
    join public.contest_formats f on f.code = m.format_code
    left join field  fl on fl.contest_id = m.id
    left join ranked r  on r.contest_id = m.id and r.user_id = auth.uid()
   order by m.kind, m.entry_fee_gems, m.name;
$function$;
grant execute on function public.my_contest_cards(text) to authenticated;
