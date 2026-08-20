-- Committing a card to a set: the card is BURNT, the slot is filled, and gems
-- are paid.
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGED, AND WHY THE PREVIOUS RULE COULD NOT STAY
-- ---------------------------------------------------------------------------
--
-- Sets shipped two migrations ago with progress derived from OWNERSHIP: hold
-- enough members and the set was complete. That version asked nothing of the
-- player. Nothing was ever spent, no card was ever chosen over another, and a
-- set completed itself in the background while you were on a different tab.
--
-- A card now has to be COMMITTED, and committing destroys it. That single
-- change is what turns the tab into a mechanic:
--
--   * duplicates become the point. A third copy of a player is dead weight in
--     a collection and a filled slot in a set, which is the first thing this
--     game has ever given them to do beyond the sell button.
--   * there is a real cost. Every card in a set is a card that can never start
--     again, and eight of them have to start every week.
--   * and it pays. Committing hands back a share of the card's sell value
--     immediately, on top of whatever the completed set eventually pays.
--
-- ---------------------------------------------------------------------------
-- THE RATE, AND WHY IT IS DELIBERATELY BELOW THE SELL PRICE
-- ---------------------------------------------------------------------------
--
-- `commit_payout_pct` defaults to 50: committing pays half of what selling the
-- same copy pays. It has to be under 100, or selling becomes strictly
-- dominated and the sell button is dead — a commit already carries a slot's
-- worth of future set reward with it, so paying the same cash as a sale would
-- make the choice a non-choice. Half now, and the rest (and much more) when
-- the set lands:
--
--   bronze   sells for   8  ->  commits for   4
--   silver              40  ->               20
--   gold               150  ->               75
--   diamond            500  ->              250
--
-- Which is also why nobody will commit a diamond: it is a copy that has earned
-- 1,250 gems in score rewards and would earn more. Sets are where BRONZE goes,
-- and that is the intended shape — the mechanic converts the part of a
-- collection that was doing nothing.
--
-- Per-set rather than global, so the rate is tunable with an UPDATE rather
-- than a deploy, and a future set can pay better without a schema change. Same
-- decision `tier_thresholds.sell_value` and `scoring_rules` already made.
--
-- ---------------------------------------------------------------------------
-- THE REQUIREMENT IS NOW A FLAT SIX, AND THE OLD FRACTION HAD TO GO
-- ---------------------------------------------------------------------------
--
-- The shipped requirements were fractions of the group — a twentieth of a
-- position, a fifth of a roster — which produced 21 for the wide receivers.
-- That was calibrated against DRAWS, because owning was free. The currency is
-- now CARDS SPENT, and asking a player to burn 21 receivers for 150 gems is
-- asking them to destroy 168 gems of sell value for 150. The fraction was
-- right for the old rule and is indefensible under this one.
--
-- Six cards, every set. What differs between families is not how many but how
-- hard they are to find, and the reward says so: 150 for six of a position
-- (~400 cards wide) against 500 for six of one club (~30 wide, so roughly four
-- times the draws). Six is also small enough that a set is a decision a player
-- can act on the week they see it, rather than a bar they watch.
--
-- NOT FARMABLE, and the arithmetic is the same as before. Six cards from one
-- club costs ~210 draws — 42 packs, 4,200 gems — to pull, against a 500 gem
-- reward. The gems only ever come from cards that were drawn anyway. This is a
-- conversion of dead stock, not a faucet.
--
-- CEILING: 32 x 500 + 5 x 150 = 16,750 gems, once per player per season, and
-- it costs 222 burnt cards to collect all of it — most of a season's draws,
-- while still fielding eight starters every week. The tension is the design.

-- ---------------------------------------------------------------- the rate

alter table public.card_sets
  add column if not exists commit_payout_pct smallint not null default 50
    check (commit_payout_pct between 0 and 100);

comment on column public.card_sets.commit_payout_pct is
  'Share of the copy''s tier sell value paid when it is committed. Under 100 on purpose — see the header of 20260819235400_commit_card_to_set.sql.';

