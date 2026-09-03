-- Yap Fantasy — friendly contests suite (20260903180441)
--
-- Proves the four rules a manager-built contest cannot break, and the one that
-- makes it private. Rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/friendly_contests.test.sql
--
-- WHY THESE FIVE AND NOT THE HAPPY PATH. Building a contest is exercised every
-- time anybody uses the feature and it fails loudly when it breaks. What is
-- tested here is the set of things that fail QUIETLY: an economy rule relaxed
-- by one migration, a stake that reappears, a room a stranger can read, a
-- contest whose winner can never be decided. Each of those looks like a working
-- feature right up until the week settles.

begin;

-- Three managers: the host, a friend, and somebody with no connection at all.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','ffffffff-0000-0000-0000-00000000f001','authenticated','authenticated','host@t.local','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ffffffff-0000-0000-0000-00000000f002','authenticated','authenticated','pal@t.local','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ffffffff-0000-0000-0000-00000000f003','authenticated','authenticated','rando@t.local','',now(),now(),now());

insert into public.friendships (requester_id, addressee_id, state, answered_at)
values ('ffffffff-0000-0000-0000-00000000f001','ffffffff-0000-0000-0000-00000000f002','accepted', now());

-- Coins enough to build and enter without the wallet being the thing that fails.
update public.coin_balances set balance = 5000
 where user_id in ('ffffffff-0000-0000-0000-00000000f001',
                   'ffffffff-0000-0000-0000-00000000f002',
                   'ffffffff-0000-0000-0000-00000000f003');

set local role authenticated;
set local request.jwt.claims = '{"sub":"ffffffff-0000-0000-0000-00000000f001","role":"authenticated"}';

do $$
declare
  v_flex3 constant jsonb := '[{"slot":"F1","positions":["RB","WR","TE"]},
                              {"slot":"F2","positions":["RB","WR","TE"]},
                              {"slot":"F3","positions":["RB","WR","TE"]}]'::jsonb;
  v_built  jsonb;
  v_code   text;
  v_id     uuid;
  v_join   text;
  blocked  integer := 0;
  n        integer;
  v_slate  record;
