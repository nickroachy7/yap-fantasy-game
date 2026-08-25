-- A heart is riding until settlement says otherwise — not until the sweep does.
--
-- ---------------------------------------------------------------------------
-- FAULT ONE: THE WINDOW CLOSED AT THE WRONG EVENT
-- ---------------------------------------------------------------------------
--
-- `wagered_entries` treated an entry as exposed while `scored_at is null`. That
-- read as "until the result is in", and it is not. `scored_at` is written by
-- the GAMEDAY SWEEP, which runs every sixty seconds through the games; hearts
-- move in `settle_run_week`, which cannot run until every fixture in the week
-- is final. Those are days apart on a normal NFL week.
--
-- So between a Sunday-afternoon lineup being swept and the Monday-night game
-- ending, a player's heart was genuinely on the line and the masthead said
-- nothing was — while the lobby row it came from still advertised the stake.
-- The two halves of the app disagreed for most of the week.
--
-- The window is now defined by settlement's OWN LEDGER: an entry is exposed
-- until there is a `run_contest_results` row for it. That table is written by
-- the only thing that can move a heart, so the display cannot drift from the
-- mechanic — the mechanic is what it reads.
--
-- THE SELL LOCK WIDENS WITH IT, and that is intended rather than tolerated.
-- "You cannot liquidate while a result you are exposed to is pending" is the
-- rule; it was only ever narrower because the predicate was wrong about when
-- exposure ends. `leave_contest` before kickoff is still the escape, and
-- committing to a set is still the way out from under the roster cap.
--
-- ---------------------------------------------------------------------------
-- FAULT TWO: THE FREE-ROLL CALL WAS WRONG, AND THIS REVERSES IT
-- ---------------------------------------------------------------------------
--
-- `20260825220000` made unstamped entries — those filed before `run_id`
-- existed — into free rolls, on the reasoning that stamping them would
-- retroactively put a heart on an entry made when entering cost nothing. That
-- was wrong on its own facts. The lobby has advertised `1 at risk` on that row
-- since `20260825190000`, so the stake was never a secret being sprung; what
-- was actually happening is that the app promised a stake in one place and
-- denied it in another, and left the player to work out which was lying.
--
-- Making it true is the honest repair. It is also the only one that leaves the
-- lobby and the masthead agreeing, which is the property both migrations were
-- trying to protect.
--
-- Backfilled only for entries that are STILL LIVE and whose week has not
-- settled. A scored or settled entry is finished and adopting it now would be
-- staking something already played.

create or replace function public.wagered_entries(p_user uuid)
returns table (lineup_id uuid, contest_id uuid, hearts_at_risk smallint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.id, c.id, c.hearts_at_risk
    from public.lineups l
    join public.contests c on c.id = l.contest_id
    -- A stake on a run that has already ended is not a stake: `settle_run_week`
    -- skips a dead run, so its pending entries record a result and move nothing.
    join public.runs r on r.id = l.run_id and r.ended_at is null
   where l.user_id = p_user
     and c.hearts_at_risk > 0
     -- EXPOSED UNTIL SETTLEMENT HAS SPOKEN. Deliberately not `scored_at`: see
     -- the header. This is the same table `settle_run_week` writes, so "is a
     -- heart riding" and "will a heart move" are one question.
     and not exists (
       select 1 from public.run_contest_results rr
        where rr.run_id = l.run_id and rr.contest_id = c.id
     );
$$;

revoke execute on function public.wagered_entries(uuid) from public, anon, authenticated;

comment on function public.wagered_entries(uuid) is
  'The entries with hearts riding on them: in a contest that stakes hearts, stamped with a live run, and not yet recorded in run_contest_results. Read by the sell lock and by my_run, so neither can promise a stake settlement will not act on.';

-- --------------------------------------------------------------- backfill

-- One-time, and narrow: live entries only, in contests that stake hearts, for
-- players who have a live run to adopt them into.
update public.lineups l
   set run_id = r.id
  from public.contests c, public.runs r
 where c.id = l.contest_id
   and r.user_id = l.user_id
   and r.ended_at is null
   and l.run_id is null
   and l.scored_at is null
   and c.hearts_at_risk > 0;

-- ------------------------------------------- set_lineup, with a healing stamp

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

  select season, season_type, week, format_code, kind, entry_fee_gems, max_entrants, name,
         hearts_at_risk
    into v_c
    from public.contests where id = v_contest;

  -- THE RUN IS RESOLVED BEFORE ANYTHING IS CHARGED, and only for a contest
  -- that can actually take a heart. The free contest never touches a run: it
  -- is the floor a dead player still has, so needing a live run to enter it
  -- would take away the one screen a death leaves them.
  if v_c.hearts_at_risk > 0 then
    v_run := public.current_run();
    if v_run.ended_at is not null then
      raise exception
        'your run ended — take your carry before entering % again', v_c.name
        using errcode = '55006';
    end if;
  end if;

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
    if v_c.entry_fee_gems > 0 then
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
        from public.gem_balances where user_id = v_user for update;
      if not found then
        raise exception 'no wallet for this user' using errcode = '22023';
      end if;
      if v_balance < v_c.entry_fee_gems then
        raise exception 'entering % costs % gems and you have %',
          v_c.name, v_c.entry_fee_gems, v_balance using errcode = '22023';
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

    if v_c.entry_fee_gems > 0 then
      update public.gem_balances
         set balance = balance - v_c.entry_fee_gems, updated_at = now()
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
      insert into public.gems_ledger (user_id, amount, reason, reference_id, idempotency_key)
      values (v_user, -v_c.entry_fee_gems, 'contest_entry', v_lineup,
              format('contest_entry:%s', v_lineup));
    end if;
  else
    update public.lineups set submitted_at = now() where id = v_lineup;

    -- SELF-HEALING STAMP. An entry can exist with no run: it was filed before
    -- runs existed, or into a contest whose stake was raised above zero after
    -- the fact. Such an entry can never be settled — `settle_run_week` skips a
    -- null `run_id` — so the lobby advertises a heart on a row that cannot cost
    -- one, which is the confusion 20260825260000 is fixing.
    --
    -- Touching the entry at all is enough to adopt it into the live run. Only
    -- ever from null: an entry already stamped keeps the run it was made with,
    -- because re-pointing it at whatever run is live now is exactly the
    -- wrong-run bug 20260825150000 exists to prevent.
    if v_c.hearts_at_risk > 0 and v_run.id is not null then
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