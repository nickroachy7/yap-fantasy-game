-- Your contests stop existing the moment the slate moves, and they should not.
--
-- ---------------------------------------------------------------------------
-- WHAT THERE IS TODAY, AND WHERE IT STOPS
-- ---------------------------------------------------------------------------
--
-- `contest_lobby` joins `lineup_slate()` and `recap_slate()`, so it answers two
-- questions — what can I enter this week, and how did I finish last week — and
-- both are about the WEEK. 20260830030000 widened the second one because a
-- finished week vanishing at 10:00 on a Tuesday was a bug; it did not, and was
-- not trying to, give a player any way to look at a contest from a month ago.
--
-- So there is no history. A season of entries exists in `lineups`, every result
-- is derivable, and none of it is reachable: the moment `recap_slate()` closes,
-- a contest you played is gone from the app for good.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS BUILT ON `lineups` AND NOT ON `run_contest_results`
-- ---------------------------------------------------------------------------
--
-- `run_contest_results` looks like the history table. It has the result, the
-- hearts delta, `settled_at`, and an index on exactly `(user_id, settled_at
-- desc)` — the index a list like this wants. It is the wrong source, and the
-- reason is one line in 20260825235000:
--
--   and c.hearts_at_risk > 0
--
-- A contest with nothing staked never reaches a run and never writes a row. The
-- FREE contest is the one nobody chose to be in, the only one with the season
-- riding on it, and the one a player has entered every single week — so a
-- history built on that table would be missing the only contest guaranteed to
-- be in it. `lineups` is where entry actually lives.
--
-- `run_contest_results` is still joined, for `hearts_delta` alone: what a
-- contest did to a run is frozen at settlement and must not be recomputed from
-- today's `hearts_at_risk`, for the reason that column's own comment gives.
--
-- ---------------------------------------------------------------------------
-- SETTLED ONLY, AND PAGED
-- ---------------------------------------------------------------------------
--
-- `finalized_at is not null` is the whole filter. A week in progress belongs to
-- the board, which already draws it live; a history that included it would put
-- the same contest on two screens disagreeing about whether it was over.
--
-- It is also the CLOCK. The rail draws a marker for a contest that finalised
-- within the last day and then clears itself so the player looks forward — a
-- 24-hour window over this column, decided on the client because it is a
-- presentation rule and not a fact about the data.
--
-- Paged on `(finalized_at, contest_id)` rather than an offset: an offset
-- re-reads rows it has already returned and shifts under a settlement landing
-- mid-scroll. The contest id breaks ties, because a whole slate finalises in
-- one sweep and shares a timestamp to the microsecond.

create or replace function public.contest_history(
  p_limit  integer default 20,
  -- The cursor: the last row already seen. Both halves or neither.
  p_before timestamptz default null,
  p_before_id uuid default null
)
returns table (
  contest_id    uuid,
  code          text,
  name          text,
  kind          text,
  season        integer,
  season_type   text,
  week          integer,
  points        numeric,
  rnk           bigint,
  entrants      bigint,
  result        text,
  hearts_delta  smallint,
  prize_gems    integer,
  finalized_at  timestamptz
)
language sql
stable
-- SECURITY DEFINER for one reason: `contest_results` is revoked from
-- `authenticated` (20260825140000 — it is settlement's function, not a
-- screen's) and this needs to call it. Every row is still scoped to the caller
-- by the `auth.uid()` test below, which is doing the work RLS would.
security definer
set search_path = public, pg_temp
as $fn$
  with mine as (
    select l.id, l.contest_id, l.total_points, l.finalized_at
      from public.lineups l
     where l.user_id = auth.uid()
       and l.finalized_at is not null
       -- KEYSET. Strictly older than the cursor, ties broken by id so a slate
       -- settled in one sweep pages without repeating or skipping.
       and (
         p_before is null
         or l.finalized_at < p_before
         or (l.finalized_at = p_before and p_before_id is not null and l.contest_id < p_before_id)
       )
     order by l.finalized_at desc, l.contest_id desc
     limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  select c.id,
         c.code,
         c.name,
         c.kind::text,
         c.season,
         c.season_type::text,
         c.week,
         m.total_points,
         cr.rnk,
         cr.entrants,
         cr.result,
         rcr.hearts_delta,
         cp.gems,
         m.finalized_at
    from mine m
    join public.contests c on c.id = m.contest_id
    -- Ranked against the field as it finished. Called per row rather than once,
    -- which is what the page size is for: twenty of these is twenty small
    -- window queries, and an unpaged season would be fifty.
    left join lateral (
      select r.rnk, r.entrants, r.result
        from public.contest_results(m.contest_id) r
       where r.lineup_id = m.id
    ) cr on true
    left join lateral (
      select p.gems from public.contest_payouts(m.contest_id) p where p.lineup_id = m.id
    ) cp on true
    -- Frozen at settlement. Absent for every contest that staked nothing, which
    -- is why it is a LEFT join and why it is not the driving table.
    left join public.run_contest_results rcr
           on rcr.contest_id = m.contest_id and rcr.user_id = auth.uid()
   order by m.finalized_at desc, c.id desc;
$fn$;

revoke execute on function public.contest_history(integer, timestamptz, uuid) from public, anon;
grant execute on function public.contest_history(integer, timestamptz, uuid) to authenticated;

comment on function public.contest_history(integer, timestamptz, uuid) is
  'Every settled contest the caller has entered, newest first, keyset-paged. Built on lineups rather than run_contest_results so the free contest — the one nobody chose and everybody is in — is not missing from it.';
