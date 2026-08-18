-- Two different questions were being answered by current_slate():
--
--   scoring asks  "which week am I ingesting stats for?"  -> most recent kickoff
--   lineups ask   "which week can I still submit for?"    -> next kickoff ahead
--
-- Using current_slate() for both made the lineup screen permanently locked the
-- moment a week kicked off: it targeted the week already in progress, whose
-- lock time is by definition in the past.
--
-- current_slate() keeps its meaning (gameday_sweep depends on it). This is the
-- forward-looking counterpart.
create or replace function public.upcoming_slate()
returns table (season integer, season_type smallint, week integer)
language sql
stable
set search_path = public, pg_temp
as $$
  with weeks as (
    select g.season, g.season_type, g.week, min(g.starts_at) as first_kick
      from public.games g
     where g.week is not null
     group by g.season, g.season_type, g.week
  ),
  next_open as (
    select * from weeks where first_kick > now() order by first_kick asc limit 1
  ),
  most_recent as (
    select * from weeks order by first_kick desc limit 1
  )
  -- Prefer the next week still open. If the season is over, fall back to the
  -- most recent week so the screen renders it as locked rather than erroring on
  -- an empty slate.
  select season, season_type, week from next_open
  union all
  select season, season_type, week from most_recent
   where not exists (select 1 from next_open);
$$;

grant execute on function public.upcoming_slate() to authenticated;
