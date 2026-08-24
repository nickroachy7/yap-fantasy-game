-- Selling several copies in one go.
--
-- The inventory can now select cards and clear them out together, and until
-- now the only sale was one card at a time from that card's own profile. A
-- player dumping twenty bronze duplicates was twenty screens and twenty
-- confirmations for one decision they had already made.
--
-- ---------------------------------------------------------------------------
-- IT IS A LOOP OVER THE SINGLE SALE, AND THAT IS THE WHOLE DESIGN
-- ---------------------------------------------------------------------------
--
-- Deliberately the same shape as `commit_cards_to_set`, for the same reason
-- that one gives: every guard on a sale — ownership, not already sold, not
-- committed to a set, not standing in a lineup that has not been scored, and
-- the price the tier fetches — lives in `sell_card`. Re-implementing any of
-- them here would be writing a second definition of what a legal sale is, and
-- the two would drift on the first change. So this calls the real thing once
-- per card and does nothing itself except decide what to do when one refuses.
--
-- The cost is N wallet locks inside one transaction that already holds the
-- lock. That is a rounding error against getting the rules wrong twice.
--
-- ---------------------------------------------------------------------------
-- PARTIAL SUCCESS IS THE POINT, NOT A COMPROMISE
-- ---------------------------------------------------------------------------
--
-- One card standing in an unscored lineup must not fail the other nineteen.
-- Each sale runs in its own exception block — which plpgsql implements as a
-- savepoint, so a refusal rolls back that card alone and leaves the transaction
-- healthy — and the caller gets back both lists: what sold, and what did not
-- with the reason it gave. A bulk action that silently dropped three cards
-- would be worse than one that refused outright; this one says so.
--
-- WHAT THIS FUNCTION DELIBERATELY DOES NOT DECIDE: which cards to sell. The
-- caller passes an explicit list and gets exactly that list acted on, so what a
-- player ticked on screen is what burns. A `sell_duplicates()` that chose for
-- itself would destroy cards the player never saw named.
--
-- THE 64 CEILING is `commit_cards_to_set`'s, kept identical on purpose: the two
-- bulk actions sit on the same selection in the same toolbar, and a selection
-- that one of them accepts and the other refuses is a limit the player cannot
-- reason about.

create or replace function public.sell_cards(p_card_instance_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_card    uuid;
  v_one     jsonb;
  v_done    jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_paid    integer := 0;
  v_balance integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_card_instance_ids is null or array_length(p_card_instance_ids, 1) is null then
    raise exception 'no cards were named' using errcode = '22023';
  end if;

  if array_length(p_card_instance_ids, 1) > 64 then
    raise exception 'too many cards in one request: % (max 64)',
      array_length(p_card_instance_ids, 1) using errcode = '22023';
  end if;

  foreach v_card in array p_card_instance_ids loop
    begin
      v_one := public.sell_card(v_card);
      v_paid := v_paid + coalesce((v_one ->> 'sold_for')::integer, 0);
      v_done := v_done || jsonb_build_array(v_one);
    exception when others then
      -- `sell_card`'s refusals are short technical sentences rather than
      -- player-facing ones (which is what `sellErrorMessage` exists to fix on
      -- the client), so they are passed through verbatim for it to map.
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('card_instance_id', v_card, 'reason', sqlerrm)
      );
    end;
  end loop;

  -- Read back rather than accumulated: the loop's own sales moved it, and a
  -- figure derived here would be one more thing that could disagree with the
  -- wallet.
  select balance into v_balance from public.gem_balances where user_id = v_user;

  return jsonb_build_object(
    'sold',     jsonb_array_length(v_done),
    'skipped',  jsonb_array_length(v_skipped),
    'paid',     v_paid,
    'cards',    v_done,
    'refusals', v_skipped,
    'balance',  v_balance
  );
end;
$$;

revoke execute on function public.sell_cards(uuid[]) from public, anon;
grant  execute on function public.sell_cards(uuid[]) to authenticated;

comment on function public.sell_cards(uuid[]) is
  'Sells several copies, skipping any the single-card rules refuse and reporting why. The caller chooses the cards; every rule is sell_card''s.';
