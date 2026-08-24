-- Yap Fantasy — view security properties
--
-- `player_directory` was created with `security_invoker = on` and an explicit
-- comment saying why. A later `create or replace view` that only meant to add
-- stat columns dropped the option, because CREATE OR REPLACE VIEW preserves the
-- name and the grants but NOT the reloptions. The view then ran as SECURITY
-- DEFINER for a day and nothing in the repo noticed — the Supabase linter did.
--
-- So this suite exists to make that class of regression loud. It asserts the
-- PROPERTY, not any one view: a view added next month is covered the moment it
-- lands, without anybody remembering to extend a list.
--
-- The last assertion is the one that matters most. Rather than trusting the
-- flag, it grants anon SELECT back inside the transaction and proves that
-- security_invoker ALONE still hides another user's cards. Grants and RLS are
-- two independent layers here, and a test that only ever checks them together
-- cannot tell you which one is load-bearing.
--
-- Runs inside a transaction that is rolled back, so it is safe against any
-- environment including production.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/view_security.test.sql

begin;

do $$
declare
  v_bad   text;
  v_count integer;
begin
  ------------------------------------------------------------------ 1. options
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'v'
     -- MATCHED ON THE VALUE, NOT ON THE SPELLING. Postgres stores whatever the
     -- CREATE VIEW wrote: every view here says `security_invoker = on` and one
     -- written `= true` stored `security_invoker=true`, which is the same
     -- setting and failed this test. A suite that reports a correctly-invoker
     -- view as SECURITY DEFINER is worse than no suite — it teaches you to
     -- distrust the alarm.
     and not coalesce(
           (select true from unnest(coalesce(c.reloptions, '{}')) o
             where split_part(o, '=', 1) = 'security_invoker'
               and lower(split_part(o, '=', 2)) in ('on', 'true', '1', 'yes')),
           false);

  if v_bad is not null then
    raise exception 'FAIL 1: view(s) in public run as SECURITY DEFINER: %', v_bad;
  end if;
  raise notice 'PASS 1: every view in public is security_invoker';

  ------------------------------------------------------------- 2. anon on views
  -- Supabase's default privileges hand anon everything created in public, so
  -- this has to be revoked deliberately and can be re-granted just as quietly.
  select string_agg(distinct table_name, ', ' order by table_name) into v_bad
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee = 'anon'
     and table_name in ('my_collection', 'player_directory');

  if v_bad is not null then
    raise exception 'FAIL 2: anon still holds privileges on: %', v_bad;
  end if;
  raise notice 'PASS 2: anon has no privileges on my_collection or player_directory';

  --------------------------------------------------------- 3. matviews are shut
  -- A materialized view CANNOT carry RLS, so a grant on one is the whole story.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'm'
     and (has_table_privilege('anon', c.oid, 'select')
       or has_table_privilege('authenticated', c.oid, 'select'));

  if v_bad is not null then
    raise exception 'FAIL 3: matview(s) readable by anon/authenticated (no RLS possible): %', v_bad;
  end if;
  raise notice 'PASS 3: no materialized view in public is directly readable';

  ------------------------------------------------- 4. authenticated kept access
  -- The mirror of 2. A revoke that also locked out the app would "pass" every
  -- assertion above while breaking every screen.
  if not has_table_privilege('authenticated', 'public.my_collection', 'select')
     or not has_table_privilege('authenticated', 'public.player_directory', 'select') then
    raise exception 'FAIL 4: authenticated lost SELECT on a view the app reads';
  end if;
  raise notice 'PASS 4: authenticated can still read both views';
end;
$$;

-------------------------------------------------------------------------------
-- 5. Behavioural: security_invoker hides other users' cards on its own.
-------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '51111111-1111-1111-1111-111111111111',
        'authenticated', 'authenticated', 'viewsec@test.local', '', now(), now(), now());

insert into public.teams (external_id, abbreviation) values (9501, 'VSC');
insert into public.players (external_id, first_name, last_name, position, position_abbreviation, team_id)
values (9501, 'View', 'Secrecy', 'QB', 'QB', (select id from public.teams where external_id = 9501));
insert into public.cards (player_id, season, rarity)
values ((select id from public.players where external_id = 9501), 2026, 'common');
insert into public.card_instances (user_id, card_id)
values ('51111111-1111-1111-1111-111111111111',
        (select id from public.cards
          where player_id = (select id from public.players where external_id = 9501)));

do $$
declare
  v_owner_sees integer;
  v_anon_sees  integer;
begin
  -- The row exists and the owner can see it, so a zero below means "hidden",
  -- not "nothing was ever inserted".
  select count(*) into v_owner_sees
    from public.my_collection
   where user_id = '51111111-1111-1111-1111-111111111111';

  if v_owner_sees <> 1 then
    raise exception 'FAIL 5 setup: expected 1 card as postgres, saw %', v_owner_sees;
  end if;
end;
$$;

-- Hand anon the grant back, deliberately, so the ONLY thing left standing is
-- security_invoker + RLS. Rolled back with everything else.
--
-- anon already holds SELECT on the tables underneath (card_instances, cards,
-- players, teams, tier_thresholds) — the same Supabase default privilege — and
-- every one of them has RLS enabled. That is exactly the configuration this
-- assertion is here to exercise: the reason anon sees nothing must be the
-- POLICY, not a missing grant somewhere in the stack.
grant select on public.my_collection to anon;

set local role anon;

do $$
declare
  v_anon_sees integer;
begin
  select count(*) into v_anon_sees from public.my_collection;

  if v_anon_sees <> 0 then
    raise exception
      'FAIL 5: anon saw % row(s) in my_collection with SELECT granted — security_invoker/RLS is NOT holding on its own',
      v_anon_sees;
  end if;
  raise notice 'PASS 5: with SELECT granted back, anon still sees 0 rows — RLS is the real gate';
end;
$$;

reset role;

do $$
begin
  raise notice 'ALL VIEW SECURITY ASSERTIONS PASSED';
end;
$$;

rollback;
