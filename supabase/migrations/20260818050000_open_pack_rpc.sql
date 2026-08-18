-- Server-side pack opening (build plan task 18).
--
-- RNG and gem math never leave the server. There is no INSERT policy on
-- card_instances, gems_ledger, gem_balances or pack_openings, so this function
-- is the only way a card is ever minted. Assume Charles Proxy.
--
-- Odds are DATA (packs.odds), not code. Today every card template is
-- rarity='common', so pulls are effectively uniform; the moment a rarity
-- algorithm is chosen and cards.rarity is populated, weighted pulls start
-- working with no code change here.

create or replace function public.open_pack(p_pack_code text)
returns table (
  card_instance_id uuid,
  player_name      text,
  position_abbreviation text,
  team_abbreviation text,
  rarity           rarity
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_pack     public.packs%rowtype;
  v_balance  integer;
  v_opening  uuid;
  v_season   integer;
  v_weights  jsonb;
  v_total    numeric;
  v_roll     numeric;
  v_acc      numeric;
  v_rarity   rarity;
  v_card     uuid;
  v_new      uuid;
  i          integer;
  r          record;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_pack from public.packs where code = p_pack_code and is_active;
  if not found then
    raise exception 'unknown or inactive pack %', p_pack_code using errcode = '22023';
  end if;

  -- Lock the wallet row for the whole transaction. Without this, two concurrent
  -- opens could both read the same balance and each pass the affordability
  -- check — the classic double-spend. The CHECK (balance >= 0) would catch it
  -- eventually, but only after one of them had already minted cards.
  select balance into v_balance
    from public.gem_balances
   where user_id = v_user
     for update;

  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;

  if v_balance < v_pack.gem_cost then
    raise exception 'insufficient gems: have %, need %', v_balance, v_pack.gem_cost
      using errcode = '22023';
  end if;

  -- Newest season that actually has mintable cards.
  select max(season) into v_season from public.cards where is_mintable;
  if v_season is null then
    raise exception 'no mintable cards' using errcode = '22023';
  end if;

  update public.gem_balances
     set balance = balance - v_pack.gem_cost, updated_at = now()
   where user_id = v_user;

  insert into public.pack_openings (user_id, pack_id, gems_spent)
  values (v_user, v_pack.id, v_pack.gem_cost)
  returning id into v_opening;

  if v_pack.gem_cost > 0 then
    insert into public.gems_ledger (user_id, amount, reason, reference_id)
    values (v_user, -v_pack.gem_cost, 'pack_purchase', v_opening);
  end if;

  v_weights := v_pack.odds;
  select coalesce(sum(value::numeric), 0) into v_total
    from jsonb_each_text(v_weights);
  if v_total <= 0 then
    raise exception 'pack % has no usable odds', p_pack_code using errcode = '22023';
  end if;

  for i in 1 .. v_pack.card_count loop
    -- weighted pick over the rarity bands
    v_roll := random() * v_total;
    v_acc  := 0;
    v_rarity := null;
    for r in select key, value::numeric as w from jsonb_each_text(v_weights) order by key loop
      v_acc := v_acc + r.w;
      if v_roll <= v_acc then
        v_rarity := r.key::rarity;
        exit;
      end if;
    end loop;
    if v_rarity is null then
      select key::rarity into v_rarity from jsonb_each_text(v_weights) order by key desc limit 1;
    end if;

    -- a card of that rarity, else any mintable card (bands can legitimately be
    -- empty — e.g. before rarity has been assigned at all)
    select c.id into v_card
      from public.cards c
     where c.season = v_season and c.is_mintable and c.rarity = v_rarity
     order by random() limit 1;

    if v_card is null then
      select c.id into v_card
        from public.cards c
       where c.season = v_season and c.is_mintable
       order by random() limit 1;
    end if;

    insert into public.card_instances (user_id, card_id, source, pack_opening_id)
    values (v_user, v_card, 'pack', v_opening)
    returning id into v_new;

    return query
      select v_new, p.full_name, p.position_abbreviation, t.abbreviation, c.rarity
        from public.cards c
        join public.players p on p.id = c.player_id
        left join public.teams t on t.id = p.team_id
       where c.id = v_card;
  end loop;
end;
$$;

revoke execute on function public.open_pack(text) from public, anon;
grant  execute on function public.open_pack(text) to authenticated;

-- Starter pack. Gem costs stay stingy on purpose: the plan's guidance is that
-- you can always grant more, but you cannot claw back.
insert into public.packs (code, name, gem_cost, card_count, odds, is_active)
values (
  'standard',
  'Standard Pack',
  100,
  5,
  '{"common": 70, "uncommon": 20, "rare": 7, "epic": 2.5, "legendary": 0.5}'::jsonb,
  true
)
on conflict (code) do update
  set name = excluded.name,
      gem_cost = excluded.gem_cost,
      card_count = excluded.card_count,
      odds = excluded.odds,
      is_active = excluded.is_active;
