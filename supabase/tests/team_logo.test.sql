-- Yap Fantasy — team logo suite
--
-- ONE RULE, AND IT IS THE ONE THE WHOLE FEATURE RESTS ON: `logo_version` only
-- ever RISES. Clearing a logo puts `has_logo` back to false and leaves the
-- counter exactly where it was.
--
-- That looks like a fussy detail and it is not. The object lives at a FIXED
-- path per manager, so the public URL never changes and the only thing telling
-- Supabase's CDN — and `expo-image`'s cache — that a logo is new is the `?v=`
-- appended to it. Reset the counter on a clear and the sequence
-- 0 -> 1 -> 0 -> 1 hands a manager's SECOND logo the cache entry belonging to
-- their FIRST. The failure is invisible to us and total for them: they upload a
-- new logo, everything reports success, and the old picture stays on every
-- screen in the app until some cache somewhere expires.
--
-- Nothing in the client can catch that. `set_team_logo` is where the rule lives
-- and this is the only thing asserting it.
--
-- Also proved: the function moves only the CALLER's row (case 3), and is not
-- reachable by `anon` (case 4) — the ACL check, because this function was
-- created with an explicit revoke and a dropped-and-recreated function silently
-- regains PUBLIC. See `20260905203000_open_pack_is_not_for_anon.sql`.
--
-- Everything is synthetic: two accounts at ids far above anything real. No
-- storage objects are written — this is about the row, and the bytes are the
-- client's half of the contract.
--
-- Runs inside a transaction that is rolled back, so it is safe anywhere.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/team_logo.test.sql

begin;

-- ---------------------------------------------------------------- fixtures

do $$
declare
  v_a constant uuid := 'ffffff11-0000-0000-0000-000000000001';
  v_b constant uuid := 'ffffff11-0000-0000-0000-000000000002';
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
          'logo-a@t.local', '', now(), now(), now()),
         ('00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated',
          'logo-b@t.local', '', now(), now(), now());

  -- `handle_new_user` has already made the profiles.
  update public.profiles set display_name = 'zzlogo_a' where id = v_a;
  update public.profiles set display_name = 'zzlogo_b' where id = v_b;

  if (select has_logo from public.profiles where id = v_a) then
    raise exception 'a new manager should start with no logo';
  end if;
  if (select logo_version from public.profiles where id = v_a) <> 0 then
    raise exception 'a new manager should start at version 0';
  end if;

  raise notice 'seeded two managers, neither with a logo';
end $$;

-- ------------------------------------------------- 1. setting one, twice

set local role authenticated;
set local request.jwt.claims = '{"sub":"ffffff11-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  v_has boolean;
  v_ver integer;
begin
  select has_logo, logo_version into v_has, v_ver from public.set_team_logo(true);
  if not v_has or v_ver <> 1 then
    raise exception 'first upload should be version 1, got has=% ver=%', v_has, v_ver;
  end if;

  select has_logo, logo_version into v_has, v_ver from public.set_team_logo(true);
  if not v_has or v_ver <> 2 then
    raise exception 'second upload should be version 2, got has=% ver=%', v_has, v_ver;
  end if;

  raise notice '1. two uploads counted 1, 2';
end $$;

-- ------------------------------------------- 2. clearing does NOT rewind
--
-- The whole suite. See the header for what a rewind actually costs.

do $$
declare
  v_has boolean;
  v_ver integer;
begin
  select has_logo, logo_version into v_has, v_ver from public.set_team_logo(false);
  if v_has then
    raise exception 'clearing should leave has_logo false';
  end if;
  if v_ver <> 2 then
    raise exception 'clearing must not move the counter: expected 2, got %', v_ver;
  end if;

  -- And the next upload is a NEW number, not a reused one.
  select has_logo, logo_version into v_has, v_ver from public.set_team_logo(true);
  if not v_has or v_ver <> 3 then
    raise exception 'upload after a clear should be version 3, got %', v_ver;
  end if;

  raise notice '2. a clear held the counter at 2, and the next upload was 3';
end $$;

-- ------------------------------------------------ 3. it moves only my row

do $$
declare
  v_b constant uuid := 'ffffff11-0000-0000-0000-000000000002';
begin
  if (select has_logo from public.profiles where id = v_b) then
    raise exception 'the other manager should still have no logo';
  end if;
  if (select logo_version from public.profiles where id = v_b) <> 0 then
    raise exception 'the other manager''s counter should still be 0';
  end if;

  raise notice '3. the other manager was untouched';
end $$;

-- ------------------------------------------------------ 4. not for anon
--
-- An explicit revoke was written into the migration. This is what notices if a
-- future drop-and-recreate forgets it.

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_ok boolean := false;
begin
  begin
    perform public.set_team_logo(true);
  exception
    when insufficient_privilege then v_ok := true;
  end;

  if not v_ok then
    raise exception 'set_team_logo must not be executable by anon';
  end if;

  raise notice '4. anon was refused';
end $$;

reset role;

rollback;
