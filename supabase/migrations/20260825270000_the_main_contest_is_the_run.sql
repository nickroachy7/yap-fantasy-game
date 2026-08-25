-- The main contest is the run.
--
-- ---------------------------------------------------------------------------
-- WHY THIS REVERSES 20260825130000
-- ---------------------------------------------------------------------------
--
-- The free contest was seeded at zero hearts and the reasoning was about
-- agency: it is AUTO-ENTERED, the median loses half its field every week by
-- construction, and a player cannot decline it — so hearts would drain with no
-- decision attached to them. That is a real objection and it is still real.
--
-- What it missed is what the exemption cost. The free contest is the eight-slot
-- lineup, the season record, and the thing the entire app is built around; the
-- lobby is a three-card side bet. Putting the only stakes on the side bet meant
-- a player could go 0-18 in the game's flagship mode and never lose anything,
-- and the roguelike was a mechanic bolted to the periphery of its own product.
--
-- So the season record IS the run's health now. Miss the median, lose a heart.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS COSTS, STATED PLAINLY BECAUSE IT IS A TIGHT SETTING
-- ---------------------------------------------------------------------------
--
-- A median player loses about half a heart a week from a contest they cannot
-- decline, which is three hearts gone in roughly six weeks. There is exactly
-- one faucet — the WR Room, top three of its field, `hearts_on_win` 1 — so
-- surviving a season means going to the lobby and winning there. The free
-- contest is the clock; the lobby is the only way to fight it.
--
-- That is a coherent shape and a demanding one, and every number in it is data:
-- `hearts_at_risk` and `hearts_on_win` per contest, `run_starting_hearts` and
-- `run_max_hearts` in `game_config`. If the beta bleeds out, the knob to turn
-- first is a second healing contest rather than a softer clock — a drain with
-- one tap is fragile in a way a drain with two is not.
--
-- ---------------------------------------------------------------------------
-- TWO THINGS HAD TO MOVE WITH THE SEED, OR IT WOULD NOT HOLD
-- ---------------------------------------------------------------------------
--
-- `ensure_free_contest` stamps the stake at creation. Free contests are made on
-- demand, one per week, so an UPDATE over the rows that exist today would have
-- applied the new rule to those weeks and silently exempted every week after.
--
-- And `set_lineup` now lets a DEAD run file its main lineup anyway, staking
-- nothing. Without that, this change turns a death into a lockout: the free
-- contest is the one contest a player is guaranteed and cannot leave, so
-- refusing it to somebody awaiting a carry would take their lineup away along
-- with their run. Death should cost the run, not the game.

update public.contests
   set hearts_at_risk = 1, hearts_on_win = 0
 where kind = 'free';

