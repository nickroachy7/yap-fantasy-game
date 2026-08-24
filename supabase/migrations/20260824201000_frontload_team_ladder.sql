-- Moving the team ladder's money to the rungs that exist in practice, and
-- making the ladder DATA so this is the last time a rebuild can revert it.
--
-- ---------------------------------------------------------------------------
-- THE SHAPE WAS WRONG, NOT THE NUMBER OF RUNGS
-- ---------------------------------------------------------------------------
--
-- Four rungs is a good structure and it is unchanged. What was wrong is where
-- the money sat:
--
--   25%    100        50%    500        75%   1500       100%   5000
--
-- A team set is a club's whole printed roster, 27-33 cards. Under coupon
-- collecting over a 968-card pool the 75% and 100% rungs are thousands of draws
-- away and will not be reached by anybody, in any season. So 92% of the
-- ladder's 7,100 gems was parked behind rungs that do not happen, while the ONE
-- rung a player can actually reach paid 100 gems — a fifth of a pack — for
-- roughly 250 draws of luck. Against the ~5,000 gems of packs it takes in
-- expectation to get there, that rung was an insult with a progress bar.
--
--   25%    400        50%   1200        75%   2500       100%   5000
--
-- Reachable value goes from 100 to between 400 and 1,600 depending on how far a
-- season gets. The total rises from 7,100 to 9,100, which is the smaller
-- change: the top rungs still hold most of the money and still will not be
-- claimed. This is a redistribution, not a raise.
--
-- IT INTERACTS WITH THE ROSTER CAP, deliberately. A capped player sheds roughly
-- 270 cards a season and the exit that preserves their board value is
-- committing, so rung progress is about to accelerate sharply for everybody.
-- That is exactly when the reachable rungs need to be worth reaching, and also
-- why the top of the ladder was left alone rather than lifted with the rest.
--
-- DAILIES ARE UNTOUCHED. The daily's 40 sits inside a measured bracket — above
-- 24 so it beats selling three bronze, below 48 so buying packs to feed it is a
-- loss — and nothing here disturbs it. The retired position family keeps its
-- figures too, so that `set_milestone_claims`, which is never rewritten,
-- continues to agree with what people were actually paid.
--
-- ---------------------------------------------------------------------------
-- WHY THE LADDER BECOMES A TABLE
-- ---------------------------------------------------------------------------
--
-- Because it was hardcoded in TWO places — `rebuild_card_sets` re-seeds it from
-- an inline VALUES list on every run — an UPDATE against
-- `card_set_milestones` alone would be silently reverted the next time a
-- signing triggered a rebuild. The bug would appear days later, look like
-- nothing, and be attributed to anything but this.
--
-- Restating a hundred-line function to change four integers is the other
-- option, and it leaves the same trap armed for whoever tunes it next. So the
-- figures move into a table the rebuild reads, which is the choice `packs.odds`
-- and `card_set_milestones.reward_gems` already made for the same reason.

-- ---------------------------------------------------------------- the source

create table if not exists public.card_set_ladder_defaults (
  family        text     not null,
  threshold_pct smallint not null check (threshold_pct between 1 and 100),
  reward_gems   integer  not null check (reward_gems >= 0),
  primary key (family, threshold_pct)
);

alter table public.card_set_ladder_defaults enable row level security;

drop policy if exists "ladder defaults are readable" on public.card_set_ladder_defaults;
create policy "ladder defaults are readable"
  on public.card_set_ladder_defaults for select to authenticated
  using (true);

insert into public.card_set_ladder_defaults (family, threshold_pct, reward_gems) values
  ('team',   25,  400),
  ('team',   50, 1200),
  ('team',   75, 2500),
  ('team',  100, 5000),
  -- Carried over exactly as they were. The daily ladder is a single rung and
  -- `rebuild_daily_set` owns it; it is listed here only so that this table is
  -- the whole answer to "what does a family pay" rather than most of it.
  ('daily', 100,   40)
on conflict (family, threshold_pct) do update
  set reward_gems = excluded.reward_gems;

comment on table public.card_set_ladder_defaults is
  'What each set family pays at each rung. Read by rebuild_card_sets, so re-tuning here survives a rebuild. Does not rewrite set_milestone_claims — anybody already paid keeps what they were paid.';

-- ---------------------------------------------------------------- apply now

update public.card_set_milestones ms
   set reward_gems = d.reward_gems
  from public.card_sets s,
       public.card_set_ladder_defaults d
 where ms.set_id = s.id
   and s.family = d.family
   and ms.threshold_pct = d.threshold_pct
   and ms.reward_gems is distinct from d.reward_gems;

-- ---------------------------------------------------------------- the rebuild
--
-- Restated whole because it is CREATE OR REPLACE and there is no partial form.
-- The ONLY change is the ladder block at the end, which now selects from
-- card_set_ladder_defaults instead of an inline VALUES list. Everything above
-- it is byte-for-byte the body from 20260821090000_daily_sets.sql.

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
  update public.card_sets
     set is_active = false
   where family = 'position'
     and is_active;

  -- ---------------------------------------------------------------- the ladder
  --
  -- THE ONE CHANGED BLOCK. Figures come from card_set_ladder_defaults, so
  -- re-tuning a rung is an UPDATE against that table and a rebuild will not
  -- undo it. `where d.family = s.family` keeps the join family-scoped exactly
  -- as the inline VALUES list did, so a family with no defaults row (the
  -- retired 'position' family) is left alone rather than zeroed.
  insert into public.card_set_milestones (set_id, threshold_pct, reward_gems)
  select s.id, d.threshold_pct, d.reward_gems
    from public.card_sets s
    join public.card_set_ladder_defaults d on d.family = s.family
   where s.season = p_season
  on conflict (set_id, threshold_pct) do update
     set reward_gems = excluded.reward_gems;

  update public.card_sets s
     set is_active = false
   where s.season = p_season
     and s.family = 'team'
     and not exists (select 1 from public.card_set_members m where m.set_id = s.id);

  return jsonb_build_object('season', p_season, 'sets', v_sets, 'members_added', v_members);
end;
$$;

revoke execute on function public.rebuild_card_sets(integer) from public, anon, authenticated;
