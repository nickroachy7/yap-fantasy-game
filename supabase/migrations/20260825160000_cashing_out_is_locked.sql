-- Cashing out is locked while the run is exposed.
--
-- ---------------------------------------------------------------------------
-- THE HOLE THIS CLOSES
-- ---------------------------------------------------------------------------
--
-- A wipe is only a wipe if there is nothing left to save first, and until this
-- migration there was: `sell_card` pays 100% of `sell_value`, immediately, for
-- anything not currently in an unscored lineup. So the play on a last heart
-- was to file the three cards the contest needs, sell THE ENTIRE REST OF THE
-- COLLECTION at full price, and let the run die holding four cards and a pile
-- of gems.
--
-- That is not a loophole a player has to be clever to find — it is the obvious
-- thing to do, which is worse. It would have meant the wipe landed hardest on
-- the players who did not think of it, and not at all on the ones who did.
--
-- The general shape, worth stating because it will come up again for anything
-- else the run can take: A WIPE IS DEFEATED BY CONVERTING WHAT DIES INTO
-- WHATEVER SURVIVES. Cards die and gems survive, so you sell. If it were the
-- other way round you would spend the gems on packs. The only fix is to close
-- the conversion for as long as the death is live, which is what this is.
--
-- ---------------------------------------------------------------------------
-- WHY THE WINDOW IS THE UNSETTLED ENTRY AND NOT THE WHOLE RUN
-- ---------------------------------------------------------------------------
--
-- The tempting version locks selling for the run's whole life, on the grounds
-- that anything else leaves some gap. It cannot be built: a run may last the
-- full eighteen weeks, the roster caps at thirty, and `set_lineup` refuses to
-- edit a lineup while a player is over that cap and tells them to sell. A
-- run-long sell lock would deadlock the game against its own roster gate.
--
-- The narrow window is enough, because the exploit needs the death to be
-- IMMINENT and the sale to happen while it is. `scored_at is null` on an entry
-- in a contest with hearts on it is exactly that window: it opens when the
-- entry is filed and closes when the sweep scores it, and the run can only die
-- inside it. Outside that window the player is selling in the ordinary way,
-- which is a thing this game wants them to do.
--
-- There is a deliberate escape hatch. `leave_contest` still works right up to
-- kickoff, refunds the fee and deletes the entry — which lifts this lock. A
-- player who decides they would rather trade than compete can, as long as they
-- decide before the games start. After kickoff the entry is real and so is the
-- lock, which is the same line every other rule in this codebase draws.

create or replace function public.sell_card(p_card_instance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_balance integer;
  v_card    public.card_instances%rowtype;
  v_price   integer;
  v_name    text;
  v_at_risk text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Wallet first, then the card. open_pack takes the wallet lock first too, and
  -- two functions that lock the same pair in opposite orders deadlock under
  -- concurrency. Consistent ordering is the cheapest way to never find out.
  select balance into v_balance
    from public.gem_balances
   where user_id = v_user
     for update;

  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;

  -- Row lock, so a double-tap cannot sell the same copy twice: the second call
  -- waits here and then fails the sold_at check below rather than paying out
  -- again. SECURITY DEFINER bypasses RLS, so ownership is checked explicitly.
  select * into v_card
    from public.card_instances
   where id = p_card_instance_id
     and user_id = v_user
     for update;

  if not found then
    raise exception 'card does not belong to you' using errcode = '42501';
  end if;

  if v_card.sold_at is not null then
    raise exception 'card has already been sold' using errcode = '22023';
  end if;

  -- A committed copy is IN a set. It is not yours to sell, and paying out for
  -- it would be paying twice for one card — the commit already paid its share.
  if v_card.committed_at is not null then
    raise exception 'card has been committed to a set' using errcode = '22023';
  end if;

  -- A card still attached to an unscored lineup is either about to play or has
  -- played and not been swept. Selling it would leave a starter that silently
  -- scores nothing, or take the card away while it is still earning. Both are
  -- worse than a refusal the client can explain.
  if exists (
    select 1
      from public.lineup_slots ls
      join public.lineups l on l.id = ls.lineup_id
     where ls.card_instance_id = p_card_instance_id
       and l.scored_at is null
  ) then
    raise exception 'card is in a lineup that has not been scored yet'
      using errcode = '55006';
  end if;

  -- ESCROW. See this migration's header: while a run has hearts riding on an
  -- unsettled contest, the collection is not for sale. Named contests, because
  -- a refusal a player cannot act on is worse than no refusal at all — and the
  -- action here is a real one, since leaving a lobby contest before kickoff
  -- refunds the fee and lifts the lock.
  select string_agg(distinct c.name, ', ') into v_at_risk
    from public.lineups l
    join public.contests c on c.id = l.contest_id
   where l.user_id = v_user
     and l.scored_at is null
     and c.hearts_at_risk > 0;

  if v_at_risk is not null then
    raise exception
      'cannot sell while your run has hearts riding on %: leave it before kickoff, or commit the card to a set instead',
      v_at_risk
      using errcode = '55006';
  end if;

  select sell_value into v_price
    from public.tier_thresholds
   where tier = v_card.tier;

  v_price := coalesce(v_price, 0);

  update public.card_instances
     set sold_at = now(), sold_for = v_price
   where id = p_card_instance_id;

  -- gems_ledger has CHECK (amount <> 0), so a zero-value tier is recorded as a
  -- sale on the card and nothing in the ledger, rather than failing the sale.
  if v_price > 0 then
    update public.gem_balances
       set balance = balance + v_price, updated_at = now()
     where user_id = v_user;

    insert into public.gems_ledger (user_id, amount, reason, reference_id)
    values (v_user, v_price, 'card_sale', p_card_instance_id);
  end if;

  select pl.full_name into v_name
    from public.cards cd
    join public.players pl on pl.id = cd.player_id
   where cd.id = v_card.card_id;

  return jsonb_build_object(
    'card_instance_id', p_card_instance_id,
    'player_name',      v_name,
    'tier',             v_card.tier,
    'sold_for',         v_price,
    'balance',          v_balance + v_price
  );
end;
$$;

revoke execute on function public.sell_card(uuid) from public, anon;
grant  execute on function public.sell_card(uuid) to authenticated;
