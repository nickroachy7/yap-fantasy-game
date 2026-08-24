-- Entering a lobby contest costs gems, and `set_lineup` is what charges it.
--
-- ---------------------------------------------------------------------------
-- WHY THE FEE HAS TO EXIST BEFORE THE FIRST LOBBY CONTEST DOES
-- ---------------------------------------------------------------------------
--
-- `award_score_gems` pays 1.5 a point on EVERY slot in EVERY lineup a player
-- files. A second contest is therefore a second source of score gems, and a
-- contest that is free to enter is a faucet with no tap. The fee is not
-- flavour and it is not a sink bolted on afterwards — it is the only thing on
-- the other side of that ledger.
--
-- A row carrying `entry_fee_gems` while nothing debits it would be worse than
-- no fee at all: the lobby would LOOK priced and be free.
--
-- ---------------------------------------------------------------------------
-- 40 GEMS, AND HOW THAT NUMBER WAS PICKED
-- ---------------------------------------------------------------------------
--
-- The floor is what the entry hands back. Measured means per game played, 2025
-- regular season, active rules: RB 8.2, WR 7.1, TE 5.9 (see
-- 20260821250000_reachable_tier_ladder). A flex three is filled from the BENCH
-- by construction — the whole point of the format — so call it ~6.5 a card and
-- ~20 points a week, which at 1.5 a point and a bronze multiplier of 1.0 is
-- **about 30 gems returned**.
--
-- So the fee must clear 30 or entering prints gems, and the contest becomes a
-- thing you enter with your three worst cards for the arbitrage. 40 clears it
-- with room for a card running hot.
--
-- The ceiling is the pack. Three cards cost 60 gems at 20 a card, and a fee
-- above that would make buying three new cards cheaper than playing three you
-- already own — which is the "price it against what a PACK yields" rule that
-- every set figure in this codebase is set by.
--
--     30 < 40 < 60
--
-- 40 is also exactly what a daily set pays, and the symmetry is worth keeping:
-- a daily pays 40 to clear three cards OUT of a collection, a lobby entry costs
-- 40 to play three of them IN.
--
-- WHAT THE PLAYER IS ACTUALLY BUYING IS TIER, NOT GEMS. On the gem ledger an
-- entry is roughly break-even to slightly negative, deliberately. What it buys
-- is career_fp on three cards that were earning NOTHING — the one currency
-- packs cannot sell, the one the weekly set demands, and the reason the bench
-- stops being free to hold. See `20260824235000_weekly_sets`.
--
-- THERE IS NO PRIZE POOL YET, so today an entry is a straight purchase of tier
-- progress. When prizes land they must come OUT of the fees collected and not
-- from a grant, or this whole calculation inverts.
--
-- ---------------------------------------------------------------------------
-- THE LINEUP ROW IS THE ENTRY RECORD
-- ---------------------------------------------------------------------------
--
-- No `contest_entries` table, and that is a decision rather than a shortcut.
-- One lineup per user per contest is already enforced by
-- `lineups_user_id_contest_key`, so the row's EXISTENCE is exactly the fact an
-- entries table would store — and duplicating it would create the usual pair
-- that can disagree. It also makes the charge idempotent by construction: the
-- fee is taken where the lineup is CREATED, so editing an entry can never
-- charge twice, no matter how many times the client autosaves.

-- How many players have filed for a contest.
--
-- SECURITY DEFINER because the caller cannot see anybody else's lineups —
-- that is what the RLS policy on `lineups` is for — and "27 of 50 entered" is
-- a fact about the contest rather than about them.
create or replace function public.contest_entrants(p_contest uuid)
returns integer
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer from public.lineups where contest_id = p_contest;
$$;

grant execute on function public.contest_entrants(uuid) to authenticated;

-- The lobby: every contest on the current slate, with the two facts a row has
-- to show that the caller cannot read for themselves — how full it is, and
-- whether they are in it.
create or replace function public.contest_lobby()
returns table(
  id uuid, code text, kind public.contest_kind, name text,
  format_code text, format_name text, slot_count smallint,
  entry_fee_gems integer, max_entrants integer, entrants integer,
  season integer, season_type smallint, week integer,
  my_lineup_id uuid, my_filled integer, affordable boolean
)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  with slate as (select * from public.lineup_slate() limit 1),
  wallet as (
    select coalesce((select balance from public.gem_balances where user_id = auth.uid()), 0) as balance
  )
  select c.id, c.code, c.kind, c.name,
         c.format_code, f.name, f.slot_count,
         c.entry_fee_gems, c.max_entrants,
         public.contest_entrants(c.id),
         c.season, c.season_type, c.week,
         l.id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = l.id), 0),
         -- Already in it, so there is nothing left to afford.
         (l.id is not null or (select balance from wallet) >= c.entry_fee_gems)
    from public.contests c
    join slate s
      on s.season = c.season and s.season_type = c.season_type and s.week = c.week
    join public.contest_formats f on f.code = c.format_code
    left join public.lineups l
           on l.contest_id = c.id and l.user_id = auth.uid()
   order by c.kind, c.entry_fee_gems, c.name;
$$;

grant execute on function public.contest_lobby() to authenticated;

-- ---------------------------------------------------------------------------
-- `set_lineup`, with the charge.
--
-- 20260825030000's body — read back from the database, per the standing rule in
-- 20260824230000 — plus step 6b. Nothing else differs.
-- ---------------------------------------------------------------------------

create or replace function public.set_lineup(
  p_season integer,
  p_season_type smallint,
  p_week integer,
  p_slots jsonb,
  p_contest_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
      -- Keyed as well, so a retry of the same entry can never double-charge
      -- even if the row were somehow reached twice.
      insert into public.gems_ledger (user_id, amount, reason, reference_id, idempotency_key)
      values (v_user, -v_c.entry_fee_gems, 'contest_entry', v_lineup,
              format('contest_entry:%s:%s', v_user, v_contest));
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
$function$;

-- ---------------------------------------------------------------------------
-- THE CONTEST
--
-- One lobby contest per week, for every week the 2026 season holds fixtures
-- for. Seeded rather than created by a cron because there is exactly one of
-- them and the beta is eighteen weeks; when there are several, or when the
-- lineup has to rotate them, this becomes a `rebuild_` function like the daily
-- set's and gets scheduled the same way.
--
-- `max_entrants` is deliberately null. A cap on a four-tester beta is a way to
-- discover that the lobby is empty rather than full.
-- ---------------------------------------------------------------------------
insert into public.contests (code, kind, format_code, season, season_type, week, name, entry_fee_gems)
select format('flex3:%s:%s:%s', g.season, g.season_type, g.week),
       'lobby', 'flex3', g.season, g.season_type, g.week,
       'Flex Three', 40
  from (select distinct season, season_type, week from public.games where week is not null and season = 2026) g
on conflict (code) do nothing;
