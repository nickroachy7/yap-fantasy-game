-- Making the play economy actually pay for playing well.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG, MEASURED
-- ---------------------------------------------------------------------------
--
-- The faucet shipped as 250 gems a week flat plus 0.5 gems per fantasy point.
-- Against a regular-season lineup of roughly 100 points that is 250 + 50, so
-- BEING RIGHT WAS 17% OF INCOME, and the gap between a great week and a poor
-- one was about 30 gems — under a third of a pack. A game whose stated purpose
-- is picking the players who will score the most was paying almost nothing for
-- picking them correctly.
--
-- Worse, and worth recording because it explains the beta's behaviour: neither
-- faucet function was ever scheduled. `gems_ledger` contains zero rows of
-- reason 'weekly_grant' and zero of 'weekly_score_reward'. Every gem in the
-- game to date came from the signup bonus, selling, or committing to sets. The
-- play economy was not merely small, it was dark, and a player who noticed that
-- packs were the only source of anything was reading the game correctly.
--
-- ---------------------------------------------------------------------------
-- THE REBALANCE, AT ROUGHLY CONSTANT TOTAL INCOME
-- ---------------------------------------------------------------------------
--
--   weekly grant     250  ->  150
--   per point        0.5  ->  1.5
--
-- On a 95-point lineup that is 292 a week against 298 before — deliberately
-- flat, because the aim is to change WHERE income comes from and not how much
-- there is. Packs must not get cheaper in real terms or every bracket tuned
-- against them (the 12 < daily < 48 window, the commit rate, the pack price
-- itself) moves at once.
--
-- What does change is the spread. A 130-point week now pays 345 and a 60-point
-- week pays 240: a full pack between them, where it used to be a third of one.
--
-- ---------------------------------------------------------------------------
-- THE AWARD BECOMES PER-SLOT, AND STAMPS WHAT IT PAID
-- ---------------------------------------------------------------------------
--
-- It used to read `lineups.total_points` and pay once. It cannot any more,
-- because `tier_thresholds.gem_multiplier` is a property of the CARD and a
-- lineup holds eight different ones. So the unit becomes the slot.
--
-- Each slot's award is written back onto the slot — the multiplier, the tier it
-- was paid at, and the gems. Three reasons, in order of how much they matter:
--
--   1. THE RECAP IS A READ. Sunday night has to show a per-player breakdown
--      that reconciles exactly with the wallet. Recomputing it later from
--      today's tier would print a different number than was paid the moment a
--      card is promoted, which is precisely when a player is looking.
--   2. IT IS AUDITABLE. "Why did I get 292?" is answerable from rows.
--   3. RE-TUNING CANNOT REWRITE HISTORY, the same rule `set_milestone_claims`
--      already follows. Change the ladder and last week still says what it paid.
--
-- ---------------------------------------------------------------------------
-- THE MULTIPLIER USED IS THE TIER THE CARD HELD *GOING INTO* THE WEEK
-- ---------------------------------------------------------------------------
--
-- Not its tier now. By the time this runs, `score_week` has already folded this
-- week's points into career_fp, so a card that crossed 50 this Sunday is
-- already silver — and paying it the silver rate for the very week that earned
-- silver is both slightly dishonest and, more importantly, worse game feel.
--
-- The recap wants to say: you played him at BRONZE, he earned SILVER, next week
-- he pays more. That line has forward pull. Paid the other way it has none.
--
-- So prior_fp = career_fp - what this card scored this week, and the tier is
-- whatever that figure buys.
--
-- ---------------------------------------------------------------------------
-- IT REFUSES TO RUN UNTIL THE WEEK IS COMPLETE
-- ---------------------------------------------------------------------------
--
-- `score_week` runs every minute and tiers settle only on final, so a payout
-- taken mid-slate would stamp a multiplier that later stops being true, and the
-- idempotency key means it would never be corrected. Waiting for
-- `week_is_complete` also puts payday at the end of the week, which is the beat
-- the recap needs anyway.

-- ---------------------------------------------------------------- stamping

alter table public.lineup_slots
  add column if not exists gem_multiplier numeric(4,2),
  add column if not exists tier_at_award  public.card_tier,
  add column if not exists gems_awarded   integer;

comment on column public.lineup_slots.gem_multiplier is
  'The tier multiplier this slot was actually paid at. Null until the week is awarded. Never recomputed — see 20260824200400_skill_weighted_faucet.sql.';
comment on column public.lineup_slots.tier_at_award is
  'The tier the card held GOING INTO this week, which is what gem_multiplier was read from. Not the card''s tier now.';
comment on column public.lineup_slots.gems_awarded is
  'Gems this one start paid, before any position or MVP bonus. Sums to the weekly_score_reward ledger row.';

-- ---------------------------------------------------------------- the grant

