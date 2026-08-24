-- Contests: the structure that lets a week hold more than one lineup.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
--
-- Eight slots can earn in a week and a roster holds thirty cards, so twenty-two
-- cards are inert. Inert cards cost nothing to hold, which is why the hoard
-- exists and why no reward schedule has ever argued it down: a bench card is
-- not being valued wrongly, it is not being valued at all.
--
-- More contests is the answer, but ONLY if a card can enter one of them. An
-- extra contest a card may also enter is another parking space and makes the
-- hoard more comfortable; an extra contest that COMPETES for the same card is
-- a demand on the roster. Exclusivity is the whole mechanism — it lands in
-- 20260825011000, and this migration is the structure it needs.
--
-- ---------------------------------------------------------------------------
-- THIS MIGRATION CHANGES NO BEHAVIOUR
-- ---------------------------------------------------------------------------
--
-- Deliberately. It is a schema change across the table every scoring path in
-- the game reads, so it lands on its own and proves itself first: afterwards
-- there is exactly one contest per week, everyone is in it, and every lineup
-- that existed before points at the one for its week. The lobby, the fees and
-- the payouts are later migrations that add rows to `contests`, not code.
--
-- ---------------------------------------------------------------------------
-- WHY FORMATS ARE A TABLE AND NOT A COLUMN
-- ---------------------------------------------------------------------------
--
-- Lobby contests must NOT be eight-card lineups. With exclusivity, entering
-- three of them would want three quarterbacks and three kickers, and both are
-- thin in a 976-card pool — contest entry would be rationed by kicker depth,
-- which is an absurd thing for a lobby to be gated on. Small formats (three
-- flex slots) have no positional bottleneck, so they are what the lobby runs.
--
-- That makes the slot list a property of the FORMAT rather than of the game,
-- which is what `lineup_slot_config` was. It is now a view over the `main`
-- format so the client keeps reading the name it already knows, and so there
-- is one source of truth rather than two that can drift.

-- --------------------------------------------------------------- formats

create table public.contest_formats (
  code          text primary key,
  name          text not null,
  -- Kept denormalised so a lobby listing can say "3 cards" without counting
  -- slots, and so a format with no slots seeded is an obvious error.
  slot_count    smallint not null check (slot_count > 0),
  description   text
);

create table public.contest_format_slots (
  format_code        text not null references public.contest_formats on delete cascade,
  slot               text not null,
  eligible_positions text[] not null,
  display_order      smallint not null,
  primary key (format_code, slot),
  unique (format_code, display_order)
);

insert into public.contest_formats (code, name, slot_count, description) values
  ('main',    'Full Roster', 8, 'The season-long format: a full lineup, every week, free.'),
  ('flex3',   'Flex Three',  3, 'Three cards, any of RB, WR or TE. No positional gate.'),
  ('wr_room', 'WR Room',     3, 'Three wide receivers.');

-- `main` is the eight slots 20260818030000 seeded, moved verbatim.
insert into public.contest_format_slots (format_code, slot, eligible_positions, display_order)
select 'main', slot, eligible_positions, display_order from public.lineup_slot_config;

insert into public.contest_format_slots (format_code, slot, eligible_positions, display_order) values
  ('flex3',   'FLEX1', array['RB','WR','TE'], 1),
  ('flex3',   'FLEX2', array['RB','WR','TE'], 2),
  ('flex3',   'FLEX3', array['RB','WR','TE'], 3),
  ('wr_room', 'WR1',   array['WR'],           1),
  ('wr_room', 'WR2',   array['WR'],           2),
  ('wr_room', 'WR3',   array['WR'],           3);

-- Assert the seed matches what the format claims, so a format added later
-- without its slots fails here rather than in a lobby.
do $$
declare v_bad text;
begin
  select string_agg(f.code, ', ') into v_bad
    from public.contest_formats f
    left join public.contest_format_slots s on s.format_code = f.code
   group by f.code, f.slot_count
  having count(s.slot) <> f.slot_count;
  if v_bad is not null then
    raise exception 'format slot_count disagrees with seeded slots: %', v_bad;
  end if;
end $$;

-- --------------------------------------------------------------- contests

-- 'free' is the one every account is in and never pays for. 'lobby' is opted
-- into. The distinction is load-bearing rather than cosmetic: the field median
-- is computed over the free contest ALONE, so a lobby can never move the
-- opponent that the season record is scored against.
create type public.contest_kind as enum ('free', 'lobby');

