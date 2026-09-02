-- A contest that pays a heart and risks none never reached the run at all.
--
-- ---------------------------------------------------------------------------
-- THE BUG, WHICH THE WARM-UP WOULD HAVE SHIPPED
-- ---------------------------------------------------------------------------
--
-- Two places decide whether a contest has anything to do with the run, and both
-- ask the same question:
--
--     set_lineup        if v_c.hearts_at_risk > 0 then  <resolve the run>
--     settle_run_week   and c.hearts_at_risk > 0
--
-- That was exactly right while every heart in the game moved in the same
-- direction: `hearts_on_win` was introduced by `20260825130000` as the reward
-- side of a HARSH loss condition, so a contest that could pay a heart had
-- always staked one first, and "risks a heart" and "touches the run" were the
-- same set.
--
-- `20260901050000` breaks that. The Warm-Up risks nothing and pays one, on
-- purpose — it is the on-ramp, the only row a broke player can enter and the
-- only place a heart is free. Under the two conditions above it would have:
--
--   * entered with `run_id` null, because `set_lineup` never resolves a run for
--     a contest that stakes nothing; and
--   * been skipped by settlement anyway, because the gate is on `hearts_at_risk`.
--
-- So the row would have advertised "+1 heart", settled cleanly, recorded a W,
-- and paid nothing — silently, with no error anywhere. The most important row
-- in the new lobby would have been a lie on Sunday and correct-looking all
-- week, which is the worst failure shape available.
--
-- The question both sites want is not "does it risk a heart". It is DOES THIS
-- CONTEST MOVE HEARTS AT ALL, in either direction.
--
-- ---------------------------------------------------------------------------
-- WHY THE STAMP IS A TRIGGER AND NOT AN EDIT TO `set_lineup`
-- ---------------------------------------------------------------------------
--
-- `set_lineup` is three hundred lines of SECURITY DEFINER that every lineup in
-- the game is written through, and it has been rebuilt from a stale copy twice
-- (`20260824230000`, `20260825100000`) — each time silently reverting something
-- unrelated. Reprinting the whole body to widen one `if` is the change most
-- likely to break something that has nothing to do with this migration.
--
-- A BEFORE INSERT trigger that fills `run_id` when it is null is strictly
-- narrower than any edit to that function: it can only ever set a column that
-- nobody set, on a row being created.
--
-- IT DOES NOT NEED TO BE ORDERED AGAINST ANYTHING, and that was worth checking
-- rather than assuming. `20260825020000` once had a `lineups_default_to_the_
-- free_contest` trigger filling `contest_id`, which this would have had to fire
-- after; it is gone — `set_lineup` took the job over — and `public.lineups`
-- carries exactly one trigger today, `lineups_match_their_contest`, which
-- validates and never assigns. `contest_id` is NOT NULL and always supplied by
-- the caller, so it is populated by the time any BEFORE INSERT trigger reads
-- it, whichever order they run in.
--
-- It also composes correctly with what `set_lineup` still does. For every
-- contest that stakes a heart, `set_lineup` resolves the run FIRST — including
-- the refusal that stops a dead run entering a paid row, and the deliberate
-- exception that lets a dead run keep its free contest with a null run. Those
-- rows arrive here with `run_id` already decided and the trigger leaves them
-- alone. Only a row that reached the table with no run and a contest that can
-- PAY one is touched, which is precisely the case that had no owner.
--
-- ---------------------------------------------------------------------------
-- A DEAD RUN IS NOT REVIVED BY WINNING A FREE CONTEST
-- ---------------------------------------------------------------------------
--
-- The trigger stamps only a LIVE run — `ended_at is null` — so a player whose
-- run has ended enters The Warm-Up with a null run and settles as they do now:
-- the result is recorded, no hearts move, and the way back is the carry, not a
-- freeroll. `settle_run_week`'s `applied` step already refuses an ended run, so
-- this is the second lock on the same door rather than the only one.
--
-- It does not START a run either. `current_run()` creates one on demand and is
-- deliberately not called here: a trigger that mints a run as a side effect of
-- an insert is a surprising place for the game's central object to come from.
-- Every account gets a run through the free contest, which stakes a heart, is
-- auto-entered and cannot be left — so by the time anybody reaches The Warm-Up
-- there is a run for it to find.

-- ---------------------------------------------------------------- the stamp

create or replace function public.lineup_joins_the_run()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_pays boolean;
begin
  -- Already decided by `set_lineup`, including the deliberate nulls. Nothing
  -- to do, and nothing here may override that decision.
  if new.run_id is not null then
    return new;
  end if;

  select c.hearts_on_win > 0 into v_pays
    from public.contests c where c.id = new.contest_id;

  if coalesce(v_pays, false) then
    select r.id into new.run_id
      from public.runs r
     where r.user_id = new.user_id and r.ended_at is null;
  end if;

  return new;
end;
$$;

create trigger lineups_join_the_run
  before insert on public.lineups
  for each row execute function public.lineup_joins_the_run();

