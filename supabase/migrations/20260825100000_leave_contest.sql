-- Leaving a paid contest before it starts, and the re-entry bug that hid
-- behind not being able to.
--
-- ---------------------------------------------------------------------------
-- WHY LEAVING EXISTS
-- ---------------------------------------------------------------------------
--
-- Entering costs gems and the decision is made days before the games. A player
-- who enters on Tuesday, sees the injury report on Thursday and wants out is
-- asking for something completely ordinary, and until now the only answer was
-- to field the lineup anyway. There is nothing clever to protect here: no
-- information has been created, no fixture has kicked off, and the seat goes
-- back on the shelf for somebody else.
--
-- ONLY BEFORE ANY OF YOUR CARDS HAVE PLAYED. That is the line, and it is the
-- per-player lock rather than the week's first kickoff for exactly the reason
-- `20260821210000` gives: an NFL week runs Thursday to Monday, and a Thursday
-- game must not confiscate a Sunday decision. But the moment one of YOUR cards
-- has taken a snap you have watched some of the contest you paid for, so the
-- refund would be a free look. Refused from then on.
--
-- ONLY LOBBY CONTESTS. The free one is not a thing you joined and not a thing
-- you can leave — every account is in it, and a `leave` that emptied your main
-- lineup would be a delete button wearing a friendly word.
--
-- ---------------------------------------------------------------------------
-- THE BUG THIS EXPOSED, WHICH WAS ALREADY THERE
-- ---------------------------------------------------------------------------
--
-- `set_lineup` keyed the entry charge as `contest_entry:<user>:<contest>`, and
-- `gems_ledger.idempotency_key` is unique. That was fine while an entry could
-- never be undone. The moment you can leave and come back, the second entry
-- collides with the first one's key — and because that insert has no
-- `on conflict` clause, the whole re-entry would have failed on a constraint
-- violation with a message about a ledger.
--
-- The key is the LINEUP now, which is the entry itself. A new entry is a new
-- row with a new id, so re-entering charges again exactly as it should, while
-- a retry against the same entry is still refused. This is the more correct
-- key regardless of leaving: the thing being paid for was always the lineup.

create or replace function public.leave_contest(p_contest_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_c       record;
  v_lineup  uuid;
  v_played  text;
  v_refund  integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id, kind, name, entry_fee_gems, season, season_type, week
    into v_c
    from public.contests where code = p_contest_code;
  if v_c.id is null then
    raise exception 'no such contest: %', p_contest_code using errcode = '22023';
  end if;

  if v_c.kind = 'free' then
    raise exception 'you cannot leave %, everybody is in it', v_c.name
      using errcode = '22023';
  end if;

  select id into v_lineup
    from public.lineups where user_id = v_user and contest_id = v_c.id;
  if v_lineup is null then
    raise exception 'you are not in %', v_c.name using errcode = '22023';
  end if;

  -- Any of YOUR cards having kicked off ends it. Same test the lineup editor
  -- applies per row, asked here of the whole entry.
  select string_agg(format('%s %s', p.first_name, p.last_name), '; ' order by p.last_name)
    into v_played
    from public.lineup_slots ls
    join public.card_instances ci on ci.id = ls.card_instance_id
    join public.cards   cd on cd.id = ci.card_id
    join public.players p  on p.id  = cd.player_id
    left join public.games g
           on g.season = v_c.season and g.season_type = v_c.season_type
          and g.week = v_c.week
          and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
   where ls.lineup_id = v_lineup
     and public.game_has_started(g.status_state, g.starts_at);

  if v_played is not null then
    raise exception 'too late to leave %: already playing — %', v_c.name, v_played
      using errcode = '55006';
  end if;

  -- Refund only what was actually taken. Reading the ledger rather than the
  -- contest's CURRENT fee, so a price changed since they entered cannot pay
  -- them more than they paid — or less.
  select coalesce(-sum(amount), 0)::integer into v_refund
    from public.gems_ledger
   where user_id = v_user and reason = 'contest_entry' and reference_id = v_lineup;

  -- Slots go with it on cascade. The lineup row IS the entry, so deleting it
  -- is what leaving means; there is no separate membership to tidy up.
  delete from public.lineups where id = v_lineup;

  if v_refund > 0 then
    update public.gem_balances
       set balance = balance + v_refund, updated_at = now()
     where user_id = v_user;

    insert into public.gems_ledger (user_id, amount, reason, idempotency_key)
    values (v_user, v_refund, 'contest_refund',
            format('contest_refund:%s', v_lineup));
  end if;

  return jsonb_build_object('contest', v_c.name, 'refunded', v_refund);
end;
$$;

grant execute on function public.leave_contest(text) to authenticated;

-- ---------------------------------------------------------------------------
-- And the key fix the paragraph above describes. Live definition read back
-- with pg_get_functiondef, one line changed.
-- ---------------------------------------------------------------------------

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

  select season, season_type, week, format_code, kind, entry_fee_gems, max_entrants, name
    into v_c
    from public.contests where id = v_contest;

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

    insert into public.lineups (user_id, season, season_type, week, contest_id)
    values (v_user, p_season, p_season_type, p_week, v_contest)
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
$function$

;
