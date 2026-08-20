-- Filling a set in one go.
--
-- A team set is a club's whole roster, so the single-card commit that shipped
-- with the mechanic means up to thirty confirmations to do one obvious thing:
-- put the duplicates you are never going to start into the set they belong to.
-- The friction was protecting a decision nobody is actually making per card.
--
-- ---------------------------------------------------------------------------
-- IT IS A LOOP OVER THE SINGLE COMMIT, AND THAT IS THE WHOLE DESIGN
-- ---------------------------------------------------------------------------
--
-- Every guard on a commit — membership, the slot not already being filled,
-- ownership, the copy not sitting in an unscored lineup, the requirement not
-- already being met, and which of your copies dies — lives in
-- `commit_card_to_set`. Re-implementing any of them here would be writing a
-- second definition of what a legal commit is, and the two would drift on the
-- first change. So this calls the real thing once per card and does nothing
-- itself except decide what to do when one of them refuses.
--
-- The cost is N wallet locks and N set lookups for N <= 34, inside one
-- transaction that already holds the lock. That is a rounding error against
-- getting the rules wrong in a second place.
--
-- ---------------------------------------------------------------------------
-- PARTIAL SUCCESS IS THE POINT, NOT A COMPROMISE
-- ---------------------------------------------------------------------------
--
-- One card in an unscored lineup must not fail the other eleven. Each commit
-- runs in its own exception block — which plpgsql implements as a savepoint, so
-- a refusal rolls back that card alone and leaves the transaction healthy — and
-- the caller gets back both lists: what went in, and what did not with the
-- reason it gave. A bulk action that silently dropped three cards would be
-- worse than one that refused outright; this one says so.
--
-- WHAT THIS FUNCTION DELIBERATELY DOES NOT DECIDE: which cards to send. The
-- caller passes an explicit list, in order, and gets exactly that list acted on
-- — so what a player confirmed on screen is what burns. A `fill_set()` that
-- chose for itself would burn cards the player never saw named, and would do it
-- against a set that may have moved since the screen was drawn.
--
-- ORDER MATTERS when the list is longer than the slots left: the array is
-- processed front to back and the tail is refused as 'already complete'. The
-- client sends its cheapest, most duplicated cards first for that reason.

create or replace function public.commit_cards_to_set(p_set_code text, p_card_ids uuid[])
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
  v_set     public.card_sets%rowtype;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    raise exception 'no cards were named' using errcode = '22023';
  end if;

  -- A ceiling well above the largest set (34 cards) but low enough that a
  -- runaway client cannot ask for ten thousand commits in one statement.
  if array_length(p_card_ids, 1) > 64 then
    raise exception 'too many cards in one request: % (max 64)', array_length(p_card_ids, 1)
      using errcode = '22023';
  end if;

  -- Resolved once, only so the summary can report against it. Every actual
  -- rule is checked per card, inside commit_card_to_set.
  select * into v_set from public.card_sets where code = p_set_code and is_active;
  if not found then
    raise exception 'no such set' using errcode = '22023';
  end if;

  foreach v_card in array p_card_ids loop
    begin
      v_one := public.commit_card_to_set(p_set_code, v_card);
      v_paid := v_paid + coalesce((v_one ->> 'paid')::integer, 0);
      v_done := v_done || jsonb_build_array(v_one);
    exception when others then
      -- The refusal's own words. Every one of them is written to be shown to a
      -- player, so there is nothing to translate here.
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('card_id', v_card, 'reason', sqlerrm)
      );
    end;
  end loop;

  select balance into v_balance from public.gem_balances where user_id = v_user;

  return jsonb_build_object(
    'set_code',   v_set.code,
    'set_name',   v_set.name,
    'added',      jsonb_array_length(v_done),
    'skipped',    jsonb_array_length(v_skipped),
    'paid',       v_paid,
    'cards',      v_done,
    'refusals',   v_skipped,
    -- Read back rather than accumulated: the loop's own commits moved it, and a
    -- figure derived here would be one more thing that could disagree with the
    -- wallet.
    'committed',  (select count(distinct card_id)::integer
                     from public.card_instances
                    where committed_to = v_set.id
                      and user_id = v_user
                      and committed_at is not null),
    'required',   v_set.required_count,
    'balance',    v_balance
  );
end;
$$;

revoke execute on function public.commit_cards_to_set(text, uuid[]) from public, anon;
grant  execute on function public.commit_cards_to_set(text, uuid[]) to authenticated;

comment on function public.commit_cards_to_set(text, uuid[]) is
  'Commits several cards to one set, skipping any the single-card rules refuse and reporting why. The caller chooses the cards and their order.';
