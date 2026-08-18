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
-- Every timestamp is set relative to now(), so this does not rot after Aug 21.
-- now() is fixed for the transaction, so "time" advances by moving the games.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/slate_transition.test.sql

begin;

do $$
declare
  s        record;
  v_live   boolean;
  v_score  jsonb;
  v_first  uuid;
  checks   int := 0;

  procedure_note constant text := 'slate transition';
begin
  /* Every mutation lives inside this block on purpose: the block is a single
   * statement, so a raise anywhere in it unwinds all of it. The test cannot
   * leave a shifted kickoff behind even if it is run outside a transaction. */

  -- Pin the surrounding weeks so the assertions describe week 3's arc alone.
  update public.games set starts_at = now() - interval '7 days', status_state = 'final'
   where season = 2026 and season_type = 1 and week = 2;
  update public.games set starts_at = now() + interval '7 days', status_state = 'scheduled'
   where season = 2026 and season_type = 1 and week = 4;
  -- Week 1 is a single game and sits behind week 2 throughout.
  update public.games set starts_at = now() - interval '14 days', status_state = 'final'
   where season = 2026 and season_type = 1 and week = 1;

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

  /* ---- phase 2: opener in progress, no box score yet --------------------
   * The live window. This is also the state the ingest function sees for its
   * first several sweeps: games targeted, zero stat lines published. */
  update public.games
     set starts_at = now() - interval '10 minutes', status_state = 'scheduled'
   where id = v_first;

  select * into s from public.current_slate();
  if s.week is distinct from 3 then
    raise exception 'FAIL phase 2: slate should be week 3, got %', s.week;
  end if;
  checks := checks + 1;

  select public.slate_is_live() into v_live;
  if not v_live then
    raise exception 'FAIL phase 2: sweep is asleep while a game is being played';
  end if;
  checks := checks + 1;

  -- Lineups must move on the moment the week starts; this is the bug that made
  -- the lineup screen permanently locked when both questions shared a function.
  select * into s from public.upcoming_slate();
  if s.week is distinct from 4 then
    raise exception 'FAIL phase 2: lineups should have moved to week 4, got %', s.week;
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
  if s.week is distinct from 3 then
    raise exception 'FAIL phase 4: scoring slate drifted off week 3, got %', s.week;
  end if;
  checks := checks + 1;

  raise notice 'OK — % assertions across the % arc', checks, procedure_note;
end $$;

rollback;
