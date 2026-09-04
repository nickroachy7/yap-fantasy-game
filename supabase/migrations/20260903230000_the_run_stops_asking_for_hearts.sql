-- The run stops asking for hearts.
--
-- ---------------------------------------------------------------------------
-- WHAT IS BEING REMOVED, AND WHAT A RUN IS AFTERWARDS
-- ---------------------------------------------------------------------------
--
-- Hearts were a life count. A run started at five (`run_starting_hearts`), a
-- contest took one on a loss, and at nought `settle_run_week` ended the run and
-- called `wipe_run` in the same statement — which sold every held card for
-- nought and zeroed the wallet. `claim_carry` then handed a few cards back off
-- a win ladder and opened the next run.
--
-- None of that survives this migration. What survives is the RUN AS A RECORD:
-- a row per player, a W and an L per settled contest in `run_contest_results`,
-- and `runs.wins` / `runs.losses` counting them. That is the half every other
-- surface in the game was already reading, and it costs nothing to keep.
--
-- ---------------------------------------------------------------------------
-- WHY, IN THE ORDER THE ARGUMENTS ACTUALLY LAND
-- ---------------------------------------------------------------------------
--
-- 1. A ONE-WAY RESOURCE ON A WEEKLY CLOCK IS A CHURN TIMER, NOT A MECHANIC.
--    `20260902030000` zeroed every `hearts_on_win` and said so plainly: "there
--    is NO PATH BACK UP". It called that the ordinary roguelike bargain, and in
--    a roguelike it is — because a roguelike pays for a one-way descent with
--    INSTANT RE-ENTRY. You die, you restart, you are playing again in seconds.
--    Here death arrives at settlement on a Tuesday morning while nobody is
--    looking, and restarting means waiting until Sunday with an empty
--    collection. The compensation that makes permadeath bearable does not exist
--    on an NFL calendar.
--
-- 2. IT WAS THE ONE SUBTRACTIVE SYSTEM IN AN ACCUMULATIVE GAME. Packs, tiers,
--    career fp, sets, the leaderboard, friends, private leagues — all of it
--    builds over a season, and `wipe_run` could delete the output of every one
--    of them in a cron job the player does not watch run.
--
-- 3. THE RESOURCE HAD TWO JOBS THAT PULLED APART. It was a life count AND the
--    lobby's entry cost — `20260831010000` moved the starting count from three
--    to five "for a reason that has nothing to do with difficulty", because the
--    contest cap needed it. Every difficulty tune moved the cap and back again.
--
--    The second job turns out to have been advertising only: NOTHING IN
--    `set_lineup` EVER CHARGED OR CAPPED ON HEARTS. The rail drew a pip per
--    entry and the copy called it a price, but the server's only refusal was
--    the dead-run one removed below. So no cap is lost here and none is added;
--    the fee is the price of entry and always was.
--
-- 4. WHAT REPLACES THE STAKE ALREADY EXISTS. `20260825270000` staked the free
--    contest precisely so an 8-slot lineup could not go 0-18 for nothing, and
--    that was right on the day. There was no prize pool then. There is now —
--    90% of everything collected (`20260901020000`) — plus contest prizes, the
--    leaderboard, and per-card tier progression. Losing costs you the fee and
--    the prize, denominated in the currency the player keeps score in.
--
-- ---------------------------------------------------------------------------
-- NOTHING HAS EVER BEEN WIPED, WHICH IS WHY THIS IS A CLEAN REMOVAL
-- ---------------------------------------------------------------------------
--
-- Checked before writing this: zero rows in `card_instances` with
-- `wiped_by_run` set, zero `run_wipe` rows in `coins_ledger`, and no `runs` row
-- with `ended_at`. Every run in the database is live. So there is no wiped card
-- to restore, no burnt wallet to refund, and no half-settled death to reason
-- about — the mechanic is being switched off before it ever fired.
--
-- ---------------------------------------------------------------------------
-- THE COLUMNS AND THE DEAD MACHINERY STAY, AT NOUGHT
-- ---------------------------------------------------------------------------
--
-- `hearts_at_risk`, `hearts_on_win`, `runs.hearts`, `peak_hearts`,
-- `run_contest_results.hearts_delta`, `wipe_run`, `claim_carry`,
-- `run_carry_ladder` — all kept, all inert. This is the same call
-- `20260902030000` made for `hearts_on_win` and for the same two reasons:
--
--   THE ALTERNATIVE IS SURGERY ON THE WRONG FUNCTIONS. `contest_lobby`,
--   `my_contest_cards`, `contest_history`, `contest_results` and
--   `create_friendly_contest` all name these columns in their RETURN types, so
--   dropping the columns means drop-and-recreate on five large functions —
--   every one of which loses its ACL on the way past (`20260828...`, the
--   gotcha that silently hands `PUBLIC` back `EXECUTE`). The client has stopped
--   reading the fields; an extra nought in a row it ignores costs nothing.
--
--   AND A MINI-GAME IS THE STATED INTENT. Hearts may come back as something of
--   their own rather than as a tax on the season. The machinery a future one
--   wants is exactly what is here, and rebuilding `wipe_run`'s
--   sold_at/wiped_at/wiped_by_run handling from scratch would be the expensive
--   half.
--
-- WHAT MAKES "INERT" TRUE RATHER THAN HOPEFUL is the pair of CHECK constraints
-- below. Every stake is set to nought and then held there, so a contest cannot
-- quietly acquire one again from a template edit, a seed, or a hand-written
-- update — which is how a dormant mechanic normally comes back: not by being
-- turned on, but by nobody noticing it was never turned off.