-- ---------------------------------------------------------------- rebuild
--
-- Same builder, one rule changed: `required_count` is a flat six rather than a
-- fraction of the membership. Restated whole because there is no partial form.
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
           6, 500,
           -- Divisions together, clubs alphabetical inside them.
           (row_number() over (order by d.subtitle nulls last, d.name))::integer,
           true
      from defs d
    on conflict (code) do update
       set name           = excluded.name,
           subtitle       = excluded.subtitle,
           required_count = excluded.required_count,
           reward_gems    = excluded.reward_gems,
           sort_order     = excluded.sort_order,
           is_active      = true
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
    select d.code, d.name, 'position', null, p_season, 6, 150, d.ord, true
      from defs d
    on conflict (code) do update
       set name           = excluded.name,
           required_count = excluded.required_count,
           reward_gems    = excluded.reward_gems,
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

  -- A set cannot ask for more cards than it contains. Six is under the size of
  -- every group this builds today (the smallest is the 27-card Chargers), but
  -- the floor is enforced rather than assumed — a future family of five cards
  -- would otherwise be permanently uncompletable with no error anywhere.
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

-- ---------------------------------------------------------------- the copy that gets burnt
--
-- WHICH of your copies goes into the set is decided HERE and by nobody else.
--
-- Holding three copies of a player and committing "him" is ambiguous, and the
-- ambiguity is expensive: one of those copies may have started fourteen weeks
-- and be sitting on gold. So the server always takes the LEAST valuable
-- eligible copy — lowest earned total, then the oldest — and there is no way
-- for a caller to name a different one. A mis-tap can cost you a bronze
-- duplicate and can never cost you your best card.
--
-- Invoker rights and an explicit user filter, so it is correct whether it is
-- called from the checklist (as the player) or from inside the SECURITY
-- DEFINER commit below (as the owner, with RLS bypassed).
create or replace function public.commit_candidate(p_card_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select ci.id
    from public.card_instances ci
   where ci.card_id = p_card_id
     and ci.user_id = auth.uid()
     and ci.is_held
   order by ci.career_fp asc, ci.acquired_at asc, ci.id asc
   limit 1;
$$;

revoke execute on function public.commit_candidate(uuid) from public, anon;
grant  execute on function public.commit_candidate(uuid) to authenticated;

-- ---------------------------------------------------------------- my_sets
--
-- Dropped rather than replaced: `owned` has become `committed` and `ready` is
-- new, and `create or replace view` cannot change a column's name.
--
-- THE TWO NUMBERS ARE NOT THE SAME QUESTION.
--   committed — slots you have filled. This is progress, and it only ever
--               rises: a committed card cannot be sold, started or taken back.
--   ready     — members you HOLD whose slot is still empty. This is the thing
--               a player can act on today, and without it the page would show
--               a bar with no hint of what to do about it.
drop view if exists public.my_sets;

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
       s.commit_payout_pct,
       s.sort_order,
       m.total_cards,
       p.committed,
       r.ready,
       (p.committed >= s.required_count) as complete,
       sc.completed_at as claimed_at,
       sc.reward_gems  as claimed_gems
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
       -- Not already filled. Without this a held duplicate would keep
       -- reporting a slot as actionable after it had been filled.
       and not exists (
         select 1
           from public.card_instances cc
          where cc.committed_to = s.id
            and cc.card_id = mm.card_id
            and cc.committed_at is not null
       )
  ) r
  left join public.set_completions sc on sc.set_id = s.id
 where s.is_active;

grant select on public.my_sets to authenticated;

-- ---------------------------------------------------------------- set_checklist
--
-- One set's membership with the caller's standing against each card: is the
-- slot filled, do you hold a copy that could fill it, and what would that pay.
--
-- The payout is computed from the copy that WOULD be burnt (see
-- commit_candidate), not from the best or the average, so the number on the
-- button is the number that lands in the balance.
drop function if exists public.set_checklist(text);