create table public.contests (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  kind           public.contest_kind not null,
  format_code    text not null references public.contest_formats,
  season         integer not null,
  season_type    smallint not null,
  week           integer not null,
  name           text not null,
  entry_fee_gems integer not null default 0 check (entry_fee_gems >= 0),
  -- Null is unlimited. A lobby contest sets it; the free contest never does.
  max_entrants   integer check (max_entrants is null or max_entrants > 1),
  created_at     timestamptz not null default now()
);

create index contests_slate_idx on public.contests (season, season_type, week);

-- Exactly one free contest per week, enforced rather than intended.
create unique index contests_one_free_per_week
  on public.contests (season, season_type, week) where kind = 'free';

-- The free contest is free. A fee on it would silently make the game's one
-- guaranteed weekly entry cost gems.
alter table public.contests add constraint contests_free_is_free
  check (kind <> 'free' or (entry_fee_gems = 0 and max_entrants is null));

alter table public.contest_formats      enable row level security;
alter table public.contest_format_slots enable row level security;
alter table public.contests             enable row level security;

create policy "formats are readable"      on public.contest_formats      for select to authenticated using (true);
create policy "format slots are readable" on public.contest_format_slots for select to authenticated using (true);
create policy "contests are readable"     on public.contests             for select to authenticated using (true);

-- ------------------------------------------------- lineup_slot_config -> view

-- The FK has to go before the table can: slot names are scoped to a format now,
-- so 'WR1' is a row in both `main` and `wr_room` and a global unique list of
-- names cannot describe them. `set_lineup` validates the slot against the
-- contest's own format instead, which is a stricter check than this FK was.
alter table public.lineup_slots drop constraint lineup_slots_slot_fkey;

drop table public.lineup_slot_config;

create view public.lineup_slot_config
  with (security_invoker = on)
  as select slot, eligible_positions, display_order
       from public.contest_format_slots
      where format_code = 'main';

grant select on public.lineup_slot_config to authenticated;

comment on view public.lineup_slot_config is
  'The main format''s slots. A view, not a table, since 20260825010000 — the '
  'slot list belongs to a contest format. New code should read '
  'contest_format_slots directly.';

-- ------------------------------------------------- the free contest, lazily

