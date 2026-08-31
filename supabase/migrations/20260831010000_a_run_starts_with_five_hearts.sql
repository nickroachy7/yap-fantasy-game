-- Five hearts to start, eight at the ceiling.
--
-- ---------------------------------------------------------------------------
-- WHY THREE STOPPED BEING THE RIGHT NUMBER
-- ---------------------------------------------------------------------------
--
-- `run_starting_hearts` has carried the note "three is two mistakes and a
-- lesson; the whole risk curve is set here" since `20260825110000`, and that
-- was right for a run whose hearts were only ever a LIFE COUNT. A heart was
-- something you lost.
--
-- A heart is now also the thing you spend to enter, and the board says so out
-- loud: the rail draws one pip per entry and ends in a button that opens the
-- lobby. Under that reading three hearts is not "two mistakes and a lesson", it
-- is a cap of three concurrent contests — and since the free contest takes one
-- of them unconditionally, it is really a cap of two. The button would have
-- spent most of the season pointing at something the player could not afford.
--
-- So the number moves for a reason that has nothing to do with difficulty: the
-- resource acquired a second job, and it was priced for the first one.
--
-- ---------------------------------------------------------------------------
-- WHY FIVE AND EIGHT AND NOT MORE
-- ---------------------------------------------------------------------------
--
-- Five is the largest rack that is still COUNTABLE at a glance — the header
-- draws a glyph and a figure, but the rail draws pips, and past about five a
-- reader stops seeing "how many" and starts seeing "some". It is also two more
-- lobby entries than today alongside the free contest, which is the change the
-- plus button was asked for.
--
-- Eight rather than five at the ceiling because the ceiling exists to stop a
-- long win streak banking a run into invulnerability, and that argument scales
-- with the start: at 5/5 a single win could never be banked and the heal on a
-- `top_n` contest would be a reward that does nothing most weeks.
--
-- WHAT THIS DOES NOT DO IS TOUCH ANY EXISTING RUN. `runs.hearts` and
-- `runs.max_hearts` were copied off these values when each run began, which is
-- deliberate — a live run's terms should not change under it mid-season. New
-- runs get the new numbers; the runs already going keep the ones they started
-- with, and `runs_hearts_within_max` keeps them consistent either way.

update public.game_config
   set value = 5,
       description = 'Hearts a new run begins with. Also the cap on concurrent contest entries, since entering stakes one — see 20260831010000.'
 where key = 'run_starting_hearts';

update public.game_config
   set value = 8,
       description = 'Ceiling a run can be healed to. Without it a long win streak banks enough hearts to make the run unkillable.'
 where key = 'run_max_hearts';

-- Both keys are read through `game_config_value(key, default)`, which falls
-- back to its second argument when a row is missing — so an environment that
-- never seeded these would silently keep 3 and 5. Assert instead.
do $$
declare v_start integer; v_max integer;
begin
  select public.game_config_value('run_starting_hearts', 0) into v_start;
  select public.game_config_value('run_max_hearts', 0) into v_max;
  if v_start <> 5 or v_max <> 8 then
    raise exception 'run heart config did not take: start=%, max=%', v_start, v_max;
  end if;
end $$;
