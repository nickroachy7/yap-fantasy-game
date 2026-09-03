-- Yap Fantasy — friendships suite
--
-- THE ONE THING THIS PROVES: a pair of managers has exactly ONE friendship,
-- whichever way it was asked, and only the person a request was sent to can
-- answer it.
--
-- Both halves of that are silent failures. The schema keeps one row per pair
-- behind an expression index on `(least, greatest)`, so a second row cannot
-- exist — which means every path that might create one has to be a path that
-- deliberately does something else instead. There are three, and each is a case
-- below:
--
--   * A asks B twice          idempotent. Nothing inserted, no error raised.
--   * A asks B, B asks A      the second ask ACCEPTS the first. This is the one
--                             that would otherwise be a raw 23505 shown to the
--                             reader as "something went wrong" at the exact
--                             moment two people agreed.
--   * B declined A, B asks A  the same row flips direction and reopens.
--
-- And the answering rule: `friend_accept` and `friend_decline` are scoped to
-- `addressee_id = auth.uid()`, so a requester cannot accept their own request.
-- Without that, "send request" and "become friends" are the same call and the
-- whole feature is decoration. Case 6 is a requester trying it.
--
-- IT ALSO CHECKS THE THINGS THAT ARE ABOUT PRIVACY RATHER THAN LOGIC:
--
--   * the SELECT policy shows a friendship only to its two participants, so a
--     third manager cannot enumerate who is friends with whom (case 8);
--   * `anon` can execute none of the nine functions (case 9);
--   * `manager_profile` returns no email and never has (case 10) — it is the
--     one reader that exists to be pointed at somebody else.
--
-- Everything is synthetic: four accounts at ids far above anything real, no
-- cards, no lineups, no slate. The friendship verbs touch none of that, and a
-- suite that seeded a season would be testing the boards again.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/friends.test.sql

begin;

-- ---------------------------------------------------------------- fixtures

do $$
declare
  v_a constant uuid := 'ffffff00-0000-0000-0000-000000000001';
  v_b constant uuid := 'ffffff00-0000-0000-0000-000000000002';
  v_c constant uuid := 'ffffff00-0000-0000-0000-000000000003';
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
          'friends-a@t.local', '', now(), now(), now()),
         ('00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated',
          'friends-b@t.local', '', now(), now(), now()),
         ('00000000-0000-0000-0000-000000000000', v_c, 'authenticated', 'authenticated',
          'friends-c@t.local', '', now(), now(), now());

  -- `handle_new_user` has already made the profiles; these are names the
  -- directory search can be pointed at without matching a real account.
  update public.profiles set display_name = 'zzfriend_a' where id = v_a;
  update public.profiles set display_name = 'zzfriend_b' where id = v_b;
  update public.profiles set display_name = 'zzfriend_c' where id = v_c;

  raise notice 'seeded three managers';
end $$;

-- ---------------------------------------------------------------- 1. the ask

set local role authenticated;
set local request.jwt.claims = '{"sub":"ffffff00-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  v_a constant uuid := 'ffffff00-0000-0000-0000-000000000001';
  v_b constant uuid := 'ffffff00-0000-0000-0000-000000000002';
  v_state text;
  v_rows  integer;
begin
  v_state := public.friend_request(v_b);
  if v_state <> 'pending' then
    raise exception 'FAIL 1: an ask returned % rather than pending', v_state;
  end if;

  -- The same row read from both ends. This is the property every screen leans
  -- on, and it is the one thing a two-row schema could not give.
  if public.friend_link(v_a, v_b) <> 'outgoing' then
    raise exception 'FAIL 1: the asker sees %', public.friend_link(v_a, v_b);
  end if;
  if public.friend_link(v_b, v_a) <> 'incoming' then
    raise exception 'FAIL 1: the asked sees %', public.friend_link(v_b, v_a);
  end if;

  -- Idempotent: a second press is not a second ask, and must not be an error.
  v_state := public.friend_request(v_b);
  select count(*) into v_rows from public.friendships;
  if v_state <> 'pending' or v_rows <> 1 then
    raise exception 'FAIL 2: asking twice gave % over % rows', v_state, v_rows;
  end if;

  raise notice 'PASS 1: one ask, one row, read correctly from both ends';
  raise notice 'PASS 2: asking twice is idempotent';
end $$;

-- ---------------------------------------------------------------- 3. asking back

set local request.jwt.claims = '{"sub":"ffffff00-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
declare
  v_a constant uuid := 'ffffff00-0000-0000-0000-000000000001';
  v_b constant uuid := 'ffffff00-0000-0000-0000-000000000002';
  v_state text;
  v_rows  integer;
