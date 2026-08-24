-- A set that junk cannot clear: the weekly, gated on TIER.
--
-- ---------------------------------------------------------------------------
-- THE PROBLEM EVERY SET SO FAR HAS SHARED
-- ---------------------------------------------------------------------------
--
-- Holding your best cards is the correct play and nothing in the game argues
-- with it. A set slot counts CARDS, and any member fills one, so a player
-- satisfies every reward on every ladder with the worst copies they hold and
-- keeps the ones they start. The daily is explicitly built that way — three of
-- a position out of the whole pool, "always completable out of whatever junk is
-- in hand, which is the point". The team ladder asks for quality only in its
-- last few slots, and those sit ~3,900 draws away, so in practice it never asks
-- at all.
--
-- The result is a collection screen where the right move is always to do
-- nothing with anything good. That is not a tuning problem and no reward
-- schedule fixes it: while a slot can be filled by a bronze, it will be.
--
-- ---------------------------------------------------------------------------
-- SO THE WEEKLY GATES ON THE COPY, NOT ON THE CARD
-- ---------------------------------------------------------------------------
--
-- THREE CARDS, ANY POSITION, EVERY ONE SILVER OR BETTER.
--
-- Tier is the one property in this game that cannot be bought. A copy arrives
-- from a pack at bronze and climbs only by being STARTED — silver is 50 career
-- fantasy points, four or five weeks of actually fielding it (see
-- 20260821250000_reachable_tier_ladder.sql). So a silver copy is proof of play,
-- and asking for three of them asks for exactly the thing players are hoarding.
--
-- IT IS STRUCTURALLY UNFARMABLE, which is the property that lets the reward be
-- generous. Packs deal bronze. There is no price in gems for a silver, at any
-- number of packs, so no amount of buying can feed this set — the only source
-- is weeks of lineups already played. Every other faucet in this economy has
-- needed a ceiling argument against the pack price; this one cannot be reached
-- from that direction at all.
--
-- WHY NOT ALSO CONSTRAIN THE PLAYER (a "top 100" list, a position, this week's
-- slate). Because the tier floor already selects for good cards — you do not
-- spend four weeks of lineup slots on somebody you do not rate — and each
-- extra axis multiplies the scarcity of an already scarce thing. Three silver
-- QUARTERBACKS is close to impossible; three silvers is a real decision. The
-- membership is therefore the whole mintable pool, exactly as the daily's is.
--
-- ---------------------------------------------------------------------------
-- WHAT IT PAYS, AND THE BRACKET THE NUMBER SITS IN
-- ---------------------------------------------------------------------------
--
-- The floor is the sell button, as it is for the daily:
--
--   Selling three silver              3 x 40  = 120 gems
--   Committing three silver     3 x 40 x 50%  =  60 gems, plus the reward
--
-- so anything under 60 loses to selling and the set is pointless. The ceiling
-- is what those three copies would earn by being KEPT. A silver started every
-- remaining week is worth roughly 6 gems a week (about 11 fantasy points at 0.5
-- a point, times the 1.10 silver multiplier) — call it 100 gems over a season,
-- and that is the best case, because only eight cards can start in any week and
-- three silvers cannot all be among them. A bench silver earns nothing at all
-- and costs a roster slot.
--
-- 250 sits between them: 310 gems all in against 120 for selling, and against
-- 100-300 for keeping three cards that mostly cannot all play. That is the
-- shape wanted — not a giveaway, not an obvious hold, an actual decision, and
-- one that comes out differently depending on whether those three are your
-- starters or your bench.
--
-- It lives in `card_set_ladder_defaults` like every other figure, so it is an
-- UPDATE and a rebuild rather than a migration when the beta says otherwise.
--
-- ONE REWARD, AT COMPLETION. Same reason the daily has one: a three-card set
-- with a ladder would pay at one card, and paying for one card is the trickle
-- the daily-sets migration removed.
--
-- ---------------------------------------------------------------------------
-- WHAT THE FLOOR TOUCHES, WHICH IS MORE THAN THE COMMIT
-- ---------------------------------------------------------------------------
--
-- A gate on `commit_card_to_set` alone would be a set that refuses the button
-- it just offered. Four places decide which copy is in play and all four move:
--
--   commit_candidate  picked the LEAST valuable copy you hold. Against a floor
--                     that picks a bronze and gets refused while a silver sits
--                     right there. It now picks the least valuable ELIGIBLE
--                     copy — still the cheapest, just from the copies that
--                     qualify.
--   commit_card_to_set  refuses a copy under the floor, with a sentence that
--                     says which tier is wanted.
--   set_checklist     counts and prices ELIGIBLE copies, so the number on the
--                     button is the number that lands.
--   my_sets.ready     counts members you hold an eligible copy of, so a weekly
--                     does not advertise thirty actionable slots on the
--                     strength of a bronze bench.
--
-- `commit_cards_to_set` needs no change: it calls `commit_card_to_set` once per
-- card and inherits every rule, which is what that function was built for.