-- ═══════════════════════════════════════════════════════════ 1. THE STAKES

-- Every live contest and every template down to nought, and then held there.
-- 196 contests carried a stake at the time of writing: 156 at one, 36 at two,
-- and four of the old WR Rooms that also paid one.
update public.contest_templates
   set hearts_at_risk = 0, hearts_on_win = 0
 where hearts_at_risk <> 0 or hearts_on_win <> 0;

update public.contests
   set hearts_at_risk = 0, hearts_on_win = 0
 where hearts_at_risk <> 0 or hearts_on_win <> 0;

-- The pair that makes it stay true. `hearts_on_win` already had one from
-- 20260902030000; this adds its twin and does not disturb it.
alter table public.contests
  drop constraint if exists contests_hearts_at_risk_is_nought;
alter table public.contests
  add constraint contests_hearts_at_risk_is_nought check (hearts_at_risk = 0);

alter table public.contest_templates
  drop constraint if exists contest_templates_hearts_at_risk_is_nought;
alter table public.contest_templates
  add constraint contest_templates_hearts_at_risk_is_nought check (hearts_at_risk = 0);

-- The free contest is created fresh every week, so the stake has to come out of
-- the constructor too or week 5 arrives with a heart on it and trips the check
-- above. Reprinted from the live definition; the only change is `1, 0` to
-- `0, 0` on the insert.
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
          0, 0, 700, 3)
  on conflict (code) do nothing
  returning id into v_id;

  if v_id is null then select id into v_id from public.contests where code = v_code; end if;
  return v_id;
end;
$function$;


-- ══════════════════════════════════════════════ 2. THE ENTRY JOINS THE RUN

-- WHAT THIS TRIGGER IS FOR NOW, AND WHY IT HAD TO CHANGE AT ALL.
--
-- Both writers of `lineups.run_id` gated on hearts. `set_lineup` resolved a run
-- only when `hearts_at_risk > 0`; this trigger filled a null one only when the
-- contest paid a heart (widened to that by 20260901060000, when the Warm-Up
-- could pay without staking). With every stake at nought, BOTH GATES CLOSE —
-- and a lineup with a null `run_id` is skipped by `settle_run_week`, so the
-- W/L record would have stopped being written the moment this migration
-- applied. Silently: no error, just a season record frozen at whatever it was.
--
-- The question both sites were really asking was "does this contest touch the
-- run". Every contest does now, because the run is the record and the record is
-- every contest. So the gate goes entirely.
--
-- STILL ONLY FROM NULL. `set_lineup` stamps the run at entry on purpose — a
-- week can settle after the entry was filed, and re-pointing a stamped entry at
-- whatever run is live at settlement is the wrong-run bug 20260825150000 exists
-- to prevent. That rule is unchanged and this only ever fills a blank.
create or replace function public.lineup_joins_the_run()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Already decided by `set_lineup`. Nothing to do, and nothing here may
  -- override that decision.
  if new.run_id is not null then
    return new;
  end if;

  select r.id into new.run_id
    from public.runs r
   where r.user_id = new.user_id and r.ended_at is null;

  return new;
end;
$function$;

