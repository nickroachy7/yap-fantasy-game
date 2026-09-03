-- Yap Fantasy — slate transition suite (build plan tasks 16 + 23)
--
-- The gameday sweep is driven entirely by two time-dependent functions, and
-- neither has ever been exercised across a week boundary — every run so far has
-- observed a single frozen moment (a Tuesday, with nothing live). The one bug
-- this area has already produced was exactly that class: current_slate() was
-- correct for scoring and wrong for lineups, and nothing caught it until the
-- lineup screen turned out to be permanently locked.
--
-- So this walks preseason week 3 through the whole arc it will actually take on
-- Aug 21 — approaching, kicked off, finished, gone cold — and asserts what the
-- sweep does at each point. In particular it pins the two decisions that cost
-- real money or real trust if they invert:
--   * a sweep must NOT call the provider before a game has started
--   * a sweep must KEEP calling for 6h after the last whistle, for corrections
--
-- IT NOW WALKS `lineup_slate()` DOWN THE SAME ARC, because the area produced
-- the same class of bug a second time. `upcoming_slate()` was the fix for the
-- permanently-locked screen and then became the screen's only source of truth
-- — so from the moment Thursday night kicked off, the lineup abandoned the week
-- being played and showed the next one for the whole of Sunday and Monday. The
-- original phase 2 below asserts `upcoming_slate() = 4` at kickoff and is still
-- right to: that is what "still open for submission" means. What was missing
-- was any assertion about what the reader should be LOOKING at, which is a
-- third question with a third answer. Phases 2 through 5 now pin it.
--
-- Every timestamp is set relative to now(), so this does not rot after Aug 21.
-- now() is fixed for the transaction, so "time" advances by moving the games.
--
-- THE FIXTURE OWNS THE WHOLE `games` TABLE, not just the four weeks it walks.
-- `current_slate()`, `upcoming_slate()` and `lineup_slate()` take no arguments
-- — they answer about the league, so any football outside this arc is inside
-- their answer. See the pin below.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/slate_transition.test.sql

begin;

do $$
declare
  s        record;
  ls       record;
  v_live   boolean;
  v_score  jsonb;
  v_first  uuid;
  checks   int := 0;

  procedure_note constant text := 'slate transition';
