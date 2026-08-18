-- Yap Fantasy — new-user bootstrap (build plan task 5)
-- Every auth.users row gets a profile, a gem balance, and a signup grant,
-- atomically, server-side. A client never creates its own wallet.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  signup_grant constant integer := 500;
  derived_name text;
begin
  -- Local part of the email, trimmed to the profiles length check.
  derived_name := left(coalesce(split_part(new.email, '@', 1), 'player'), 24);
  if char_length(derived_name) < 2 then
    derived_name := 'player';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, derived_name)
  on conflict (id) do nothing;

  insert into public.gem_balances (user_id, balance)
  values (new.id, signup_grant)
  on conflict (user_id) do nothing;

  insert into public.gems_ledger (user_id, amount, reason)
  values (new.id, signup_grant, 'signup_bonus');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