-- The entries already filed under the old gates. Five lineups had a null
-- `run_id` at the time of writing — filed into contests that staked nothing —
-- and without this they would sit out the record for ever. Only ever from null,
-- for the reason above, and only into a live run.
update public.lineups l
   set run_id = r.id
  from public.runs r
 where l.run_id is null
   and r.user_id = l.user_id
   and r.ended_at is null;


-- ═══════════════════════════════════════════════════════════ 3. SETTLEMENT

-- `settle_run_week` KEEPS ITS FIRST JOB AND LOSES ITS SECOND.
--
-- It did two things in one pass: record what happened (a row per entry in
-- `run_contest_results`, and the W/L counters on the run), and apply what it
-- cost (the hearts delta, the death, the wipe). The first is the season record
-- and stays exactly as it was. The second is gone.
--
-- FOUR CHANGES, AND THE FIRST IS THE ONE THAT MATTERS:
--
--   THE GATE IS OFF HEARTS. `and (c.hearts_at_risk > 0 or c.hearts_on_win > 0)`
--   selected the contests that moved hearts, which after section 1 is none of
--   them — leaving this function correct, running weekly, and recording
--   nothing. The gate is now what it was always standing in for: an entry with
--   a run and a result.
--
--   `hearts_delta` IS WRITTEN AS NOUGHT rather than dropped. The column is not
--   null and the row is the permanent record of the week; a nought says
--   truthfully that this contest moved no hearts.
--
--   THE `runs` UPDATE STOPS TOUCHING `hearts` AND `peak_hearts`. Wins and
--   losses still accumulate. `ended_at is null` stays in the where clause even
--   though nothing can end a run any more: a run ended by the old code (none
--   exist, but this function outlives that fact) must not start accruing again.
--
--   THE DEATH BLOCK IS DELETED OUTRIGHT — the `update ... set ended_at` and the
--   `perform public.wipe_run(...)` loop under it. This is the change the whole
--   migration is for. `runs_ended` stays in the returned jsonb, always nought,
--   because the gameday sweep logs this payload and a key vanishing from a log
--   line is harder to read than a key that has gone quiet.
create or replace function public.settle_run_week(
  p_season integer, p_season_type smallint, p_week integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_recorded integer := 0;
begin
  with scored as (
    select l.run_id, c.id as contest_id, l.user_id, l.id as lineup_id, r.result
      from public.contests c
      join public.lineups l
        on l.contest_id = c.id
      join lateral public.contest_results(c.id) r
        on r.lineup_id = l.id
     where c.season = p_season
       and c.season_type = p_season_type
       and c.week = p_week
       -- An entry filed before runs existed carries none and cannot be
       -- retroactively given one. `lineup_joins_the_run` stamps every new
       -- entry, so this is effectively only history.
       and l.run_id is not null
       -- Null is NO RESULT — week not final, field too small, did not enter.
       -- It must never reach the ledger, because a row here is permanent.
       and r.result is not null
  ),
  fresh as (
    insert into public.run_contest_results
      (run_id, contest_id, user_id, lineup_id, result, hearts_delta)
    select run_id, contest_id, user_id, lineup_id, result, 0 from scored
    on conflict (run_id, contest_id) do nothing
    returning run_id, result
  ),
  agg as (
    select run_id,
           count(*) filter (where result = 'W')::integer as wins,
           count(*) filter (where result = 'L')::integer as losses,
           count(*)::integer                             as rows_written
      from fresh group by run_id
  ),
  applied as (
    update public.runs r
       set wins   = r.wins   + a.wins,
           losses = r.losses + a.losses
      from agg a
     where r.id = a.run_id
       -- A run ended by the old heart code still has its later entries recorded
       -- above — they are history — but its counters are closed.
       and r.ended_at is null
    returning 1
  )
  select coalesce(sum(rows_written), 0) into v_recorded from agg;

  return jsonb_build_object(
    'season', p_season, 'season_type', p_season_type, 'week', p_week,
    'results_recorded', v_recorded, 'runs_ended', 0);
end;
$function$;


-- ══════════════════════════════════════════════════════════ 4. `set_lineup`

-- REPRINTED FROM THE LIVE DEFINITION, NOT FROM AN EARLIER MIGRATION. This
-- function has been rebuilt from a stale copy twice (20260824230000,
-- 20260825100000) and each time silently reverted something unrelated, so the
-- body below is `pg_get_functiondef` output from the running database with four
-- edits applied to it and nothing else touched.
--
-- The four, all of them heart plumbing:
--
--   THE SELECT no longer reads `hearts_at_risk` into `v_c`.
--   THE RUN IS RESOLVED UNCONDITIONALLY, and the dead-run refusal under it is
--     gone — see the note in the body.
--   THE SELF-HEALING STAMP on an edit no longer gates on a stake.
--   ITS COMMENT stops describing a heart advertised on a row that cannot cost
--     one.
--
-- Everything else — the roster cap, the fee and the wallet lock, the entrant
-- cap, the one-card-one-contest clash, the per-card lock, the slot diff — is
-- byte-for-byte what was running before this migration.

CREATE OR REPLACE FUNCTION public.set_lineup(p_season integer, p_season_type smallint, p_week integer, p_slots jsonb, p_contest_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_lineup  uuid;
  v_games   integer;
  v_blocked text;
  v_held    integer;
  v_cap     integer;
  v_contest uuid;
  v_format  text;
  v_clash   text;
  v_c       record;
  v_balance integer;
  v_entrants integer;
  v_run     public.runs;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be a json array' using errcode = '22023';
  end if;

  v_cap := public.game_config_value('roster_cap', 30);
  select count(*) into v_held
    from public.card_instances where user_id = v_user and is_held;

  if v_held > v_cap then
    raise exception
      'roster is over the limit: % of % cards. Commit % to a set or sell them to set your lineup.',
      v_held, v_cap, v_held - v_cap
      using errcode = '55006';
  end if;

  if p_contest_code is null then
    v_contest := public.ensure_free_contest(p_season, p_season_type, p_week);
  else
    select id into v_contest from public.contests where code = p_contest_code;
    if v_contest is null then
      raise exception 'no such contest: %', p_contest_code using errcode = '22023';
    end if;
  end if;

  select season, season_type, week, format_code, kind, entry_fee_coins, max_entrants, name
    into v_c
    from public.contests where id = v_contest;

  -- THE RUN IS RESOLVED BEFORE ANYTHING IS CHARGED, for every contest.
  --
  -- IT WAS CONDITIONAL ON A STAKE — `if v_c.hearts_at_risk > 0` — and carried a
  -- refusal underneath it: a player whose run had ended could not enter
  -- anything but the free contest until they took their carry. Both go with the
  -- hearts. Nothing ends a run now, so the refusal can never fire, and a run
  -- resolved only for contests that staked something would leave every entry
  -- unstamped and every result unrecorded.
  --
  -- `current_run()` CREATES ONE ON FIRST READ, which is why this is safe to
  -- call unconditionally: a player who has never entered anything gets a run
  -- here rather than a null, and the record starts on their first lineup.
  v_run := public.current_run();

  if (p_season, p_season_type, p_week) is distinct from (v_c.season, v_c.season_type, v_c.week) then
    raise exception 'contest % is for %/%/%, not %/%/%',
      coalesce(p_contest_code, 'free'), v_c.season, v_c.season_type, v_c.week,
      p_season, p_season_type, p_week
      using errcode = '22023';
  end if;
  v_format := v_c.format_code;

  select count(*) into v_games
    from public.games g
   where g.season = p_season and g.season_type = p_season_type and g.week = p_week;
  if v_games = 0 then
    raise exception 'no scheduled games for season % type % week %',
      p_season, p_season_type, p_week using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
      left join public.contest_format_slots c
             on c.format_code = v_format and c.slot = x.slot
     where c.slot is null or x.slot is null or x.card_instance_id is null
  ) then
    raise exception 'unknown or malformed lineup slot for format %', v_format
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
     group by x.slot having count(*) > 1
  ) then
    raise exception 'duplicate slot in payload' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
     group by x.card_instance_id having count(*) > 1
  ) then
    raise exception 'the same card cannot fill two slots' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
      left join public.card_instances ci
             on ci.id = x.card_instance_id
            and ci.user_id = v_user
            and ci.is_held
     where ci.id is null
  ) then
    raise exception 'card does not belong to you' using errcode = '42501';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
      join public.contest_format_slots c on c.format_code = v_format and c.slot = x.slot
      join public.card_instances     ci on ci.id  = x.card_instance_id
      join public.cards              cd on cd.id  = ci.card_id
      join public.players            p  on p.id   = cd.player_id
     where cd.season <> p_season
        or p.position_abbreviation is null
        or not (p.position_abbreviation = any (c.eligible_positions))
  ) then
    raise exception 'player is not eligible for that slot' using errcode = '22023';
  end if;

  select id into v_lineup
    from public.lineups
   where user_id = v_user and contest_id = v_contest;

  -- ONE CARD, ONE CONTEST, ONE WEEK — named, so the player can act on it.
  select string_agg(distinct format('%s %s (in %s)',
           p.first_name, p.last_name,
           case when oc.kind = 'free' then 'your main lineup' else oc.name end), '; ')
    into v_clash
    from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
    join public.lineup_slots ls on ls.card_instance_id = x.card_instance_id
    join public.lineups      ol on ol.id = ls.lineup_id
    join public.contests     oc on oc.id = ol.contest_id
    join public.card_instances ci on ci.id = x.card_instance_id
    join public.cards   cd on cd.id = ci.card_id
    join public.players p  on p.id  = cd.player_id
   where ol.user_id = v_user
     and ol.season = p_season and ol.season_type = p_season_type and ol.week = p_week
     and ol.id is distinct from v_lineup;

  if v_clash is not null then
    raise exception 'already playing elsewhere this week: %', v_clash
      using errcode = '55006';
  end if;

  with submitted as (
    select x.slot, x.card_instance_id
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
  ),
  stored as (
    select ls.slot, ls.card_instance_id
      from public.lineup_slots ls
     where ls.lineup_id = v_lineup
  ),
  changed as (
    select coalesce(s.slot, t.slot) as slot,
           t.card_instance_id as leaving,
           s.card_instance_id as arriving
      from submitted s
      full outer join stored t on t.slot = s.slot
     where s.card_instance_id is distinct from t.card_instance_id
  ),
  touched as (
    select slot, leaving as card_instance_id, 'remove' as direction from changed
     where leaving is not null
    union all
    select slot, arriving, 'add' from changed
     where arriving is not null
  )
  select string_agg(
           format('%s %s (%s)',
                  p.first_name, p.last_name,
                  case when t.direction = 'remove' then 'already playing — cannot be taken out'
                       else 'already playing — cannot be added' end),
           '; ' order by p.last_name)
    into v_blocked
    from touched t
    join public.card_instances ci on ci.id = t.card_instance_id
    join public.cards   cd on cd.id = ci.card_id
    join public.players p  on p.id  = cd.player_id
    left join public.games g
           on g.season = p_season
          and g.season_type = p_season_type
          and g.week = p_week
          and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
   where public.game_has_started(g.status_state, g.starts_at);

  if v_blocked is not null then
    raise exception 'lineup locked for %', v_blocked using errcode = '55006';
  end if;

  if v_lineup is null then
    -- 6b. ENTERING. Everything below runs ONLY on the transition from not
    --     entered to entered, which is what makes the charge idempotent: an
    --     edit finds `v_lineup` already set and never reaches here.
    if v_c.entry_fee_coins > 0 then
      -- An empty payload must not buy an entry. The client autosaves, and a
      -- screen opened and closed without a card placed would otherwise take
      -- the fee for a lineup that scores nothing.
      if jsonb_array_length(p_slots) = 0 then
        raise exception 'name at least one card to enter %', v_c.name
          using errcode = '22023';
      end if;

      -- Lock the wallet for the transaction. Without this two concurrent
      -- entries both pass the affordability check — the same trap
      -- `open_pack` documents.
      select balance into v_balance
        from public.coin_balances where user_id = v_user for update;
      if not found then
        raise exception 'no wallet for this user' using errcode = '22023';
      end if;
      if v_balance < v_c.entry_fee_coins then
        raise exception 'entering % costs % coins and you have %',
          v_c.name, v_c.entry_fee_coins, v_balance using errcode = '22023';
      end if;
    end if;

    -- Checked INSIDE the wallet lock so a contest cannot be oversold by two
    -- entries racing, and after affordability so the commoner refusal wins.
    if v_c.max_entrants is not null then
      select count(*) into v_entrants from public.lineups where contest_id = v_contest;
      if v_entrants >= v_c.max_entrants then
        raise exception '% is full (% of %)', v_c.name, v_entrants, v_c.max_entrants
          using errcode = '55006';
      end if;
    end if;

    -- Stamped at ENTRY rather than looked up at settlement. A week can end
    -- with the run already dead — killed by another contest on the same slate
    -- — and settlement still has to know which run this entry belonged to.
    -- Reading the live run at settlement time would attribute it to whatever
    -- run happened to be live then, which is the NEXT one.
    insert into public.lineups (user_id, season, season_type, week, contest_id, run_id)
    values (v_user, p_season, p_season_type, p_week, v_contest, v_run.id)
    returning id into v_lineup;

    if v_c.entry_fee_coins > 0 then
      update public.coin_balances
         set balance = balance - v_c.entry_fee_coins, updated_at = now()
       where user_id = v_user;

      -- `reference_id` is the lineup, which IS the entry — see the header.
      --
      -- KEYED ON THE LINEUP, NOT ON (user, contest). The old key could not tell
      -- a retry from a RE-entry, which did not matter while an entry could
      -- never be undone. With `leave_contest` it does: leaving and coming back
      -- is a second, real charge, and the old key collided with the first one's
      -- — and this insert has no `on conflict` clause, so the re-entry would
      -- have failed on a ledger constraint rather than charging. A new entry is
      -- a new lineup row with a new id; a retry against the same entry is the
      -- same id and is still refused.
      insert into public.coins_ledger (user_id, amount, reason, reference_id, idempotency_key)
      values (v_user, -v_c.entry_fee_coins, 'contest_entry', v_lineup,
              format('contest_entry:%s', v_lineup));
    end if;
  else
    update public.lineups set submitted_at = now() where id = v_lineup;

    -- SELF-HEALING STAMP. An entry can exist with no run: it was filed before
    -- runs existed, or under the old rule that only stamped a contest with a
    -- stake on it. Such an entry can never be settled — `settle_run_week` skips
    -- a null `run_id` — so it sits out the season record for ever.
    --
    -- Touching the entry at all is enough to adopt it into the live run. Only
    -- ever from null: an entry already stamped keeps the run it was made with,
    -- because re-pointing it at whatever run is live now is exactly the
    -- wrong-run bug 20260825150000 exists to prevent.
    if v_run.id is not null then
      update public.lineups
         set run_id = v_run.id
       where id = v_lineup and run_id is null;
    end if;
  end if;

  delete from public.lineup_slots ls
   where ls.lineup_id = v_lineup
     and not exists (
       select 1 from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
        where x.slot = ls.slot and x.card_instance_id = ls.card_instance_id
     );

  insert into public.lineup_slots (lineup_id, slot, card_instance_id)
  select v_lineup, x.slot, x.card_instance_id
    from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
   where not exists (
     select 1 from public.lineup_slots ls
      where ls.lineup_id = v_lineup and ls.slot = x.slot
        and ls.card_instance_id = x.card_instance_id
   );

  return v_lineup;
