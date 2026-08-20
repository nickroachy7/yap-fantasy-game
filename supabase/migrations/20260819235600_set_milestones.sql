-- Team sets are completed IN FULL, and a set pays out along the way.
--
-- ---------------------------------------------------------------------------
-- THE BUG THIS ALSO FIXES, WHICH IS THE REASON THE NUMBERS MOVE SO FAR
-- ---------------------------------------------------------------------------
--
-- The shipped ladder was a money loop, and the note claiming it was not
-- farmable was analysed the wrong way round. It asked "what does it cost to
-- complete ONE team set" (~210 draws, 42 packs) and compared that to one 500
-- gem reward. But nobody buys packs to finish one set — packs fill every set at
-- once, and the honest question is what a pack's worth of cards pays back
-- across all of them:
--
--   a season is ~300 draws (60 packs, 6,000 gems). 300 draws from a 976-card
--   pool yields ~8 DISTINCT cards from every one of the 32 teams, because
--   30/976 x 300 = 9.2 hits and distinctness barely dents it. Six of those
--   eight completed a team set. So 32 x 500 = 16,000 gems came back out of
--   6,000 gems of packs, and the loop paid 2.7x.
--
-- A closed economy cannot let a card yield more in set rewards than the pack
-- that dealt it cost — 20 gems a card, at 100 for five. Every figure below is
-- set against that ceiling rather than against the cost of one set.
--
-- ---------------------------------------------------------------------------
-- WHY FULL COMPLETION IS WHAT CLOSES IT
-- ---------------------------------------------------------------------------
--
-- Requiring the WHOLE roster is what puts the big rewards out of reach of a
-- season's drawing, and coupon-collecting is why. Expected draws to collect all
-- 30 cards of one club, from a 976-card pool, is 976 x H(30) = ~3,900 draws —
-- 780 packs, 78,000 gems. A season is 300 draws. So a full team set is a
-- multi-season chase and its 5,000 gem tranche can never be farmed, while the
-- 25% tranche a player DOES reach is priced to stay under what the packs cost.
--
-- Which is exactly the shape a checklist wants: something you make progress on
-- constantly, and something you may never finish.
--
-- THE TAIL IS REAL AND IS NOT PRETENDED AWAY. Under uniform pack odds the LAST
-- card of any set costs ~976 draws in expectation however small the set is, so
-- 100% on a team is a prestige tier rather than a goal — nobody finishes one
-- without a way to chase a named card. A team pack, or buying a specific card,
-- is the lever that would change that, and neither exists yet. The UI says so.
--
-- ---------------------------------------------------------------------------
-- THE LADDER
-- ---------------------------------------------------------------------------
--
-- Four milestones on every set, at a quarter, half, three quarters and all of
-- its requirement. Percentages rather than card counts so one ladder describes
-- a 6-card target and a 33-card roster without a second rule.
--
--   TEAM (required = the whole roster, 27-33 cards)
--     25%   ~8 cards     100     ~300 draws
--     50%  ~15 cards     500     ~660 draws
--     75%  ~23 cards   1,500   ~1,370 draws
--    100%  ~30 cards   5,000   ~3,900 draws
--
--   Checked against the loop: a player who reached 25% on ALL 32 teams would
--   burn 256 cards for 3,200 gems, having spent 6,000 on the packs that dealt
--   them. Still a loss, and they would have nothing left to field a lineup with.
--
--   POSITION (required = 6 of a group of hundreds — unchanged, because "all
--   398 wide receivers" is not a set, it is a list)
--     25%   2 cards      25
--     50%   3 cards      40
--     75%   5 cards      60
--    100%   6 cards     100
--
--   The binding constraint here is kickers: 6 distinct from a pool of 41 costs
--   ~151 draws (30 packs, 3,000 gems) against 225 gems for the whole ladder.
--
-- Committing still pays 50% of the copy's sell value on top, immediately. That
-- is the part that makes a set beat the sell button for junk (8 bronze cards
-- return 32 + 100 rather than 64), which is the job sets are actually for.

-- ---------------------------------------------------------------- milestones

create table public.card_set_milestones (
  set_id        uuid     not null references public.card_sets on delete cascade,
  -- A percentage of the set's `required_count`, resolved to a card count at
  -- read time. Storing the percentage rather than the count is what lets a
  -- roster grow mid-season without stranding a player between two bars.
  threshold_pct smallint not null check (threshold_pct between 1 and 100),
  reward_gems   integer  not null check (reward_gems >= 0),
  primary key (set_id, threshold_pct)
);

alter table public.card_set_milestones enable row level security;

create policy "set milestones are readable"
  on public.card_set_milestones for select to authenticated
  using (true);

comment on table public.card_set_milestones is
  'What a set pays, and at what fraction of its requirement. Tunable with an UPDATE — see the header of 20260819235600_set_milestones.sql for the arithmetic each figure is set against.';

-- ---------------------------------------------------------------- claims
--
-- `set_completions` becomes `set_milestone_claims`: one row per MILESTONE
-- claimed, not one per set. Renamed rather than replaced because it already
-- holds a real claim, and altered in place rather than dropped so that claim
-- survives — it was a 100% claim on the wide receivers under the old one-bar
-- rule, and 100 is exactly what it becomes.
alter table public.set_completions rename to set_milestone_claims;
alter table public.set_milestone_claims rename column owned_at_claim to committed_at_claim;
alter table public.set_milestone_claims rename constraint set_completions_pkey to set_milestone_claims_pkey;

alter table public.set_milestone_claims
  add column if not exists threshold_pct smallint not null default 100
    check (threshold_pct between 1 and 100);

-- The default did its job on the existing row; leaving it would let a future
-- writer omit the column and silently claim the top tranche.
alter table public.set_milestone_claims alter column threshold_pct drop default;

alter table public.set_milestone_claims drop constraint set_milestone_claims_pkey;
alter table public.set_milestone_claims
  add constraint set_milestone_claims_pkey primary key (user_id, set_id, threshold_pct);

comment on table public.set_milestone_claims is
  'One row per milestone a player has been paid for. Never updated: the reward is frozen at the moment of the claim, so re-tuning a ladder cannot rewrite what somebody was paid.';
comment on column public.set_milestone_claims.committed_at_claim is
  'Slots filled at the moment of the claim.';

-- The old policy name still says "completions"; the rule is unchanged.
drop policy if exists "users read their own set completions" on public.set_milestone_claims;
create policy "users read their own milestone claims"
  on public.set_milestone_claims for select to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------- card_sets
--
-- `reward_gems` moves to the ladder. A single figure on the set could only ever
-- be the total or the last tranche, and a column that means one of two things
-- depending on who reads it is worse than no column.
--
-- `my_sets` selects it, so the view goes first. It is rebuilt in full further
-- down; dropping it here rather than reaching for DROP ... CASCADE keeps the
-- teardown to the one object we intend to replace.
drop view if exists public.my_sets;

alter table public.card_sets drop column if exists reward_gems;

-- ---------------------------------------------------------------- rebuild
--
-- Team sets now require their WHOLE membership; position sets keep their target
-- of six. Both seed the same four-rung ladder at family rates. Restated whole
-- because there is no partial form.
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

  -- ---------------------------------------------------------------- positions
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
                                  sort_order, is_active)
    select d.code, d.name, 'position', null, p_season, 6, d.ord, true
      from defs d
    on conflict (code) do update
       set name           = excluded.name,
           required_count = excluded.required_count,
           sort_order     = excluded.sort_order,
           is_active      = true
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

  -- A set cannot ask for more cards than it contains. Load-bearing for the
  -- position sets only (six of a group that could in principle be smaller);
  -- a team set's requirement IS its membership and can never trip it.
  update public.card_sets s
     set required_count = least(s.required_count, m.total)::smallint
    from (
      select set_id, count(*)::integer as total
        from public.card_set_members
       group by set_id
    ) m
   where m.set_id = s.id
     and s.season = p_season
     and s.required_count > m.total;

  -- ---------------------------------------------------------------- the ladder
  insert into public.card_set_milestones (set_id, threshold_pct, reward_gems)
  select s.id, l.pct, l.gems
    from public.card_sets s
    join lateral (
      select *
        from (values
          ('team',      25::smallint,  100),
          ('team',      50::smallint,  500),
          ('team',      75::smallint, 1500),
          ('team',     100::smallint, 5000),
          ('position',  25::smallint,   25),
          ('position',  50::smallint,   40),
          ('position',  75::smallint,   60),
          ('position', 100::smallint,  100)
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
     and not exists (select 1 from public.card_set_members m where m.set_id = s.id);

  return jsonb_build_object('season', p_season, 'sets', v_sets, 'members_added', v_members);
end;
$$;

revoke execute on function public.rebuild_card_sets(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- my_sets
--
-- Dropped rather than replaced: `reward_gems` is gone and six ladder columns
-- are new, and `create or replace view` cannot change a column list.
--
-- The ladder rides along as jsonb. It is four rows per set and the checklist
-- needs all four, so carrying it here costs one small column and saves the
-- detail screen a second round trip on a page it opens over the list.
--
-- Already dropped above, so that `card_sets.reward_gems` could go.
create view public.my_sets
with (security_invoker = on) as
select s.id   as set_id,
       s.code,
       s.name,
       s.family,
       s.subtitle,
       s.season,
       s.required_count,
       s.commit_payout_pct,
       s.sort_order,
       m.total_cards,
       p.committed,
       r.ready,
       (p.committed >= s.required_count) as complete,
       ms.total_reward,
       -- Reached and not yet paid: the only figure on this row that is a call
       -- to action.
       ms.claimable_gems,
       ms.claimed_gems,
       -- The next rung: how many slots it wants, and what it pays. Null once
       -- every rung is behind you.
       ms.next_at,
       ms.next_reward,
       ms.milestones
  from public.card_sets s
  cross join lateral (
    select count(*)::integer as total_cards
      from public.card_set_members mm
     where mm.set_id = s.id
  ) m
  cross join lateral (
    -- RLS scopes card_instances to the caller, which is what makes this the
    -- CALLER's progress. A definer view here would report the whole game's.
    select count(distinct ci.card_id)::integer as committed
      from public.card_instances ci
     where ci.committed_to = s.id
       and ci.committed_at is not null
  ) p
  cross join lateral (
    select count(distinct mm.card_id)::integer as ready
      from public.card_set_members mm
      join public.card_instances ci
        on ci.card_id = mm.card_id
       and ci.is_held
     where mm.set_id = s.id
       and not exists (
         select 1
           from public.card_instances cc
          where cc.committed_to = s.id
            and cc.card_id = mm.card_id
            and cc.committed_at is not null
       )
  ) r
  cross join lateral (
    select coalesce(sum(k.gems), 0)::integer                                          as total_reward,
           coalesce(sum(k.gems) filter (where k.reached and not k.claimed), 0)::integer as claimable_gems,
           -- What was actually PAID, not what the rung costs today. The two
           -- differ the moment a ladder is re-tuned, and the frozen figure is
           -- the honest one — a player who was paid 150 under an older ladder
           -- must not be told they received 100.
           coalesce(sum(k.paid), 0)::integer                                           as claimed_gems,
           min(k.cards) filter (where not k.reached)                                   as next_at,
           (array_agg(k.gems order by k.pct) filter (where not k.reached))[1]          as next_reward,
           coalesce(
             jsonb_agg(jsonb_build_object(
               'pct',     k.pct,
               'cards',   k.cards,
               'gems',    k.gems,
               'reached', k.reached,
               'claimed', k.claimed,
               -- Null unless claimed. What landed in the balance, which is not
               -- necessarily what the rung is priced at now.
               'paid',    k.paid
             ) order by k.pct),
             '[]'::jsonb
           ) as milestones
      from (
        select ml.threshold_pct                                              as pct,
               -- The rung resolved against THIS set's requirement. Stored as a
               -- percentage so a roster that grows moves the rungs with it.
               ceil(s.required_count * ml.threshold_pct / 100.0)::integer     as cards,
               ml.reward_gems                                                 as gems,
               p.committed >= ceil(s.required_count * ml.threshold_pct / 100.0) as reached,
               (cl.user_id is not null)                                        as claimed,
               cl.reward_gems                                                  as paid
          from public.card_set_milestones ml
          -- RLS scopes the claim to the caller, so this is their receipt or
          -- nothing at all.
          left join public.set_milestone_claims cl
                 on cl.set_id = ml.set_id
                and cl.threshold_pct = ml.threshold_pct
         where ml.set_id = s.id
      ) k
  ) ms
 where s.is_active;

grant select on public.my_sets to authenticated;

-- ---------------------------------------------------------------- claim
--
-- Sweeps EVERY rung you have reached and not been paid for, in one call.
--
-- The alternative — a claim per milestone — leaves gems on the table for
-- anybody who does not notice a rung went by, and a set can cross two rungs on
-- a single commit when a roster is small. One press, everything owed.
create or replace function public.claim_set_reward(p_set_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_set       public.card_sets%rowtype;
  v_balance   integer;
  v_committed integer;
  v_paid      integer;
  v_rungs     integer;
  v_pcts      smallint[];
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

  -- Wallet first, always. Same lock order as open_pack, sell_card and
  -- commit_card_to_set, and it is what serialises a double-tapped claim.
  select balance into v_balance
    from public.gem_balances
   where user_id = v_user
     for update;

  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;

  -- SECURITY DEFINER bypasses RLS, so the owner is filtered explicitly —
  -- without the user_id predicate this would count the whole game's commits.
  select count(distinct card_id)::integer into v_committed
    from public.card_instances
   where committed_to = v_set.id
     and user_id = v_user
     and committed_at is not null;

  with due as (
    select ml.threshold_pct, ml.reward_gems
      from public.card_set_milestones ml
     where ml.set_id = v_set.id
       and v_committed >= ceil(v_set.required_count * ml.threshold_pct / 100.0)
       and not exists (
         select 1
           from public.set_milestone_claims c
          where c.user_id = v_user
            and c.set_id = v_set.id
            and c.threshold_pct = ml.threshold_pct
       )
  ),
  ins as (
    insert into public.set_milestone_claims
                (user_id, set_id, threshold_pct, committed_at_claim, reward_gems)
    select v_user, v_set.id, d.threshold_pct, v_committed, d.reward_gems
      from due d
    returning threshold_pct, reward_gems
  ),
  led as (
    -- One ledger row per rung rather than one for the sweep: the ledger is the
    -- audit trail for "what has the set economy paid out", and a single lumped
    -- row would make a 25% tranche and a 100% tranche indistinguishable.
    insert into public.gems_ledger (user_id, amount, reason, reference_id, idempotency_key)
    select v_user, i.reward_gems, 'set_reward', v_set.id,
           format('set_reward:%s:%s:%s', v_user, v_set.id, i.threshold_pct)
      from ins i
     where i.reward_gems > 0
    returning amount
  )
  select coalesce(sum(i.reward_gems), 0)::integer,
         count(*)::integer,
         coalesce(array_agg(i.threshold_pct order by i.threshold_pct), '{}')
    into v_paid, v_rungs, v_pcts
    from ins i;

  if v_rungs = 0 then
    raise exception 'nothing to claim on this set yet' using errcode = '55006';
  end if;

  if v_paid > 0 then
    update public.gem_balances
       set balance = balance + v_paid, updated_at = now()
     where user_id = v_user;
  end if;

  return jsonb_build_object(
    'set_code',    v_set.code,
    'set_name',    v_set.name,
    'committed',   v_committed,
    'required',    v_set.required_count,
    'milestones',  v_pcts,
    'rungs',       v_rungs,
    'reward_gems', v_paid,
    'balance',     v_balance + v_paid
  );
end;
$$;

revoke execute on function public.claim_set_reward(text) from public, anon;
grant  execute on function public.claim_set_reward(text) to authenticated;

-- Re-apply the requirement and seed the ladder onto whatever is already built.
do $$
declare
  v_season integer;
begin
  for v_season in select distinct season from public.cards where is_mintable order by 1 loop
    perform public.rebuild_card_sets(v_season);
  end loop;
end;
$$;