begin
  select season, season_type, week into v_slate from public.lineup_slate() limit 1;
  if v_slate.season is null then
    raise notice 'SKIP: no enterable week on the slate';
    return;
  end if;

  -- ======================================================================
  -- RULE 1 — A FRIENDLY COSTS COINS, INSIDE THE BAND
  -- ======================================================================
  --
  -- The floor is the important edge and it is the one an innocent change would
  -- remove. `award_score_coins` pays score_rate() a point on every slot of every
  -- lineup filed, so a contest a player can mint for free is a faucet with no
  -- tap: the only thing capping it is one card, one contest, one week.

  begin
    perform public.create_friendly_contest('Free Money', v_flex3,
      0, 8, 'median', null, null, null, 'flat', '{}'::uuid[]);
    raise exception 'FAIL: built a free friendly — the score-coin faucet is open';
  exception when sqlstate '22023' then blocked := blocked + 1;
  end;

  -- Exactly ON the floor is still refused: the rule is strictly greater.
  begin
    perform public.create_friendly_contest('On The Floor', v_flex3,
      30, 8, 'median', null, null, null, 'flat', '{}'::uuid[]);
    raise exception 'FAIL: 30 coins for 3 slots was allowed — losing would still earn coins';
  exception when sqlstate '22023' then blocked := blocked + 1;
  end;

  begin
    perform public.create_friendly_contest('Over The Top', v_flex3,
      60, 8, 'median', null, null, null, 'flat', '{}'::uuid[]);
    raise exception 'FAIL: 60 coins for 3 slots was allowed — a pack is cheaper per card';
  exception when sqlstate '22023' then blocked := blocked + 1;
  end;

  -- ======================================================================
  -- RULE 3 — IT HAS TO BE ABLE TO RESOLVE
  -- ======================================================================
  --
  -- `contest_results` returns NULL — no win, no loss, no payout and no error —
  -- for each of these. The failure would arrive eleven days later as nobody
  -- being paid, which is why it is refused at build time.

  begin
    perform public.create_friendly_contest('Everyone Wins', v_flex3,
      40, 4, 'top_n', 4, null, null, 'flat', '{}'::uuid[]);
    raise exception 'FAIL: top 4 in a room of 4 was allowed — nobody can lose it';
  exception when sqlstate '22023' then blocked := blocked + 1;
  end;

  begin
    perform public.create_friendly_contest('Solo', v_flex3,
      40, 1, 'median', null, null, null, 'flat', '{}'::uuid[]);
    raise exception 'FAIL: a one-seat contest was allowed';
  exception when sqlstate '22023' then blocked := blocked + 1;
  end;

  begin
    perform public.create_friendly_contest('Impossible', v_flex3,
      40, 8, 'target', null, null, 900, 'flat', '{}'::uuid[]);
    raise exception 'FAIL: a 900-point target was allowed';
  exception when sqlstate '22023' then blocked := blocked + 1;
  end;

  -- THE KICKER RULE. `20260901050000` banned kickers outside the free contest
  -- entirely, on 41 kicker cards against thirty-card rosters; a friendly may
  -- have one, and two is a format the card pool cannot supply.
  begin
    perform public.create_friendly_contest('Two Kickers',
      '[{"slot":"K1","positions":["PK"]},{"slot":"K2","positions":["PK"]}]'::jsonb,
      30, 8, 'median', null, null, null, 'flat', '{}'::uuid[]);
    raise exception 'FAIL: two kicker slots were allowed';
  exception when sqlstate '22023' then blocked := blocked + 1;
  end;

  if blocked <> 7 then
    raise exception 'FAIL: % of 7 bad contests refused', blocked;
  end if;

  -- ======================================================================
  -- THE ONE THAT SHOULD WORK
  -- ======================================================================

  v_built := public.create_friendly_contest('The Good One', v_flex3,
    40, 8, 'top_n', 3, null, null, 'steep',
    array['ffffffff-0000-0000-0000-00000000f002']::uuid[]);

  v_code := v_built ->> 'code';
  v_join := v_built ->> 'join_code';
  select id into v_id from public.contests where code = v_code;

  if (v_built ->> 'invited')::integer <> 1 then
    raise exception 'FAIL: invited % friends, expected 1', v_built ->> 'invited';
  end if;
  if length(v_join) <> 6 then
    raise exception 'FAIL: join code % is % characters, expected 6', v_join, length(v_join);
  end if;

  -- ======================================================================
  -- RULE 2 — IT CANNOT TOUCH A RUN
  -- ======================================================================
  --
  -- `wipe_run` takes the collection, and it is the only irreversible act in the
  -- game. A manager must not be able to author one for somebody else. Both
  -- halves are asserted because `settle_run_week` skips on `hearts_at_risk > 0
  -- or hearts_on_win > 0` — either being nonzero brings the contest back into
  -- settlement.
  select count(*) into n from public.contests
   where id = v_id and hearts_at_risk = 0 and hearts_on_win = 0;
  if n <> 1 then
    raise exception 'FAIL: a friendly is carrying hearts';
  end if;

  -- AND IT CANNOT BE RAISED AFTERWARDS, which is the shape this would actually
  -- break in: a contest built clean and edited later. Two separate defences,
  -- and the first one is easy to mistake for the second.
  --
  -- `contests` has a SELECT policy and no write policy at all, so a client
  -- UPDATE matches no rows and REPORTS SUCCESS — it does not raise. Asserting a
  -- constraint violation here would therefore have failed against a perfectly
  -- secure database, and asserting nothing would have missed the case where the
  -- policy is loosened later. So: assert the row did not move.
  update public.contests set hearts_at_risk = 1 where id = v_id;
  select count(*) into n from public.contests
   where id = v_id and hearts_at_risk = 0;
  if n <> 1 then
    raise exception 'FAIL: a client raised the stake on a friendly through RLS';
  end if;

  -- ======================================================================
  -- THE POOL IS REDISTRIBUTION, NEVER A MINT
  -- ======================================================================
  select prize_pool_bps into n from public.contests where id = v_id;
  if n <> 9000 then
    raise exception 'FAIL: prize pool is % bps, expected 9000', n;
  end if;
  -- Nothing collected, nothing to pay: the pool is not a grant.
  if public.contest_prize_pool(v_id) <> 0 then
    raise exception 'FAIL: an unentered contest already has a pool';
  end if;

  -- ======================================================================
  -- RULE 4 — THE ROOM IS PRIVATE
  -- ======================================================================

  -- The host sees it.
  select count(*) into n from public.contest_lobby() where code = v_code;
  if n <> 1 then raise exception 'FAIL: the host cannot see their own contest'; end if;

  -- The invited friend sees it, and it is on their to-do list.
  perform set_config('request.jwt.claims',
    '{"sub":"ffffffff-0000-0000-0000-00000000f002","role":"authenticated"}', true);
  select count(*) into n from public.contest_lobby() where code = v_code;
  if n <> 1 then raise exception 'FAIL: an invited friend cannot see the contest'; end if;
  select count(*) into n from public.my_friendly_invites() where code = v_code;
  if n <> 1 then raise exception 'FAIL: the invitation is not on the friend''s list'; end if;

  -- A STRANGER SEES NOTHING, through every door there is.
  perform set_config('request.jwt.claims',
    '{"sub":"ffffffff-0000-0000-0000-00000000f003","role":"authenticated"}', true);

  select count(*) into n from public.contest_lobby() where code = v_code;
  if n <> 0 then raise exception 'FAIL: a stranger sees a friendly in the lobby'; end if;

  if public.can_see_contest(v_id) then
    raise exception 'FAIL: can_see_contest says yes to a stranger';
  end if;

  select count(*) into n from public.contest_field(v_id);
  if n <> 0 then raise exception 'FAIL: a stranger can read the field'; end if;

  begin
    perform public.contest_lineup(v_id, 'ffffffff-0000-0000-0000-00000000f001');
    raise exception 'FAIL: a stranger read somebody''s lineup in a private contest';
  exception when sqlstate '42501' then null;
  end;

  -- RLS, which is the path the lineup board takes: a plain select on contests.
  select count(*) into n from public.contests where code = v_code;
  if n <> 0 then
    raise exception 'FAIL: RLS lets a stranger read the friendly row directly';
  end if;

  -- THE JOIN CODE IS THE ONE WAY IN, and it admits to the ROOM rather than to
  -- the contest — no fee is taken and no lineup exists until `set_lineup`.
  perform public.join_friendly(lower(v_join));
  select count(*) into n from public.contest_lobby() where code = v_code;
  if n <> 1 then raise exception 'FAIL: the join code did not admit anybody'; end if;
  select count(*) into n from public.lineups
   where contest_id = v_id and user_id = 'ffffffff-0000-0000-0000-00000000f003';
  if n <> 0 then raise exception 'FAIL: joining with a code filed an entry'; end if;
  if (select balance from public.coin_balances
       where user_id = 'ffffffff-0000-0000-0000-00000000f003') <> 5000 then
    raise exception 'FAIL: joining with a code charged the fee';
  end if;

  -- AND THE CODE IS NOT HANDED OUT. Only the creator receives it, so a guest
  -- cannot fill a room with people the host did not ask for.
  select count(*) into n from public.contest_lobby()
   where code = v_code and join_code is not null;
  if n <> 0 then raise exception 'FAIL: a guest was given the join code'; end if;

  -- ======================================================================
  -- ONLY THE HOST HOLDS THE DOOR
  -- ======================================================================
  begin
    perform public.invite_to_friendly(v_code,
      array['ffffffff-0000-0000-0000-00000000f002']::uuid[]);
    raise exception 'FAIL: a guest invited somebody to a contest they do not own';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform public.cancel_friendly(v_code);
    raise exception 'FAIL: a guest called off somebody else''s contest';
  exception when sqlstate '42501' then null;
  end;

  -- A HOST CANNOT INVITE A STRANGER, which is what keeps an invitation from
  -- being a message surface: the recipient has already agreed to hear from
  -- this person. Dropped silently rather than raised — the count says so.
  perform set_config('request.jwt.claims',
    '{"sub":"ffffffff-0000-0000-0000-00000000f001","role":"authenticated"}', true);
  if public.invite_to_friendly(v_code,
       array['ffffffff-0000-0000-0000-00000000f003']::uuid[]) <> 0 then
    raise exception 'FAIL: a non-friend was invited';
  end if;

  -- ======================================================================
  -- A SHAPE THE GAME ALREADY RUNS IS THAT FORMAT, not a copy of it
  -- ======================================================================
  --
  -- Deduplication by (slot name, eligibility, order). It keeps the formats
  -- table from growing a near-duplicate row per contest, and it is why a
  -- hand-built Flex Three is titled "Flex Three".
  v_built := public.create_friendly_contest('Homemade Flex Three',
    '[{"slot":"FLEX1","positions":["RB","WR","TE"]},
      {"slot":"FLEX2","positions":["RB","WR","TE"]},
      {"slot":"FLEX3","positions":["RB","WR","TE"]}]'::jsonb,
    40, 8, 'median', null, null, null, 'flat', '{}'::uuid[]);

  if (v_built ->> 'format_code') <> 'flex3' then
    raise exception 'FAIL: a hand-built Flex Three made format % instead of reusing flex3',
      v_built ->> 'format_code';
  end if;

  raise notice 'PASS: friendly contests — % refusals, private room, no hearts, no mint', blocked;