-- ---------------------------------------------------------------- family

-- Found by definition rather than by name, for the reason
-- 20260821090000_daily_sets.sql gives at length: the original constraint was
-- written inline so its name is whatever Postgres generated, and a
-- `drop constraint if exists` that guesses wrong fails silently and leaves the
-- old constraint standing beside the new one.
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
  add constraint card_sets_family_check
  check (family in ('team', 'position', 'daily', 'weekly'));

comment on column public.card_sets.family is
  '''team'' | ''position'' | ''daily'' | ''weekly''. Position is retired and kept only so existing rows and claims stay readable; nothing seeds it any more.';

-- ---------------------------------------------------------------- the floor

alter table public.card_sets
  add column if not exists min_tier public.card_tier;

comment on column public.card_sets.min_tier is
  'The lowest tier a copy may be to fill a slot in this set. Null means any copy, which is every family except weekly. card_tier is a real enum in ascending order, so the check is a plain >= comparison.';

-- ---------------------------------------------------------------- candidate
--
-- Dropped and recreated rather than replaced: a second function with a
-- defaulted argument beside the existing one-argument version makes
-- `commit_candidate(x)` ambiguous, and Postgres raises at the call site rather
-- than here. Dropping first means the one-argument calls that already exist —
-- `card_actions`, and `set_checklist` before it is restated below — resolve to
-- the new function with a null floor, which is exactly their old behaviour.
drop function if exists public.commit_candidate(uuid);

create or replace function public.commit_candidate(
  p_card_id  uuid,
  p_min_tier public.card_tier default null
)
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
     -- The floor. Null accepts anything, which keeps every existing caller and
     -- every unfloored family behaving exactly as before.
     and (p_min_tier is null or ci.tier >= p_min_tier)
   -- CHEAPEST FIRST, STILL. The floor changes which copies are candidates, not
   -- which candidate wins: a player holding a silver and a gold gives up the
   -- silver. career_fp rather than tier is the sort key because it is the finer
   -- measure of the same thing and it is what every test in the suite pins.
   order by ci.career_fp asc, ci.acquired_at asc, ci.id asc
   limit 1;
$$;

revoke execute on function public.commit_candidate(uuid, public.card_tier) from public, anon;
grant  execute on function public.commit_candidate(uuid, public.card_tier) to authenticated;

comment on function public.commit_candidate(uuid, public.card_tier) is
  'Which copy of a card a commit would burn: the least valuable one you hold that meets the set''s tier floor. Null floor means any copy.';

-- ---------------------------------------------------------------- commit
--
-- Restated whole because there is no partial form. Byte-for-byte the body from
-- 20260821230000_commit_frees_lineup_slot.sql except for the floor: the
-- candidate lookup now passes `v_set.min_tier`, and the refusal below it is
-- new.
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
  v_freed     integer := 0;
  v_best      public.card_tier;
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
   where id = public.commit_candidate(p_card_id, v_set.min_tier)
     for update;

  -- TWO DIFFERENT REFUSALS, and telling them apart is the whole point of this
  -- block. "You hold none" and "you hold three but they are all bronze" are
  -- different problems with different fixes, and one message covering both
  -- would send a player to open packs when what they need is to start the card
  -- they already have.
  if not found then
    if v_set.min_tier is not null then
      -- ORDER BY rather than max(): Postgres ships no max() aggregate for an
      -- enum type, and `max(ci.tier)` fails to resolve at CREATE FUNCTION time
      -- only if plpgsql happened to plan it — which it does not, so it would
      -- have failed at the first bronze-only refusal instead. The enum's btree
      -- ordering is bronze < silver < gold < diamond, so this is the same
      -- question asked in the form Postgres answers.
      select ci.tier into v_best
        from public.card_instances ci
       where ci.card_id = p_card_id
         and ci.user_id = v_user
         and ci.is_held
       order by ci.tier desc
       limit 1;

      if v_best is not null then
        raise exception
          'this set needs a % copy or better, and your best copy of that card is %',
          v_set.min_tier, v_best
          using errcode = '55006';
      end if;
    end if;

    raise exception 'you do not hold a copy of that card' using errcode = '42501';
  end if;

  -- Re-checked under the lock. commit_candidate read without one, so a
  -- concurrent sale of the same copy could have landed in between. The tier
  -- cannot fall between the two reads — career_fp only rises — so the floor
  -- does not need re-checking here, only ownership.
  if not v_copy.is_held or v_copy.user_id <> v_user then
    raise exception 'you do not hold a copy of that card' using errcode = '42501';
  end if;

  -- Kicked off is the one thing that cannot be undone. See the header of
  -- 20260821230000_commit_frees_lineup_slot.sql.
  if exists (
    select 1
      from public.lineup_slots ls
      join public.lineups l  on l.id = ls.lineup_id
      join public.cards    cd on cd.id = v_copy.card_id
      join public.players  pl on pl.id = cd.player_id
      join public.games    g
        on g.season = l.season
       and g.season_type = l.season_type
       and g.week = l.week
       and (g.home_team_id = pl.team_id or g.visitor_team_id = pl.team_id)
     where ls.card_instance_id = v_copy.id
       and l.scored_at is null
       and public.game_has_started(g.status_state, g.starts_at)
  ) then
    raise exception 'that player has already kicked off and cannot leave your lineup'
      using errcode = '55006';
  end if;

  -- Free whatever unscored slots hold this copy. Scored lineups are history and
  -- are deliberately untouched: their slots record what was started that week,
  -- and rewriting them would change a result that has already been paid out.
  delete from public.lineup_slots ls
   using public.lineups l
   where ls.lineup_id = l.id
     and ls.card_instance_id = v_copy.id
     and l.scored_at is null;
  get diagnostics v_freed = row_count;

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
    'balance',          v_balance + v_payout,
    'lineup_freed',     v_freed > 0
  );
end;
$$;

revoke execute on function public.commit_card_to_set(text, uuid) from public, anon;
grant  execute on function public.commit_card_to_set(text, uuid) to authenticated;

-- ---------------------------------------------------------------- checklist
--
-- Restated for the floor, and for one thing the floor forces that is worth
-- naming.
--
-- A FLOORED SET IS FILTERED TO WHAT YOU CAN ACT ON. Its membership is the whole
-- mintable pool — ~968 rows — because the point is that any position qualifies.
-- Sending 968 rows so a player can find the eight they hold a silver of would
-- be a slow screen listing mostly nothing. So a set with a floor returns the
-- slots already filled plus the members you hold an ELIGIBLE copy of, which is
-- a handful. An unfloored set is untouched and still returns its whole
-- checklist, because a team roster IS a checklist and the missing names on it
-- are the chase.
--
-- The client's ALL / CAN_ADD / MISSING filters therefore collapse to roughly
-- one list on a weekly. That is honest rather than broken: a weekly is a quota,
-- not a checklist, and there is no meaningful "missing" for a set whose
-- membership is every card in the game.
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
  /** Copies you still hold that could fill it. Eligible ones only. */
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
  with target as (
    select id, min_tier, commit_payout_pct
      from public.card_sets
     where code = p_set_code
       and is_active
  ),
  -- SIEVED BEFORE THE CANDIDATE IS RESOLVED, and the order is the point. A
  -- weekly's membership is ~968 rows; `commit_candidate` is a function call per
  -- row, and the planner is under no obligation to defer it past a filter it
  -- could just as well evaluate first. Splitting the query makes the cheap
  -- predicates run on all 968 and the expensive lookup run on the handful that
  -- survive, rather than leaving that to a plan that can change under us.
  standing as (
    select m.card_id,
           t.id       as set_id,
           t.min_tier,
           t.commit_payout_pct,
           fill.id    as fill_id,
           coalesce(mine.held, 0) as held
      from target t
      join public.card_set_members m on m.set_id = t.id
      left join lateral (
        select ci.id
          from public.card_instances ci
         where ci.committed_to = t.id
           and ci.card_id = m.card_id
           and ci.committed_at is not null
         limit 1
      ) fill on true
      -- ELIGIBLE copies only. Counting all of them would put "you hold 2"
      -- beside a button that refuses, which is the one thing a checklist must
      -- never do.
      left join lateral (
        select count(*)::integer as held
          from public.card_instances ci
         where ci.card_id = m.card_id
           and ci.is_held
           and (t.min_tier is null or ci.tier >= t.min_tier)
      ) mine on true
     where t.min_tier is null
        or fill.id is not null
        or coalesce(mine.held, 0) > 0
  )
  select d.card_id,
         d.player_id,
         d.player_name,
         d.position_abbreviation,
         d.team_abbreviation,
         d.rarity,
         d.season_fp,
         (st.fill_id is not null)                    as committed,
         st.held                                     as held,
         coalesce(floor(cand.sell_value * st.commit_payout_pct / 100.0), 0)::integer
                                                     as commit_value,
         cand.tier                                   as commit_tier
    from standing st
    -- player_directory already flattens card -> player -> team plus the
    -- season's production, and is itself security_invoker. Reusing it keeps the
    -- checklist and the Players boards showing the same numbers for the same
    -- card. It filters on is_mintable, so a card withdrawn from the pool drops
    -- off the checklist while staying a member and staying counted by my_sets —
    -- the honest reading of "this was printed and no longer is".
    join public.player_directory d on d.card_id = st.card_id
    -- What committing would burn, and therefore what it would pay. Same floor,
    -- same function the commit itself calls, so this cannot report one copy and
    -- burn another.
    left join lateral (
      select ci.tier, tt.sell_value
        from public.card_instances ci
        join public.tier_thresholds tt on tt.tier = ci.tier
       where ci.id = public.commit_candidate(st.card_id, st.min_tier)
    ) cand on true
   -- Filled slots first (the set you are building), then best available.
   order by (st.fill_id is not null) desc, st.held desc, d.season_fp desc, d.player_name;
$$;

revoke execute on function public.set_checklist(text) from public, anon;
grant  execute on function public.set_checklist(text) to authenticated;

-- ---------------------------------------------------------------- my_sets
--
-- REPLACED, NOT DROPPED. `create or replace view` can append columns at the
-- end, and `min_tier` goes after `milestones` for exactly that reason — the
-- alternative is dropping a view five screens select from. Everything else is
-- the definition from 20260819235600_set_milestones.sql, with the floor added
-- to `ready`.
create or replace view public.my_sets
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
       ms.claimable_gems,
       ms.claimed_gems,
       ms.next_at,
       ms.next_reward,
       ms.milestones,
       -- Appended. The client needs it to say WHY a bronze cannot go in, and to
       -- stop its autofill proposing copies the server will refuse.
       s.min_tier
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
       -- The floor, so a weekly reports what could actually go in rather than
       -- every card in the game you happen to hold.
       and (s.min_tier is null or ci.tier >= s.min_tier)
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
               'paid',    k.paid
             ) order by k.pct),
             '[]'::jsonb
           ) as milestones
      from (
        select ml.threshold_pct                                              as pct,
               ceil(s.required_count * ml.threshold_pct / 100.0)::integer     as cards,
               ml.reward_gems                                                 as gems,
               p.committed >= ceil(s.required_count * ml.threshold_pct / 100.0) as reached,
               (cl.user_id is not null)                                        as claimed,
               cl.reward_gems                                                  as paid
          from public.card_set_milestones ml
          left join public.set_milestone_claims cl
                 on cl.set_id = ml.set_id
                and cl.threshold_pct = ml.threshold_pct
         where ml.set_id = s.id
      ) k
  ) ms
 where s.is_active;

grant select on public.my_sets to authenticated;

-- ---------------------------------------------------------------- the ladder

insert into public.card_set_ladder_defaults (family, threshold_pct, reward_gems) values
  ('weekly', 100, 250)
on conflict (family, threshold_pct) do update
  set reward_gems = excluded.reward_gems;

-- ---------------------------------------------------------------- rebuild

-- The Monday a date belongs to. `date_trunc('week', ...)` is ISO, so weeks
-- start Monday, which is also when an NFL week's results are finally in.
create or replace function public.weekly_set_monday(p_day date)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select date_trunc('week', p_day::timestamp)::date;
$$;

comment on function public.weekly_set_monday(date) is
  'The Monday of the week a date falls in. Pure, so a backfill and a live run agree by construction — the same property daily_set_position has.';

create or replace function public.rebuild_weekly_set(p_season integer, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_required constant smallint         := 3;
  v_floor    constant public.card_tier := 'silver';
  v_monday   date := public.weekly_set_monday(p_day);
  v_code     text;
  v_set      uuid;
  v_members  integer := 0;
begin
  v_code := format('weekly-%s', to_char(v_monday, 'YYYY-MM-DD'));

  insert into public.card_sets (code, name, family, subtitle, season, required_count,
                                sort_order, is_active, opens_on, min_tier)
  values (v_code,
          'Proven three',
          'weekly',
          format('Week of %s', to_char(v_monday, 'FMDD FMMonth')),
          p_season,
          v_required,
          0,
          true,
          v_monday,
          v_floor)
  on conflict (code) do update
     set name           = excluded.name,
         subtitle       = excluded.subtitle,
         required_count = excluded.required_count,
         is_active      = true,
         opens_on       = excluded.opens_on,
         min_tier       = excluded.min_tier
  returning id into v_set;

  -- THE WHOLE POOL. Position is not the constraint here, tier is, and narrowing
  -- the membership as well would stack two scarcities on one three-card ask.
  with added as (
    insert into public.card_set_members (set_id, card_id)
    select v_set, c.id
      from public.cards c
     where c.season = p_season
       and c.is_mintable
    on conflict do nothing
    returning 1
  )
  select count(*) into v_members from added;

  insert into public.card_set_milestones (set_id, threshold_pct, reward_gems)
  select v_set, d.threshold_pct, d.reward_gems
    from public.card_set_ladder_defaults d
   where d.family = 'weekly'
  on conflict (set_id, threshold_pct) do update
     set reward_gems = excluded.reward_gems;

  -- Last week's is over. Deactivated rather than deleted, for the reason every
  -- other retirement in this schema gives: cards were burnt into it, and
  -- `set_milestone_claims` is never rewritten.
  update public.card_sets
     set is_active = false
   where family = 'weekly'
     and opens_on < v_monday
     and is_active;

  return jsonb_build_object('monday', v_monday, 'code', v_code,
                            'min_tier', v_floor, 'members_added', v_members);
end;
$$;

revoke execute on function public.rebuild_weekly_set(integer, date) from public, anon, authenticated;

comment on function public.rebuild_weekly_set(integer, date) is
  'Ensures the weekly set for one week exists, with its membership, its tier floor and its single reward, and retires anything older. Idempotent.';

-- ---------------------------------------------------------------- rotate
--
-- Hourly and idempotent, for the same reasons `rotate-daily-set` is: Eastern
-- midnight is 04:00 UTC for half the year and 05:00 for the other half, and a
-- job that asks what day it is now needs no DST arithmetic at all. Runs at :15
-- to sit clear of the scoring sweep at :00, the daily rotation at :10 and the
-- payout settle at :20.
create or replace function public.rotate_weekly_set()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season integer;
  v_day    date := public.daily_set_day();
begin
  select max(season) into v_season
    from public.cards
   where is_mintable;

  if v_season is null then
    return jsonb_build_object('rotated', false, 'reason', 'no mintable cards');
  end if;

  return public.rebuild_weekly_set(v_season, v_day) || jsonb_build_object('rotated', true);
end;
$$;

revoke execute on function public.rotate_weekly_set() from public, anon, authenticated;

comment on function public.rotate_weekly_set() is
  'Ensures this week''s weekly set exists and retires last week''s. Scheduled hourly; idempotent, so every run after the first of a week does nothing.';

select cron.unschedule('rotate-weekly-set')
where exists (select 1 from cron.job where jobname = 'rotate-weekly-set');

select cron.schedule(
  'rotate-weekly-set',
  '15 * * * *',
  $cron$ select public.rotate_weekly_set(); $cron$
);

-- ---------------------------------------------------------------- apply now

do $$
begin
  perform public.rotate_weekly_set();
end;
$$;

-- ---------------------------------------------------------------- card_actions
--
-- THE FIFTH PLACE THE FLOOR HAS TO HOLD, and the one the header above missed
-- on its first pass. It is worth writing down how, because the reason it was
-- missed is structural rather than careless.
--
-- The weekly's membership is the WHOLE MINTABLE POOL. `card_actions` offers
-- every active set a printed card is a member of, so the moment a weekly
-- exists, every copy in every inventory gains an offer for it — including the
-- bronzes. That is fine and even wanted (it is how the set advertises itself),
-- but only if the offer is honest, and unamended this function would have made
-- two dishonest claims about every one of them:
--
--   `pays`        was computed from `commit_candidate(card_id)` with no floor,
--                 so it quoted what burning the CHEAPEST copy would pay while
--                 the weekly would actually burn a higher one. The number under
--                 the button would have been wrong on every floored offer.
--   `can_commit`  was "you hold a copy, the slot is open, the set is not full".
--                 Under a floor, holding a copy is not holding an ELIGIBLE copy,
--                 so every bronze would have shown a live Add button that the
--                 server refuses — and `bulk.ts` routes straight off this flag,
--                 so a bulk add would have sent a batch built to fail.
--
-- THE CANDIDATE THEREFORE MOVES INSIDE `eligible`, because with floors it is no
-- longer a property of the copy — it is a property of the copy AND the set. The
-- old `burn` CTE resolved it once per card, which was correct exactly as long
-- as every set wanted the same copy.
--
-- `burns_this_copy` STAYS AT THE TOP LEVEL AND STAYS UNFLOORED, and gains a
-- per-set twin. The top-level flag answers "of the copies of this player you
-- hold, is this the one a commit would take" — a question about the collection,
-- which the inventory asks before any set is chosen, and it keeps its old
-- meaning so nothing reading it changes under this migration. The per-set
-- `burns_this_copy` is the same question asked of one set, and it is the one a
-- floored offer has to be read against.
--
-- Restated whole: it is a SQL function and there is no partial form.
create or replace function public.card_actions(p_card_instance_ids uuid[])
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with asked as (
    select distinct unnest(coalesce(p_card_instance_ids, '{}'::uuid[])) as id
  ),

  -- The copies named, and only the caller's.
  copy as (
    select ci.id,
           ci.card_id,
           ci.tier,
           ci.sold_at,
           ci.committed_at,
           ci.is_held,
           coalesce(tt.sell_value, 0) as sell_value,
           -- The one refusal `sell_card` makes that is not visible on the row.
           -- A commit no longer refuses for this (see commit_frees_lineup_slot)
           -- so it is reported against selling alone.
           exists (
             select 1
               from public.lineup_slots ls
               join public.lineups l on l.id = ls.lineup_id
              where ls.card_instance_id = ci.id
                and l.scored_at is null
           ) as in_open_lineup
      from asked a
      join public.card_instances ci on ci.id = a.id and ci.user_id = auth.uid()
      left join public.tier_thresholds tt on tt.tier = ci.tier
  ),

  -- The UNFLOORED candidate, which is what `burns_this_copy` at the top level
  -- has always meant: which of your copies of this player a commit takes, asked
  -- of the collection rather than of a particular set.
  burn as (
    select c.id,
           b.burn_id
      from copy c
      cross join lateral (select public.commit_candidate(c.card_id) as burn_id) b
  ),

  -- Every active set this printed card is a member of, with the caller's
  -- standing in it. Both counts are the commit's own: distinct card_id for
  -- progress, and "is this player already in" for the slot.
  eligible as (
    select c.id,
           s.code,
           s.name,
           s.family,
           s.subtitle,
           s.required_count,
           s.commit_payout_pct,
           s.min_tier,
           -- PER SET, under that set's floor. Null means "you hold nothing this
           -- set would accept", which is the whole of `can_commit` below.
           cand.burn_id,
           coalesce(ctt.sell_value, 0) as burn_sell_value,
           (select count(distinct filled.card_id)::integer
              from public.card_instances filled
             where filled.committed_to = s.id
               and filled.user_id = auth.uid()
               and filled.committed_at is not null) as committed,
           exists (
             select 1
               from public.card_instances mine
              where mine.committed_to = s.id
                and mine.card_id = c.card_id
                and mine.user_id = auth.uid()
                and mine.committed_at is not null
           ) as slot_filled
      from copy c
      join public.card_set_members m on m.card_id = c.card_id
      join public.card_sets s on s.id = m.set_id and s.is_active
      cross join lateral (
        select public.commit_candidate(c.card_id, s.min_tier) as burn_id
      ) cand
      left join public.card_instances ci on ci.id = cand.burn_id
      left join public.tier_thresholds ctt on ctt.tier = ci.tier
  )

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'card_instance_id', c.id,
        'card_id',          c.card_id,
        'tier',             c.tier,
        'sell_value',       c.sell_value,
        -- Still in the collection: not sold, not burnt into a set.
        'held',             c.is_held,
        -- Exactly `sell_card`'s three guards, in the order it raises them.
        'sellable',         c.sold_at is null
                              and c.committed_at is null
                              and not c.in_open_lineup,
        'burns_this_copy',  b.burn_id is not distinct from c.id,
        'sets', coalesce(
          (select jsonb_agg(
                    jsonb_build_object(
                      'code',         e.code,
                      'name',         e.name,
                      'family',       e.family,
                      'subtitle',     e.subtitle,
                      -- The floor this set puts on a copy, so the client can
                      -- say why an offer is dark instead of just darkening it.
                      'min_tier',     e.min_tier,
                      -- floor(), matching the commit exactly. A client rounding
                      -- this the other way would over-promise by a gem. Priced
                      -- off THIS set's candidate, so a floored offer quotes the
                      -- copy it would really burn.
                      'pays',         floor(e.burn_sell_value * e.commit_payout_pct / 100.0)::integer,
                      'committed',    e.committed,
                      'required',     e.required_count,
                      'slot_filled',  e.slot_filled,
                      'set_complete', e.committed >= e.required_count,
                      -- Whether the copy being asked about is the one THIS set
                      -- would take. Differs from the top-level flag only on a
                      -- floored set, which is exactly where it is needed.
                      'burns_this_copy', e.burn_id is not distinct from c.id,
                      'can_commit',   e.burn_id is not null
                                        and not e.slot_filled
                                        and e.committed < e.required_count
                    )
                    -- A daily expires at midnight, a weekly on Monday, and a
                    -- team set not at all, so the things with a deadline on
                    -- them are offered first and the shorter clock leads.
                    order by (e.family = 'daily') desc, (e.family = 'weekly') desc,
                             e.name, e.code
                  )
             from eligible e
            where e.id = c.id),
          '[]'::jsonb)
      )
      order by c.id
    ),
    '[]'::jsonb)
    from copy c
    join burn b on b.id = c.id;
$$;

revoke execute on function public.card_actions(uuid[]) from public, anon;
grant  execute on function public.card_actions(uuid[]) to authenticated;
