-- Sets — the thing the Sets tab said was not built yet.
--
-- Schema v1 deferred these deliberately ("no set/museum tables: sets ship
-- Week 3 as a purely additive migration"). This is that migration: nothing
-- here alters a v1 table, and dropping every object in this file would leave
-- the rest of the game exactly as it was.
--
-- ---------------------------------------------------------------------------
-- WHY COMPLETION IS A THRESHOLD AND NOT "OWN ALL OF THEM"
-- ---------------------------------------------------------------------------
--
-- The Sets screen used to state that a set would be completed "by owning all
-- of them". That rule does not survive contact with this game's pack maths, so
-- it is not the rule shipped here, and the arithmetic is worth writing down
-- because it is what decides every number below.
--
-- The 2026 pool is 968 mintable cards. A pack deals 5 for 100 gems. Expected
-- draws to collect N SPECIFIC cards out of a pool of P is P x (1/1 + 1/2 + ...
-- + 1/N) — so a named five-card set costs, in expectation,
--
--   968 x (1 + 1/2 + 1/3 + 1/4 + 1/5) = 2,210 draws = 442 packs = 44,200 gems
--
-- against a season's income of roughly 6,000 gems (250 a week plus 0.5 a
-- fantasy point). "Own all of them" is therefore not a hard set, it is an
-- unreachable one — for everybody, every season. Printing it as the rule would
-- have been a promise the economy cannot keep.
--
-- So a set here is a NAMED GROUP with a THRESHOLD: own any `required_count`
-- distinct cards from its membership. That single change makes the cost
-- tractable, because collecting K of a group of M is cheap where collecting K
-- SPECIFIC cards is not:
--
--   expected draws for K distinct from a group of M = sum(P / (M - i)), i<K
--
-- ---------------------------------------------------------------------------
-- THE TWO FAMILIES, AND WHY EACH IS A FRACTION
-- ---------------------------------------------------------------------------
--
-- Both requirements are stated as a fraction of the group, not as a number
-- somebody picked. A fraction keeps difficulty even across groups of very
-- different sizes — the 41 kickers and the 398 wide receivers are not the same
-- pool — and it is the one form of the rule a player can hold in their head.
--
--   POSITION sets: a twentieth of the position (5%). QB 6 of 120, RB 11 of
--   201, WR 20 of 398, TE 11 of 208, PK 3 of 41. Every one of them costs about
--   50 draws — ten packs — because 5% of a group is ~P/20 draws whatever the
--   group's size. These are the early-game sets: the first thing a new player
--   completes, and how the mechanic teaches itself.
--
--   TEAM sets: a fifth of the roster (20%). Rosters run 27-33 cards, so 6 or
--   7, at about 210 draws — 42 packs — each. These are the season-long chase.
--   A season of draws (~300 cards) completes all five position sets and a
--   handful of teams, which is the shape wanted: something to finish in week
--   two, something still unfinished in December.
--
-- REWARDS ARE GEMS, ONE-TIME, AND CANNOT BE FARMED. 150 for a position set,
-- 500 for a team set — the 3.3x ratio is roughly the 4x difficulty ratio
-- above, blunted so the long chase is not the only thing worth doing. A team
-- set pays 500 gems for ~4,200 gems of expected packs, so buying packs to
-- complete sets is a heavy loss, exactly as selling cards is. Sets pay you for
-- collecting; they are not a way to make money collecting.
--
-- The other two candidates the old screen listed — gated lineup slots and
-- duplicate fuel — are NOT implemented and nothing here presumes them. Both
-- would change what a card is for; a gem payout changes nothing except the
-- balance, which is why it is the one that can ship first.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT HERE
-- ---------------------------------------------------------------------------
--
-- No way to TARGET a set. Packs are uniform over the pool, so progress is
-- something that happens to you rather than something you steer. That is a
-- real limitation and the obvious next lever is a team pack; it is not
-- pretended away anywhere in the UI.

-- ---------------------------------------------------------------- tables

