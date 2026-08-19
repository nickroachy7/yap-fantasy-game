-- NOTE ON THIS FILENAME'S TIMESTAMP. CLI-shaped rather than round because this
-- was applied through the Supabase MCP, which stamps its own version. The file
-- is named to match what the remote recorded, so `supabase migration list`
-- shows no orphan. See the same note on the median_contest migration.

-- Adds `low` to median_record. Everything else is unchanged from
-- `20260819214607_median_contest`, whose header carries the reasoning for the
-- whole contest — read that one first; this is an amendment, not a restatement.
--
-- WHY THE FIELD'S RANGE, NOT JUST ITS MIDDLE
--
-- The contest card no longer draws an opponent. Showing the median as a second
-- avatar with a score beside your own made the community read as another
-- manager, which is exactly what this game does not have. It now draws the
-- field as what it actually is — a distribution — with your score placed inside
-- it: the bar runs from the worst score in the field to the best, the median is
-- a mark on it, and your own total is the fill. That needs both ends, and only
-- `high` was being returned.
--
-- One property worth knowing, because it is what makes the bar safe to draw:
-- the caller is IN the field, so `low <= my_points <= high` always holds for
-- anybody who entered. The fill can never run off either end.
--
-- Dropped and recreated rather than `create or replace`: Postgres will not let
-- a RETURNS TABLE function change its output columns in place, and the error it
-- gives ("cannot change return type of existing function") is easy to misread
-- as a permissions problem.
drop function if exists public.median_record(integer, smallint);

create or replace function public.median_record(
  p_season      integer,
  p_season_type smallint default 2
)
returns table (
  week      integer,
  entrants  bigint,
  -- The worst and best scores in the field. The two ends of the card's bar.
  low       numeric,
  -- What you are scored against, and the mark on that bar.
  median    numeric,
  -- Context only; never what anybody is scored against. See the sibling file.
  average   numeric,
  high      numeric,
  -- Every fixture in the week is complete. Until then there is no result yet,
  -- only a live median.
  final     boolean,
  my_points numeric,
  my_rank   bigint,
  -- Entrants the caller is STRICTLY ahead of. Ties are in neither share.
  ahead     bigint,
  -- 'W' | 'L' | 'T', or null while the week is live, when the caller had no
  -- lineup, or when the field is too small to have a middle to be on one side of.
  result    text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with entries as (
    -- A lineup row with no slots is not an entrant. `set_lineup` writes the row
    -- before it writes the slots and an empty payload is legal, so "opened the
    -- screen" would otherwise count as a nought and pull the middle down.
    select l.week, l.user_id, l.total_points as pts
      from public.lineups l
     where l.season = p_season
       and l.season_type = p_season_type
       and exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  field as (
    select e.week,
           count(*)   as entrants,
           min(e.pts) as low,
           round(
             (percentile_cont(0.5) within group (order by e.pts::double precision))::numeric,
             2
           ) as median,
           round(avg(e.pts), 2) as average,
           max(e.pts)           as high
      from entries e
     group by e.week
  ),
  -- The window has to see every entrant, so the caller's row is picked out
  -- AFTER the rank is computed. Filtering first would rank the caller against
  -- themselves and return 1 every week.
  ranked as (
    select e.week, e.user_id, e.pts,
           rank() over (partition by e.week order by e.pts desc) as rnk
      from entries e
  ),
  mine as (
    select r.week, r.pts, r.rnk
      from ranked r
     where r.user_id = auth.uid()
  ),
  -- A week is over when every one of its fixtures is. `status_state` is the
  -- three-value field; `status` is a human string ("Final/OT", "TBD") and is
  -- deliberately not read. A week with no fixtures at all gets no row here and
  -- resolves to false below rather than to null.
  finality as (
    select g.week,
           bool_and(lower(coalesce(g.status_state, '')) in ('final', 'complete', 'completed'))
             as final
      from public.games g
     where g.season = p_season
       and g.season_type = p_season_type
       and g.week is not null
     group by g.week
  )
  select f.week,
         f.entrants,
         f.low,
         f.median,
         f.average,
         f.high,
         coalesce(fin.final, false) as final,
         m.pts as my_points,
         m.rnk as my_rank,
         case
           when m.pts is null then null
           else (select count(*) from entries x where x.week = f.week and x.pts < m.pts)
         end as ahead,
         case
           when m.pts is null then null
           when not coalesce(fin.final, false) then null
           -- One entrant is their own median. Two is the smallest field that
           -- has a middle somebody can be on one side of.
           when f.entrants < 2 then null
           when m.pts > f.median then 'W'
           when m.pts < f.median then 'L'
           else 'T'
         end as result
    from field f
    left join finality fin on fin.week = f.week
    left join mine     m   on m.week   = f.week
   order by f.week;
$fn$;

revoke execute on function public.median_record(integer, smallint) from public, anon;
grant  execute on function public.median_record(integer, smallint) to authenticated;

comment on function public.median_record(integer, smallint) is
  'The caller''s week-by-week result against the field''s median score, plus the field''s full range (low..high) so a client can place the caller within it. Aggregates plus the caller''s own line; never anybody else''s identity.';
