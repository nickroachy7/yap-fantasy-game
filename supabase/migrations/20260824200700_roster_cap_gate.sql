-- The roster cap: a limit on how many cards you may HOLD, enforced at the one
-- place where holding them matters.
--
-- ---------------------------------------------------------------------------
-- WHAT THE CAP IS FOR
-- ---------------------------------------------------------------------------
--
-- Only eight cards can earn anything in a given week. A bench card gains no
-- fantasy points, so no career_fp, so no tier, so no gems — it is completely
-- inert. Without a cap the correct play is therefore to hold EVERYTHING
-- forever, because a held card costs nothing and might one day be worth
-- starting. That is exactly what the beta did, and it is why the Sets tab sat
-- unused: nobody has to choose, so nobody chooses.
--
-- The cap makes a roster slot scarce, which makes every pull a decision, which
-- gives the other two exits a reason to exist:
--
--   KEEP    you believe in them          costs a slot
--   COMMIT  you do not, but a set does    costs nothing but the card's future
--   SELL    you do not, and no set does   costs you the value permanently
--
-- ---------------------------------------------------------------------------
-- IT GATES EDITING, NOT OWNING, AND NEVER SCORING
-- ---------------------------------------------------------------------------
--
-- Three refusals we are deliberately NOT making, each of which would be worse
-- than the problem:
--
--   NOT OWNING. Nothing is confiscated and no pull is blocked. A player who
--   already has ninety cards keeps all ninety. Retroactively deleting somebody's
--   collection to enforce a number we invented afterwards is not a mechanic, it
--   is a bug with a changelog entry.
--
--   NOT BUYING. `open_pack` is untouched. Going over the cap is allowed and
--   expected — it is how you discover you have a decision to make. Blocking the
--   purchase would punish the exact enthusiasm the game runs on.
--
--   NOT SCORING. A lineup already submitted keeps scoring, forever, whatever
--   the roster does afterwards. `score_week` is untouched. Going over the cap on
--   a Thursday must never void a week that was legally set on Tuesday; a game
--   that silently zeroes a submitted lineup has broken its only promise.
--
-- What IS blocked is `set_lineup` — changing who starts. That bites at the
-- moment the player cares most, which is the only moment a soft gate works, and
-- it clears in one bulk commit. It is a debt, not a confiscation.
--
-- ---------------------------------------------------------------------------
-- COMMITTED COPIES DO NOT COUNT
-- ---------------------------------------------------------------------------
--
-- `is_held` is already exactly the right predicate — false once a card is sold
-- OR committed — so the count below is a one-line read of a stored generated
-- column with an index already on it. That is not a convenience: it is the
-- release valve, and it is what makes a set the only way to keep a card without
-- spending a roster slot.

create or replace function public.roster_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_held integer;
  v_cap  integer;
  v_warn integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select count(*) into v_held
    from public.card_instances where user_id = v_user and is_held;

  v_cap  := public.game_config_value('roster_cap', 30);
  v_warn := public.game_config_value('roster_cap_warn_at', 24);

  return jsonb_build_object(
    'held',      v_held,
    'cap',       v_cap,
    'warn_at',   v_warn,
    'over_by',   greatest(0, v_held - v_cap),
    'is_over',   v_held > v_cap,
    'is_near',   v_held >= v_warn and v_held <= v_cap,
    'remaining', greatest(0, v_cap - v_held));
end;
$$;

revoke execute on function public.roster_status() from public, anon;
grant  execute on function public.roster_status() to authenticated;

comment on function public.roster_status() is
  'The caller''s held-card count against the roster cap, and whether lineup editing is currently blocked by it.';

-- ---------------------------------------------------------------- the gate
--
-- Restated whole rather than patched, as every previous revision of this
-- function has been: it is CREATE OR REPLACE and there is no partial form. Only
-- check 0 is new.

create or replace function public.set_lineup(
  p_season      integer,
  p_season_type smallint,
  p_week        integer,
  p_slots       jsonb          -- [{"slot":"QB","card_instance_id":"<uuid>"}, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_lock   timestamptz;
  v_lineup uuid;
  v_held   integer;
  v_cap    integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be a json array' using errcode = '22023';
  end if;

  -- 0. THE ROSTER CAP.
  --
  --    Checked before anything else so the message a player gets is about the
  --    thing they actually have to fix, rather than about the third eligibility
  --    rule that happened to fail first. The wording carries the remedy because
  --    it is shown verbatim — see commit_cards_to_set, which does the same.
  v_cap := public.game_config_value('roster_cap', 30);
  select count(*) into v_held
    from public.card_instances where user_id = v_user and is_held;

  if v_held > v_cap then
    raise exception
      'roster is over the limit: % of % cards. Commit % to a set or sell them to set your lineup.',
      v_held, v_cap, v_held - v_cap
      using errcode = '55006';
  end if;

  -- Lock time comes from stored kickoff times, never from the caller.
  v_lock := public.week_lock_time(p_season, p_season_type, p_week);
  if v_lock is null then
    raise exception 'no scheduled games for season % type % week %',
      p_season, p_season_type, p_week using errcode = '22023';
  end if;
  if now() >= v_lock then
    raise exception 'lineup for week % locked at %', p_week, v_lock
      using errcode = '55006';
  end if;

  -- 1. every slot is a real slot
  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
      left join public.lineup_slot_config c on c.slot = x.slot
     where c.slot is null or x.slot is null or x.card_instance_id is null
  ) then
    raise exception 'unknown or malformed lineup slot' using errcode = '22023';
  end if;

  -- 2. a slot appears at most once
  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
     group by x.slot having count(*) > 1
  ) then
    raise exception 'duplicate slot in payload' using errcode = '22023';
  end if;

  -- 3. a card appears at most once (also guarded by a unique index)
  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
     group by x.card_instance_id having count(*) > 1
  ) then
    raise exception 'the same card cannot fill two slots' using errcode = '22023';
  end if;

  -- 4. every card is one the caller actually owns AND still holds.
  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
      left join public.card_instances ci
             on ci.id = x.card_instance_id
            and ci.user_id = v_user
            and ci.sold_at is null
     where ci.id is null
  ) then
    raise exception 'card does not belong to you' using errcode = '42501';
  end if;

  -- 5. the player is eligible for the slot, and the card is from this season
  if exists (
    select 1
      from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid)
      join public.lineup_slot_config c  on c.slot = x.slot
      join public.card_instances     ci on ci.id  = x.card_instance_id
      join public.cards              cd on cd.id  = ci.card_id
      join public.players            p  on p.id   = cd.player_id
     where cd.season <> p_season
        or p.position_abbreviation is null
        or not (p.position_abbreviation = any (c.eligible_positions))
  ) then
    raise exception 'player is not eligible for that slot' using errcode = '22023';
  end if;

  insert into public.lineups (user_id, season, season_type, week)
  values (v_user, p_season, p_season_type, p_week)
  on conflict (user_id, season, season_type, week)
    do update set submitted_at = now()
  returning id into v_lineup;

  delete from public.lineup_slots where lineup_id = v_lineup;

  insert into public.lineup_slots (lineup_id, slot, card_instance_id)
  select v_lineup, x.slot, x.card_instance_id
    from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid);

  return v_lineup;
end;
$$;

revoke execute on function public.set_lineup(integer, smallint, integer, jsonb) from public, anon;
grant  execute on function public.set_lineup(integer, smallint, integer, jsonb) to authenticated;
