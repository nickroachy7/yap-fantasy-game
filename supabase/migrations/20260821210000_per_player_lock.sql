-- A lineup locks player by player, not all at once.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG WITH ONE LOCK FOR THE WEEK
-- ---------------------------------------------------------------------------
--
-- `week_lock_time` is `min(starts_at)` over the week's games, and `set_lineup`
-- refused every edit after it. An NFL week opens Thursday night and closes
-- Monday, so that rule froze eleven of your players on account of the one who
-- was playing — for four days, over games that had not kicked off. Every real
-- fantasy game locks each player at his own kickoff, and so should this one.
--
-- The rule, stated as the game states it: a player who has not started his game
-- can be swapped out for another player who has not started his game, and an
-- empty slot can be filled by one. Once a player's game begins he is fixed —
-- he cannot leave the lineup and he cannot be added to it.
--
-- ---------------------------------------------------------------------------
-- WHY THE WHOLESALE DELETE HAD TO GO
-- ---------------------------------------------------------------------------
--
-- The old body replaced every slot on every submission, justified by a comment
-- that is now false in both of its halves:
--
--     "Safe because this path is unreachable after lock, and before lock every
--      slot's points are still zero."
--
-- Under per-player locking the path IS reachable mid-week, and by then the
-- locked slots hold real points. Deleting and re-inserting them would zero
-- points a card had already earned and, through `career_fp`, its progress
-- toward a tier. The next sweep would rebuild both — score_week recomputes from
-- source — but between the edit and that sweep the lineup would read wrong, and
-- "wrong until something else fixes it" is not a property to design in.
--
-- So this diffs. Slots that did not change are not touched at all, which is
-- also what makes the lock check honest: the question is never "is this lineup
-- legal" but "is this EDIT legal".

-- Has this game begun?
--
-- Mirrors `statusOf` + `resolveStatus` in the client (src/components/scores/
-- scoreboard.ts, src/components/lineup/model.ts) deliberately: the feed's word
-- when it has one, the clock when it does not. The provider spells in-progress
-- more than one way and has been known to leave a game reading `scheduled`
-- after kickoff, and a lineup that could still be edited during the game is the
-- one error this must not make. Both sides therefore treat a passed kickoff as
-- started regardless of what the status string says.
create or replace function public.game_has_started(
  p_status_state text,
  p_starts_at    timestamptz
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_starts_at <= now(), false)
      or lower(coalesce(p_status_state, '')) in
         ('final', 'complete', 'completed', 'in_progress', 'inprogress', 'live', 'in progress');
$$;

grant execute on function public.game_has_started(text, timestamptz) to authenticated;

-- Which of a user's cards are locked for a given week, and why.
--
-- Exposed rather than kept inside `set_lineup` because the client has to draw
-- the same answer — a badge that offers a swap the server will refuse is worse
-- than no badge — and two implementations of "is this player locked" would
-- drift the first time the provider changed a word.
--
-- A card whose team has no game that week is NOT locked. A bye player never
-- kicks off, so nothing ever fixes him in place; he can be swapped right up
-- until the only players left to swap for have games of their own under way,
-- at which point the rule below stops it on the incoming card instead.
create or replace function public.locked_cards(
  p_season      integer,
  p_season_type smallint,
  p_week        integer
)
returns table (card_instance_id uuid, locked boolean, starts_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ci.id,
         coalesce(public.game_has_started(g.status_state, g.starts_at), false),
         g.starts_at
    from public.card_instances ci
    join public.cards   cd on cd.id = ci.card_id
    join public.players p  on p.id  = cd.player_id
    left join public.games g
           on g.season = p_season
          and g.season_type = p_season_type
          and g.week = p_week
          and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
   where ci.user_id = auth.uid()
     and ci.is_held;
$$;

grant execute on function public.locked_cards(integer, smallint, integer) to authenticated;

-- ---------------------------------------------------------------- set_lineup
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
  v_user    uuid := auth.uid();
  v_lineup  uuid;
  v_games   integer;
  v_blocked text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be a json array' using errcode = '22023';
  end if;

  -- The week has to exist. This replaces the old lock check's second job: it
  -- used week_lock_time being null to detect a week with no fixtures, and that
  -- is still worth refusing — a lineup for a week we hold no games for can
  -- never be scored.
  select count(*) into v_games
    from public.games g
   where g.season = p_season and g.season_type = p_season_type and g.week = p_week;
  if v_games = 0 then
    raise exception 'no scheduled games for season % type % week %',
      p_season, p_season_type, p_week using errcode = '22023';
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
  --    `is_held` is the load-bearing half: a sold OR committed copy is still
  --    your row, and starting one would be a slot that silently scores nothing.
  --    It is a generated column precisely so this check cannot fall behind the
  --    next way a card leaves a collection.
  --
  --    KEPT FROM 20260819235300. The first draft of this migration was written
  --    against 20260818162000, which tested `sold_at is null`, and silently
  --    reverted the committed-card half. `card_sets` caught it — and only
  --    because the week lock had been masking it: with a whole-week lock the
  --    suite's rejection could come from either rule, and removing the lock is
  --    what made the assertion actually test what it says it tests.
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

  select id into v_lineup
    from public.lineups
   where user_id = v_user and season = p_season
     and season_type = p_season_type and week = p_week;

  -- 6. THE LOCK, applied to the EDIT rather than to the lineup.
  --
  --    Every slot whose occupant differs from what is already stored is a
  --    change, and a change touches up to two cards: the one leaving and the
  --    one arriving. Either having kicked off refuses the whole submission.
  --
  --    A full outer join because a change can be an addition (nothing stored,
  --    something submitted), a removal (the reverse), or a substitution. All
  --    three are the same question asked of whichever cards are present.
  --
  --    Untouched slots are absent from this by construction, which is the point:
  --    your Thursday quarterback stays exactly where he is and stops nothing
  --    else from moving.
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
    insert into public.lineups (user_id, season, season_type, week)
    values (v_user, p_season, p_season_type, p_week)
    returning id into v_lineup;
  else
    update public.lineups set submitted_at = now() where id = v_lineup;
  end if;

  -- 7. APPLY ONLY WHAT CHANGED.
  --
  --    Not a delete-and-reinsert. Slots now carry points from the moment the
  --    week's first sweep runs, and rewriting an untouched locked slot would
  --    discard what its card has earned until the next sweep rebuilt it.
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
$$;

revoke execute on function public.set_lineup(integer, smallint, integer, jsonb) from public, anon;
grant  execute on function public.set_lineup(integer, smallint, integer, jsonb) to authenticated;

comment on function public.set_lineup(integer, smallint, integer, jsonb) is
  'Submit a lineup. Locks are PER PLAYER: a card whose game has kicked off can neither leave the lineup nor join it, and every other slot stays editable. Only changed slots are written, so a locked slot keeps the points it has already earned.';