-- The definition. Contents live in card_set_members; nothing about a player or
-- a team is duplicated onto this row except the name it is printed under.
create table public.card_sets (
  id             uuid primary key default gen_random_uuid(),
  -- Stable, human-readable and the client's handle: 'team-buf-2026'. The
  -- claim RPC takes a code rather than an id for the same reason open_pack
  -- takes a pack code.
  code           text not null unique,
  name           text not null,
  -- 'team' | 'position'. Text with a CHECK rather than an enum: a third family
  -- is an UPDATE to this constraint, where an enum would be a two-migration
  -- dance (see the gem_reason note next door).
  family         text not null check (family in ('team', 'position')),
  -- Context under the name — a division for a team set. Never a rule or a
  -- number; the view computes those.
  subtitle       text,
  season         integer not null,
  -- How many DISTINCT member cards you must hold. Derived from the membership
  -- by rebuild_card_sets, never typed in by hand.
  required_count smallint not null check (required_count > 0),
  reward_gems    integer not null default 0 check (reward_gems >= 0),
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index card_sets_family_idx on public.card_sets (family, sort_order) where is_active;

comment on table public.card_sets is
  'A named group of cards, completed by owning `required_count` distinct members. See the header of 20260819235100_card_sets.sql for why completion is a threshold rather than the whole group.';

-- Membership is a printed checklist: once a card is in a set it stays in it.
--
-- A player traded in November does not fall out of the set his card was
-- printed into — removing him would shrink somebody's progress overnight, and
-- would do it retroactively to a set they might already have claimed. The
-- rebuild only ever ADDS. See rebuild_card_sets.
create table public.card_set_members (
  set_id  uuid not null references public.card_sets on delete cascade,
  card_id uuid not null references public.cards     on delete cascade,
  primary key (set_id, card_id)
);

-- The join in `my_sets` runs card_instances -> members, so this is the index
-- that side needs.
create index card_set_members_card_idx on public.card_set_members (card_id);

-- One row per user per set, written by claim_set_reward and never updated.
--
-- It records that the reward was PAID, which is a different fact from "this
-- set is currently complete". Selling the cards afterwards does not claw the
-- gems back and does not delete this row — the same posture as sell_card's
-- frozen `sold_for`. Progress is always recomputed live from what is held, so
-- a set can read "claimed" and "4 of 6" at once, and that is the truth.
create table public.set_completions (
  user_id        uuid not null references auth.users      on delete cascade,
  set_id         uuid not null references public.card_sets on delete cascade,
  completed_at   timestamptz not null default now(),
  -- What was held at the moment of the claim, so a later sale cannot make the
  -- payout look unearned.
  owned_at_claim smallint not null check (owned_at_claim >= 0),
  -- Frozen, so re-tuning a set's reward never rewrites what somebody was paid.
  reward_gems    integer not null check (reward_gems >= 0),
  primary key (user_id, set_id)
);

-- ---------------------------------------------------------------- RLS
--
-- Same posture as everything else: definitions are reference data, ownership
-- is read-only to its owner, and there is no write policy anywhere. The only
-- path that writes a completion is claim_set_reward, which is SECURITY
-- DEFINER. Assume the caller is running curl.

alter table public.card_sets        enable row level security;
alter table public.card_set_members enable row level security;
alter table public.set_completions  enable row level security;

create policy "card sets are readable"
  on public.card_sets for select to authenticated
  using (is_active);

create policy "set members are readable"
  on public.card_set_members for select to authenticated
  using (true);

create policy "users read their own set completions"
  on public.set_completions for select to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------- my_sets
--
-- Every active set with the caller's progress against it, in one request.
--
-- security_invoker = on is load-bearing twice over: card_instances' RLS is
-- what makes `owned` the CALLER's count, and set_completions' RLS is what
-- makes `claimed_at` theirs. A definer view here would report the whole
-- game's ownership to everybody.
create view public.my_sets
with (security_invoker = on) as
select s.id   as set_id,
       s.code,
       s.name,
       s.family,
       s.subtitle,
       s.season,
       s.required_count,
       s.reward_gems,
       s.sort_order,
       m.total_cards,
       o.owned,
       -- Threshold, not "all of them". See the file header.
       (o.owned >= s.required_count) as complete,
       sc.completed_at as claimed_at,
       sc.reward_gems  as claimed_gems
  from public.card_sets s
  cross join lateral (
    select count(*)::integer as total_cards
      from public.card_set_members mm
     where mm.set_id = s.id
  ) m
  cross join lateral (
    -- DISTINCT card_id: three copies of the same player are one tick on the
    -- checklist. Duplicates are what the sell button is for.
    select count(distinct mm.card_id)::integer as owned
      from public.card_set_members mm
      join public.card_instances ci
        on ci.card_id = mm.card_id
       and ci.sold_at is null
     where mm.set_id = s.id
  ) o
  left join public.set_completions sc on sc.set_id = s.id
 where s.is_active;

grant select on public.my_sets to authenticated;

-- ---------------------------------------------------------------- set_checklist
--
-- One set's membership, with the caller's ownership marked against it: the
-- detail screen behind a row in `my_sets`.
--
-- A view would have done, except that a set is addressed by code and a view
-- cannot take one — so this is a function, and it is `stable` + invoker
-- rights rather than definer because everything it reads is either reference
-- data or the caller's own cards. There is nothing here RLS needs bypassing
-- for, and a definer function would have had to re-derive the ownership scope
-- by hand.
create or replace function public.set_checklist(p_set_code text)
returns table (
  card_id                uuid,
  player_id              uuid,
  player_name            text,
  position_abbreviation  text,
  team_abbreviation      text,
  rarity                 public.rarity,
  season_fp              numeric,
  owned                  integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select d.card_id,
         d.player_id,
         d.player_name,
         d.position_abbreviation,
         d.team_abbreviation,
         d.rarity,
         d.season_fp,
         (select count(*)::integer
            from public.card_instances ci
           where ci.card_id = d.card_id
             and ci.sold_at is null) as owned
    from public.card_set_members m
    join public.card_sets s        on s.id = m.set_id
    -- player_directory already flattens card -> player -> team plus the
    -- season's production, and is itself security_invoker. Reusing it keeps
    -- the checklist and the Players boards showing the same numbers for the
    -- same card. It filters on is_mintable, so a card withdrawn from the pool
    -- drops off the checklist while staying a member and staying counted by
    -- my_sets -- the honest reading of "this was printed and no longer is".
    join public.player_directory d on d.card_id = m.card_id
   where s.code = p_set_code
     and s.is_active
   -- Best first. The checklist is also a scouting list: a missing card near
   -- the top is a card worth wanting.
   order by d.season_fp desc, d.player_name;
$$;

revoke execute on function public.set_checklist(text) from public, anon;
grant  execute on function public.set_checklist(text) to authenticated;

-- ---------------------------------------------------------------- claim_set_reward
--
-- The only path that pays a set reward. There is no INSERT policy on
-- set_completions, gem_balances or gems_ledger, so this function is the whole
-- surface — the same posture as open_pack and sell_card.
create or replace function public.claim_set_reward(p_set_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_set     public.card_sets%rowtype;
  v_balance integer;
  v_total   integer;
  v_owned   integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_set
    from public.card_sets
   where code = p_set_code
     and is_active;

  if not found then
    raise exception 'no such set' using errcode = '22023';
  end if;

  -- Wallet first. open_pack and sell_card both take the wallet lock before
  -- anything else, and two functions that lock the same pair in opposite
  -- orders deadlock under concurrency. It is also what serialises a
  -- double-tapped claim: the second call waits here and then fails the
  -- already-claimed check below rather than paying twice.
  select balance into v_balance
    from public.gem_balances
   where user_id = v_user
     for update;

  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.set_completions
     where user_id = v_user and set_id = v_set.id
  ) then
    raise exception 'you have already claimed this set' using errcode = '22023';
  end if;

  select count(*)::integer into v_total
    from public.card_set_members
   where set_id = v_set.id;

  -- SECURITY DEFINER bypasses RLS, so the owner is filtered explicitly here —
  -- without the user_id predicate this would count the whole game's copies and
  -- every set would be complete for everybody.
  select count(distinct m.card_id)::integer into v_owned
    from public.card_set_members m
    join public.card_instances ci
      on ci.card_id = m.card_id
     and ci.user_id = v_user
     and ci.sold_at is null
   where m.set_id = v_set.id;

  if v_owned < v_set.required_count then
    raise exception 'set is not complete: you hold % of the % needed', v_owned, v_set.required_count
      using errcode = '55006';
  end if;

  insert into public.set_completions (user_id, set_id, owned_at_claim, reward_gems)
  values (v_user, v_set.id, v_owned, v_set.reward_gems);

  -- gems_ledger has CHECK (amount <> 0), so a zero-reward set is recorded as
  -- completed with nothing in the ledger rather than failing the claim.
  if v_set.reward_gems > 0 then
    update public.gem_balances
       set balance = balance + v_set.reward_gems, updated_at = now()
     where user_id = v_user;

    -- The completion PK already makes a double claim impossible; the
    -- idempotency key is the second belt, and it is the one that shows up in
    -- the ledger rather than as a constraint name.
    insert into public.gems_ledger (user_id, amount, reason, reference_id, idempotency_key)
    values (v_user, v_set.reward_gems, 'set_reward', v_set.id,
            format('set_reward:%s:%s', v_user, v_set.id));
  end if;

  return jsonb_build_object(
    'set_code',    v_set.code,
    'set_name',    v_set.name,
    'owned',       v_owned,
    'total_cards', v_total,
    'required',    v_set.required_count,
    'reward_gems', v_set.reward_gems,
    'balance',     v_balance + v_set.reward_gems
  );
end;
$$;

revoke execute on function public.claim_set_reward(text) from public, anon;
grant  execute on function public.claim_set_reward(text) to authenticated;

-- ---------------------------------------------------------------- rebuild_card_sets
--
-- Builds a season's sets from the card pool. ADMIN ONLY — not granted to
-- authenticated — and safe to re-run: it upserts definitions by code, adds
-- members it has not seen, and never removes one.
--
-- Re-running after new cards are minted (a signing, a practice-squad call-up)
-- grows the membership and therefore the requirement, because the requirement
-- is a FRACTION of the group. A player who has already claimed keeps the
-- reward — set_completions is never rewritten — so the bar can rise but it can
-- never take anything back. Worth running after sync-cards.
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
  --
  -- One set per team, named for the club and captioned with its division.
  -- Teams with no mintable cards are skipped rather than printed empty.
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
           -- "AFC East". The provider stores both halves upper-cased, and a
           -- straight copy reads as shouting next to the club's own name.
           nullif(trim(upper(coalesce(conference, '')) || ' ' ||
                       initcap(lower(coalesce(division, '')))), '') as subtitle,
           team_id,
           abbreviation
      from rostered
  ),
  upserted as (
    insert into public.card_sets (code, name, family, subtitle, season, required_count,
                                  reward_gems, sort_order, is_active)
    select d.code, d.name, 'team', d.subtitle, p_season,
           -- Placeholder: the real figure is a fraction of the membership,
           -- which does not exist until the insert below has run.
           1, 500,
           -- Divisions together, clubs alphabetical inside them.
           (row_number() over (order by d.subtitle nulls last, d.name))::integer,
           true
      from defs d
    on conflict (code) do update
       set name        = excluded.name,
           subtitle    = excluded.subtitle,
           reward_gems = excluded.reward_gems,
           sort_order  = excluded.sort_order,
           is_active   = true
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

  -- ---------------------------------------------------------------- positions
  --
  -- One set per lineup position. The five labels are the only invented text in
  -- this function, and they are names for things that already exist rather
  -- than a mechanic.
  with labels (pos, label, ord) as (
    values ('QB', 'Quarterbacks', 1),
           ('RB', 'Running Backs', 2),
           ('WR', 'Wide Receivers', 3),
           ('TE', 'Tight Ends', 4),
           ('PK', 'Kickers', 5)
  ),
  pooled as (
    select l.pos, l.label, l.ord, c.id as card_id
      from public.cards c
      join public.players p on p.id = c.player_id
      join labels l on l.pos = upper(p.position_abbreviation)
     where c.season = p_season
       and c.is_mintable
  ),
  defs as (
    select distinct
           format('position-%s-%s', lower(pos), p_season) as code,
           label as name,
           pos,
           ord
      from pooled
  ),
  upserted as (
    insert into public.card_sets (code, name, family, subtitle, season, required_count,
                                  reward_gems, sort_order, is_active)
    select d.code, d.name, 'position', null, p_season, 1, 150, d.ord, true
      from defs d
    on conflict (code) do update
       set name        = excluded.name,
           reward_gems = excluded.reward_gems,
           sort_order  = excluded.sort_order,
           is_active   = true
    returning id, code
  ),
  members as (
    insert into public.card_set_members (set_id, card_id)
    select u.id, p.card_id
      from upserted u
      join defs d on d.code = u.code
      join pooled p on p.pos = d.pos
    on conflict do nothing
    returning 1
  )
  select v_sets + (select count(*) from upserted), v_members + (select count(*) from members)
    into v_sets, v_members;

  -- ---------------------------------------------------------------- the bar
  --
  -- Set LAST and from the membership itself, so the rule and the data cannot
  -- disagree: a fifth of a roster, a twentieth of a position, floored at two so
  -- a thin group can never be completed by accident with one card.
  update public.card_sets s
     set required_count = greatest(
           2,
           ceil(m.total / case s.family when 'team' then 5.0 else 20.0 end)
         )::smallint
    from (
      select set_id, count(*)::numeric as total
        from public.card_set_members
       group by set_id
    ) m
   where m.set_id = s.id
     and s.season = p_season;

  -- A set nothing landed in is a set that would read as broken. Deactivating
  -- is not deleting: a family that comes back next season keeps its code, its
  -- members and anybody's claim against it.
  update public.card_sets s
     set is_active = false
   where s.season = p_season
     and not exists (select 1 from public.card_set_members m where m.set_id = s.id);

  return jsonb_build_object('season', p_season, 'sets', v_sets, 'members_added', v_members);
end;
$$;

revoke execute on function public.rebuild_card_sets(integer) from public, anon, authenticated;

-- Build whatever the pool already holds. Data-driven rather than hardcoded to
-- 2026, so a fresh database with no cards in it produces no sets instead of
-- producing an empty 2026 shelf.
do $$
declare
  v_season integer;
begin
  for v_season in select distinct season from public.cards where is_mintable order by 1 loop
    perform public.rebuild_card_sets(v_season);
  end loop;
end;
$$;
