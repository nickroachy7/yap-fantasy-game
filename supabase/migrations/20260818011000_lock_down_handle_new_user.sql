-- PostgREST exposes every function in the public schema as an RPC endpoint.
-- handle_new_user() is a trigger function only, so revoke EXECUTE from the
-- client roles to keep /rest/v1/rpc/handle_new_user unreachable. The trigger
-- itself runs as the table owner and is unaffected.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
