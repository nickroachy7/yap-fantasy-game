-- A sold card cannot be started.
--
-- `sell_card` refuses to sell a card that sits in an unscored lineup, which
-- closes that door from one side. This closes it from the other: without it you
-- could sell a card and then submit a lineup naming it, because `set_lineup`
-- only ever asked whether the row belonged to you — and a sold row still does.
-- The result would be a starter that scores nothing, with no error anywhere.
--
-- Only check 4 changes. It is restated whole rather than patched because the
-- function is CREATE OR REPLACE and there is no partial form.

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
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be a json array' using errcode = '22023';
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
  --    SECURITY DEFINER bypasses RLS, so ownership is checked explicitly here.
  --    `sold_at is null` is the new half: a sold copy is still your row.
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

  -- Replace wholesale. Safe because this path is unreachable after lock, and
  -- before lock every slot's points are still zero.
  delete from public.lineup_slots where lineup_id = v_lineup;

  insert into public.lineup_slots (lineup_id, slot, card_instance_id)
  select v_lineup, x.slot, x.card_instance_id
    from jsonb_to_recordset(p_slots) as x(slot text, card_instance_id uuid);

  return v_lineup;
end;
$$;

revoke execute on function public.set_lineup(integer, smallint, integer, jsonb) from public, anon;
grant  execute on function public.set_lineup(integer, smallint, integer, jsonb) to authenticated;
