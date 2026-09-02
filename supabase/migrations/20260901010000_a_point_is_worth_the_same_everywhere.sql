-- The per-point rate is the game's baseline, so it stops being a function's
-- default argument and starts being a number the game holds.
--
-- ---------------------------------------------------------------------------
-- IT WAS ALREADY UNIVERSAL. NOTHING SAID SO.
-- ---------------------------------------------------------------------------
--
-- `award_score_coins` has paid `1.5 × points × tier multiplier` on EVERY slot
-- of EVERY lineup since `20260824200400`. Free contest, paid contest, a row
-- entered by accident — every card that starts anywhere is priced the same way.
-- That is the correct rule and it has been the rule for a week.
--
-- The trouble is that nothing anywhere states it. The rate lives in one place:
--
--     award_score_coins(..., p_per_point numeric DEFAULT 1.5)
--
-- a default argument on a function no client may execute. So the only surface
-- that could ever mention it was the lobby, and the lobby mentioned it in
-- exactly one branch — `rewardLines` prints "From 1.5 coins a point" when a
-- contest has NO entry fee and prints the prize pool when it has one. Read as a
-- reward column, that says the coins-per-point deal is something the free
-- contest gives you and the paid rows do not.
--
-- It is the opposite. A paid row earns it too, on cards that would otherwise be
-- earning nothing at all, and that is the single best argument for entering
-- one. The rate was the game's floor, presented as one contest's perk.
--
-- ---------------------------------------------------------------------------
-- WHY `game_config` AND NOT A CONSTANT
-- ---------------------------------------------------------------------------
--
-- Because two things now need to read it and only one of them is SQL.
--
--   * `award_score_coins` pays it, and must keep paying whatever it is told.
--   * THE CLIENT HAS TO SAY IT, on every contest, in the reward column. Today
--     the string "1.5" is typed into `contest-model.ts`. A rate that is a
--     literal in the database and a different literal in the app is the
--     parallel-copy bug this codebase has now fixed four times — and this one
--     would be visible: retune the payout, and every row in the lobby quietly
--     advertises the old number.
--
-- `game_config` is the table that already exists for exactly this — a value the
-- server owns, the client may read, and neither has to hardcode.
--
-- ---------------------------------------------------------------------------
-- BASIS POINTS, BECAUSE `game_config.value` IS AN INTEGER
-- ---------------------------------------------------------------------------
--
-- 150 = 1.50 coins a point. The column is an integer and widening it to numeric
-- would touch every key in the table for one row's benefit, so the row carries
-- the scale instead. `score_rate()` below is the only place that division
-- happens, so no caller — SQL or TypeScript — ever divides by 100 itself.
--
-- ---------------------------------------------------------------------------
-- THE VALUE DOES NOT CHANGE
-- ---------------------------------------------------------------------------
--
-- 1.5 in, 1.5 out. This migration moves where the number lives and who is
-- allowed to read it; it deliberately does not retune it, so if next week's
-- payouts differ by a coin, this is not the migration that did it.

-- ------------------------------------------------------------------- config

insert into public.game_config (key, value, description) values
  ('score_coins_per_point_bps', 150,
   'Coins paid per fantasy point, in hundredths: 150 = 1.50 a point. Multiplied by the card''s tier multiplier at award time. Paid on every slot of every lineup in every contest — this is the game''s baseline, not any one contest''s reward.')
on conflict (key) do update
  set value       = excluded.value,
      description = excluded.description,
      updated_at  = now();

-- --------------------------------------------------------------- the read

-- The rate as a number you can multiply by, in one place.
--
-- STABLE rather than IMMUTABLE for the same reason `game_config_value` is: the
-- row can be retuned under a running session, and a plan that folded this to a
-- constant would keep paying yesterday's rate until the connection recycled.
create or replace function public.score_rate()
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select public.game_config_value('score_coins_per_point_bps', 150)::numeric / 100;
$$;