-- Idempotent, and the only way a free contest is ever created. Called by the
-- backfill below, by `set_lineup`, and by the sweep — so a week that gains
-- fixtures after this migration ran still gets its contest without anybody
-- remembering to make one.
create or replace function public.ensure_free_contest(
  p_season integer,
  p_season_type smallint,
  p_week integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid;
  v_code text := format('free:%s:%s:%s', p_season, p_season_type, p_week);
begin
  select id into v_id from public.contests where code = v_code;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.contests (code, kind, format_code, season, season_type, week, name)
  values (v_code, 'free', 'main', p_season, p_season_type, p_week,
          case when p_season_type = 1 then format('Preseason Week %s', p_week)
               else format('Week %s', p_week) end)
  on conflict (code) do nothing
  returning id into v_id;

  -- Lost the race; the other transaction's row is the answer.
  if v_id is null then
    select id into v_id from public.contests where code = v_code;
  end if;

  return v_id;
end;
$$;

grant execute on function public.ensure_free_contest(integer, smallint, integer) to authenticated;

-- --------------------------------------------------------- lineups.contest_id

alter table public.lineups add column contest_id uuid references public.contests;

-- Every week we hold fixtures for, plus every week somebody already has a
-- lineup in. The union matters: `backfill_week` can leave a lineup on a week
-- whose games were later re-slated, and that lineup still needs a contest.
do $$
declare r record;
begin
  for r in
    select distinct season, season_type, week from public.games where week is not null
    union
    select distinct season, season_type, week from public.lineups
  loop
    perform public.ensure_free_contest(r.season, r.season_type::smallint, r.week);
  end loop;
end $$;

update public.lineups l
   set contest_id = c.id
  from public.contests c
 where c.kind = 'free'
   and c.season = l.season
   and c.season_type = l.season_type
   and c.week = l.week
   and l.contest_id is null;

do $$
declare v_orphans integer;
begin
  select count(*) into v_orphans from public.lineups where contest_id is null;
  if v_orphans > 0 then
    raise exception 'backfill left % lineups without a contest', v_orphans;
  end if;
end $$;

alter table public.lineups alter column contest_id set not null;

-- One lineup per contest, replacing one lineup per week. The old constraint is
-- exactly the thing being removed — it is what made a second contest
-- impossible — so it is dropped rather than kept alongside.
alter table public.lineups drop constraint lineups_user_id_season_season_type_week_key;
alter table public.lineups add  constraint lineups_user_id_contest_key unique (user_id, contest_id);

create index lineups_contest_idx on public.lineups (contest_id);

-- season/season_type/week stay on `lineups` and stay authoritative. Every
-- scoring path in the game reads them (`score_week`, `award_score_gems`,
-- `award_position_bonuses`, `settle_week_payouts`, `week_recap`, the boards),
-- and rewriting all of them to reach through `contests` would be a much larger
-- change than this one for no gain. They must AGREE with the contest, which is
-- a trigger rather than a comment.
create or replace function public.lineup_matches_contest()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare c record;
begin
  select season, season_type, week into c from public.contests where id = new.contest_id;
  if c is null then
    raise exception 'lineup names a contest that does not exist' using errcode = '23503';
  end if;
  if (new.season, new.season_type, new.week) is distinct from (c.season, c.season_type, c.week) then
    raise exception
      'lineup slate (%/%/%) disagrees with its contest (%/%/%)',
      new.season, new.season_type, new.week, c.season, c.season_type, c.week
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger lineups_match_their_contest
  before insert or update of contest_id, season, season_type, week on public.lineups
  for each row execute function public.lineup_matches_contest();

-- --------------------------------------------------- the field is the free one

-- `median_record` unchanged but for the contest filter. Without it, the first
-- lobby contest shipped would silently fold its entries into the field median
-- and move the opponent every season record is scored against.
create or replace function public.median_record(p_season integer, p_season_type smallint default 2)
returns table(week integer, entrants bigint, low numeric, median numeric, average numeric,
              high numeric, final boolean, my_points numeric, my_rank bigint, ahead bigint, result text)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  with entries as (
    select l.week, l.user_id, l.total_points as pts
      from public.lineups l
      join public.contests c on c.id = l.contest_id and c.kind = 'free'
     where l.season = p_season
       and l.season_type = p_season_type
       and exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  field as (
    select e.week,
           count(*) as entrants,
           min(e.pts) as low,
           round(
             (percentile_cont(0.5) within group (order by e.pts::double precision))::numeric,
             2
           ) as median,
           round(avg(e.pts), 2) as average,
           max(e.pts)           as high
      from entries e
     group by e.week
  ),
  ranked as (
    select e.week, e.user_id, e.pts,
           rank() over (partition by e.week order by e.pts desc) as rnk
      from entries e
  ),
  mine as (
    select r.week, r.pts, r.rnk
      from ranked r
     where r.user_id = auth.uid()
  ),
  finality as (
    select g.week,
           bool_and(lower(coalesce(g.status_state, '')) in ('final', 'complete', 'completed'))
             as final
      from public.games g
     where g.season = p_season
       and g.season_type = p_season_type
       and g.week is not null
     group by g.week
  )
  select f.week,
         f.entrants,
         f.low,
         f.median,
         f.average,
         f.high,
         coalesce(fin.final, false) as final,
         m.pts as my_points,
         m.rnk as my_rank,
         case
           when m.pts is null then null
           else (select count(*) from entries x where x.week = f.week and x.pts < m.pts)
         end as ahead,
         case
           when m.pts is null then null
           when not coalesce(fin.final, false) then null
           when f.entrants < 2 then null
           when m.pts > f.median then 'W'
           when m.pts < f.median then 'L'
           else 'T'
         end as result
    from field f
    left join finality fin on fin.week = f.week
    left join mine     m   on m.week   = f.week
   order by f.week;
$$;

-- ------------------------------------------------------------- exclusivity

-- ONE CARD, ONE CONTEST, ONE WEEK.
--
-- This is the entire mechanism. Without it a second contest is another place to
-- park the same eight cards and the hoard gets more comfortable, not less; with
-- it, a second contest is a DEMAND on the roster, and the cards behind the
-- starters have to come out to meet it.
--
-- A trigger rather than a unique index because the rule spans tables: the card
-- is on `lineup_slots` and the slate is on `lineups`. Denormalising the slate
-- onto the slot would make it an index, but it would also make the slate two
-- facts that can disagree, which is the trade 20260821140000 already refused.
--
-- `set_lineup` checks this too, and says which contest the card is already in.
-- This is the backstop that makes the rule true no matter who writes the row.
create or replace function public.card_plays_one_contest()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_other text;
begin
  select c.name into v_other
    from public.lineups mine
    join public.lineup_slots ls on ls.card_instance_id = new.card_instance_id
    join public.lineups other   on other.id = ls.lineup_id
    join public.contests c      on c.id = other.contest_id
   where mine.id = new.lineup_id
     and other.user_id   = mine.user_id
     and other.season    = mine.season
     and other.season_type = mine.season_type
     and other.week      = mine.week
     and other.id <> mine.id
   limit 1;

  if v_other is not null then
    raise exception 'that card is already playing in another contest this week (%)', v_other
      using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger lineup_slots_one_contest_per_card
  before insert or update of card_instance_id, lineup_id on public.lineup_slots
  for each row execute function public.card_plays_one_contest();

-- --------------------------------------------------------------- set_lineup

-- 20260824230000's body, which is the LIVE definition read back with
-- pg_get_functiondef, plus three changes and nothing else:
--
--   * it takes a contest (null means the free one for the slate), and the slate
--     is derived FROM that contest rather than trusted from the caller;
--   * slots are validated against the contest's FORMAT, which is what the old
--     `lineup_slot_config` join did back when there was only one;
--   * a card already playing elsewhere this week is refused by name.
--
-- Everything else — the roster cap, the ownership and is_held check, the
-- per-player lock, the apply-only-what-changed write — is unchanged. This
-- function has now been rebuilt from a stale copy twice (see 20260824230000),
-- so: it was read from the database, not from a migration file.
drop function public.set_lineup(integer, smallint, integer, jsonb);

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
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be a json array' using errcode = '22023';
  end if;

  -- 0. THE ROSTER CAP (added by 20260824200700, preserved here).
  --
  --    Checked before anything else so the message names the thing the player
  --    actually has to fix, rather than whichever eligibility rule happened to
  --    fail first. The wording carries the remedy because it is shown verbatim.
  v_cap := public.game_config_value('roster_cap', 30);
  select count(*) into v_held
    from public.card_instances where user_id = v_user and is_held;

  if v_held > v_cap then
    raise exception
      'roster is over the limit: % of % cards. Commit % to a set or sell them to set your lineup.',
      v_held, v_cap, v_held - v_cap
      using errcode = '55006';
  end if;

  -- 0b. WHICH CONTEST. Null is the free one, which is what every caller written
  --     before contests existed means, and it is created on demand so a week
  --     that gains fixtures late still has one.
  if p_contest_code is null then
    v_contest := public.ensure_free_contest(p_season, p_season_type, p_week);
  else
    select id into v_contest from public.contests where code = p_contest_code;
    if v_contest is null then
      raise exception 'no such contest: %', p_contest_code using errcode = '22023';
    end if;
  end if;

  -- The slate is the CONTEST's, never the caller's. Taking the caller's would
  -- let a lineup be filed against week 4's contest carrying week 5's slate, and
  -- score_week reads the lineup's own columns.
  select season, season_type, week, format_code into v_c
    from public.contests where id = v_contest;

  if (p_season, p_season_type, p_week) is distinct from (v_c.season, v_c.season_type, v_c.week) then
    raise exception 'contest % is for %/%/%, not %/%/%',
      coalesce(p_contest_code, 'free'), v_c.season, v_c.season_type, v_c.week,
      p_season, p_season_type, p_week
      using errcode = '22023';
  end if;
  v_format := v_c.format_code;

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

  -- 1. every slot is a real slot IN THIS CONTEST'S FORMAT. A three-card lobby
  --    entry naming 'QB' is the error this catches, and it is why the old
  --    global slot list had to become a per-format one.
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

  -- 5b. ONE CARD, ONE CONTEST, ONE WEEK — named, so the player can act on it.
  --     The trigger on lineup_slots enforces the same rule; this exists to say
  --     WHICH contest is holding the card, which the trigger cannot do as
  --     cheaply and which is the whole difference between a usable refusal and
  --     a constraint violation.
  select string_agg(distinct format('%s %s (in %s)', p.first_name, p.last_name, oc.name), '; ')
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
    insert into public.lineups (user_id, season, season_type, week, contest_id)
    values (v_user, p_season, p_season_type, p_week, v_contest)
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
$function$;

grant execute on function public.set_lineup(integer, smallint, integer, jsonb, text) to authenticated;
