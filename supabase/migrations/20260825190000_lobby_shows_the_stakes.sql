-- The lobby shows what a row costs to lose.
--
-- A contest that can end your run and a contest that cannot are not the same
-- product, and until this migration the lobby drew them identically — same
-- card, same fee, no way to tell which one was carrying a heart. Entering
-- something that can kill a run without being told it can is the single worst
-- surprise this feature can hand somebody, and it is entirely a presentation
-- bug: the facts have been on `contests` since 20260825130000.
--
-- Dropped and recreated rather than replaced, because Postgres will not let a
-- RETURNS TABLE function change its output columns in place — the same trap
-- `median_record` documents, where the error ("cannot change return type of
-- existing function") reads like a permissions problem.

drop function if exists public.contest_lobby();

create or replace function public.contest_lobby()
returns table(
  id uuid, code text, kind public.contest_kind, name text,
  format_code text, format_name text, slot_count smallint,
  entry_fee_gems integer, max_entrants integer, entrants integer,
  season integer, season_type smallint, week integer,
  my_lineup_id uuid, my_filled integer, affordable boolean,
  win_condition public.contest_win_condition, win_rank integer,
  hearts_at_risk smallint, hearts_on_win smallint,
  -- Hearts the caller's run is holding right now. Denormalised into every row
  -- because the one thing a player needs in order to read `hearts_at_risk` is
  -- what they have left, and a lobby that made them go elsewhere for it would
  -- be asking them to price the risk from memory.
  my_hearts smallint
)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  with slate as (select * from public.lineup_slate() limit 1),
  wallet as (
    select coalesce((select balance from public.gem_balances where user_id = auth.uid()), 0) as balance
  ),
  -- Read, never created. `contest_lobby` is STABLE and browsing a lobby must
  -- not be the thing that starts somebody's first run — that belongs to the
  -- entry, which is where a player has actually chosen to take a risk.
  run as (
    select hearts from public.runs where user_id = auth.uid() and ended_at is null
  )
  select c.id, c.code, c.kind, c.name,
         c.format_code, f.name, f.slot_count,
         c.entry_fee_gems, c.max_entrants,
         public.contest_entrants(c.id),
         c.season, c.season_type, c.week,
         l.id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = l.id), 0),
         (l.id is not null or (select balance from wallet) >= c.entry_fee_gems),
         c.win_condition, c.win_rank,
         c.hearts_at_risk, c.hearts_on_win,
         -- Null means no run yet, which the client draws as the starting
         -- hearts rather than as a zero. A player who has never entered
         -- anything has not lost anything.
         (select hearts from run)
    from public.contests c
    join slate s
      on s.season = c.season and s.season_type = c.season_type and s.week = c.week
    join public.contest_formats f on f.code = c.format_code
    left join public.lineups l
           on l.contest_id = c.id and l.user_id = auth.uid()
   -- Free first, then by what it costs you: gems, then hearts. A row that can
   -- end the run should never be the first thing under the thumb.
   order by c.kind, c.hearts_at_risk, c.entry_fee_gems, c.name;
$$;

grant execute on function public.contest_lobby() to authenticated;
