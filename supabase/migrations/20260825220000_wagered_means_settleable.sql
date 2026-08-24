-- A heart is only wagered if settlement can actually take it.
--
-- ---------------------------------------------------------------------------
-- THE CONTRADICTION
-- ---------------------------------------------------------------------------
--
-- `wagered_entries` asked one question — is this entry in a contest with hearts
-- on it, and has it not been scored yet — and `settle_run_week` asks a
-- different one. Settlement also requires `l.run_id is not null`, because an
-- entry with no run is an entry it has nowhere to apply a result to.
--
-- The gap between those two is small and produces a straightforwardly false
-- statement. Any lobby entry filed BEFORE `20260825150000` shipped carries no
-- run — nothing stamped it, and nothing can go back and decide which run it
-- should have belonged to. The chrome drew a heart as riding on it and the sell
-- lock refused sales to protect it, while settlement was always going to skip
-- it. The player was shown a stake that could not be lost.
--
-- Found on a real row: a Flex Three entry for Preseason Week 4, hearts_at_risk
-- 1, run_id null, sitting under a masthead saying one heart was on the line.
--
-- ---------------------------------------------------------------------------
-- THE PREDICATE FOLLOWS SETTLEMENT, NOT THE OTHER WAY ROUND
-- ---------------------------------------------------------------------------
--
-- Settlement is the authority here: it is what actually moves hearts, so
-- anything that DESCRIBES a stake has to describe what settlement will do. The
-- alternative — teaching settlement to find a run for an unstamped entry — is
-- worse than it sounds, because the only run it could find is whichever one
-- happens to be live at settlement time, which is exactly the wrong-run bug
-- `20260825150000` exists to prevent.
--
-- So an unstamped entry is a FREE ROLL: it plays, it scores, it earns its gems,
-- and it cannot cost or pay a heart. That is the honest reading of an entry
-- made before hearts existed, and it corrects itself in a week — every entry
-- filed from now on is stamped at creation.
--
-- NOT BACKFILLED, deliberately. Stamping those rows would retroactively put a
-- heart on an entry somebody made when entering cost them nothing, which is a
-- worse failure than a week of free rolls: it takes something real away on the
-- strength of a rule that did not exist when they acted.

create or replace function public.wagered_entries(p_user uuid)
returns table (lineup_id uuid, contest_id uuid, hearts_at_risk smallint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.id, c.id, c.hearts_at_risk
    from public.lineups l
    join public.contests c on c.id = l.contest_id
    -- The run is joined rather than merely tested for non-null, because a
    -- stake on a run that has already ENDED is not a stake either: the update
    -- in `settle_run_week` skips a dead run, so its pending entries record a
    -- result and move nothing.
    join public.runs r on r.id = l.run_id and r.ended_at is null
   where l.user_id = p_user
     -- UNSETTLED: the window opens when the entry is filed and closes when the
     -- sweep scores it. The run can only be killed inside it.
     and l.scored_at is null
     and c.hearts_at_risk > 0;
$$;

revoke execute on function public.wagered_entries(uuid) from public, anon, authenticated;

comment on function public.wagered_entries(uuid) is
  'The entries with hearts riding on them right now: unscored, in a contest that stakes hearts, stamped with a run that is still live. Matches settle_run_week''s own filter exactly — the sell lock and the heart display both read it, and neither may promise a stake settlement will not act on.';
