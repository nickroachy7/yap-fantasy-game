-- Sets are chases. Dailies are the faucet. They were the same thing, and that
-- is what this splits apart.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG
-- ---------------------------------------------------------------------------
--
-- Two families shipped together and only one of them was a set.
--
-- A TEAM set asks for a club's whole printed roster — 27-33 cards, ~3,900 draws
-- to finish under coupon-collecting — and pays at a quarter, half, three
-- quarters and all of it. That is the right shape: constant visible progress
-- against something you may never finish, with the big tranche permanently out
-- of reach of a season's drawing. It is unchanged here.
--
-- A POSITION set asked for SIX cards out of a pool of 41 to 398. The previous
-- migration's own note admitted the problem in passing — "all 398 wide
-- receivers is not a set, it is a list" — and then set the target at six to
-- work around it. Six of a group of hundreds is not a checklist you complete;
-- it is a quota you clear by accident, four times over, on the way to
-- something else. Five of them, at 225 gems a ladder, turned the Sets tab into
-- a trickle: gems arrived constantly, in small amounts, for nothing that felt
-- like collecting.
--
-- The trickle is worth having. It just should not be wearing a set's clothes,
-- because it teaches the wrong thing about what a set is on the one screen
-- whose job is to teach that.
--
-- ---------------------------------------------------------------------------
-- SO: POSITION SETS RETIRE, DAILY SETS ARRIVE
-- ---------------------------------------------------------------------------
--
-- DEACTIVATED, NOT DELETED, and the difference is somebody's cards. Committing
-- BURNS a card permanently; deleting a set the burns point at would strand
-- them, and `set_milestone_claims` is explicitly never rewritten so that a
-- re-tuned ladder cannot rewrite what a player was paid. The rows stay, the
-- claims stay, the sets stop being offered. `is_active` is the switch that
-- already exists for exactly this.
--
-- A DAILY SET is the same machinery at a different scale: one position, THREE
-- cards, one rung, one day. Membership is the whole position pool, so it is
-- always completable out of whatever junk is in hand — which is the point. It
-- rotates through QB, RB, WR, TE and PK on a fixed cycle off the date, so
-- there is no state to keep and no job that can drift: the same day always
-- produces the same set.
--
-- ---------------------------------------------------------------------------
-- WHAT IT PAYS, AND WHY 40
-- ---------------------------------------------------------------------------
--
-- A daily must beat the sell button and must lose to the pack that dealt the
-- cards. Those two are the whole bracket.
--
--   Selling three bronze              3 x 8  =  24 gems
--   Committing three bronze     3 x 8 x 50%  =  12 gems, plus the rung
--   What three cards cost in packs   3 x 20  =  60 gems
--
-- Above 12 the daily beats selling, which is what makes it worth doing at all.
-- Below 48 the daily loses to the packs, because 12 + 48 is exactly the 60 the
-- cards cost — so buying packs to feed a daily is a loss at any price under
-- that, and cannot be farmed.
--
-- 40 sits in the middle with room on both sides: 52 against 24 for selling, and
-- 52 against 60 for buying. It is a better home for junk than the sell button
-- and a worse business than not playing. That is what a daily faucet should be.
--
-- ONE A DAY IS THE CAP, and it is structural rather than enforced: there is one
-- daily set per date, its rung claims once, and yesterday's is inactive. There
-- is no rate limit to get wrong.
--
-- THE COMMIT PAYOUT RIDES ALONG unchanged at 50%, as on every other set. The
-- daily's 40 is on top of it, not instead.

-- ---------------------------------------------------------------- family

-- FOUND BY DEFINITION, NOT BY NAME. The original constraint was written inline
-- (`family text not null check (...)`), so its name is whatever Postgres
-- generated — `card_sets_family_check` on every version we have seen, but a
-- `drop constraint if exists` that guesses wrong fails SILENTLY and then the
-- ADD below succeeds beside the old one, leaving a table that still refuses
-- 'daily' with no error until the first daily is built. Dropping whatever
-- actually constrains `family` is the version that cannot half-work.
do $$
declare
  v_name text;
