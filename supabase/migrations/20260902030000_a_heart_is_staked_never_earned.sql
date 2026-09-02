-- Winning gives you coins. It does not give you a heart back.
--
-- ---------------------------------------------------------------------------
-- WHAT `hearts_on_win` WAS FOR, AND WHY THAT ARGUMENT HAS EXPIRED
-- ---------------------------------------------------------------------------
--
-- `20260825130000_contest_stakes` introduced it with a real problem behind it:
--
--     four systems in this game take things away and only the dailies give
--     anything back. A resource that can only ever drain is a countdown, not a
--     mechanic — the player's whole relationship with it is watching it go.
--
-- That was written when a contest had NOTHING ELSE to pay. The same migration
-- says so in as many words: a heart was the reward "for as long as there is no
-- gem prize pool to be the reward instead". It was a placeholder wearing a
-- mechanic's clothes.
--
-- There is a pool now, and it is 90% of everything collected
-- (`20260901020000`). The Main Event pays its winner more than a Pro Pack. So
-- the question "what do I win" has a good answer that is denominated in the
-- currency the player actually keeps score in, and the placeholder can go.
--
-- ---------------------------------------------------------------------------
-- AND IT WAS NEVER A GOOD ANSWER TO THAT QUESTION
-- ---------------------------------------------------------------------------
--
-- "You won, so you keep the thing you would have lost" is not a prize. It is
-- the absence of a punishment, printed in the column headed WIN — and on the
-- lobby it read exactly that way: `RISK ♥1` on the left, `WIN ♥+1` on the
-- right, the same glyph twice, cancelling out. A player scanning that row
-- learns nothing about what the contest is FOR.
--
-- A heart is the price of admission to a contest that can end your run. Prices
-- are not refunded for good play; that is what the pool is.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES TO A RUN, STATED PLAINLY
-- ---------------------------------------------------------------------------
--
-- `settle_run_week` is the only writer of `runs.hearts` and its delta is
-- `+hearts_on_win` on a win, `-hearts_at_risk` on a loss. With every
-- `hearts_on_win` at nought there is NO PATH BACK UP. A run starts at five
-- (`run_starting_hearts`), only ever falls, wipes at nought, and the next run
-- starts at five again.
--
-- That is a deliberate shape and not an oversight: five lives, spent, then a
-- wipe you carry cards out of. It is the ordinary roguelike bargain, and the
-- run's tension comes from the descent being one-way.
--
-- `run_max_hearts` (8) IS NOW UNREACHABLE and is left in place rather than
-- dropped. It is the ceiling `settle_run_week` clamps to, it costs nothing
-- while nothing approaches it, and it is exactly the config a future healing
-- mechanic — a set reward, a milestone, a run-length bonus — would want to find
-- already wired. Dropping it would mean rebuilding the clamp to restore it.
--
-- The column `hearts_on_win` is likewise KEPT, at nought everywhere and with a
-- check that holds it there. Dropping it would mean rewriting `settle_run_week`,
-- `contest_lobby`, `my_contest_cards`, `contest_history` and the client types
-- that read it — a large change to express "this is zero", when a constraint
-- expresses it exactly and reverses in one line.
--
-- ---------------------------------------------------------------------------
-- WEEKS THAT HAVE NOT KICKED OFF, THE SAME LINE AS EVERY OTHER RE-TERMING
-- ---------------------------------------------------------------------------
--
-- `week_has_started` again (`20260901020000`). A week being played has hearts
-- already wagered against terms the player accepted, and `run_contest_results`
-- freezes what a contest did to a run at settlement precisely so that re-tuning
-- cannot reach back into it. A settled row keeps the heart it paid.

-- ------------------------------------------------------------------ template

update public.contest_templates set hearts_on_win = 0 where hearts_on_win <> 0;

-- Dropped first so the file re-runs. `supabase db push` has no transaction, so
-- a migration that fails below this line stays half-applied and the re-run has
-- to get past it — the same reason `20260901050000` creates its table with
-- `if not exists`.
alter table public.contest_templates drop constraint if exists contest_templates_win_no_hearts;
alter table public.contest_templates
  add constraint contest_templates_win_no_hearts check (hearts_on_win = 0);

-- ------------------------------------------------------------------ contests

update public.contests c
   set hearts_on_win = 0
 where c.hearts_on_win <> 0
   and not public.week_has_started(c.season, c.season_type, c.week);

alter table public.contests drop constraint if exists contests_win_no_hearts;
alter table public.contests
  add constraint contests_win_no_hearts
    check (hearts_on_win = 0) not valid;

-- NOT VALID, and this is the one place that word appears in the schema, so it
-- is worth saying why. A week already in play keeps its terms — that is the
-- rule above — so a contest mid-week may legitimately still carry a 1 here.
-- A validating constraint would refuse to be added at all while one exists.
-- `not valid` enforces it on every future insert and update, which is the whole
-- requirement, and leaves the in-flight rows alone to settle as promised.
--
-- It can be validated once the last of them has finalised:
--   alter table public.contests validate constraint contests_win_no_hearts;

comment on column public.contests.hearts_on_win is
  'Hearts a win heals. Nought everywhere and constrained to it since 20260902030000: a heart is the price of entering a contest that can end a run, and the pool is what winning pays. Kept as a column rather than dropped so a future healing mechanic has somewhere to land.';

-- ---------------------------------------------------------------- assertions

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from public.contest_templates where hearts_on_win <> 0;
  if v_bad > 0 then
    raise exception '% templates still heal a heart', v_bad;
  end if;

  -- Every contest that has not kicked off. The ones that have are the
  -- deliberate exception and are excluded on exactly the same test that
  -- excluded them from the update.
  select count(*) into v_bad
    from public.contests c
   where c.hearts_on_win <> 0
     and not public.week_has_started(c.season, c.season_type, c.week);
  if v_bad > 0 then
    raise exception '% unplayed contests still heal a heart', v_bad;
  end if;
end $$;