create or replace function public.set_checklist(p_set_code text)
returns table (
  card_id                uuid,
  player_id              uuid,
  player_name            text,
  position_abbreviation  text,
  team_abbreviation      text,
  rarity                 public.rarity,
  season_fp              numeric,
  /** This slot is filled — the card is in the set, permanently. */
  committed              boolean,
  /** Copies you still hold and could commit. 0 means you cannot fill it yet. */
  held                   integer,
  /** Gems the commit would pay, from the copy that would actually be burnt. */
  commit_value           integer,
  /** That copy's tier, so the screen can say what it is about to destroy. */
  commit_tier            public.card_tier
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
         (fill.id is not null)                       as committed,
         coalesce(mine.held, 0)                      as held,
         coalesce(floor(cand.sell_value * s.commit_payout_pct / 100.0), 0)::integer
                                                     as commit_value,
         cand.tier                                   as commit_tier
    from public.card_set_members m
    join public.card_sets s        on s.id = m.set_id
    -- player_directory already flattens card -> player -> team plus the
    -- season's production, and is itself security_invoker. Reusing it keeps
    -- the checklist and the Players boards showing the same numbers for the
    -- same card. It filters on is_mintable, so a card withdrawn from the pool
    -- drops off the checklist while staying a member and staying counted by
    -- my_sets -- the honest reading of "this was printed and no longer is".
    join public.player_directory d on d.card_id = m.card_id
    -- The committed copy, if this slot is filled. RLS makes it the caller's.
    left join lateral (
      select ci.id
        from public.card_instances ci
       where ci.committed_to = s.id
         and ci.card_id = m.card_id
         and ci.committed_at is not null
       limit 1
    ) fill on true
    left join lateral (
      select count(*)::integer as held
        from public.card_instances ci
       where ci.card_id = m.card_id
         and ci.is_held
    ) mine on true
    -- What committing would burn, and therefore what it would pay.
    left join lateral (
      select ci.tier, tt.sell_value
        from public.card_instances ci
        join public.tier_thresholds tt on tt.tier = ci.tier
       where ci.id = public.commit_candidate(m.card_id)
    ) cand on true
   where s.code = p_set_code
     and s.is_active
   -- Filled slots first (the set you are building), then best available.
   order by (fill.id is not null) desc, coalesce(mine.held, 0) desc, d.season_fp desc, d.player_name;
$$;

revoke execute on function public.set_checklist(text) from public, anon;
grant  execute on function public.set_checklist(text) to authenticated;

-- ---------------------------------------------------------------- commit_card_to_set
--
-- The only path that burns a card into a set. There is no UPDATE policy on
-- card_instances, gem_balances or gems_ledger, so this function is the whole
-- surface — the same posture as open_pack, sell_card and claim_set_reward.
--
-- IT TAKES A CARD, NOT A COPY. The caller names the catalogue entry (which
-- slot on the checklist) and the server picks which of their copies dies; see
-- commit_candidate. A client that could name an instance would eventually name
-- the wrong one.
create or replace function public.commit_card_to_set(p_set_code text, p_card_id uuid)
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
  v_copy      public.card_instances%rowtype;
  v_price     integer;
  v_payout    integer;
  v_name      text;
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

  -- Wallet first, always. open_pack, sell_card and claim_set_reward all take
  -- this lock before anything else, and two functions that lock the same pair
  -- in opposite orders deadlock under concurrency.
  select balance into v_balance
    from public.gem_balances
   where user_id = v_user
     for update;

  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.card_set_members
     where set_id = v_set.id and card_id = p_card_id
  ) then
    raise exception 'that card is not in this set' using errcode = '22023';
  end if;

  select count(distinct card_id)::integer into v_committed
    from public.card_instances
   where committed_to = v_set.id
     and user_id = v_user
     and committed_at is not null;

  -- REFUSED ONCE THE SET IS FULL, and this guard is protective rather than
  -- tidy. A commit into a finished set would pay half of what the sell button
  -- pays and buy nothing at all — there is no reward for filling a set beyond
  -- its requirement — so offering it at any price would be offering a trap.
  -- Lift this only if a full-checklist bonus ever exists to lift it for.
  if v_committed >= v_set.required_count then
    raise exception 'this set is already complete' using errcode = '55006';
  end if;

  if exists (
    select 1 from public.card_instances
     where committed_to = v_set.id
       and card_id = p_card_id
       and user_id = v_user
       and committed_at is not null
  ) then
    raise exception 'that card is already in this set' using errcode = '22023';
  end if;

  -- Row lock, so a double-tap cannot burn two copies for one slot: the second
  -- call waits here, then fails the already-in-this-set check above. The
  -- partial unique index is the backstop if it somehow does not.
  select * into v_copy
    from public.card_instances
   where id = public.commit_candidate(p_card_id)
     for update;

  if not found then
    raise exception 'you do not hold a copy of that card' using errcode = '42501';
  end if;

  -- Re-checked under the lock. commit_candidate read without one, so a
  -- concurrent sale of the same copy could have landed in between.
  if not v_copy.is_held or v_copy.user_id <> v_user then
    raise exception 'you do not hold a copy of that card' using errcode = '42501';
  end if;

  -- A card still attached to an unscored lineup is either about to play or has
  -- played and not been swept. Burning it would leave a starter that silently
  -- scores nothing. Same refusal, same reason, as sell_card.
  if exists (
    select 1
      from public.lineup_slots ls
      join public.lineups l on l.id = ls.lineup_id
     where ls.card_instance_id = v_copy.id
       and l.scored_at is null
  ) then
    raise exception 'card is in a lineup that has not been scored yet'
      using errcode = '55006';
  end if;

  select sell_value into v_price
    from public.tier_thresholds
   where tier = v_copy.tier;

  v_payout := floor(coalesce(v_price, 0) * v_set.commit_payout_pct / 100.0)::integer;

  update public.card_instances
     set committed_at  = now(),
         committed_to  = v_set.id,
         committed_for = v_payout
   where id = v_copy.id;

  -- gems_ledger has CHECK (amount <> 0), so a zero payout is recorded on the
  -- card and nothing in the ledger, rather than failing the commit.
  if v_payout > 0 then
    update public.gem_balances
       set balance = balance + v_payout, updated_at = now()
     where user_id = v_user;

    insert into public.gems_ledger (user_id, amount, reason, reference_id)
    values (v_user, v_payout, 'set_commit', v_copy.id);
  end if;

  select pl.full_name into v_name
    from public.cards cd
    join public.players pl on pl.id = cd.player_id
   where cd.id = p_card_id;

  return jsonb_build_object(
    'set_code',         v_set.code,
    'set_name',         v_set.name,
    'card_id',          p_card_id,
    'card_instance_id', v_copy.id,
    'player_name',      v_name,
    'tier',             v_copy.tier,
    'paid',             v_payout,
    'sell_value',       coalesce(v_price, 0),
    'committed',        v_committed + 1,
    'required',         v_set.required_count,
    'complete',         (v_committed + 1) >= v_set.required_count,
    'balance',          v_balance + v_payout
  );
