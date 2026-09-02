-- `score_rate()` shipped with the grant Postgres gives every function, and the
-- house rule is that nothing does.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS AND IS NOT
-- ---------------------------------------------------------------------------
--
-- It is NOT a live hole, and it is worth being exact about why rather than
-- filing it as one. `20260901010000` created `score_rate()` with a `grant
-- execute ... to authenticated` and no matching revoke, so it kept Postgres's
-- default `EXECUTE` for PUBLIC — which `anon` is a member of. But:
--
--   * it is not SECURITY DEFINER (`prosecdef = f`), so it runs as its caller;
--   * its whole body is a call to `game_config_value`, which `20260830020000`
--     revoked from `public, anon`.
--
-- So an anonymous call fails on the inner function today. Nothing leaked.
--
-- ---------------------------------------------------------------------------
-- WHY IT IS STILL WORTH A MIGRATION
-- ---------------------------------------------------------------------------
--
-- Because the thing standing between `anon` and this function is a grant on a
-- DIFFERENT function, and nobody reading `score_rate()` would know that.
--
-- The obvious future edit is to make it SECURITY DEFINER — a natural thing to
-- want, so a caller can read the rate without also being trusted with
-- `game_config_value`. That single word would turn this into an anon-readable
-- door, with no other change and no warning. The protection is currently
-- accidental, and accidental protection is the exact failure
-- `20260830020000_the_contest_rpcs_were_never_revoked_from_anon` was written
-- about: four contest RPCs that were assumed closed and were not.
--
-- The posture in this codebase is that every function states its own audience.
-- This one did not.
--
-- ---------------------------------------------------------------------------
-- NOTHING BREAKS, AND THE REASON IS THAT NOTHING CALLS IT
-- ---------------------------------------------------------------------------
--
-- The client never invokes `score_rate()`. It reads the rate as a COLUMN off
-- `contest_lobby()` and `my_contest_cards()` (see `use-contests.ts` and
-- `use-my-contests.ts`), and both of those are SECURITY DEFINER — so the call
-- happens as the function owner, not as the signed-in user, and is unaffected
-- by any grant here.
--
-- The `authenticated` grant is therefore not load-bearing either. It is kept
-- anyway, so that a future caller reaching for the rate directly gets the
-- answer rather than a permission error, which is how every other read helper
-- in this schema behaves.

revoke execute on function public.score_rate() from public, anon;
grant  execute on function public.score_rate() to authenticated;

-- Assert it, rather than trusting that the revoke above said what it meant.
-- This is the check `20260830020000` would have caught its four functions with.
do $$
declare v_open text;
begin
  select string_agg(distinct case when x.grantee = 0 then 'PUBLIC'
                                  else pg_get_userbyid(x.grantee) end, ', ')
    into v_open
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(p.proacl) x
   where n.nspname = 'public'
     and p.proname = 'score_rate'
     and x.privilege_type = 'EXECUTE'
     and (x.grantee = 0 or pg_get_userbyid(x.grantee) = 'anon');

  if v_open is not null then
    raise exception 'score_rate() is still executable by %', v_open;
  end if;
end $$;
