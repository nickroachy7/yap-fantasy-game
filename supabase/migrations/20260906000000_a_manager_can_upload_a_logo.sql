-- A team logo: the first thing in this game that a player MAKES rather than
-- earns, and the first bytes any of them upload.
--
-- ---------------------------------------------------------------------------
-- WHY NO RPC IN THIS FILE READS A LOGO BACK
-- ---------------------------------------------------------------------------
--
-- A logo has to appear next to a manager's name in six different places — the
-- boards, a contest's field, the friends list, a manager's profile, the rail,
-- the account page — and every one of those is fed by a different function.
-- `display_name` is selected in 104 places across this directory, which is a
-- fair measure of what "thread one more column through" would have cost.
--
-- It would also have cost more than typing. Postgres cannot `create or replace`
-- a function whose OUT columns changed, so each of those is a DROP and a
-- recreate — and a dropped function loses its ACL and silently comes back
-- granted to PUBLIC, which is the exact trap `20260905203000` was written to
-- close. Six chances to reopen it, for a picture.
--
-- So nothing here touches an existing function. `profiles` is already
-- `select using (true)` to any signed-in reader (see `20260818010000`), and
-- every one of those six screens already has the `user_id` of every row it
-- draws. The client asks `profiles` for the logo state of the ids it is about
-- to render, in ONE batched `in (...)` per screen. See `use-team-logos.ts`.
--
-- ---------------------------------------------------------------------------
-- TWO COLUMNS, AND THE SECOND ONE IS ABOUT A CDN
-- ---------------------------------------------------------------------------
--
-- `has_logo` is the fact. `logo_version` is a counter that ONLY EVER RISES —
-- clearing a logo sets `has_logo` false and leaves the count alone.
--
-- That asymmetry is the whole point. The object lives at one fixed path per
-- user (`<uid>/logo.jpg`), which keeps a re-upload from orphaning the last
-- one, but it also means the public URL never changes — and both Supabase's
-- CDN and `expo-image`'s own cache key on that URL. A new logo at an old URL
-- is a new logo nobody sees. The client appends `?v=<logo_version>` to break
-- both caches at once.
--
-- Reset the counter on clear and the sequence 0 -> 1 -> 0 -> 1 hands the second
-- upload the FIRST one's cache entry, which is the original bug wearing a
-- disguise. Monotonic, it cannot happen.
--
-- ---------------------------------------------------------------------------
-- THE COUNTER IS BUMPED SERVER-SIDE, AFTER THE BYTES LAND
-- ---------------------------------------------------------------------------
--
-- `set_team_logo` is a function rather than a client-side
-- `update ... set logo_version = logo_version + 1` because that read-then-write
-- is two round trips holding a number that decides which cached image everyone
-- else sees. Here it is one statement.
--
-- Order matters at the call site and cannot be enforced from in here: upload
-- the object FIRST, then bump. Bumping first publishes a version number for
-- bytes that may never arrive, and every reader spends the gap fetching a 404.

alter table public.profiles
  add column has_logo     boolean not null default false,
  add column logo_version integer not null default 0;

-- ---------------------------------------------------------------- the bucket
--
-- PUBLIC, deliberately. These are drawn on the global leaderboard and on a web
-- build that anyone can open signed out; a private bucket would mean a signed
-- URL per row per render, with an expiry, on a board of fifty managers.
--
-- The size cap is the real protection and it is enforced by storage itself
-- rather than by the client — 2 MiB is generous for something rendered at 28pt
-- and small enough that nobody is hosting a photo album here. The mime list is
-- what `expo-image` will actually draw; HEIC is deliberately absent, and the
-- picker is asked to hand us JPEG instead (see `team-logo.ts`).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-logos',
  'team-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- who may write
--
-- THE FIRST PATH SEGMENT IS THE OWNER'S id, and that is the only reason these
-- policies can be one line each. `<uid>/logo.jpg` puts the authorisation check
-- in the path itself; a flat `<uid>.jpg` would have to parse a filename, and
-- `storage.foldername()` is the idiom storage's own docs are written around.
--
-- INSERT AND UPDATE BOTH, because a second upload to the same path is an
-- upsert, and an upsert with no update policy fails on the row that is already
-- there — which is every upload after a manager's first.

drop policy if exists "team logos are readable by anyone" on storage.objects;
create policy "team logos are readable by anyone"
  on storage.objects for select to public
  using (bucket_id = 'team-logos');

drop policy if exists "a manager writes their own logo" on storage.objects;
create policy "a manager writes their own logo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "a manager replaces their own logo" on storage.objects;
create policy "a manager replaces their own logo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "a manager removes their own logo" on storage.objects;
create policy "a manager removes their own logo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------- the bump
--
-- SECURITY INVOKER, and the `where id = auth.uid()` is what makes that safe:
-- the caller can only ever move their own row, and the existing update policy
-- on `profiles` would refuse anything else anyway. Definer here would be a
-- second, weaker copy of a rule that is already correct one level down.

create or replace function public.set_team_logo(p_present boolean)
returns table (has_logo boolean, logo_version integer)
language sql
security invoker
set search_path = public
as $$
  update public.profiles p
     set has_logo     = p_present,
         /* Only a SET bumps it. Clearing must leave the counter where it is —
            see the header; this single `case` is the whole cache argument. */
         logo_version = case when p_present then p.logo_version + 1 else p.logo_version end,
         updated_at   = now()
   where p.id = auth.uid()
  returning p.has_logo, p.logo_version;
$$;

revoke all on function public.set_team_logo(boolean) from public, anon;
grant execute on function public.set_team_logo(boolean) to authenticated;
