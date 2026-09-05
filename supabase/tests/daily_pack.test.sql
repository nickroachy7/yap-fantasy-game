-- Yap Fantasy — daily free pack
--
-- Covers the one thing `open_pack` learned when the Daily Pack shipped: a
-- per-UTC-day claim limit. The rest of that function is already proved by
-- economy_abuse.test.sql; this exists because a limit that can be claimed twice
-- is a coin printer, and because a limit that can never be claimed again is a
-- broken retention mechanic. Both failures are silent.
--
-- Rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/daily_pack.test.sql

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','eeeeeeee-0000-0000-0000-000000000009','authenticated','authenticated','daily@t.local','',now(),now(),now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000009","role":"authenticated"}';

do $$
declare
  v_start int; v_after int; v_cost int; n int; v_status jsonb;
  v_pack uuid;
  blocked int := 0;
begin
  select balance into v_start from public.coin_balances where user_id = auth.uid();

  -- 1. it is claimable before it is claimed, and says so
  v_status := public.daily_pack_status();
  if (v_status ->> 'available')::boolean is not true then
    raise exception 'FAIL: daily reported unavailable before any claim: %', v_status;
  end if;
  /* THE SHELF'S COUNT, not a constant — the same rule the price already
     follows one suite over. The daily went from three cards to five when the
     shop was rebuilt (20260905183000) and this assertion was the only thing
     that noticed, which is the suite working; hardcoding the new number just
     moves the tripwire. What matters is that `daily_pack_status` and the row
     it reports on agree. */
  if (v_status ->> 'card_count')::int
       <> (select card_count from public.packs where code = 'daily') then
    raise exception 'FAIL: daily card_count is %, but the shelf says %',
      v_status ->> 'card_count',
      (select card_count from public.packs where code = 'daily');
  end if;

  -- 2. it deals its cards
  select count(*) into n from public.open_pack('daily');
  if n <> (select card_count from public.packs where code = 'daily') then
    raise exception 'FAIL: daily returned % cards, the shelf promises %',
      n, (select card_count from public.packs where code = 'daily');
  end if;

  -- 3. IT IS FREE. The whole point, and the thing a copy-pasted pack row would
  --    quietly get wrong: a non-zero coin_cost here would take coins from someone
  --    who was told the pack was a gift.
  select balance into v_after from public.coin_balances where user_id = auth.uid();
  if v_after <> v_start then
    raise exception 'FAIL: daily cost % coins, expected 0', v_start - v_after;
  end if;

  -- 4. and writes no ledger row, for the same reason
  if exists (
    select 1 from public.coins_ledger
     where user_id = auth.uid() and reason = 'pack_purchase'
  ) then
    raise exception 'FAIL: free pack wrote a pack_purchase ledger row';
  end if;

  -- 5. the second claim of the day is refused
  begin
    perform public.open_pack('daily');
    raise exception 'FAIL: claimed the daily pack twice in one day';
  exception when sqlstate '22023' then blocked := blocked + 1; end;

  -- 6. and the status function agrees with the refusal. These are two separate
  --    reads of the same rule and a client that trusted a disagreeing pair
  --    would draw a live button that always errors.
  v_status := public.daily_pack_status();
  if (v_status ->> 'available')::boolean is not false then
    raise exception 'FAIL: status says available after the day was claimed: %', v_status;
  end if;
  if (v_status ->> 'used')::int <> 1 then
    raise exception 'FAIL: status reports % claims today, expected 1', v_status ->> 'used';
  end if;

  -- 7. THE OBVIOUS ATTACK ON A PER-DAY LIMIT is to backdate your own claim, so
  --    check it is refused before checking that the limit resets at all. This
  --    passes because `pack_openings` carries a SELECT policy and nothing else:
  --    the UPDATE matches no rows rather than raising, which is the quiet kind
  --    of pass, so it is asserted on the row count rather than on an error.
  select id into v_pack from public.packs where code = 'daily';
  update public.pack_openings
     set opened_at = now() - interval '1 day'
   where user_id = auth.uid() and pack_id = v_pack;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: a client backdated % of its own pack openings', n;
  end if;

  -- 8. the limit is PER PACK, not global: a paid pack is unaffected by having
  --    claimed the free one.
  /* `base` was `standard` until 20260905183000 renamed the shop to
     Base -> Pro -> All-Pro -> Elite. What this step needs is any paid pack. */
  select count(*) into n from public.open_pack('base');
  if n <> (select card_count from public.packs where code = 'base') then
    raise exception 'FAIL: base returned % cards after a daily claim, the shelf promises %',
      n, (select card_count from public.packs where code = 'base');
  end if;
  /* CHARGED WHAT THE SHELF SAYS, read from the row rather than from a constant.
     This was `100` until 20260903124500 doubled it to close a buy-to-dump loop,
     and a price copied into a test is a test that breaks on the day the price
     is deliberately changed. What matters here is that a paid pack still
     charges after a free one was claimed — the amount is the packs table's
     business.
     THE CARD COUNT ABOVE NOW FOLLOWS THE SAME RULE, and did not until the shop
     went to six cards a pack. Half-applying this lesson is how the suite came
     back red twice for the same kind of reason. */
  select coin_cost into v_cost from public.packs where code = 'base';
  select balance into v_after from public.coin_balances where user_id = auth.uid();
  if v_after <> v_start - v_cost then
    raise exception 'FAIL: base cost % coins, expected the shelf price of %',
      v_start - v_after, v_cost;
  end if;

  if blocked <> 1 then raise exception 'FAIL: the second same-day claim was not blocked'; end if;
end $$;

-- 9. THE LIMIT IS PER DAY, NOT PER LIFETIME.
--
-- This is the half a `once_per_user`-style check would pass every other
-- assertion above and still fail, and it can only be set up from outside the
-- client's own privileges — see 7, where backdating as the player is the attack
-- being blocked. So the clock is moved by the owner, which is the one thing a
-- test can do that a user cannot.
reset role;

update public.pack_openings po
   set opened_at = now() - interval '1 day'
  from public.packs p
 where p.id = po.pack_id
   and p.code = 'daily'
   and po.user_id = 'eeeeeeee-0000-0000-0000-000000000009';

set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000009","role":"authenticated"}';

do $$
declare n int; v_status jsonb;
begin
  v_status := public.daily_pack_status();
  if (v_status ->> 'available')::boolean is not true then
    raise exception 'FAIL: daily did not reset after the previous claim aged out: %', v_status;
  end if;
  if (v_status ->> 'used')::int <> 0 then
    raise exception 'FAIL: status counts % claims today after the reset', v_status ->> 'used';
  end if;

  select count(*) into n from public.open_pack('daily');
  if n <> (select card_count from public.packs where code = 'daily') then
    raise exception 'FAIL: reset daily returned % cards, the shelf promises %',
      n, (select card_count from public.packs where code = 'daily');
  end if;

  raise notice 'PASS: daily pack is free, deals 3, blocks a second same-day claim, cannot be backdated, resets next day, and does not gate paid packs';
end $$;

reset role;
rollback;