begin
  -- THE CASE THAT WOULD OTHERWISE BE A CONSTRAINT VIOLATION. Two people who
  -- each open the other's profile and press the button both expect to be
  -- friends; the unique pair index means the second insert cannot happen, so
  -- the second ask has to mean accept.
  v_state := public.friend_request(v_a);
  select count(*) into v_rows from public.friendships;
  if v_state <> 'accepted' or v_rows <> 1 then
    raise exception 'FAIL 3: a mutual ask gave % over % rows', v_state, v_rows;
  end if;
  if public.friend_link(v_a, v_b) <> 'friends' or public.friend_link(v_b, v_a) <> 'friends' then
    raise exception 'FAIL 3: after a mutual ask the two disagree: % / %',
      public.friend_link(v_a, v_b), public.friend_link(v_b, v_a);
  end if;

  -- The row still remembers who asked first — accepting does not symmetrise it,
  -- which is why every reader normalises with a CASE. See the migration.
  if not exists (select 1 from public.friendships f
                  where f.requester_id = v_a and f.addressee_id = v_b) then
    raise exception 'FAIL 3: accepting rewrote the direction of the ask';
  end if;

  raise notice 'PASS 3: asking back accepts, and the row remembers who asked';
end $$;

-- ---------------------------------------------------------------- 4. the list

do $$
declare
  v_a constant uuid := 'ffffff00-0000-0000-0000-000000000001';
  v_name text;
  v_n    integer;
begin
  -- Read as B, who was the ADDRESSEE. A list that only normalised one way would
  -- come back empty here and full for A, which is the bug this asserts against.
  select display_name into v_name from public.my_friends() limit 1;
  select count(*) into v_n from public.my_friends();
  if v_n <> 1 or v_name <> 'zzfriend_a' then
    raise exception 'FAIL 4: the addressee sees % friends (first: %)', v_n, v_name;
  end if;

  -- Nothing is pending any more, so the inbox is empty for both of them.
  select count(*) into v_n from public.my_friend_requests();
  if v_n <> 0 then
    raise exception 'FAIL 4: % requests still pending after an accept', v_n;
  end if;

  -- The profile agrees with the list, and dates the friendship.
  if (select friend_state from public.manager_profile(v_a)) <> 'friends' then
    raise exception 'FAIL 4: manager_profile disagrees with my_friends';
  end if;
  if (select friends_since from public.manager_profile(v_a)) is null then
    raise exception 'FAIL 4: an accepted friendship has no date';
  end if;

  raise notice 'PASS 4: both ends see the friendship, and it is dated';
end $$;

-- ---------------------------------------------------------------- 5. no, remembered

do $$
declare
  v_a constant uuid := 'ffffff00-0000-0000-0000-000000000001';
  v_b constant uuid := 'ffffff00-0000-0000-0000-000000000002';
  v_state text;
  v_rows  integer;
begin
  -- Put the pair back to nothing (B unfriends A), then have A ask again.
  perform public.friend_remove(v_a);
  if public.friend_link(v_a, v_b) <> 'none' then
    raise exception 'FAIL 5: after a removal the pair is %', public.friend_link(v_a, v_b);
  end if;

  set local request.jwt.claims = '{"sub":"ffffff00-0000-0000-0000-000000000001","role":"authenticated"}';
  perform public.friend_request(v_b);

  set local request.jwt.claims = '{"sub":"ffffff00-0000-0000-0000-000000000002","role":"authenticated"}';
  v_state := public.friend_decline(v_a);
  if v_state <> 'dismissed' then
    raise exception 'FAIL 5: a decline returned %', v_state;
  end if;

  -- A DECLINE IS REMEMBERED, and that is the whole point of not deleting the
  -- row: it is what stops "no" costing the asker nothing.
  select count(*) into v_rows from public.friendships;
  if v_rows <> 1 then
    raise exception 'FAIL 5: a decline left % rows', v_rows;
  end if;
  if public.friend_link(v_a, v_b) <> 'declined'
     or public.friend_link(v_b, v_a) <> 'dismissed' then
    raise exception 'FAIL 5: after a decline the pair reads % / %',
      public.friend_link(v_a, v_b), public.friend_link(v_b, v_a);
  end if;

  raise notice 'PASS 5: a decline is remembered, and reads differently at each end';
end $$;

-- ---------------------------------------------------------------- 6. the rules of answering

do $$
declare
  v_a constant uuid := 'ffffff00-0000-0000-0000-000000000001';
  v_b constant uuid := 'ffffff00-0000-0000-0000-000000000002';
  v_refused integer := 0;
  v_state   text;
