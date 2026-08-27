-- Only a STARTER is locked out of a sale. Entering a contest is not a lockdown.
--
-- THE BUG. `sell_card` refused every sale — the whole collection, not the cards
-- involved — while any lobby entry still had a heart riding on it. Enter a
-- second contest on Tuesday and quick sell was dead until the week settled,
-- with a refusal naming a contest and offering "leave it before kickoff" as the
-- way out, which is not something a player will do to sell a card they were
-- never starting anyway.
--
-- WHY THE ESCROW CAN GO. It was built against one exploit: liquidate the
-- collection at full price while a run is doomed, and walk away holding the
-- gems. That exploit died in 20260825230000 — the wipe takes the wallet too, at
-- settlement, with no gap to act in — and 20260825270000 already recorded the
-- escrow as defence in depth rather than the guard. It was also already
-- half-retracted there: the free contest had to be carved out of it, because a
-- rule that fires from the moment you set a lineup collides with the roster cap
-- gate, which refuses to edit a lineup while you are over thirty cards and
-- tells you to sell. Widening a lobby entry into the same deadlock is the same
-- collision with a slower fuse.
--
-- WHAT IS LEFT is the check that was always the real one, and it is per-card:
-- a copy attached to a lineup that has not been scored is either about to play
-- or has played and not been swept. Everything else in the collection stays for
-- sale, entered or not.

CREATE OR REPLACE FUNCTION public.sell_card(p_card_instance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_balance integer;
  v_card    public.card_instances%rowtype;
  v_price   integer;
  v_name    text;
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

  -- THE ONLY CONTEST-SHAPED REFUSAL LEFT, and it is about this card rather than
  -- about your run. A card still attached to an unscored lineup is either about
  -- to play or has played and not been swept. Selling it would leave a starter
  -- that silently scores nothing, or take the card away while it is still
  -- earning. Both are worse than a refusal the client can explain.
  --
  -- `lineup_slots` holds starters only — there is no bench row — so this is
  -- exactly "started somewhere that has not settled" and nothing wider.
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
$function$;
revoke execute on function public.sell_card(uuid) from public, anon;
grant  execute on function public.sell_card(uuid) to authenticated;

comment on function public.sell_card(uuid) is
  'Sells one owned copy for its tier sell_value. Refuses a copy that is sold, committed to a set, or in a lineup that has not been scored. Entering a contest does not lock the rest of the collection.';

-- `wagered_entries` keeps its job — it is what the heart rack and settlement
-- read — but it no longer has a second reader, so the comment stops naming one.
comment on function public.wagered_entries(uuid) is
  'The entries with hearts that can still move: staked, on a live run, not yet settled, and in a week that is not over. Read by the heart display and by settlement.';
