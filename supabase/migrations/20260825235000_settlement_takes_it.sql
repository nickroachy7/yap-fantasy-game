-- Settlement wipes the runs it kills, in the same statement that kills them.
--
-- `20260825230000`'s body carries the reasoning; this is the one caller of
-- `wipe_run`, and the only place it may ever be called from. The change is the
-- death statement becoming a loop over `returning`, so the wipe happens on the
-- transition rather than at some later moment of the player's choosing.
--
-- Read back from the database rather than copied from the migration that last
-- defined it, per the standing rule in 20260824230000 — and per this session's
-- own regression in 20260825200000, which happened because a file that LOOKED
-- like the latest definition was not.

CREATE OR REPLACE FUNCTION public.settle_run_week(p_season integer, p_season_type smallint, p_week integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
       -- A contest with nothing at stake settles nothing. The free contest is
       -- scored by the sweep like always; it just never reaches a run.
       and c.hearts_at_risk > 0
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
           hearts = greatest(0, least(r.max_hearts, r.hearts + a.delta))
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

revoke execute on function public.settle_run_week(integer, smallint, integer) from public, anon, authenticated;
