-- A run remembers the most hearts it ever held, so a lost one can be drawn.
--
-- ---------------------------------------------------------------------------
-- WHY A BROKEN HEART NEEDS A RACK TO BE BROKEN AGAINST
-- ---------------------------------------------------------------------------
--
-- The chrome draws three states — safe, wagered, broken — and the third one is
-- not a property of a heart. It is a property of a GAP: the difference between
-- how many hearts you hold and how many pips the row is drawing. So the whole
-- question is what sets the width of that row, and the two obvious answers are
-- both wrong.
--
--   `max_hearts` (5) — this is the bug 20260825210000 fixed. A run starts on 3
--   and heals to a ceiling of 5, so a brand-new player opened the app to three
--   filled hearts and two empty ones: nothing lost, drawn as two losses.
--
--   `run_starting_hearts` (3) — correct right up until somebody wins a WR Room
--   and heals to 4, at which point the run holds more hearts than the rack has
--   room for and the fourth has nowhere to go.
--
-- The rack is a HIGH-WATER MARK, and it has to be stored because it cannot be
-- derived: a run at 3 of a possible 5 might have started at 3 and never been
-- touched, or climbed to 4 and lost one. Those are different situations and
-- the player can tell them apart; `hearts` and `max_hearts` between them
-- cannot.
--
-- ---------------------------------------------------------------------------
-- IT ONLY EVER GROWS, WITHIN A RUN
-- ---------------------------------------------------------------------------
--
-- Healing widens it permanently and losing never narrows it, which is what
-- makes damage visible: a run that climbed to 4 and dropped back to 3 draws
-- three solid and one broken, rather than silently becoming a three-heart run
-- again. A row that shrank when you were hurt would hide the hurt.
--
-- It resets with the run, because it is scoped to one. A new run starts on its
-- starting hearts with a rack of exactly that — no history, nothing broken.
--
-- ---------------------------------------------------------------------------
-- ON THE GRAVEYARD OBJECTION, WHICH WAS MINE AND WAS WRONG IN PART
-- ---------------------------------------------------------------------------
--
-- The argument against drawing losses at all was that a permanent tally makes
-- a healthy run look damaged. That is true of HEADROOM — pips for hearts you
-- never had — and it is why `max_hearts` is still not drawn anywhere. It is not
-- true of a loss you actually took. "Two of my three are gone" is the single
-- most decision-relevant thing about a run, it is exactly the fact the pips are
-- best at carrying, and a row that showed only what remained made a run one
-- loss from death look identical to a fresh one at the same count.

alter table public.runs
  add column peak_hearts smallint;

-- Existing runs have no history to recover, so the rack starts where they are.
-- A run mid-flight that had already lost a heart will therefore under-report
-- that one loss, once, and be exact from its next settlement onward. Better
-- than inventing damage that cannot be verified.
update public.runs set peak_hearts = greatest(hearts, 1);

alter table public.runs
  alter column peak_hearts set not null,
  add constraint runs_peak_at_least_hearts check (peak_hearts >= hearts),
  add constraint runs_peak_within_max      check (peak_hearts <= max_hearts);

comment on column public.runs.peak_hearts is
  'The most hearts this run has ever held. The rack the chrome draws against, so the gap between it and `hearts` is BROKEN rather than merely unfilled. Grows on healing, never shrinks, resets with the run.';

CREATE OR REPLACE FUNCTION public.current_run()
 RETURNS runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_run  public.runs;
  v_h    integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_run from public.runs
   where user_id = v_user and ended_at is null;
  if found then
    return v_run;
  end if;

  -- Dead and unanswered. Returned as-is; the client shows the death screen and
  -- calls `claim_carry`, which is what starts the next one.
  select * into v_run from public.runs
   where user_id = v_user and ended_at is not null and settled_at is null
   order by ended_at desc limit 1;
  if found then
    return v_run;
  end if;

  v_h := public.game_config_value('run_starting_hearts', 3);

  insert into public.runs (user_id, hearts, max_hearts, peak_hearts)
  values (v_user, v_h, greatest(v_h, public.game_config_value('run_max_hearts', 5)), v_h)
  returning * into v_run;

  return v_run;
