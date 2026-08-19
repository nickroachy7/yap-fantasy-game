-- NOTE ON THIS FILENAME'S TIMESTAMP. CLI-shaped rather than round because this
-- was applied through the Supabase MCP, which stamps its own version. The file
-- is named to match what the remote recorded, so `supabase migration list`
-- shows no orphan. Do the same for the next MCP-applied migration — apply
-- first, read back the recorded version, then name the file after it.

-- Everybody plays everybody, every week.
--
-- There are no head-to-head pairings in this game and there is no intention to
-- add any: pairing a growing, uneven base means byes, orphans and a schedule to
-- maintain, and it makes your week depend on the single opponent you drew. So
-- the whole base plays ONE opponent — the field's median score — and half of
-- everyone wins. That is the entire contest.
--
-- WHY THE MEDIAN AND NOT THE AVERAGE
--
-- The left tail of a weekly score distribution is people, not luck: accounts
-- that set a lineup once and never came back, half-filled lineups (allowed —
-- an empty slot simply scores nothing), starters left in on a bye. Those scores
-- drag a MEAN down hard and barely move a MEDIAN. Score against the mean and,
-- as engagement decays, two thirds of the active base beats "the community"
-- every week and a W stops meaning anything. The median is self-balancing by
-- construction — half beat it, half do not, forever, however many dormant
-- accounts pile up — so wins and losses across the base always sum to each
-- other. `average` is returned anyway, as CONTEXT on the card; it is never what
-- anybody is scored against.
--
-- `percentile_cont`, so an even entrant count interpolates between the two
-- middle scores and nobody ties the median by accident. On an odd count the
-- middle manager genuinely ties it, and that is reported as a tie rather than
-- rounded into a win.
--
-- WHY A FUNCTION AND NOT A TABLE
--
-- Same reasoning as score_week: every number here is a recomputation from
-- source rows, never an increment. `score_week` already rewrites total_points
-- idempotently from stat lines, so a stat correction three days later moves the
-- median with it and the record stays true. A stored result would need its own
-- backfill and would silently disagree with the lineups it was computed from.
--
-- WHY security definer
--
-- `lineups` is RLS-scoped to its owner, so an invoker-rights version of this
-- would compute the median of one row — the caller's own — which is not a
-- smaller answer but a WRONG one, indistinguishable from a real median. Same
-- boundary as `leaderboard()`: what crosses it is aggregates and the caller's
-- own line. No user ids, no display names, nothing that names anybody.
create or replace function public.median_record(
  p_season      integer,
  p_season_type smallint default 2
)
returns table (
  week      integer,
  entrants  bigint,
  -- What you are scored against.
  median    numeric,
  -- Context only. See the header.
  average   numeric,
  high      numeric,
  -- Every fixture in the week is complete. Until then there is no result yet,
  -- only a live median.
  final     boolean,
  my_points numeric,
  my_rank   bigint,
  -- Entrants the caller is STRICTLY ahead of, which is what the share bar on
  -- the contest card divides by `entrants`. Ties are in neither share.
  ahead     bigint,
  -- 'W' | 'L' | 'T', or null while the week is live, when the caller had no
  -- lineup, or when the field is too small to have a middle to be on one side of.
  result    text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with entries as (
    -- A lineup row with no slots is not an entrant. `set_lineup` writes the row
    -- before it writes the slots and an empty payload is legal, so "opened the
    -- screen" would otherwise count as a nought and pull the median down.
    select l.week, l.user_id, l.total_points as pts
      from public.lineups l
     where l.season = p_season
       and l.season_type = p_season_type
       and exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  field as (
    select e.week,
           count(*) as entrants,
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
$$;

revoke execute on function public.median_record(integer, smallint) from public, anon;
grant  execute on function public.median_record(integer, smallint) to authenticated;

comment on function public.median_record(integer, smallint) is
  'The caller''s week-by-week result against the field''s median score. Aggregates plus the caller''s own line; never anybody else''s identity.';
