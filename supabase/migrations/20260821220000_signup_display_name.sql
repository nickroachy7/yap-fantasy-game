-- Let a new account choose its own display name.
--
-- The trigger derived the name from the email local part and nothing else, so
-- the name was never the user's to pick: sign up as first.last@gmail.com and
-- "first.last" is what the leaderboard calls you. `profiles` is readable by
-- every authenticated user (see rls_policies), which makes that a small leak as
-- well as a bad name — the email prefix of everyone who signs up is legible to
-- everyone else who does.
--
-- The name now comes from `raw_user_meta_data.display_name`, which is what
-- supabase.auth.signUp({ options: { data } }) writes. Doing it here rather than
-- as a follow-up UPDATE from the client matters: the profile row is created by
-- this trigger inside the signup transaction, so a client-side rename is a
-- second round trip that can be lost to a dropped connection or a closed tab,
-- and leaves a row named after an email address when it is.
--
-- THE FALLBACK CHAIN IS UNCHANGED BELOW THE NEW STEP. Magic-link signup has no
-- form to collect a name on, so those accounts still land on the email-derived
-- name, and that is deliberate: the alternative is every link signup being
-- called "player" until they notice.
--
-- VALIDATION FALLS BACK, IT DOES NOT RAISE. `profiles_display_name_check`
-- requires 2..24 characters, and a violation raised in here would abort the
-- INSERT on auth.users — the account would fail to be created at all, over a
-- name. The client validates the same rule for a real error message; this end
-- treats anything that fails as absent and moves down the chain, so a hostile
-- or malformed payload costs the user their chosen name and nothing more.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  signup_grant constant integer := 500;
  chosen_name  text;
  derived_name text;
begin
  -- 1. What they asked to be called, if it survives the length rule.
  chosen_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if char_length(chosen_name) < 2 or char_length(chosen_name) > 24 then
    chosen_name := null;
  end if;

  -- 2. Otherwise the email local part, as before.
  derived_name := left(coalesce(split_part(new.email, '@', 1), 'player'), 24);
  if char_length(derived_name) < 2 then
    derived_name := 'player';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, coalesce(chosen_name, derived_name))
  on conflict (id) do nothing;

  insert into public.gem_balances (user_id, balance)
  values (new.id, signup_grant)
  on conflict (user_id) do nothing;

  insert into public.gems_ledger (user_id, amount, reason)
  values (new.id, signup_grant, 'signup_bonus');

  return new;
end;
$function$;

-- Same reasoning as 20260818011000: a trigger function has no business being
-- reachable as an RPC, and `create or replace` resets the grants.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