-- The assumption the trigger rests on, asserted rather than trusted: nothing
-- else on this table ASSIGNS during BEFORE INSERT, so there is no ordering to
-- get right. If a future migration adds one that does, this fails here — at
-- push time, with the name of the trigger that broke the assumption — rather
-- than by silently stamping a null run on somebody's entry.
do $$
declare v_others text;
begin
  select string_agg(tgname, ', ' order by tgname) into v_others
    from pg_trigger
   where tgrelid = 'public.lineups'::regclass
     and not tgisinternal
     and tgname not in ('lineups_join_the_run', 'lineups_match_their_contest');

  if v_others is not null then
    raise exception
      'public.lineups grew triggers this migration has not considered: %', v_others;
  end if;
end $$;

-- ------------------------------------------------------------- settlement

-- `20260825250000`'s live body, with one condition widened and nothing else
-- touched. The gate now asks whether the contest moves hearts in EITHER
-- direction; every other line — the null-result guard, the clamp, the rack, the
-- exactly-once death transition and the wipe riding on it — is verbatim.
create or replace function public.settle_run_week(
  p_season integer, p_season_type smallint, p_week integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_recorded integer := 0;
  v_died     integer := 0;
  v_dead     record;
begin
  with scored as (
    select l.run_id, c.id as contest_id, l.user_id, l.id as lineup_id, r.result,
           (case when r.result = 'W' then  c.hearts_on_win
                 when r.result = 'L' then -c.hearts_at_risk
                 else 0 end)::smallint as hearts_delta
      from public.contests c
      join public.lineups l
        on l.contest_id = c.id
      join lateral public.contest_results(c.id) r
        on r.lineup_id = l.id
     where c.season = p_season
       and c.season_type = p_season_type
       and c.week = p_week
       -- A contest that moves no hearts settles nothing. Widened from
       -- `hearts_at_risk > 0` by 20260901060000: a contest can now PAY a heart
       -- without staking one, and the old test skipped exactly those.
       and (c.hearts_at_risk > 0 or c.hearts_on_win > 0)
       -- An entry filed before this feature existed, or filed into a contest
       -- whose stake was raised above zero after the fact, carries no run and
       -- cannot retroactively be charged for one.
       and l.run_id is not null
       -- Null is NO RESULT — week not final, field too small, did not enter.
       -- It must never reach the ledger, because a row here is permanent.
       and r.result is not null
  ),
  fresh as (
    insert into public.run_contest_results
      (run_id, contest_id, user_id, lineup_id, result, hearts_delta)
    select run_id, contest_id, user_id, lineup_id, result, hearts_delta from scored
    on conflict (run_id, contest_id) do nothing
    returning run_id, result, hearts_delta
  ),
  agg as (
    select run_id,
           count(*) filter (where result = 'W')::integer as wins,
           count(*) filter (where result = 'L')::integer as losses,
           coalesce(sum(hearts_delta), 0)::integer       as delta,
           count(*)::integer                             as rows_written
      from fresh group by run_id
  ),
  applied as (
    update public.runs r
       set wins   = r.wins   + a.wins,
           losses = r.losses + a.losses,
           -- Clamped both ends in one expression. The ceiling is what stops a
           -- long healing streak from banking a run into invulnerability; the
           -- floor is what makes "risk two hearts holding one" legal rather
           -- than a constraint violation.
           hearts = greatest(0, least(r.max_hearts, r.hearts + a.delta)),
           -- THE RACK ONLY EVER GROWS. It is the most hearts this run has held,
           -- and it is what broken pips are counted against — so healing above
           -- the starting three widens the rack permanently, and losing them
           -- again shows as damage rather than quietly shrinking the row.
           peak_hearts = greatest(r.peak_hearts,
                                  greatest(0, least(r.max_hearts, r.hearts + a.delta)))
      from agg a
     where r.id = a.run_id
       -- A run that died on an earlier week still has its later entries
       -- recorded above — they are history — but they cost and pay nothing.
       -- Re-opening a dead run to charge it is how a settled carry gets
       -- silently invalidated.
       and r.ended_at is null
    returning 1
  )
  select coalesce(sum(rows_written), 0) into v_recorded from agg;

  -- Death is its own statement rather than a CASE in the update above, because
  -- it has to see the CLAMPED result. A run that took three hearts of damage
  -- holding one is at zero, not at minus two, and only the stored value knows.
  --
  -- AND THE WIPE RIDES ON THE SAME TRANSITION. `returning` is what makes this
  -- exactly-once: only a run that was live before this statement appears in
  -- `dead`, so a second pass over the same week finds nothing to end and wipes
  -- nothing. There is deliberately no gap between ending a run and taking it —
  -- every gap is somewhere a player can act, and 20260825230000 sets out what
  -- they did with the last one.
  for v_dead in
    with dead as (
      update public.runs
         set ended_at = now(), ended_reason = 'out_of_hearts'
       where ended_at is null and hearts = 0
      returning id
    ) select id from dead
  loop
    perform public.wipe_run(v_dead.id);
    v_died := v_died + 1;
  end loop;

  return jsonb_build_object(
    'season', p_season, 'season_type', p_season_type, 'week', p_week,
    'results_recorded', v_recorded, 'runs_ended', v_died);
end;
$function$;

revoke execute on function public.settle_run_week(integer, smallint, integer)
  from public, anon, authenticated;