begin
  set local request.jwt.claims = '{"sub":"ffffff00-0000-0000-0000-000000000001","role":"authenticated"}';

  -- A was declined and cannot ask again. The one dead end in the vocabulary.
  begin
    perform public.friend_request(v_b);
  exception when others then v_refused := v_refused + 1;
  end;

  -- Nor can A clear the no that was given TO them — that row is B's answer.
  perform public.friend_remove(v_b);
  if public.friend_link(v_a, v_b) <> 'declined' then
    raise exception 'FAIL 6: the requester cleared a decline they received';
  end if;

  if v_refused <> 1 then
    raise exception 'FAIL 6: a declined requester was allowed to ask again';
  end if;

  -- B, who declined, MAY ask A themselves: the row flips direction and reopens.
  set local request.jwt.claims = '{"sub":"ffffff00-0000-0000-0000-000000000002","role":"authenticated"}';
  v_state := public.friend_request(v_a);
  if v_state <> 'pending' or public.friend_link(v_b, v_a) <> 'outgoing' then
    raise exception 'FAIL 6: the decliner could not ask (% / %)',
      v_state, public.friend_link(v_b, v_a);
  end if;

  -- AND THE REQUESTER STILL CANNOT ACCEPT THEIR OWN REQUEST. Without this the
  -- ask and the friendship are the same call.
  v_refused := 0;
  begin
    perform public.friend_accept(v_a);
  exception when others then v_refused := v_refused + 1;
  end;
  if v_refused <> 1 or public.friend_link(v_b, v_a) <> 'outgoing' then
    raise exception 'FAIL 6: a requester accepted their own request';
  end if;

  raise notice 'PASS 6: only the addressee answers, and a no cannot be self-cleared';
end $$;

-- ---------------------------------------------------------------- 7. the directory

do $$
declare
  v_hits integer;
  v_self integer;
  v_link text;
begin
  set local request.jwt.claims = '{"sub":"ffffff00-0000-0000-0000-000000000001","role":"authenticated"}';

  -- An empty query is the directory, not an empty result — the whole reason
  -- the find panel is worth opening in a beta this size.
  select count(*) into v_hits from public.find_managers(null, 100);
  if v_hits = 0 then
    raise exception 'FAIL 7: an empty query returned nobody';
  end if;

  -- And it never returns the caller: an "add" button on yourself is a button
  -- that can only error.
  select count(*) into v_self
    from public.find_managers(null, 100)
   where user_id = 'ffffff00-0000-0000-0000-000000000001'::uuid;
  if v_self <> 0 then
    raise exception 'FAIL 7: the directory returned the caller';
  end if;

  -- Every row carries the state, so the list can draw the right button per
  -- person rather than one button that errors on half of them.
  select friend_state into v_link
    from public.find_managers('zzfriend_b', 10)
   where user_id = 'ffffff00-0000-0000-0000-000000000002'::uuid;
  if v_link <> 'incoming' then
    raise exception 'FAIL 7: the directory reports % for a pending ask', v_link;
  end if;

  raise notice 'PASS 7: the directory lists everyone but you, with the state on every row';
end $$;

-- ---------------------------------------------------------------- 8. who can see a friendship

do $$
declare
  v_visible integer;
begin
  -- C is not in any of this. A friendship is between two people and the policy
  -- says so: without it, one signed-in account could enumerate the whole
  -- social graph.
  set local request.jwt.claims = '{"sub":"ffffff00-0000-0000-0000-000000000003","role":"authenticated"}';
  select count(*) into v_visible from public.friendships;
  if v_visible <> 0 then
    raise exception 'FAIL 8: a third manager can see % friendship rows', v_visible;
  end if;

  raise notice 'PASS 8: a friendship is visible only to its two participants';
end $$;

-- ---------------------------------------------------------------- 9. anon

reset role;

do $$
declare v_denied integer := 0;
begin
  set local role anon;

  begin perform public.friend_link(null, null);
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform public.friend_request('ffffff00-0000-0000-0000-000000000002'::uuid);
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform public.friend_accept('ffffff00-0000-0000-0000-000000000002'::uuid);
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform public.friend_decline('ffffff00-0000-0000-0000-000000000002'::uuid);
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform public.friend_remove('ffffff00-0000-0000-0000-000000000002'::uuid);
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform * from public.my_friends();
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform * from public.my_friend_requests();
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform * from public.find_managers(null, 1);
  exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin perform * from public.manager_profile('ffffff00-0000-0000-0000-000000000002'::uuid);
  exception when insufficient_privilege then v_denied := v_denied + 1; end;

  reset role;

  if v_denied <> 9 then
    raise exception 'FAIL 9: only %/9 friend functions refused anon', v_denied;
  end if;
  raise notice 'PASS 9: anon can execute none of the nine';
end $$;

-- ---------------------------------------------------------------- 10. what a profile does not say

do $$
declare v_cols text;
begin
  -- The one reader built to be pointed at somebody else. Everything it returns
  -- is already on a public board; an email would not be, and this is the
  -- assertion that keeps a future column from quietly becoming one.
  select string_agg(a.attname, ', ')
    into v_cols
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(p.proargnames) with ordinality as a(attname, ord)
   where n.nspname = 'public'
     and p.proname = 'manager_profile'
     and a.attname ~* 'email|password|phone|token|ip_|address';

  if v_cols is not null then
    raise exception 'FAIL 10: manager_profile exposes %', v_cols;
  end if;

  raise notice 'PASS 10: manager_profile exposes no contact details';
end $$;

rollback;
