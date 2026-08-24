-- A scored_at stamp on a week that has not happened yet was quietly disabling
-- the thing that keeps lineups honest, and it bricked the autosave.
--
-- ---------------------------------------------------------------------------
-- WHAT THE PLAYER SAW
-- ---------------------------------------------------------------------------
--
-- "I keep adding a QB, I switch pages, I come back and the player is gone."
--
-- What was actually happening, from `postgres_logs`: every `set_lineup` call
-- the app made was refused with `card does not belong to you`, several a minute
-- for as long as somebody kept trying.
--
-- ---------------------------------------------------------------------------
-- THE CHAIN, WHICH IS FOUR CORRECT DECISIONS ENDING SOMEWHERE WRONG
-- ---------------------------------------------------------------------------
--
--  1. `score_week` stamped `scored_at` on preseason week 4 on 21 August. Every
--     one of that week's sixteen games is still `scheduled`, kicking off on the
--     27th. Every slot scored 0, because there was nothing to score.
--
--  2. `commit_card_to_set` frees a burnt card from any lineup it is standing in
--     — but only `where l.scored_at is null`, on the entirely reasonable ground
--     that a scored lineup is history and rewriting it would change a result
--     that has already been paid out.
--
--  3. So the stamp from (1) turned off the freeing in (2) for the UPCOMING
--     week. Five cards — a QB, two receivers, a running back and a kicker —
--     were committed to sets over the following days and stayed in the week 4
--     lineup as dead references.
--
--  4. `set_lineup` takes the WHOLE slot map and refuses the whole call if any
--     one card is not held. The client sends all eight slots on every autosave.
--     Five were dead. So every save failed, no matter which slot was edited,
--     and the newly added QB was never written.
--
-- Nothing in the chain is a typo. The bug is that `scored_at` was being used to
-- mean "this week is over" by a piece of code that needed "this week can no
-- longer be edited", and those two came apart the moment a week was scored
-- early.
--
-- ---------------------------------------------------------------------------
-- THE FIX: FINALIZED_AT IS THE ONE THAT MEANS HISTORY
-- ---------------------------------------------------------------------------
--
-- `settle_week_payouts` sets `finalized_at` when every game in the week is
-- final and the payouts have been made. That is the point after which a lineup
-- genuinely cannot be rewritten without taking back gems somebody has been
-- paid. `scored_at` is just "the sweep has run over this week", which can and
-- does happen before a ball is thrown.
--
-- So both predicates in `commit_card_to_set` move from `scored_at` to
-- `finalized_at`:
--
--   THE KICKED-OFF CHECK widens, which is the safe direction — a card whose
--   game has started still cannot leave a lineup, and now that also holds for a
--   week that was scored early.
--   THE SLOT FREEING widens to match, so a commit clears the card out of every
--   lineup that can still be played.
--
-- The two work as a pair: the first refuses the commit outright when the player
-- is already on the field, so by the time the delete runs there is nothing to
-- free that anybody could still be scoring.
--
-- `card_actions.in_open_lineup` is deliberately LEFT on `scored_at`. It answers
-- "would selling this card pull it out of a lineup you are about to play",
-- which is a warning rather than a rule, and the conservative reading — warn
-- about a scored-but-unplayed week too — is the one it already gives.

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
       and l.finalized_at is null
       and public.game_has_started(g.status_state, g.starts_at)
  ) then
    raise exception 'that player has already kicked off and cannot leave your lineup'
      using errcode = '55006';
  end if;

  -- Free whatever LIVE slots hold this copy. See the header: the test is
  -- `finalized_at`, not `scored_at`, because a week can carry a scored_at
  -- stamp while every one of its games is still days away — and under the old
  -- predicate that stamp silently switched this delete off and left burnt
  -- cards sitting in the upcoming lineup.
  --
  -- Finalized lineups are still history and are still untouched: their slots
  -- record what was started that week, and rewriting them would change a
  -- result that has already been paid out.
  delete from public.lineup_slots ls
   using public.lineups l
   where ls.lineup_id = l.id
     and ls.card_instance_id = v_copy.id
     and l.finalized_at is null;
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

-- ---------------------------------------------------------------- the repair
--
-- The rows the old predicate already left behind. Without this the fix above
-- prevents new ones and changes nothing for the lineup that is broken today.
--
-- SCOPED AS TIGHTLY AS THE FACTS ALLOW, because this deletes lineup slots and
-- that is not an operation to be generous with. Only slots that are ALL of:
--   * naming a card that is no longer held (burnt into a set, or sold);
--   * in a lineup that has not been finalized, so no payout depends on it;
--   * in a week where NOT ONE GAME has left 'scheduled', so nothing has been
--     played and no points can be lost.
--
-- At the time of writing that is exactly five slots, all in one 2026 preseason
-- week 4 lineup, all recording 0.00 points against games that start on the
-- 27th. The delete is written from the conditions rather than from those five
-- ids so that it is correct if anybody else has drifted into the same state
-- between this being written and being applied.
with dead as (
  select ls.lineup_id, ls.slot
    from public.lineup_slots ls
    join public.lineups l        on l.id = ls.lineup_id
    join public.card_instances ci on ci.id = ls.card_instance_id
   where not ci.is_held
     and l.finalized_at is null
     and not exists (
       select 1 from public.games g
        where g.season = l.season
          and g.season_type = l.season_type
          and g.week = l.week
          and g.status_state is distinct from 'scheduled'
     )
)
delete from public.lineup_slots ls
 using dead d
 where ls.lineup_id = d.lineup_id
   and ls.slot = d.slot;

-- AND THE STAMP THAT CAUSED IT. A week with no game out of 'scheduled' has not
-- been scored in any meaningful sense, and leaving the stamp on would keep this
-- lineup outside every `scored_at is null` predicate still in the schema.
-- `finalized_at` is untouched — it is already null on these rows, which is what
-- made them safe to repair.
update public.lineups l
   set scored_at = null
 where l.scored_at is not null
   and l.finalized_at is null
   and not exists (
     select 1 from public.games g
      where g.season = l.season
        and g.season_type = l.season_type
        and g.week = l.week
        and g.status_state is distinct from 'scheduled'
   );