end;
$function$;

revoke execute on function public.current_run() from public, anon;
grant  execute on function public.current_run() to authenticated;

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

revoke execute on function public.settle_run_week(integer, smallint, integer) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_carry(p_card_instance_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user     uuid := auth.uid();
  v_run      public.runs;
  v_slots    smallint;
  v_keep     uuid[] := coalesce(p_card_instance_ids, '{}');
  v_bad      integer;
  v_restored integer := 0;
  v_lost     integer := 0;
  v_h        integer;
  v_new      public.runs;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Locked: a double-tap on a death screen is the likeliest way this is ever
  -- called twice, and the second call must find the run already settled.
  select * into v_run
    from public.runs
   where user_id = v_user and ended_at is not null and settled_at is null
   order by ended_at desc
     for update
   limit 1;

  if not found then
    raise exception 'you have no ended run waiting to be claimed'
      using errcode = '22023';
  end if;

  v_slots := public.run_carry_slots(v_run.wins);

  if array_length(v_keep, 1) is not null and array_length(v_keep, 1) > v_slots then
    raise exception '% win(s) lets you keep % card(s), and you named %',
      v_run.wins, v_slots, array_length(v_keep, 1)
      using errcode = '22023';
  end if;

  -- Named twice is a client bug, and de-duplicating it silently would hand the
  -- player fewer cards than the ladder owes them.
  if array_length(v_keep, 1) is not null
     and array_length(v_keep, 1) <> (select count(distinct x) from unnest(v_keep) x) then
    raise exception 'the same card was named more than once' using errcode = '22023';
  end if;

  -- ONLY WHAT THIS RUN TOOK. Ownership is implied by `wiped_by_run` — the wipe
  -- only ever touched this user's cards — but it is checked anyway, because
  -- this is the one function that can put a card back into a collection.
  select count(*) into v_bad
    from unnest(v_keep) x(id)
    left join public.card_instances ci
           on ci.id = x.id
          and ci.user_id = v_user
          and ci.wiped_by_run = v_run.id
   where ci.id is null;

  if v_bad > 0 then
    raise exception 'you can only keep a card this run took from you'
      using errcode = '42501';
  end if;

  select count(*) into v_lost
    from public.card_instances
   where user_id = v_user and wiped_by_run = v_run.id;

  if array_length(v_keep, 1) is not null then
    update public.card_instances
       set sold_at = null, sold_for = null, wiped_at = null, wiped_by_run = null
     where id = any (v_keep);
    get diagnostics v_restored = row_count;
  end if;

  -- Close the run out and open the next one, both here: a player left holding
  -- a settled dead run and no live one has no way to ask for another.
  update public.runs set settled_at = now() where id = v_run.id;

  v_h := public.game_config_value('run_starting_hearts', 3);
  insert into public.runs (user_id, hearts, max_hearts, peak_hearts)
  values (v_user, v_h, greatest(v_h, public.game_config_value('run_max_hearts', 5)), v_h)
  returning * into v_new;

  return jsonb_build_object(
    'ended_run',   v_run.id,
    'wins',        v_run.wins,
    'losses',      v_run.losses,
    'carry_slots', v_slots,
    'restored',    v_restored,
    'cards_lost',  v_lost - v_restored,
    'new_run',     v_new.id,
    'hearts',      v_new.hearts);
end;
$function$;

revoke execute on function public.claim_carry(uuid[]) from public, anon;
grant  execute on function public.claim_carry(uuid[]) to authenticated;

CREATE OR REPLACE FUNCTION public.my_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

revoke execute on function public.my_run() from public, anon;
grant  execute on function public.my_run() to authenticated;
