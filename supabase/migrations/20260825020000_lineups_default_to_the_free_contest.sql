-- A lineup that names no contest is a lineup in the free one.
--
-- ---------------------------------------------------------------------------
-- WHAT 20260825010000 GOT WRONG
-- ---------------------------------------------------------------------------
--
-- `lineups.contest_id` landed NOT NULL with no default, and `set_lineup` — the
-- only function that writes the table — always passes it. That looked complete
-- and was not: eight SQL suites build their fixtures by inserting into
-- `public.lineups` directly, naming a slate and nothing else, because until
-- that migration a slate was ALL a lineup was. Every one of them broke.
--
-- The failure was also a lie. `lineup_matches_contest` fires BEFORE the NOT
-- NULL is enforced, so a missing contest_id was reported as "lineup names a
-- contest that does not exist" — which sends you looking for a deleted row
-- rather than at the column you did not fill in.
--
-- ---------------------------------------------------------------------------
-- THE FIX IS A DEFAULT, NOT EIGHT EDITED FIXTURES
-- ---------------------------------------------------------------------------
--
-- Rewriting the suites to name a contest would be churn that buys nothing: the
-- lineups they build are ordinary weekly ones, which is exactly what the free
-- contest is. And it would leave the footgun in place for the next writer —
-- `backfill_week`, a repair script, a hand-fixed row in the SQL editor — each
-- of which thinks in slates because that is what every other column here is.
--
-- So the trigger FILLS the column rather than only checking it. The free
-- contest is created on demand by the same idempotent function the backfill
-- used, so this works on a week that has never been played.
--
-- IT DEFAULTS ONLY WHEN NOTHING WAS NAMED. A row that names a contest is still
-- checked against its slate and still refused if the two disagree — that check
-- is the reason this trigger exists and it is untouched. The default cannot
-- mask a lobby lineup that forgot its contest either, because `set_lineup`
-- resolves the contest FIRST and derives the slate from it: by the time a row
-- reaches this trigger from that path, contest_id is always set.

create or replace function public.lineup_matches_contest()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare c record;
begin
  -- No contest named: this is a plain weekly lineup, and the free contest is
  -- what that means. Created on demand — see `ensure_free_contest`.
  if new.contest_id is null then
    new.contest_id := public.ensure_free_contest(new.season, new.season_type, new.week);
    return new;
  end if;

  select season, season_type, week into c from public.contests where id = new.contest_id;
  if c is null then
    raise exception 'lineup names a contest that does not exist' using errcode = '23503';
  end if;
  if (new.season, new.season_type, new.week) is distinct from (c.season, c.season_type, c.week) then
    raise exception
      'lineup slate (%/%/%) disagrees with its contest (%/%/%)',
      new.season, new.season_type, new.week, c.season, c.season_type, c.week
      using errcode = '23514';
  end if;
  return new;
end;
$$;
