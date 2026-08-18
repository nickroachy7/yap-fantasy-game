-- Yap Fantasy — economy abuse suite (build plan tasks 18 + 31)
--
-- Proves gems and card minting cannot be reached from a client. Rolled back,
-- so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/economy_abuse.test.sql

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','eeeeeeee-0000-0000-0000-000000000005','authenticated','authenticated','pack@t.local','',now(),now(),now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000005","role":"authenticated"}';

do $$
declare
  v_start int; v_after int; v_cards int; v_net int;
  blocked int := 0; n int;
begin
  select balance into v_start from public.gem_balances where user_id = auth.uid();
  if v_start <> 500 then raise exception 'FAIL: signup grant was %, expected 500', v_start; end if;

  select count(*) into n from public.open_pack('standard');
  if n <> 5 then raise exception 'FAIL: pack returned % cards, expected 5', n; end if;

  select balance into v_after from public.gem_balances where user_id = auth.uid();
  if v_after <> 400 then raise exception 'FAIL: balance % after one pack, expected 400', v_after; end if;

  -- drain the wallet
  perform public.open_pack('standard');
  perform public.open_pack('standard');
  perform public.open_pack('standard');
  perform public.open_pack('standard');

  select balance into v_after from public.gem_balances where user_id = auth.uid();
  if v_after <> 0 then raise exception 'FAIL: balance % after 5 packs, expected 0', v_after; end if;

  -- 1. buy a pack you cannot afford
  begin
    perform public.open_pack('standard');
    raise exception 'FAIL: opened a pack with 0 gems';
  exception when sqlstate '22023' then blocked := blocked + 1; end;

  -- 2. invent a pack code
  begin
    perform public.open_pack('free_legendary_pack');
    raise exception 'FAIL: opened an invented pack';
  exception when sqlstate '22023' then blocked := blocked + 1; end;

  -- 3. write your own ledger entry
  begin
    insert into public.gems_ledger (user_id, amount, reason)
    values (auth.uid(), 999999, 'admin_adjust');
    raise exception 'FAIL: minted gems via direct insert';
  exception when insufficient_privilege then blocked := blocked + 1; end;

  -- 4. rewrite your own balance. An UPDATE with no matching policy affects zero
  --    rows rather than raising, so assert the value instead of catching.
  update public.gem_balances set balance = 999999 where user_id = auth.uid();
  if (select balance from public.gem_balances where user_id = auth.uid()) <> 0 then
    raise exception 'FAIL: rewrote own gem balance';
  end if;
  blocked := blocked + 1;

  -- 5. mint a card directly
  begin
    insert into public.card_instances (user_id, card_id)
    values (auth.uid(), (select id from public.cards limit 1));
    raise exception 'FAIL: minted a card directly';
  exception when insufficient_privilege then blocked := blocked + 1; end;

  if blocked <> 5 then raise exception 'FAIL: only %/5 attacks blocked', blocked; end if;

  -- the ledger must reconcile against the wallet, exactly
  select coalesce(sum(amount),0) into v_net from public.gems_ledger where user_id = auth.uid();
  if v_net <> (select balance from public.gem_balances where user_id = auth.uid()) then
    raise exception 'FAIL: ledger nets to % but balance is %',
      v_net, (select balance from public.gem_balances where user_id = auth.uid());
  end if;

  -- every card must be traceable to a pack opening: no orphan mints
  select count(*) into v_cards from public.card_instances
   where user_id = auth.uid() and pack_opening_id is null;
  if v_cards <> 0 then raise exception 'FAIL: % cards with no pack opening', v_cards; end if;

  raise notice 'PASS: 5/5 attacks blocked, ledger reconciles, 25 cards all traceable';
end $$;

reset role;
rollback;
