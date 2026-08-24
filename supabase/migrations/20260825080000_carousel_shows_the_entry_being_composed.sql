-- The carousel has to be able to show a contest you have not entered YET.
--
-- ---------------------------------------------------------------------------
-- THE HOLE THIS CLOSES
-- ---------------------------------------------------------------------------
--
-- Entering is not an act of its own: the fee is taken by the first `set_lineup`
-- that names a card, because the lineup row IS the entry record
-- (`20260825050000`). That is the right design — it makes the charge idempotent
-- against the client's autosave — but it means there is a real state in between
-- where a player has chosen a contest and has no lineup in it.
--
-- `my_contest_cards()` keyed on having a lineup, so during that state the
-- contest simply was not there. The contest sheet's "Set your lineup" sent you
-- to the board naming a contest the carousel did not contain, the board fell
-- back to the free contest, and the entry flow quietly dropped you on the wrong
-- lineup. Every piece behaving exactly as written.
--
-- `p_include` is that state, and it is a PARAMETER rather than a second
-- function because the alternative is the client asking twice and stitching
-- the two answers together — at which point the shape of a card is defined in
-- two places, one of them TypeScript.
--
-- A contest named here comes back with a null `lineup_id` and nothing filled,
-- which is what the board reads to know it is composing an entry rather than
-- editing one. It is NOT a promise of a seat: `set_lineup` still checks
-- capacity and the wallet when the first card is submitted.
create or replace function public.my_contest_cards(p_include text default null)
returns table(
  contest_id uuid, code text, kind public.contest_kind, name text,
  format_code text, format_name text, slot_count smallint, entry_fee_gems integer,
  season integer, season_type smallint, week integer,
  lineup_id uuid, filled integer,
  entrants bigint, low numeric, median numeric, average numeric, high numeric,
  final boolean, my_points numeric, my_rank bigint, ahead bigint, result text
)
language sql
stable security definer
set search_path = public, pg_temp
as $$
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
         end
    from mine m
    join public.contest_formats f on f.code = m.format_code
    left join field  fl on fl.contest_id = m.id
    left join ranked r  on r.contest_id = m.id and r.user_id = auth.uid()
   order by m.kind, m.entry_fee_gems, m.name;
$$;

-- The no-argument form is gone: it would sit alongside the new one as an
-- overload, and PostgREST picks an overload by the argument names it is sent,
-- so a client that stopped sending `p_include` would silently get the old body.
drop function if exists public.my_contest_cards();

grant execute on function public.my_contest_cards(text) to authenticated;
