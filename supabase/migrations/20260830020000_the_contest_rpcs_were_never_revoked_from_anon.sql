-- Eleven SECURITY DEFINER functions were callable by `anon`.
--
-- ---------------------------------------------------------------------------
-- HOW A GRANT NOBODY WROTE ENDED UP THERE
-- ---------------------------------------------------------------------------
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default. Every RPC in
-- this database from August 18 answers that with an explicit
--
--     revoke execute on function ... from public, anon;
--
-- on the line after its grant — see `set_lineup`, `leaderboard`, `open_pack`,
-- `player_profile`, `median_record`. The contest work of August 25 and 26 wrote
-- the grant and not the revoke, eleven times, and every function it added
-- inherited PUBLIC's.
--
-- `docs/security-posture.md` states the invariant this violates out loud —
-- "anon_can_call must be false for every row. If it is ever true, that is a
-- finding, not a warning" — and hands you the query that finds it. Nobody ran
-- the query.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ACTUALLY EXPOSED, AND WHY IT MATTERS MORE TODAY THAN YESTERDAY
-- ---------------------------------------------------------------------------
--
-- The publishable key is in the app bundle, so `anon` is not a hypothetical
-- role — it is anybody who has ever opened the site. These are all definer
-- functions over RLS-hidden tables, so the RLS underneath them does not save
-- anything:
--
--   contest_lineup   the worst of them, and it is worse as of today: it takes a
--                    contest and a user as ARGUMENTS rather than reading
--                    `auth.uid()`, and `20260830010000` has just removed the
--                    reveal rule that was gating it. An unauthenticated caller
--                    could read any entry in any contest.
--   contest_field    every entrant's display name, score, place and prize.
--   contest_lobby    what is open this week. Harmless-ish, and it still leaks
--                    the shape of the game to anybody counting.
--   my_contest_cards, set_lineup, leave_contest
--                    all keyed on `auth.uid()`, which is null for `anon`, so
--                    these fail or return nothing rather than acting. Revoked
--                    anyway: "it happens not to work" is not an access control.
--   contest_entrants, contest_payouts, contest_prize_pool, locked_cards,
--   game_config_value
--                    helpers the other definers call. A nested call runs as the
--                    DEFINER, so revoking the outside grant costs them nothing.
--
-- Signatures are spelled out in full because `set_lineup` is overloaded: the
-- four-argument form was revoked in `20260818031000`, and it was the FIVE
-- argument one — the contest-aware overload — that arrived without it.

revoke execute on function public.contest_entrants(uuid)                      from public, anon;
revoke execute on function public.contest_field(uuid)                         from public, anon;
revoke execute on function public.contest_lineup(uuid, uuid)                  from public, anon;
revoke execute on function public.contest_lobby()                             from public, anon;
revoke execute on function public.contest_payouts(uuid)                       from public, anon;
revoke execute on function public.contest_prize_pool(uuid)                    from public, anon;
revoke execute on function public.game_config_value(text, integer)            from public, anon;
revoke execute on function public.leave_contest(text)                         from public, anon;
revoke execute on function public.locked_cards(integer, smallint, integer)    from public, anon;
revoke execute on function public.my_contest_cards(text)                      from public, anon;
revoke execute on function public.set_lineup(integer, smallint, integer, jsonb, text)
  from public, anon;

-- The grants the revokes must not have taken with them. `revoke ... from
-- public` removes the default grant; these are explicit and survive it, but
-- restating them here means this file can be read on its own and means a replay
-- cannot leave a function nobody can call.
grant execute on function public.contest_entrants(uuid)                       to authenticated;
grant execute on function public.contest_field(uuid)                          to authenticated;
grant execute on function public.contest_lineup(uuid, uuid)                   to authenticated;
grant execute on function public.contest_lobby()                              to authenticated;
grant execute on function public.contest_payouts(uuid)                        to authenticated;
grant execute on function public.contest_prize_pool(uuid)                     to authenticated;
grant execute on function public.game_config_value(text, integer)             to authenticated;
grant execute on function public.leave_contest(text)                          to authenticated;
grant execute on function public.locked_cards(integer, smallint, integer)     to authenticated;
grant execute on function public.my_contest_cards(text)                       to authenticated;
grant execute on function public.set_lineup(integer, smallint, integer, jsonb, text)
  to authenticated;

-- And prove it, in the same transaction that did it. A revoke that silently
-- missed an overload is exactly the failure this file exists to correct, so it
-- is asserted rather than assumed.
do $$
declare v_bad text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute');

  if v_bad is not null then
    raise exception 'anon can still execute definer functions: %', v_bad;
  end if;
end $$;
