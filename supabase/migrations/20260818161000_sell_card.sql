-- Selling a card back for gems.
--
-- WHY SOFT DELETE, NOT DELETE
--
-- `lineup_slots.card_instance_id` is ON DELETE CASCADE. Deleting a sold card
-- would therefore silently remove it from every lineup it has ever started in,
-- rewriting scoring history and changing past leaderboard weeks — a data-loss
-- bug that would look like nothing at all until someone compared last month's
-- standings. So a sale marks the row and leaves it in place: history keeps
-- resolving, and `my_collection` simply stops returning it.
--
-- WHY THE PRICE IS A COLUMN AND NOT AN EXPRESSION
--
-- Tier is already the axis that says how much a card has done — it is earned by
-- starting the card, week after week, and cannot be shortcut. Pricing off it
-- keeps the rule explainable in one sentence ("a card sells for its tier's
-- value") and tunable with an UPDATE rather than a deploy, which is the same
-- decision `tier_thresholds` and `scoring_rules` already made.
--
-- THE NUMBERS, AND WHY THEY CANNOT BE FARMED
--
-- A pack is 100 gems for 5 cards, and every card mints at bronze. Dumping a
-- whole pack therefore returns 5 x 8 = 40 gems against 100 spent: buying to
-- sell is a 60% loss, so there is no money loop. Above bronze the value tracks
-- roughly a fifth of what the card has already paid its owner in score rewards
-- (0.5 gems per fantasy point):
--
--   bronze      0 fp earned ->   0 gems paid out  -> sells for   8
--   silver    200 fp         -> 100 gems          -> sells for  40
--   gold      750 fp         -> 375 gems          -> sells for 150
--   diamond  2500 fp         -> 1250 gems         -> sells for 500
--
-- Selling is therefore for clearing duplicates and dead weight, never a
-- strategy that beats holding and starting the card.

alter table public.card_instances
  add column if not exists sold_at  timestamptz,
  add column if not exists sold_for integer check (sold_for is null or sold_for >= 0);

comment on column public.card_instances.sold_at is
  'When the owner sold this copy back. Non-null means it is gone from the collection but still resolves for historical lineups.';
comment on column public.card_instances.sold_for is
  'Gems paid at the time of sale. Frozen, so re-pricing a tier never rewrites history.';

-- The collection reads "mine and not sold" on every page of every load.
create index if not exists card_instances_unsold_idx
  on public.card_instances (user_id)
  where sold_at is null;

alter table public.tier_thresholds
  add column if not exists sell_value integer not null default 0 check (sell_value >= 0);

update public.tier_thresholds set sell_value = v.val
  from (values ('bronze', 8), ('silver', 40), ('gold', 150), ('diamond', 500))
    as v(tier, val)
 where public.tier_thresholds.tier = v.tier::public.card_tier;

-- ---------------------------------------------------------------------------
-- my_collection: hide sold copies, and carry the price so the client never has
-- to compute it. A client that derives its own price will eventually disagree
-- with the server, and the disagreement will be a user watching the wrong
-- number appear in their balance.
--
-- CREATE OR REPLACE requires the existing columns in their existing order, so
-- sell_value is appended rather than slotted in beside tier.
-- ---------------------------------------------------------------------------
create or replace view public.my_collection
with (security_invoker = on) as
  select ci.id,
         ci.user_id,
         ci.card_id,
         p.full_name as player_name,
         p.position_abbreviation,
         t.abbreviation as team_abbreviation,
         p.injury_status,
         ci.tier,
         ci.career_fp,
         ci.lineup_starts,
         cur.min_career_fp as tier_floor_fp,
         nxt.min_career_fp as next_tier_at,
         nxt.tier          as next_tier_label,
         c.season,
         ci.acquired_at,
         c.player_id,
         cur.sell_value
    from public.card_instances ci
    join public.cards   c   on c.id = ci.card_id
    join public.players p   on p.id = c.player_id
    left join public.teams t on t.id = p.team_id
    join public.tier_thresholds cur on cur.tier = ci.tier
    left join public.tier_thresholds nxt on nxt.sort_order = (cur.sort_order + 1)
   where ci.sold_at is null;

-- ---------------------------------------------------------------------------
-- sell_card
--
-- There is no UPDATE policy on card_instances, gem_balances or gems_ledger, so
-- this function is the only way a card is ever sold — the same posture as
-- open_pack. Assume the caller is running curl.
-- ---------------------------------------------------------------------------
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
