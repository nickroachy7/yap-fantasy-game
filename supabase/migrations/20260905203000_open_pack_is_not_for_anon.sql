-- ===========================================================================
-- `open_pack` IS NOT FOR `anon`
-- ===========================================================================
--
-- 20260905140000 dropped and recreated `open_pack` to widen its return type,
-- and ended with what looked like the right restoration:
--
--     revoke all on function public.open_pack(text) from public;
--     grant execute on function public.open_pack(text) to authenticated, service_role;
--
-- That is not enough, and the ACL afterwards proves it:
--
--     {postgres=X, anon=X, authenticated=X, service_role=X}
--
-- WHERE `anon` CAME FROM. A Supabase project ships ALTER DEFAULT PRIVILEGES
-- granting EXECUTE on new functions in `public` to `anon` and `authenticated`.
-- So the grant is applied at CREATE time, to the role by name — and
-- `revoke ... from public` does not touch it, because PUBLIC and `anon` are
-- different grantees. The revoke ran, looked like it had done the job, and left
-- a coin-spending, card-minting endpoint reachable by an unauthenticated
-- request.
--
-- IT WAS NOT EXPLOITABLE, and that is worth stating precisely rather than
-- reassuringly: the first thing the function does is read `auth.uid()` and
-- raise `28000` when it is null, so an anonymous call fails before it can lock
-- a wallet or mint anything. What was lost is the layer underneath that — the
-- guarantee that the endpoint is not even callable — and defence in depth is
-- exactly the thing you do not notice losing.
--
-- THE RULE FOR NEXT TIME. Dropping a function in this project silently
-- re-grants it to `anon`. Any migration that drops and recreates one must
-- revoke `anon` BY NAME afterwards and then read `proacl` back, rather than
-- trusting `revoke from public` to have covered it.
-- ===========================================================================

revoke execute on function public.open_pack(text) from anon;

-- Stated positively as well, so this file describes the intended end state
-- rather than only the correction.
revoke all    on function public.open_pack(text) from public;
grant  execute on function public.open_pack(text) to authenticated, service_role;

-- `pack_odds` KEEPS ITS `anon` GRANT, deliberately. It reads no user state,
-- writes nothing, and returns what the shelf prints on the pack card — the
-- published odds are public information by design, and a signed-out browser
-- landing on the web build should be able to read them.