end;
$$;

revoke execute on function public.commit_card_to_set(text, uuid) from public, anon;
grant  execute on function public.commit_card_to_set(text, uuid) to authenticated;

-- ---------------------------------------------------------------- claim_set_reward
--
-- Restated: completion is counted from COMMITTED cards now, not from held
-- ones. Everything else — the wallet lock, the one-claim-per-player rule, the
-- frozen payout — is unchanged.
--
-- One consequence worth naming: completion is now MONOTONIC. A committed card
-- can never be sold, started or taken back, so a set that reads complete stays
-- complete, and the old caveat about selling your way back under the bar after
-- claiming no longer has a case to describe.
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
  v_total     integer;
  v_committed integer;
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

  -- SECURITY DEFINER bypasses RLS, so the owner is filtered explicitly —
  -- without the user_id predicate this would count the whole game's commits
  -- and every set would be claimable by everybody.
  select count(distinct card_id)::integer into v_committed
    from public.card_instances
   where committed_to = v_set.id
     and user_id = v_user
     and committed_at is not null;

  if v_committed < v_set.required_count then
    raise exception 'set is not complete: % of the % cards are committed',
      v_committed, v_set.required_count
      using errcode = '55006';
  end if;

  insert into public.set_completions (user_id, set_id, owned_at_claim, reward_gems)
  values (v_user, v_set.id, v_committed, v_set.reward_gems);

  if v_set.reward_gems > 0 then
    update public.gem_balances
       set balance = balance + v_set.reward_gems, updated_at = now()
     where user_id = v_user;

    insert into public.gems_ledger (user_id, amount, reason, reference_id, idempotency_key)
    values (v_user, v_set.reward_gems, 'set_reward', v_set.id,
            format('set_reward:%s:%s', v_user, v_set.id));
  end if;

  return jsonb_build_object(
    'set_code',    v_set.code,
    'set_name',    v_set.name,
    'committed',   v_committed,
    'total_cards', v_total,
    'required',    v_set.required_count,
    'reward_gems', v_set.reward_gems,
    'balance',     v_balance + v_set.reward_gems
  );
end;
$$;

revoke execute on function public.claim_set_reward(text) from public, anon;
grant  execute on function public.claim_set_reward(text) to authenticated;

comment on column public.set_completions.owned_at_claim is
  'Committed slots at the moment of the claim. Named `owned` from the ownership-based version of sets; kept rather than renamed because renaming a column somebody has rows in buys nothing.';

-- Re-apply the new requirement to whatever is already built.
do $$
declare
  v_season integer;
begin
  for v_season in select distinct season from public.cards where is_mintable order by 1 loop
    perform public.rebuild_card_sets(v_season);
  end loop;
end;
$$;
