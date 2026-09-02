-- The provider ruleset goes live
--
-- The flip that `20260903020000` deliberately did not do. See that file for why
-- the provider's PPR replaces our engine and why it was safe to do it while the
-- entire game held 107 career fantasy points.
--
-- ---------------------------------------------------------------------------
-- IT REFUSES TO RUN EARLY, BECAUSE THE FAILURE IS SILENT
-- ---------------------------------------------------------------------------
--
-- `is_active` is what a dozen readers key on:
--
--   fp.rules_version = (select version from scoring_rules where is_active limit 1)
--
-- — the player directory, the player profile, the game log, season stats, the
-- sell price. Activate v3 before `sync-fantasy` has written any v3 rows and
-- every one of those joins matches nothing. No error is raised and no migration
-- fails; the app simply reads as though the league had never played a down.
--
-- That is precisely the shape of bug this project has been bitten by before —
-- a thousand-row PostgREST cap that scored 1000 of 1584 rows and returned a
-- clean 200. A guard is cheap and a silent zero is not.
--
-- SO IT COUNTS FIRST. If there are no v3 rows this raises and the migration
-- fails loudly, leaving v2 active and the app working. Re-run it after the
-- backfill.
--
-- The threshold is 1000 rather than 1: a partial backfill — one week ingested,
-- seventeen missing — would satisfy `> 0` and still empty most of the app. The
-- 2025 regular season alone is ~16,000 stat lines, so a thousand is a floor
-- that a real backfill clears immediately and a half-finished one does not.

do $$
declare
  v3_rows bigint;
begin
  select count(*) into v3_rows from public.fantasy_points where rules_version = 3;

  if v3_rows < 1000 then
    raise exception
      'Refusing to activate scoring v3: only % rows carry it. Run the sync-fantasy edge function to backfill provider points first, then re-run this migration.',
      v3_rows;
  end if;
end
$$;

-- One statement, so there is never an instant with two active rulesets or none.
update public.scoring_rules set is_active = (version = 3);
