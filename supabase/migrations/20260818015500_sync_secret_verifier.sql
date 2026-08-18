-- The scheduler proves itself with a shared secret generated inside the
-- database and never exported: pg_cron reads it from Vault to set the request
-- header, and the Edge Function calls this to check it.
create or replace function public.verify_sync_secret(candidate text)
returns boolean
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  stored text;
begin
  select decrypted_secret into stored
    from vault.decrypted_secrets
   where name = 'sync_secret';

  if stored is null or candidate is null then
    return false;
  end if;

  return stored = candidate;
end;
$$;

revoke execute on function public.verify_sync_secret(text) from public, anon, authenticated;