-- Readable by the client on purpose — see the header. It returns one number
-- that is already printed on every contest row, so there is nothing here to
-- withhold.
grant execute on function public.score_rate() to authenticated;

comment on function public.score_rate() is
  'Coins per fantasy point, before the card''s tier multiplier. The game''s baseline rate, read by award_score_coins and by the client''s reward column so the two can never advertise different numbers.';

-- ---------------------------------------------------------------- the award

-- `20260831060000`'s live body, with one change: the rate defaults to NULL and
-- resolves through `score_rate()`. Passing an explicit rate still works and
-- still wins, which is what the rescore path and the tests use.
--
-- Everything else is verbatim — the week-complete gate, the prior-tier
-- multiplier, the per-slot stamp, the one-ledger-row-per-user sum. This is a
-- function that has been rebuilt from a stale copy before (see
-- `20260824230000`), so: the body below was read from the database.
create or replace function public.award_score_coins(
  p_season      integer,
  p_season_type smallint,
  p_week        integer,
  -- Null means "whatever the game is currently paying". See the header.
  p_per_point   numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_awarded integer;
  v_slots   integer;
  v_coins   bigint;
  v_rate    numeric;
begin
  v_rate := coalesce(p_per_point, public.score_rate());

  if v_rate <= 0 then
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
           prior.coin_multiplier                                   as mult,
           greatest(0, floor(ls.points * v_rate * prior.coin_multiplier))::integer as coins
      from public.lineup_slots ls
      join public.lineups        l  on l.id  = ls.lineup_id
      join public.card_instances ci on ci.id = ls.card_instance_id
      -- The highest tier the card's PRIOR career total would have bought. Ties
      -- resolve by sort_order, so a threshold sitting exactly on the boundary
      -- reads the same way sync_card_tier reads it.
      join lateral (
        select tt.tier, tt.coin_multiplier
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
       and ls.coins_awarded is null
  ),
  stamped as (
    update public.lineup_slots ls
       set coin_multiplier = sa.mult,
           tier_at_award   = sa.prior_tier,
           coins_awarded   = sa.coins
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
           sum(coalesce(ls.coins_awarded, 0))::integer as amount,
           format('score_reward:%s:%s:%s:%s', l.user_id, p_season, p_season_type, p_week) as key
      from public.lineups l
      join public.lineup_slots ls on ls.lineup_id = l.id
     where l.season = p_season
       and l.season_type = p_season_type
       and l.week = p_week
       and l.scored_at is not null
     group by l.user_id
    having sum(coalesce(ls.coins_awarded, 0)) > 0
  ),
  inserted as (
    insert into public.coins_ledger (user_id, amount, reason, idempotency_key)
    select p.user_id, p.amount, 'weekly_score_reward', p.key
      from payable p
    on conflict (idempotency_key) where idempotency_key is not null
      do nothing
    returning user_id, amount
  ),
  moved as (
    update public.coin_balances gb
       set balance = gb.balance + i.amount, updated_at = now()
      from inserted i
     where gb.user_id = i.user_id
    returning i.amount
  )
  select count(*), coalesce(sum(amount), 0) into v_awarded, v_coins from moved;

  return jsonb_build_object(
    'week', p_week, 'per_point', v_rate,
    'slots_priced', v_slots, 'awarded_to', v_awarded, 'coins', v_coins);
end;
$function$;

-- The signature is unchanged (the default moved, not the type), so the old
-- grant still applies to this body. Restated rather than assumed, because
-- `20260830020000` exists precisely because a redefinition silently regained
-- PUBLIC execute once already.
revoke execute on function public.award_score_coins(integer, smallint, integer, numeric)
  from public, anon, authenticated;

comment on function public.award_score_coins(integer, smallint, integer, numeric) is
  'Pays every scored slot of a complete week at score_rate() times the card''s tier multiplier going into the week, stamping what each slot earned. Pass p_per_point to override the configured rate; null means whatever the game currently pays.';
