-- Hearts come back, because the players asked for them.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS REVERSES AND WHY
-- ---------------------------------------------------------------------------
--
-- `20260903230000_the_run_stops_asking_for_hearts` took the stakes, the death
-- and the wipe out of the game, on an argument that was about SHAPE: a
-- one-way descent with no faucet, settling once a week on a real-world
-- calendar, sitting on top of a collection game whose every other system
-- accumulates. That argument was sound and it was also beside the point, because
-- it was reasoning about players rather than asking them. Nick asked them. They
-- want the hearts.
--
-- So this restores the mechanic to EXACTLY its pre-removal state — not to some
-- older or better one. Two things that look like part of hearts are deliberately
-- left as they are, because they were decided separately and are not this
-- migration's to reopen:
--
--   * `hearts_on_win` STAYS AT NOUGHT, held by `contests_win_no_hearts` and
--     `contest_templates_win_no_hearts`. That was `20260902030000`'s call — a
--     heart is the price of admission and prices are not refunded for good play,
--     the pool is what pays. It means there is still no faucet and a run still
--     only descends. That is a live design question and it is Nick's, not this
--     migration's.
--   * `contests_friendly_risks_no_hearts` stays. A manager-built contest has
--     never staked a heart and does not start now.
--
-- ---------------------------------------------------------------------------
-- THE ONE THING THAT MADE THIS SAFE TO DO TODAY
-- ---------------------------------------------------------------------------
--
-- A migration reaches every install the instant it is applied; the JavaScript
-- that explains it arrives over the following two launches. So restoring the
-- stakes and the wipe together, right now, would open a window in which a
-- tester still on the hearts-free build could stake a heart they cannot see,
-- lose a run they were never shown, and have their collection taken with no
-- screen anywhere that says why. That is the same rolling-deploy trap
-- `20260904003000` was written to close, pointing the other way.
--
-- IT IS CLOSED HERE BY THE ADOPTION RULE, WHICH ALREADY EXISTED FOR ANOTHER
-- REASON. Raising a contest's stake is not a data edit — it changes what every
-- live entry in that contest means — so only weeks that have NOT KICKED OFF are
-- adopted. The earliest unplayed week is 2026 regular season week 1, first kick
-- 2026-09-10, and settlement lands after the week completes. That is eleven days
-- before a single heart can move, against a client update that takes two app
-- launches. The window does not exist.
--
-- Weeks already in play keep `hearts_at_risk = 0` for ever. They were entered
-- under terms that said nothing was at stake, and that promise outlives the
-- reversal.


-- ═══════════════════════════════════════════════════════════════ 1. THE STAKES

-- The nought-constraints from the removal. Dropped rather than left with the
-- updates working around them: a check that says "this column is always zero"
-- is a statement about the game, and the statement is no longer true.
alter table public.contests
  drop constraint if exists contests_hearts_at_risk_is_nought;

alter table public.contest_templates
  drop constraint if exists contest_templates_hearts_at_risk_is_nought;

-- The catalogue, back to the values `20260901050000` seeded. Written out per
-- code rather than restored from a backup table, because there is no backup
-- table — the removal overwrote them in place, and these numbers only exist in
-- that migration's INSERT and in this comment. Anything not named here keeps
-- nought, which is the right default for a template added since.
update public.contest_templates t
   set hearts_at_risk = v.risk
  from (values
          ('warmup',     0),  -- the on-ramp: stakes nothing, and since
                              -- 20260902030000 pays nothing either
          ('flex3',      1),
          ('wr_room',    1),
          ('rb_room',    1),
          ('superflex',  1),
          ('double_up',  1),
          ('duel',       2),  -- two hearts on the table both ways
          ('main_event', 2)
       ) as v(code, risk)
 where t.code = v.code
   and t.hearts_at_risk is distinct from v.risk;

-- THE LIVE CONTESTS, AND ONLY THE UNPLAYED ONES. The week must have a schedule
-- and none of it may have started — both halves matter. `not exists (started)`
-- alone would be TRUE for a week with no games rows at all, which is how a
-- fixture-less or not-yet-imported week would quietly acquire stakes.
update public.contests c
   set hearts_at_risk = t.hearts_at_risk
  from public.contest_templates t
 where c.kind = 'lobby'
   and t.code = split_part(c.code, ':', 1)
   and c.hearts_at_risk is distinct from t.hearts_at_risk
   and exists (
     select 1 from public.games g
      where g.season = c.season and g.season_type = c.season_type and g.week = c.week
   )
   and not exists (
     select 1 from public.games g
      where g.season = c.season and g.season_type = c.season_type and g.week = c.week
        and g.starts_at <= now()
   );

-- The free contest is not in the catalogue — `ensure_free_contest` stamps it —
-- so it is restored on its own, to the 1 that `20260825270000` put there when
-- it decided the season record IS the run's health.
update public.contests c
   set hearts_at_risk = 1
 where c.kind = 'free'
   and c.hearts_at_risk is distinct from 1
   and exists (
     select 1 from public.games g
      where g.season = c.season and g.season_type = c.season_type and g.week = c.week
   )
   and not exists (
     select 1 from public.games g
      where g.season = c.season and g.season_type = c.season_type and g.week = c.week
        and g.starts_at <= now()
   );


-- ═════════════════════════════════════════════════════════ 2. NEW WEEKS STAKE

-- Back to stamping the stake at creation. This is the load-bearing half of
-- `20260825270000`: miss it and every week created from here on is silently
-- exempt, which is a hole that opens quietly and is noticed a month later.
create or replace function public.ensure_free_contest(
  p_season integer, p_season_type smallint, p_week integer)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id   uuid;
  v_code text := format('free:%s:%s:%s', p_season, p_season_type, p_week);
