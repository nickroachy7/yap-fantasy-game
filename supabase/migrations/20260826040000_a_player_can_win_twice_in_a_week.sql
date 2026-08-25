-- A player can win two contests on one slate, and settlement has to survive it.
--
-- ---------------------------------------------------------------------------
-- THE BUG
-- ---------------------------------------------------------------------------
--
-- `award_contest_prizes` (20260826020000) paid every prize as its own row and
-- then folded those rows into `gem_balances` with a single upsert:
--
--     insert into gem_balances (user_id, balance, ...)
--     select user_id, amount from inserted
--     on conflict (user_id) do update set balance = gem_balances.balance + ...
--
-- One row per PRIZE, and the conflict target is one row per PLAYER. A player
-- who won the Flex Three and the WR Room in the same week produced two rows
-- with the same `user_id`, and Postgres refuses that outright:
--
--     ERROR: ON CONFLICT DO UPDATE command cannot affect row a second time
--
-- ---------------------------------------------------------------------------
-- WHY IT MATTERS MORE THAN IT LOOKS
-- ---------------------------------------------------------------------------
--
-- It is not one player's prize that fails. `award_contest_prizes` is one
-- statement inside `settle_week_payouts`, so the exception takes the whole
-- week's settlement with it — the score gems, the positional bonuses and the
-- RUN HEARTS for every account on the slate. One player entering two contests
-- and winning both would have stopped the week from settling at all, and the
-- symptom on the way in is a Postgres error about a conflict clause, which
-- names neither contests nor prizes.
--
-- And it is the ordinary case, not an edge one. Entering more than one contest
-- is the entire point of having a lobby — `card_plays_one_contest` exists to
-- make people do exactly this — and the two contests on the slate pay two
-- different win conditions, so winning both is a Sunday, not a coincidence.
--
-- It shipped because the fixture behind it had one contest in it. The
-- `contest_prizes` suite found it within a minute of being given a second.
--
-- ---------------------------------------------------------------------------
-- THE FIX
-- ---------------------------------------------------------------------------
--
-- Sum per player before touching the wallet. The LEDGER still gets one row per
-- prize — that is the audit trail, and collapsing it would lose which contest
-- paid what — but the balance moves once, by the total.
--
-- `award_score_gems` never had this bug because it groups by user on the way
-- in. This is the same shape, arrived at the hard way.

create or replace function public.award_contest_prizes(
  p_season      integer,
  p_season_type smallint,
  p_week        integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paid integer := 0;
  v_gems bigint  := 0;
begin
  if not public.week_is_complete(p_season, p_season_type, p_week) then
    return jsonb_build_object(
      'week', p_week, 'awarded_to', 0, 'skipped', 'week is not complete');
  end if;

  with payable as (
    select p.user_id, p.lineup_id, p.gems,
           format('contest_prize:%s', p.lineup_id) as key
      from public.contests c
      join lateral public.contest_payouts(c.id) p on true
     where c.season = p_season
       and c.season_type = p_season_type
       and c.week = p_week
       and c.prize_pool_bps > 0
       and p.gems > 0
  ),
  -- ONE LEDGER ROW PER PRIZE. Which contest paid what is the whole audit trail
  -- and the only way to check a pool balanced, so this stays per-entry even
  -- though the wallet below does not.
  inserted as (
    insert into public.gems_ledger (user_id, amount, reason, reference_id, idempotency_key)
    select user_id, gems, 'contest_prize', lineup_id, key from payable
    on conflict (idempotency_key) where idempotency_key is not null
      do nothing
    returning user_id, amount
  ),
  -- ONE WALLET MOVE PER PLAYER. See the header: the conflict target is the
  -- user, so two prizes for one player in a single statement is an error rather
  -- than two additions.
  totals as (
    select user_id, sum(amount)::integer as amount from inserted group by user_id
  ),
  moved as (
    -- Upsert rather than update. A prize is the first gems some accounts will
    -- ever be paid outside the signup bonus, and an UPDATE against a missing
    -- balance row moves nothing and reports success — a prize that appears in
    -- the ledger and never in the wallet.
    insert into public.gem_balances (user_id, balance, updated_at)
    select user_id, amount, now() from totals
    on conflict (user_id) do update
      set balance = gem_balances.balance + excluded.balance, updated_at = now()
    returning user_id
  )
  select count(*), coalesce(sum(amount), 0) into v_paid, v_gems
    from inserted;

  return jsonb_build_object('week', p_week, 'awarded_to', v_paid, 'gems', v_gems);
end;
$$;

revoke execute on function public.award_contest_prizes(integer, smallint, integer)
  from public, anon, authenticated;

comment on function public.award_contest_prizes(integer, smallint, integer) is
  'Pays every contest prize on a complete week, out of the fees that contest collected. One ledger row per prize, one wallet move per player. Idempotent on the lineup, like the entry charge it settles.';
