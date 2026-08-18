-- Global leaderboard (build plan task 24). One board, no leagues, no friend
-- lists in the beta.
--
-- Deliberately a SECURITY DEFINER *function*, not a view. A view over `lineups`
-- would either be blocked by that table's RLS (which scopes rows to their
-- owner) or, if created as a definer view, would silently bypass RLS in a way
-- that is easy to widen by accident later. A function makes the exposed columns
-- an explicit, reviewable list: display name, points, rank — and nothing else.
create or replace function public.leaderboard(
  p_season      integer,
  p_season_type smallint default 2,
  p_week        integer default null,   -- null = season to date
  p_limit       integer default 100
)
returns table (
  rank          bigint,
  user_id       uuid,
  display_name  text,
  total_points  numeric,
  weeks_played  bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with totals as (
    select l.user_id,
           sum(l.total_points) as pts,
           count(*)            as weeks
      from public.lineups l
     where l.season = p_season
       and l.season_type = p_season_type
       and l.scored_at is not null
       and (p_week is null or l.week = p_week)
     group by l.user_id
  )
  select rank() over (order by t.pts desc, pr.display_name asc),
         t.user_id,
         pr.display_name,
         t.pts,
         t.weeks
    from totals t
    join public.profiles pr on pr.id = t.user_id
   order by t.pts desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.leaderboard(integer, smallint, integer, integer) from public, anon;
grant  execute on function public.leaderboard(integer, smallint, integer, integer) to authenticated;
