-- Adopt the free-contest entries the stake arrived too late for.
--
-- ---------------------------------------------------------------------------
-- WHY 20260825270000 DID NOT DO THIS ITSELF
-- ---------------------------------------------------------------------------
--
-- `20260825260000` backfilled `run_id` onto live entries in contests that stake
-- hearts. At that moment the free contest staked none, so its entries were not
-- adopted — correctly, by the rule as it stood. Then `20260825270000` made the
-- free contest a heart contest, and every one of those entries was left in the
-- state that migration exists to prevent: a row the lobby says risks a heart,
-- carrying no run, which `settle_run_week` will skip.
--
-- The ordering was mine and it was avoidable. Recorded rather than tidied away,
-- because the lesson generalises: RAISING A CONTEST'S STAKE IS NOT A DATA EDIT,
-- it changes what every live entry in that contest means, and the entries have
-- to be brought with it.
--
-- ---------------------------------------------------------------------------
-- ONLY WEEKS THAT HAVE NOT KICKED OFF
-- ---------------------------------------------------------------------------
--
-- This is the line the earlier backfill did not need and this one does.
--
-- Adopting a lobby entry was safe because the lobby had advertised `1 at risk`
-- on that row since `20260825190000` — the stake was already the deal. The free
-- contest is the opposite case: it read zero right up until the previous
-- migration, so a player who filed their main lineup did so under a rule that
-- genuinely said it cost nothing. Staking a week they had already played would
-- be changing the terms after the whistle.
--
-- A week that has not kicked off has no such problem. Nothing is decided, the
-- lineup can still be changed or improved, and the player meets the new stake
-- before it can cost them anything — which is the same standing anybody
-- entering next week gets.
--
-- Verified before writing this: the only affected slate is preseason week 4,
-- sixteen fixtures, none started, first kickoff three days out.
--
-- Entries in a week already under way keep no run and are free rolls, exactly
-- as `20260825220000` intended for the case where the rule genuinely arrived
-- late. `set_lineup` will adopt them if the player touches the lineup again,
-- which is them accepting the new terms by acting under them.

update public.lineups l
   set run_id = r.id
  from public.contests c, public.runs r
 where c.id = l.contest_id
   and r.user_id = l.user_id
   and r.ended_at is null
   and l.run_id is null
   and l.scored_at is null
   and c.hearts_at_risk > 0
   -- Not one fixture of the week has started.
   and not exists (
     select 1 from public.games g
      where g.season = c.season and g.season_type = c.season_type and g.week = c.week
        and public.game_has_started(g.status_state, g.starts_at)
   );
