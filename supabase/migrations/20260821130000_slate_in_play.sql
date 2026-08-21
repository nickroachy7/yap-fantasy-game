-- The week the lineup screen is about, which was never the week it showed.
--
-- ---------------------------------------------------------------------------
-- THE BUG
-- ---------------------------------------------------------------------------
--
-- `upcoming_slate()` returns the first week whose EARLIEST kickoff is still
-- ahead. That is the right answer to "which week can I still submit for", and
-- 20260818060000 introduced it for exactly that reason. The lineup screen then
-- used it for everything, including "which week am I watching" — and those two
-- questions have different answers for five days out of every seven.
--
-- An NFL week is not an event, it is a span. Regular-season week 1 opens
-- Thursday 10 Sep at 20:20 ET and closes Monday 14 Sep at 20:15 ET. The moment
-- Thursday night kicks off, week 1's min(starts_at) is in the past, so
-- `upcoming_slate()` moves to week 2 — and the lineup screen abandons the week
-- being played for the whole of Sunday and Monday, which is precisely when
-- anyone would open it.
--
-- Observed, not theorised. At the time of writing, preseason week 3 has 2 of
-- its 16 games final and fixtures tonight, tomorrow and Sunday, and
-- `upcoming_slate()` already reads week 4.
--
-- ---------------------------------------------------------------------------
-- THE FIX
-- ---------------------------------------------------------------------------
--
-- A third question, asked plainly: which week is IN PLAY — begun, and not yet
-- done with. The screen shows that week when there is one, and the next open
-- week when there is not. Neither existing function changes meaning:
--
--   current_slate()   most recent kickoff       -> what the sweep ingests
--   upcoming_slate()  next kickoff ahead        -> what you can still submit
--   slate_in_play()   begun and unfinished      -> what you are watching
--
-- `current_slate()` is deliberately NOT reused here. It answers with the most
-- recent week to have kicked off whether or not that week is over, so in the
-- gap between Tuesday and Thursday it names a finished week — correct for
-- deciding whether to re-ingest stat corrections, wrong for deciding what to
-- put on screen.

-- Every game in the week has a final status, and there is at least one game.
-- The `count(*) > 0` guard matters: an empty week is vacuously "all final",
-- which would settle tiers against fixtures that do not exist.
create or replace function public.week_is_complete(
  p_season      integer,
  p_season_type smallint,
  p_week        integer
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*) > 0
     and count(*) filter (where g.status_state is distinct from 'final') = 0
    from public.games g
   where g.season = p_season
     and g.season_type = p_season_type
     and g.week = p_week;
$$;

grant execute on function public.week_is_complete(integer, smallint, integer) to authenticated;

-- The week that has begun and is not yet done with.
--
-- THE TAIL. A week stays in play for 12 hours past its last kickoff even once
-- every game is final, so Monday Night Football's result is still on screen on
-- Tuesday morning rather than vanishing at the final whistle. 12h from a 20:15
-- kickoff is roughly 08:00 the next day, which is about eight hours after the
-- game ends — long enough to read it over coffee, short enough that the next
-- week is open well before its Thursday.
--
-- Measured from `starts_at` rather than from when the game went final, because
-- we do not store the latter and adding a column to carry it would be storing
-- a fact we can already infer to within an hour.
create or replace function public.slate_in_play()
returns table (season integer, season_type smallint, week integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select w.season, w.season_type, w.week
    from (
      select g.season, g.season_type, g.week,
             min(g.starts_at) as first_kick,
             max(g.starts_at) as last_kick,
             count(*) filter (where g.status_state is distinct from 'final') as unfinished
        from public.games g
       where g.week is not null
       group by g.season, g.season_type, g.week
    ) w
   where w.first_kick <= now()
     and (w.unfinished > 0 or w.last_kick > now() - interval '12 hours')
   -- Newest first: in the ordinary case exactly one week qualifies, but a
   -- postponed fixture can leave an old week technically unfinished forever,
   -- and the screen must follow the football rather than the anomaly.
   order by w.first_kick desc
   limit 1;
$$;

grant execute on function public.slate_in_play() to authenticated;

-- What the lineup screen asks for: one week, and whether it is being played.
--
-- Returning the flag rather than making the client infer it from two separate
-- calls is the point. "Is this week live" decides whether the board is a form
-- or a scoreboard, and a client that derived it by comparing the answers of
-- two RPCs taken a round trip apart would get it wrong in exactly the moment
-- it matters — the minute either side of first kickoff.
create or replace function public.lineup_slate()
returns table (season integer, season_type smallint, week integer, in_play boolean)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.season, p.season_type, p.week, true from public.slate_in_play() p
  union all
  select u.season, u.season_type, u.week, false from public.upcoming_slate() u
   where not exists (select 1 from public.slate_in_play());
$$;

grant execute on function public.lineup_slate() to authenticated;

comment on function public.lineup_slate() is
  'The week the lineup screen shows: the week in play if one has begun and not finished, otherwise the next week still open for submission. in_play distinguishes the two.';