end;
$function$;


-- ═════════════════════════════════════════════════ 5. THE UNREACHED DOORS

-- `my_run` IS DROPPED. It was the chrome's read — hearts, the rack, what was
-- wagered, the carry slots and the next rung — and every one of those fields
-- described something that no longer happens. The client has stopped calling
-- it (`PlayerContext` dropped the RPC entirely), and a function that returns a
-- rack for a game with no rack is worse than no function: the next reader would
-- believe it.
--
-- `current_run()` STAYS. It is not the same thing — it returns the row, it
-- creates one on first read, and `set_lineup` depends on both of those.
drop function if exists public.my_run();

-- `wipe_run` and `claim_carry` are KEPT and put out of reach.
--
-- Neither can do anything today: both require a run with `ended_at` set, and
-- nothing sets it any more. But `wipe_run` is a SECURITY DEFINER function whose
-- job is to sell a player's whole collection for nought and zero their wallet,
-- and "unreachable because no caller currently exists" is the kind of safety
-- that lasts until somebody adds a caller. It already had no grant to
-- `authenticated`; `claim_carry` did, from when the death screen called it, and
-- that screen is deleted.
--
-- Revoked rather than dropped, for the mini-game reason in the header.
revoke execute on function public.claim_carry(uuid[]) from authenticated;


-- ══════════════════════════════════════════════════════════════ 6. CONFIG

-- The knobs that priced the mechanic. Left in place and left alone: they are
-- read by `current_run()` when it opens a run, so a run still gets a `hearts`
-- and a `max_hearts` written to a column nothing reads. Zeroing them would make
-- `current_run` write a run at nought hearts, which under the OLD settlement
-- was the shape of a dead one — and that is exactly the trap this file is
-- trying not to leave behind for whoever restores the mechanic.
--
--   run_starting_hearts   5
--   run_max_hearts        8
--   run_carry_ladder      3 wins -> 1 card, 6 -> 2, 10 -> 3
--
-- They are inert because nothing subtracts, not because they are nought.