begin
  select id into v_id from public.contests where code = v_code;
  if v_id is not null then return v_id; end if;

  insert into public.contests (code, kind, format_code, season, season_type, week, name,
                               hearts_at_risk, hearts_on_win, podium_coins, podium_places)
  values (v_code, 'free', 'main', p_season, p_season_type, p_week,
          case when p_season_type = 1 then format('Preseason Week %s', p_week)
               else format('Week %s', p_week) end,
          1, 0, 700, 3)
  on conflict (code) do nothing
  returning id into v_id;

  if v_id is null then select id into v_id from public.contests where code = v_code; end if;
  return v_id;
end;
$function$;

-- The trigger, back to its narrow gate.
--
-- It reads INERT and that is correct. `set_lineup` resolves the run for any
-- contest with `hearts_at_risk > 0`, which after section 1 is most of them; this
-- trigger only ever covered the other case — a contest that PAYS a heart without
-- staking one (`20260901060000`, written for the Warm-Up) — and `hearts_on_win`
-- has been nought everywhere since `20260902030000`. So it fires for nothing
-- today, and exists so that a future faucet does not have to rediscover the bug
-- that migration was written for.
--
-- The removal had widened it to stamp unconditionally, which was right for a
-- world where the run was only a record. It is wrong now: an unconditional stamp
-- means a lineup in a nought-stake contest joins the run, and the moment that
-- contest's stake is ever raised the entry is retroactively charged.
create or replace function public.lineup_joins_the_run()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
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
$function$;


-- ═══════════════════════════════════════════════════════════════ 3. SETTLEMENT

-- `settle_run_week` GETS ITS SECOND JOB BACK: the hearts delta, the death, and
-- the wipe that rides on the same transition. Restored verbatim from the
-- definition that was live before the removal — including the two properties
-- that were expensive to learn and are invisible from the outside:
--
--   THE `returning` IN THE `dead` CTE IS WHAT MAKES THE WIPE EXACTLY-ONCE. Only
--   a run that was live before that statement appears in `dead`, so a second
--   pass over the same week ends nothing and wipes nothing. There is no settled
--   flag and there must not be one.
--
--   DEATH IS A SEPARATE STATEMENT because it has to see the CLAMPED hearts. A
--   run that took three hearts of damage holding one is at zero, not minus two,
--   and only the stored value knows that.
create or replace function public.settle_run_week(
  p_season integer, p_season_type smallint, p_week integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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


-- ═══════════════════════════════════════════════════════════════ 4. THE CLIENT

-- `my_run` replaces the shim from `20260904003000`, which existed only to keep
-- the pre-removal build's masthead alive and is now redundant: this is that
-- build's function, back.
--
-- The shim is a strict subset of this, so there is no window in either
-- direction — a client on the hearts-free build reads `id`, `wins` and `losses`
-- and finds them, and the restored build reads the rest and finds that too.
create or replace function public.my_run()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_run public.runs;
begin
  v_run := public.current_run();
  return jsonb_build_object(
    'id',           v_run.id,
    'started_at',   v_run.started_at,
    'hearts',       v_run.hearts,
    'max_hearts',   v_run.max_hearts,
    -- The rack the chrome draws: the most hearts this run has ever held, so
    -- the pips between it and `hearts` are BROKEN and not merely unfilled.
    'rack',         v_run.peak_hearts,
    'wagered',      coalesce((select sum(hearts_at_risk)::integer
                                from public.wagered_entries(v_run.user_id)), 0),
    'wagered_in',   (select count(*)::integer from public.wagered_entries(v_run.user_id)),
    'wins',         v_run.wins,
    'losses',       v_run.losses,
    'ended_at',     v_run.ended_at,
    'ended_reason', v_run.ended_reason,
    'awaiting_carry', (v_run.ended_at is not null and v_run.settled_at is null),
    'carry_slots',  public.run_carry_slots(v_run.wins),
    'next_rung',    (select jsonb_build_object('at_wins', min_wins, 'card_slots', card_slots)
                       from public.run_carry_ladder
                      where min_wins > v_run.wins
                      order by min_wins limit 1),
    'held_cards',   (select count(*) from public.card_instances
                      where user_id = v_run.user_id and is_held),
    -- Non-zero only on a death screen, and it is the size of the pool the carry
    -- is picked from.
    'lost_cards',   (select count(*) from public.card_instances
                      where user_id = v_run.user_id and wiped_by_run = v_run.id)
  );
end;
$function$;

-- THE GRANTS, AND THE SHIM LEFT A REAL HOLE HERE.
--
-- `20260904003000` created `my_run` fresh, and a function created without an
-- explicit grant gets EXECUTE for PUBLIC — which is exactly the trap
-- 20260827's notes describe. The shim has been sitting on
-- `=X/postgres` (PUBLIC) plus anon since it was applied. It is SECURITY DEFINER
-- over `auth.uid()`, so an anonymous caller gets "not authenticated" rather than
-- somebody else's run — but a SECURITY DEFINER function reachable by anon is
-- not a thing to leave lying about because today's body happens to be safe.
revoke all on function public.my_run() from public;
revoke all on function public.my_run() from anon;
grant execute on function public.my_run() to authenticated;

-- And `claim_carry` gets its grant back — the removal revoked it because the
-- death screen it serves had been deleted. The screen is back.
grant execute on function public.claim_carry(uuid[]) to authenticated;