end $$;

-- ======================================================================
-- THE CONSTRAINT UNDER THE POLICY
-- ======================================================================
--
-- Everything above ran as `authenticated`, where `contests` has no write policy
-- — so it proves RLS and says nothing about what the table itself will accept.
-- A future migration that adds an UPDATE policy, or any SECURITY DEFINER
-- function that writes this table, meets only the CHECK. That is what this
-- block exercises, as the owner, with RLS out of the way.
reset role;

do $$
declare v_id uuid; n integer;
begin
  select id into v_id from public.contests where kind = 'friendly' limit 1;
  if v_id is null then
    raise notice 'SKIP: no friendly contest to re-term';
    return;
  end if;

  begin
    update public.contests set hearts_at_risk = 1 where id = v_id;
    raise exception 'FAIL: the table accepted hearts on a friendly';
  exception when check_violation then null;
  end;

  -- EITHER REFUSAL WILL DO, and which one arrives is not this test's business.
  -- `contests_friendly_costs_coins` says a friendly charges something;
  -- `friendly_terms_are_playable` says what it charges is inside the band. A
  -- fee of nought breaks both, and the trigger happens to run first — so
  -- naming one of them here would make this assertion fail the day the other
  -- becomes the one that catches it, without anything actually being wrong.
  begin
    update public.contests set entry_fee_coins = 0 where id = v_id;
    raise exception 'FAIL: the table accepted a free friendly';
  exception
    when check_violation then null;
    when sqlstate '22023' then null;
  end;

  begin
    update public.contests set podium_coins = 100, podium_places = 3 where id = v_id;
    raise exception 'FAIL: the table accepted a minted podium on a friendly';
  exception when check_violation then null;
  end;

  begin
    update public.contests set max_entrants = null where id = v_id;
    raise exception 'FAIL: the table accepted an unbounded friendly';
  exception when check_violation then null;
  end;

  -- And the fee band is a TRIGGER rather than a CHECK, because it needs the
  -- format's slot count. It has to hold on an update too, not only an insert.
  begin
    update public.contests set entry_fee_coins = 500 where id = v_id;
    raise exception 'FAIL: the fee band does not hold on an update';
  exception when sqlstate '22023' then null;
  end;

  raise notice 'PASS: the constraints hold under the policy as well as through it';
end $$;

rollback;