begin
  /* Every mutation lives inside this block on purpose: the block is a single
   * statement, so a raise anywhere in it unwinds all of it. The test cannot
   * leave a shifted kickoff behind even if it is run outside a transaction. */

  /* Pin the surrounding weeks so the assertions describe week 3's arc alone.
   *
   * AND PIN EVERY OTHER SEASON TYPE OUT OF THE WAY, which this suite did not
   * have to do when it was written and does now. It walks PRESEASON week 3,
   * and it was written in August when the preseason was the only football
   * ingested — so "the next slate" could only ever be another preseason week.
   * The regular season landed on 2026-09-03 and phase 2 started failing with
   * `lineups should have moved to week 4, got 1`: `upcoming_slate()` had
   * correctly moved to REGULAR week 1, which kicks off before the preseason
   * week 4 this arc pins seven days out. Nothing was broken; the fixture had
   * stopped describing the whole board.
   *
   * A month is chosen rather than a year so the rows stay plausible football
   * — this is a rolled-back transaction, but a game in 2027 in a table
   * somebody might dump mid-run is a confusing thing to leave lying around. */
  update public.games set starts_at = now() - interval '7 days', status_state = 'final'
   where season = 2026 and season_type = 1 and week = 2;
  update public.games set starts_at = now() + interval '7 days', status_state = 'scheduled'
   where season = 2026 and season_type = 1 and week = 4;
  -- Week 1 is a single game and sits behind week 2 throughout.
  update public.games set starts_at = now() - interval '14 days', status_state = 'final'
   where season = 2026 and season_type = 1 and week = 1;
  -- Everything that is not this preseason: a month out, and out of the arc.
  update public.games
     set starts_at = now() + interval '30 days' + (week * interval '1 day'),
         status_state = 'scheduled'
   where not (season = 2026 and season_type = 1);

  -- Week 3's opener, which is the game that flips the slate.
  select id into v_first
    from public.games
   where season = 2026 and season_type = 1 and week = 3
   order by starts_at, id
   limit 1;
  if v_first is null then
    raise exception 'FAIL: preseason week 3 has no games to walk';
  end if;

  /* ---- phase 1: 30 minutes out ------------------------------------------
   * current_slate() deliberately looks an hour ahead, so week 3 becomes the
   * slate BEFORE anyone kicks off. That is correct — but it means the only
   * thing standing between us and a provider call on a quiet afternoon is
   * slate_is_live(). If this assertion ever inverts, the sweep starts paying
   * for 12 calls an hour to learn that nothing has happened. */
  update public.games
     set starts_at = now() + interval '30 minutes' + (row_number_offset * interval '1 hour'),
         status_state = 'scheduled'
    from (
      select id, (row_number() over (order by starts_at, id) - 1) as row_number_offset
        from public.games
       where season = 2026 and season_type = 1 and week = 3
    ) ord
   where public.games.id = ord.id;

  select * into s from public.current_slate();
  if s.week is distinct from 3 then
    raise exception 'FAIL phase 1: slate should look ahead to week 3, got %', s.week;
  end if;
  checks := checks + 1;

  select public.slate_is_live() into v_live;
  if v_live then
    raise exception 'FAIL phase 1: sweep would call the provider before kickoff';
  end if;
  checks := checks + 1;

  select * into s from public.upcoming_slate();
  if s.week is distinct from 3 then
    raise exception 'FAIL phase 1: week 3 is still open for lineups, got %', s.week;
  end if;
  checks := checks + 1;

  -- Nothing has begun, so there is no week in play and the screen shows the one
  -- you can still set. in_play false is what makes the board a form.
  select * into ls from public.lineup_slate();
  if ls.week is distinct from 3 or ls.in_play then
    raise exception 'FAIL phase 1: screen should show week 3 as settable, got week % in_play %',
      ls.week, ls.in_play;
  end if;
  checks := checks + 1;

  /* ---- phase 2: opener in progress, no box score yet --------------------
   * The live window. This is also the state the ingest function sees for its
   * first several sweeps: games targeted, zero stat lines published. */
  update public.games
     set starts_at = now() - interval '10 minutes', status_state = 'scheduled'
   where id = v_first;

  select * into s from public.current_slate();
  if s.week is distinct from 3 or s.season_type is distinct from 1::smallint then
    raise exception 'FAIL phase 2: slate should be preseason week 3, got type % week %',
      s.season_type, s.week;
  end if;
  checks := checks + 1;

  select public.slate_is_live() into v_live;
  if not v_live then
    raise exception 'FAIL phase 2: sweep is asleep while a game is being played';
  end if;
  checks := checks + 1;

  -- Lineups must move on the moment the week starts; this is the bug that made
  -- the lineup screen permanently locked when both questions shared a function.
  /* THE SEASON TYPE IS PART OF THE ANSWER, and leaving it out is what made
   * this assertion's failure unreadable: it reported "got 1" for a function
   * that had correctly returned REGULAR week 1, and a bare 1 next to an
   * expected 4 reads as the arc going backwards rather than as a different
   * season entirely. Every slate check below names both. */
  select * into s from public.upcoming_slate();
  if s.week is distinct from 4 or s.season_type is distinct from 1::smallint then
    raise exception 'FAIL phase 2: lineups should have moved to preseason week 4, got type % week %',
      s.season_type, s.week;
  end if;
  checks := checks + 1;

  /* THE REGRESSION. One game of week 3 is being played and fifteen have not
   * kicked off. `upcoming_slate()` has correctly moved to week 4 — you cannot
   * submit for week 3 any more — but week 3 is what the reader is watching, for
   * the next three days. A screen that reads `upcoming_slate()` here shows an
   * empty week 4 board while the user's players are on the field, which is the
   * shape the bug actually took. */
  select * into ls from public.lineup_slate();
  if ls.week is distinct from 3 then
    raise exception 'FAIL phase 2: screen abandoned the week being played, got week %', ls.week;
  end if;
  if not ls.in_play then
    raise exception 'FAIL phase 2: week 3 is being played but in_play is false';
  end if;
  checks := checks + 1;

  -- A week with games still to come is NOT complete, so nothing settles and no
  -- tier can move on the strength of a Thursday night.
  if public.week_is_complete(2026, 1::smallint, 3) then
    raise exception 'FAIL phase 2: week called complete with 15 games unplayed';
  end if;
  checks := checks + 1;

  -- Scoring a week with no stat lines yet must be a clean no-op, not an error:
  -- the sweep calls it on every tick from kickoff onward.
  v_score := public.score_week(2026, 1::smallint, 3);
  if v_score is null then
    raise exception 'FAIL phase 2: score_week returned null mid-game';
  end if;
  checks := checks + 1;

  /* ---- phase 3: all final, still inside the correction window -----------
   * Stat corrections land for hours after the whistle. Standing down at the
   * final gun would freeze a wrong score into the leaderboard. */
  update public.games
     set starts_at = now() - interval '2 hours', status_state = 'final'
   where season = 2026 and season_type = 1 and week = 3;

  select public.slate_is_live() into v_live;
  if not v_live then
    raise exception 'FAIL phase 3: stopped sweeping while corrections still land';
  end if;
  checks := checks + 1;

  -- Every game final: NOW the week is complete, which is what lets settled_fp
  -- catch up to career_fp and tiers move. This is the only moment they may.
  if not public.week_is_complete(2026, 1::smallint, 3) then
    raise exception 'FAIL phase 3: every game is final but the week is not complete';
  end if;
  checks := checks + 1;

  -- Complete is not the same as gone. The result stays on screen.
  select * into ls from public.lineup_slate();
  if ls.week is distinct from 3 or not ls.in_play then
    raise exception 'FAIL phase 3: final result vanished at the whistle, got week % in_play %',
      ls.week, ls.in_play;
  end if;
  checks := checks + 1;

  /* ---- phase 4: cold ----------------------------------------------------
   * Six hours past the last kickoff the week is done and the sweep must stand
   * down, or it bills the provider around the clock until the next slate. */
  update public.games
     set starts_at = now() - interval '8 hours', status_state = 'final'
   where season = 2026 and season_type = 1 and week = 3;

  select public.slate_is_live() into v_live;
  if v_live then
    raise exception 'FAIL phase 4: sweep never stands down after the week ends';
  end if;
  checks := checks + 1;

  -- The finished week stays the scoring slate until the next one approaches.
  select * into s from public.current_slate();
  if s.week is distinct from 3 or s.season_type is distinct from 1::smallint then
    raise exception 'FAIL phase 4: scoring slate drifted off preseason week 3, got type % week %',
      s.season_type, s.week;
  end if;
  checks := checks + 1;

  /* The sweep and the screen part company here, deliberately. Eight hours past
   * the last kickoff there is nothing left to ingest, but somebody opening the
   * app over breakfast still wants last night's result rather than an empty
   * board for a week that is four days away. The screen's tail is 12h, the
   * sweep's is 6h, and this is the window where that difference shows. */
  select * into ls from public.lineup_slate();
  if ls.week is distinct from 3 or not ls.in_play then
    raise exception 'FAIL phase 4: result gone 8h after the whistle, got week % in_play %',
      ls.week, ls.in_play;
  end if;
  checks := checks + 1;

  /* ---- phase 5: the roll forward ---------------------------------------
   * Past the 12h tail the week is done with, and the screen becomes a form for
   * the next one. If this never fires the lineup is stuck on a finished week
   * forever, which is the same bug as phase 2 with the sign reversed. */
  update public.games
     set starts_at = now() - interval '13 hours', status_state = 'final'
   where season = 2026 and season_type = 1 and week = 3;

  if exists (select 1 from public.slate_in_play()) then
    raise exception 'FAIL phase 5: week 3 is still in play 13h after its last kickoff';
  end if;
  checks := checks + 1;

  select * into ls from public.lineup_slate();
  if ls.week is distinct from 4 or ls.in_play then
    raise exception 'FAIL phase 5: screen did not roll to week 4, got week % in_play %',
      ls.week, ls.in_play;
  end if;
  checks := checks + 1;

  raise notice 'OK — % assertions across the % arc', checks, procedure_note;
end $$;

rollback;