create or replace function public.grant_weekly_gems(
  p_season      integer,
  p_season_type smallint,
  p_week        integer,
  -- 250 -> 150. The difference moved into the per-point rate below.
  p_amount      integer default 150
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_granted integer;
begin
  if p_amount <= 0 then
    raise exception 'grant must be positive' using errcode = '22023';
  end if;

  with eligible as (
    select gb.user_id,
           format('weekly_grant:%s:%s:%s:%s', gb.user_id, p_season, p_season_type, p_week) as key
      from public.gem_balances gb
  ),
  inserted as (
    insert into public.gems_ledger (user_id, amount, reason, idempotency_key)
    select e.user_id, p_amount, 'weekly_grant', e.key
      from eligible e
    on conflict (idempotency_key) where idempotency_key is not null
      do nothing
    returning user_id
  )
  update public.gem_balances gb
     set balance = gb.balance + p_amount, updated_at = now()
    from inserted i
   where gb.user_id = i.user_id;

  get diagnostics v_granted = row_count;
  return jsonb_build_object('week', p_week, 'amount', p_amount, 'granted_to', v_granted);
end;
$$;

-- ---------------------------------------------------------------- the award

create or replace function public.award_score_gems(
  p_season      integer,
  p_season_type smallint,
  p_week        integer,
  -- 0.5 -> 1.5. See the header.
  p_per_point   numeric default 1.5
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_awarded integer;
  v_slots   integer;
  v_gems    bigint;
begin
  if p_per_point <= 0 then
    raise exception 'per_point must be positive' using errcode = '22023';
  end if;

  -- See the header: a mid-slate payout would stamp a multiplier that stops
  -- being true, and the idempotency key means nothing would ever fix it.
  if not public.week_is_complete(p_season, p_season_type, p_week) then
    return jsonb_build_object(
      'week', p_week, 'awarded_to', 0, 'skipped', 'week is not complete');
  end if;

  -- 1. Price every slot, at the tier its card held going INTO the week.
  with slot_award as (
    select ls.id,
           l.user_id,
           prior.tier                                              as prior_tier,
           prior.gem_multiplier                                    as mult,
           greatest(0, floor(ls.points * p_per_point * prior.gem_multiplier))::integer as gems
      from public.lineup_slots ls
      join public.lineups        l  on l.id  = ls.lineup_id
      join public.card_instances ci on ci.id = ls.card_instance_id
      -- The highest tier the card's PRIOR career total would have bought. Ties
      -- resolve by sort_order, so a threshold sitting exactly on the boundary
      -- reads the same way sync_card_tier reads it.
      join lateral (
        select tt.tier, tt.gem_multiplier
          from public.tier_thresholds tt
         where tt.min_career_fp <= greatest(0, ci.career_fp - ls.points)
         order by tt.sort_order desc
         limit 1
      ) prior on true
     where l.season = p_season
       and l.season_type = p_season_type
       and l.week = p_week
       and l.scored_at is not null
       -- Never re-price a slot that has already been paid. The ledger's
       -- idempotency key protects the wallet; this protects the stamp.
       and ls.gems_awarded is null
  ),
  stamped as (
    update public.lineup_slots ls
       set gem_multiplier = sa.mult,
           tier_at_award  = sa.prior_tier,
           gems_awarded   = sa.gems
      from slot_award sa
     where ls.id = sa.id
    returning ls.id
  )
  select count(*) into v_slots from stamped;

  -- 2. One ledger row per user, summing what their slots were just stamped
  --    with. Read back from the slots rather than carried in a variable, so the
  --    wallet and the recap can never disagree about what was paid.
  with payable as (
    select l.user_id,
           sum(coalesce(ls.gems_awarded, 0))::integer as amount,
           format('score_reward:%s:%s:%s:%s', l.user_id, p_season, p_season_type, p_week) as key
      from public.lineups l
      join public.lineup_slots ls on ls.lineup_id = l.id
     where l.season = p_season
       and l.season_type = p_season_type
       and l.week = p_week
       and l.scored_at is not null
     group by l.user_id
    having sum(coalesce(ls.gems_awarded, 0)) > 0
  ),
  inserted as (
    insert into public.gems_ledger (user_id, amount, reason, idempotency_key)
    select p.user_id, p.amount, 'weekly_score_reward', p.key
      from payable p
    on conflict (idempotency_key) where idempotency_key is not null
      do nothing
    returning user_id, amount
  ),
  moved as (
    update public.gem_balances gb
       set balance = gb.balance + i.amount, updated_at = now()
      from inserted i
     where gb.user_id = i.user_id
    returning i.amount
  )
  select count(*), coalesce(sum(amount), 0) into v_awarded, v_gems from moved;

  return jsonb_build_object(
    'week', p_week, 'per_point', p_per_point,
    'slots_priced', v_slots, 'awarded_to', v_awarded, 'gems', v_gems);
end;
$$;

revoke execute on function public.grant_weekly_gems(integer, smallint, integer, integer) from public, anon, authenticated;
revoke execute on function public.award_score_gems(integer, smallint, integer, numeric) from public, anon, authenticated;