begin
  for v_name in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'card_sets'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%family%'
  loop
    execute format('alter table public.card_sets drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.card_sets
  add constraint card_sets_family_check check (family in ('team', 'position', 'daily'));

comment on column public.card_sets.family is
  '''team'' | ''position'' | ''daily''. Position is retired and kept only so existing rows and claims stay readable; nothing seeds it any more.';

-- The day a daily set is FOR. Null on a standing set, which is every other
-- family — a team set is for the season, not for a date.
alter table public.card_sets add column if not exists opens_on date;

comment on column public.card_sets.opens_on is
  'The date a daily set belongs to. Null for standing sets. The client shows the active daily and nothing else, so this is a label rather than a gate.';

create index if not exists card_sets_daily_day_idx
  on public.card_sets (opens_on desc)
  where family = 'daily';

-- ---------------------------------------------------------------- rotation

-- Which position a given day asks for.
--
-- DERIVED FROM THE DATE, not stored and not random. A stored rotation is state
-- that can drift when a rebuild is missed or run twice; a random one cannot be
-- reproduced when somebody asks why yesterday wanted kickers. This is a pure
-- function of the day, so a backfill and a live run agree by construction.
--
-- Five positions on a five-day cycle against a seven-day week means the same
-- position lands on a different weekday each time round, which is the point —
-- a fixed weekday map would make Sunday permanently the kicker day.
create or replace function public.daily_set_position(p_day date)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select (array['QB', 'RB', 'WR', 'TE', 'PK'])[
    (p_day - date '2026-01-01') % 5 + 1
  ];
$$;

comment on function public.daily_set_position(date) is
  'The position a given day''s daily set asks for. Pure in the date, so it can be reproduced and backfilled.';

-- ---------------------------------------------------------------- rebuild

-- How many cards a daily asks for, and what clearing it pays. Named constants
-- in one place because the header above argues about these two numbers and
-- nothing else.
create or replace function public.rebuild_daily_set(p_season integer, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_required constant smallint := 3;
  v_reward   constant integer  := 40;
  v_pos      text;
  v_code     text;
  v_set      uuid;
  v_members  integer := 0;
begin
  v_pos  := public.daily_set_position(p_day);
  v_code := format('daily-%s-%s', lower(v_pos), to_char(p_day, 'YYYY-MM-DD'));

  insert into public.card_sets (code, name, family, subtitle, season, required_count,
                                sort_order, is_active, opens_on)
  values (v_code,
          format('%s of the day', initcap(
            case v_pos
              when 'QB' then 'quarterback'
              when 'RB' then 'running back'
              when 'WR' then 'wide receiver'
              when 'TE' then 'tight end'
              else 'kicker'
            end)),
          'daily',
          to_char(p_day, 'FMDay DD FMMonth'),
          p_season,
          v_required,
          0,
          true,
          p_day)
  on conflict (code) do update
     set name           = excluded.name,
         subtitle       = excluded.subtitle,
         required_count = excluded.required_count,
         is_active      = true,
         opens_on       = excluded.opens_on
  returning id into v_set;

  -- The whole position pool. A daily has to be clearable out of whatever is in
  -- hand or it is not a faucet, and membership this wide is what guarantees it.
  with added as (
    insert into public.card_set_members (set_id, card_id)
    select v_set, c.id
      from public.cards c
      join public.players p on p.id = c.player_id
     where c.season = p_season
       and c.is_mintable
       -- The feed spells a kicker 'PK', which is what the rotation holds, so
       -- this is a straight match rather than the client's PK/K normalisation.
       and upper(p.position_abbreviation) = v_pos
    on conflict do nothing
    returning 1
  )
  select count(*) into v_members from added;

  -- ONE RUNG, at completion. A three-card set with four rungs would pay at one
  -- card, which is the trickle this migration exists to remove.
  insert into public.card_set_milestones (set_id, threshold_pct, reward_gems)
  values (v_set, 100, v_reward)
  on conflict (set_id, threshold_pct) do update
     set reward_gems = excluded.reward_gems;

  delete from public.card_set_milestones
   where set_id = v_set
     and threshold_pct <> 100;

  -- Yesterday's is over. Deactivating rather than deleting, for the same
  -- reason the position sets survive: cards were burnt into it.
  update public.card_sets
     set is_active = false
   where family = 'daily'
     and opens_on < p_day
     and is_active;

  return jsonb_build_object('day', p_day, 'position', v_pos, 'code', v_code,
                            'members_added', v_members);
end;
$$;

revoke execute on function public.rebuild_daily_set(integer, date) from public, anon, authenticated;

comment on function public.rebuild_daily_set(integer, date) is
  'Ensures the daily set for one date exists, with its membership and its single rung, and retires anything older. Idempotent.';

-- ---------------------------------------------------------------- rebuild

create or replace function public.rebuild_card_sets(p_season integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sets    integer := 0;
  v_members integer := 0;
begin
  -- ---------------------------------------------------------------- teams
  with rostered as (
    select t.id            as team_id,
           t.abbreviation,
           coalesce(t.full_name, t.abbreviation) as full_name,
           t.conference,
           t.division,
           c.id            as card_id
      from public.cards c
      join public.players p on p.id = c.player_id
      join public.teams   t on t.id = p.team_id
     where c.season = p_season
       and c.is_mintable
  ),
  defs as (
    select distinct
           format('team-%s-%s', lower(abbreviation), p_season) as code,
           full_name as name,
           nullif(trim(upper(coalesce(conference, '')) || ' ' ||
                       initcap(lower(coalesce(division, '')))), '') as subtitle,
           team_id,
           abbreviation
      from rostered
  ),
  upserted as (
    insert into public.card_sets (code, name, family, subtitle, season, required_count,
                                  sort_order, is_active)
    select d.code, d.name, 'team', d.subtitle, p_season,
           -- Placeholder: the real figure is the membership, which does not
           -- exist until the insert below has run.
           1,
           (row_number() over (order by d.subtitle nulls last, d.name))::integer,
           true
      from defs d
    on conflict (code) do update
       set name       = excluded.name,
           subtitle   = excluded.subtitle,
           sort_order = excluded.sort_order,
           is_active  = true
    returning id, code
  ),
  members as (
    insert into public.card_set_members (set_id, card_id)
    select u.id, r.card_id
      from upserted u
      join defs d on d.code = u.code
      join rostered r on r.team_id = d.team_id
    on conflict do nothing
    returning 1
  )
  select (select count(*) from upserted), (select count(*) from members)
    into v_sets, v_members;

  -- ALL OF IT. A team set is the club's whole printed roster, so the
  -- requirement follows the membership and rises when a signing adds a card.
  -- A player mid-ladder is not stranded by that: the rungs are percentages, so
  -- they move with it, and anything already claimed stays claimed.
  update public.card_sets s
     set required_count = m.total::smallint
    from (
      select set_id, count(*)::integer as total
        from public.card_set_members
       group by set_id
    ) m
   where m.set_id = s.id
     and s.season = p_season
     and s.family = 'team'
     and s.required_count <> m.total;

  -- ---------------------------------------------------------------- retired
  --
  -- The position family stops being offered. Deactivated rather than deleted
  -- because cards were BURNT into these sets and `set_milestone_claims` is
  -- never rewritten — the rows, the members and anybody's claims stay exactly
  -- as they were, and the set simply stops appearing.
  update public.card_sets
     set is_active = false
   where family = 'position'
     and is_active;

  -- ---------------------------------------------------------------- the ladder
  insert into public.card_set_milestones (set_id, threshold_pct, reward_gems)
  select s.id, l.pct, l.gems
    from public.card_sets s
    join lateral (
      select *
        from (values
          ('team',  25::smallint,  100),
          ('team',  50::smallint,  500),
          ('team',  75::smallint, 1500),
          ('team', 100::smallint, 5000)
        ) as v(family, pct, gems)
       where v.family = s.family
    ) l on true
   where s.season = p_season
  on conflict (set_id, threshold_pct) do update
     set reward_gems = excluded.reward_gems;

  -- A set nothing landed in is a set that would read as broken. Deactivating
  -- is not deleting: it keeps its code, its members and anybody's claim.
  update public.card_sets s
     set is_active = false
   where s.season = p_season
     and s.family = 'team'
     and not exists (select 1 from public.card_set_members m where m.set_id = s.id);

  return jsonb_build_object('season', p_season, 'sets', v_sets, 'members_added', v_members);
end;
$$;


revoke execute on function public.rebuild_card_sets(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- my_sets
--
-- UNTOUCHED, deliberately.
--
-- The view already ends `where s.is_active`, which is the whole of the
-- position family's removal: nothing selects an inactive set, so deactivating
-- them above retires them from every screen at once. And it is family-agnostic
-- about everything else — progress, the ladder, the claimable total — so a
-- daily set reads through it correctly the moment one exists.
--
-- `opens_on` is not exposed on it. The client tells a daily by its family, and
-- adding a column would mean dropping and rebuilding the view (a column list
-- cannot be replaced in place) and regenerating `database.types.ts` for a
-- field nothing reads. When a daily grows a countdown, that is the migration
-- to add it in.
