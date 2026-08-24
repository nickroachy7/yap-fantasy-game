-- Every contest you are in this week, each with its OWN field.
--
-- ---------------------------------------------------------------------------
-- THE BUG THIS EXISTS TO FIX
-- ---------------------------------------------------------------------------
--
-- `20260825010000` made the lineup BOARD contest-aware and left the card above
-- it reading `median_record`, which is scoped to the free contest. So opening a
-- lobby entry drew three FLEX slots under a card captioned with the free
-- contest's season record and the free contest's field — every number on it
-- true, and none of it about the contest on screen.
--
-- A card per contest needs a field per contest, and `median_record` cannot
-- give one: it is deliberately free-only, because the season's opponent must
-- not move when somebody opens a side contest (see `20260825060000`). So the
-- distribution is computed here, per contest, and the two functions stay
-- separate on purpose — they are answering different questions and the day
-- they are merged is the day a lobby score lands in the season median again.
--
-- ---------------------------------------------------------------------------
-- ONE ROUND TRIP FOR THE WHOLE CAROUSEL
-- ---------------------------------------------------------------------------
--
-- The carousel draws N cards and would otherwise ask for N distributions. N is
-- small, but the shape is the problem rather than the count: a card that
-- fetches its own stats cannot be swiped to before it has them, so the second
-- card in the row is always a spinner the first time you reach it.
--
-- SECURITY DEFINER for the same reason `contest_lobby` is: the field is built
-- out of other people's lineups, which RLS hides, and only aggregates come
-- back — a count, four percentiles and your own row.
create or replace function public.my_contest_cards()
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
  -- The contests the caller has actually entered, which for the free one is
  -- everybody and for a lobby one is whoever paid.
  mine as (
    select c.*, l.id as lineup_id, l.total_points as my_points
      from public.contests c
      join slate s on s.season = c.season and s.season_type = c.season_type and s.week = c.week
      join public.lineups l on l.contest_id = c.id and l.user_id = auth.uid()
  ),
  -- Every entry in those contests, the caller's included. An entry with no
  -- slots is not in the field: the same rule `median_record` applies, so a
  -- lineup opened and never filled cannot drag a median down.
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
  -- Finality is a property of the WEEK's fixtures, not of the contest, so
  -- every contest on a slate finalises together.
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
   -- Free first, then by fee: the one you did not choose to be in leads, and
   -- the carousel opens on it.
   order by m.kind, m.entry_fee_gems, m.name;
$$;

grant execute on function public.my_contest_cards() to authenticated;