CREATE OR REPLACE FUNCTION public.ensure_free_contest(p_season integer, p_season_type smallint, p_week integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id   uuid;
  v_code text := format('free:%s:%s:%s', p_season, p_season_type, p_week);
begin
  select id into v_id from public.contests where code = v_code;
  if v_id is not null then
    return v_id;
  end if;

  -- THE STAKE IS SET AT CREATION, and this line is the whole reason the change
  -- carries forward. Free contests are made on demand, one per week, for the
  -- life of the season — so leaving `hearts_at_risk` to its column default of
  -- zero would have applied the new rule to the weeks that already existed and
  -- silently exempted every week after this one.
  insert into public.contests (code, kind, format_code, season, season_type, week, name,
                               hearts_at_risk, hearts_on_win)
  values (v_code, 'free', 'main', p_season, p_season_type, p_week,
          case when p_season_type = 1 then format('Preseason Week %s', p_week)
               else format('Week %s', p_week) end,
          1, 0)
  on conflict (code) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.contests where code = v_code;
  end if;

  return v_id;
end;
$function$;

revoke execute on function public.ensure_free_contest(integer, smallint, integer) from public, anon;
grant  execute on function public.ensure_free_contest(integer, smallint, integer) to authenticated;

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
  -- that can actually take a heart.
  --
  -- THE FREE CONTEST IS ALWAYS ENTERABLE, EVEN DEAD, and that is what keeps
  -- this from being a lockout. It stakes a heart now, so it goes through this
  -- branch — but it is also auto-entered, unleaveable, and the only contest a
  -- player is guaranteed. Refusing it to somebody whose run has ended would
  -- take away their main lineup as well as their run, which is a suspension
  -- rather than a death.
  --
  -- Entered with a null run, so it stakes nothing: `settle_run_week` skips an
  -- entry with no run, which is exactly the right behaviour for a player who
  -- has no run to stake.
  if v_c.hearts_at_risk > 0 then
    v_run := public.current_run();
    if v_run.ended_at is not null then
      if v_c.kind = 'free' then
        v_run := null;
      else
        raise exception
          'your run ended — take your carry before entering % again', v_c.name
          using errcode = '55006';
      end if;
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

-- ------------------------------------------- sell_card, narrowed to the lobby
--
-- The free contest staking a heart would otherwise make the sell lock
-- permanent: it is auto-entered, unleaveable, and now exposed every week. The
-- body's own comment carries the argument.

CREATE OR REPLACE FUNCTION public.sell_card(p_card_instance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_balance integer;
  v_card    public.card_instances%rowtype;
  v_price   integer;
  v_name    text;
  v_at_risk text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Wallet first, then the card. open_pack takes the wallet lock first too, and
  -- two functions that lock the same pair in opposite orders deadlock under
  -- concurrency. Consistent ordering is the cheapest way to never find out.
  select balance into v_balance
    from public.gem_balances
   where user_id = v_user
     for update;

  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;

  -- Row lock, so a double-tap cannot sell the same copy twice: the second call
  -- waits here and then fails the sold_at check below rather than paying out
  -- again. SECURITY DEFINER bypasses RLS, so ownership is checked explicitly.
  select * into v_card
    from public.card_instances
   where id = p_card_instance_id
     and user_id = v_user
     for update;

  if not found then
    raise exception 'card does not belong to you' using errcode = '42501';
  end if;

  if v_card.sold_at is not null then
    raise exception 'card has already been sold' using errcode = '22023';
  end if;

  -- A committed copy is IN a set. It is not yours to sell, and paying out for
  -- it would be paying twice for one card — the commit already paid its share.
  if v_card.committed_at is not null then
    raise exception 'card has been committed to a set' using errcode = '22023';
  end if;

  -- A card still attached to an unscored lineup is either about to play or has
  -- played and not been swept. Selling it would leave a starter that silently
  -- scores nothing, or take the card away while it is still earning. Both are
  -- worse than a refusal the client can explain.
  if exists (
    select 1
      from public.lineup_slots ls
      join public.lineups l on l.id = ls.lineup_id
     where ls.card_instance_id = p_card_instance_id
       and l.scored_at is null
  ) then
    raise exception 'card is in a lineup that has not been scored yet'
      using errcode = '55006';
  end if;

  -- ESCROW. See this migration's header: while a run has hearts riding on an
  -- unsettled contest, the collection is not for sale. Named contests, because
  -- a refusal a player cannot act on is worse than no refusal at all — and the
  -- action here is a real one, since leaving a lobby contest before kickoff
  -- refunds the fee and lifts the lock.
  -- LOBBY CONTESTS ONLY, and the narrowing is forced rather than chosen.
  --
  -- The free contest stakes a heart now (20260825270000), and it is auto-
  -- entered and cannot be left — so a lock that counted it would fire from the
  -- moment a player sets their weekly lineup until the week settles, every
  -- week, forever. That collides head-on with the roster cap gate, which
  -- refuses to edit a lineup while a player is over thirty cards and tells them
  -- to SELL. A rule that makes another rule unsatisfiable has to yield.
  --
  -- What is left is the rule that was always meant: you cannot cash out of a
  -- bet you chose to take. And it is defence in depth rather than the primary
  -- guard now — the exploit it was built for (liquidate at full price, die
  -- holding gems) is dead because the wipe takes the wallet too, at settlement,
  -- with no gap to act in. See 20260825230000.
  select string_agg(distinct c.name, ', ') into v_at_risk
    from public.wagered_entries(v_user) w
    join public.contests c on c.id = w.contest_id
   where c.kind = 'lobby';

  if v_at_risk is not null then
    raise exception
      'cannot sell while your run has hearts riding on %: leave it before kickoff, or commit the card to a set instead',
      v_at_risk
      using errcode = '55006';
  end if;

  select sell_value into v_price
    from public.tier_thresholds
   where tier = v_card.tier;

  v_price := coalesce(v_price, 0);

  update public.card_instances
     set sold_at = now(), sold_for = v_price
   where id = p_card_instance_id;

  -- gems_ledger has CHECK (amount <> 0), so a zero-value tier is recorded as a
  -- sale on the card and nothing in the ledger, rather than failing the sale.
  if v_price > 0 then
    update public.gem_balances
       set balance = balance + v_price, updated_at = now()
     where user_id = v_user;

    insert into public.gems_ledger (user_id, amount, reason, reference_id)
    values (v_user, v_price, 'card_sale', p_card_instance_id);
  end if;

  select pl.full_name into v_name
    from public.cards cd
    join public.players pl on pl.id = cd.player_id
   where cd.id = v_card.card_id;

  return jsonb_build_object(
    'card_instance_id', p_card_instance_id,
    'player_name',      v_name,
    'tier',             v_card.tier,
    'sold_for',         v_price,
    'balance',          v_balance + v_price
  );
end;
$function$;
revoke execute on function public.sell_card(uuid) from public, anon;
grant  execute on function public.sell_card(uuid) to authenticated;

-- ------------------------------------------- wagered_entries, closed properly
--
-- `20260825260000` moved the window's close from `scored_at` to "settlement has
-- recorded a result", which fixed the days-long lie between the sweep and
-- settlement. It left one hole, and making the free contest a heart contest is
-- what walked into it.
--
-- AN ENTRY THAT CAN NEVER PRODUCE A RESULT WOULD RIDE FOREVER. `contest_results`
-- returns null — no result, no heart moves — when the field is too small to
-- have one: a single entrant is their own median, and a top-three contest with
-- three players has no place to miss. Settlement writes no row for those, so
-- "not yet recorded" stayed true permanently and the heart never came home.
--
-- Rare in a full league and routine in a four-tester beta, which is exactly who
-- is about to be looking at it.
--
-- So the window also closes when the WEEK does. Once every fixture is final,
-- settlement runs on its next tick and resolves the entry one way or the other
-- — with a result, or with the null that means there was never one to have.
-- Either way nothing more can move, so nothing is still riding.
--
-- The residual gap is the cron's own latency, a minute or so between the last
-- whistle and settlement. That is the honest floor for this: the alternative is
-- a marker saying "settlement has visited this week", which is a second fact
-- that can disagree with the first, and the failure mode of getting THAT wrong
-- is a heart charged twice.

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
     -- Not settled yet...
     and not exists (
       select 1 from public.run_contest_results rr
        where rr.run_id = l.run_id and rr.contest_id = c.id
     )
     -- ...and the week can still produce one. `status_state` is the three-value
     -- field; `status` is a human string ("Final/OT") and is never read.
     and exists (
       select 1 from public.games g
        where g.season = c.season and g.season_type = c.season_type and g.week = c.week
          and lower(coalesce(g.status_state, '')) not in ('final', 'complete', 'completed')
     );
$$;

revoke execute on function public.wagered_entries(uuid) from public, anon, authenticated;

comment on function public.wagered_entries(uuid) is
  'The entries with hearts that can still move: staked, on a live run, not yet settled, and in a week that is not over. Read by the heart display and by the lobby half of the sell lock.';
