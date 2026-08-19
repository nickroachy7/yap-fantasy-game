-- A stated security property that silently reverted.
--
-- `player_directory` was created (20260818070000) with an explicit
-- `with (security_invoker = on)` and a comment explaining why. The stats addon
-- (20260818170000) later widened the column list with a plain
-- `create or replace view ... as`, which does NOT preserve reloptions — so the
-- option was dropped and the view has been running as SECURITY DEFINER ever
-- since. Nothing announced it; the Supabase linter is what noticed.
--
-- Bug class worth remembering: `create or replace view` keeps the NAME and the
-- GRANTS but not the OPTIONS. Any security property you set at creation has to
-- be restated by every later replace, or asserted somewhere that fails loudly.
-- This migration does the second thing.
--
-- `alter view ... set` rather than another `create or replace`, deliberately:
-- restating the 40-column body here would be a third copy of it, free to drift
-- from the one in 20260818170000. This changes only the property that is wrong.
alter view public.player_directory set (security_invoker = on);

-- ---------------------------------------------------------------- anon access
-- Supabase's default privileges grant `anon` and `authenticated` everything on
-- anything created in `public` — the same default that already made
-- `player_season_ranks` reachable (20260818130000).
--
-- With security_invoker restored, `my_collection` was never actually leaking:
-- RLS runs as the caller, and anon owns no cards, so anon selects zero rows.
-- That is the mechanism working. But it is the ONLY thing standing between an
-- unauthenticated request and every tester's collection, and the view next door
-- just demonstrated that the mechanism can be switched off by an unrelated
-- edit. Two independent reasons to be unreadable is the point.
--
-- `player_directory` is reference data (who exists, what they scored) and was
-- genuinely anon-readable while the option was off. Every caller in the app
-- sits behind the auth gate — `src/components/cards/player-directory.ts` and
-- `src/app/(app)/player/[id].tsx` — so nothing legitimate loses access. The
-- public routes (`/legal/privacy`, `/legal/support`) read no data at all.
revoke all on public.player_directory from anon;
revoke all on public.my_collection   from anon;

grant select on public.player_directory to authenticated;
grant select on public.my_collection   to authenticated;

-- ---------------------------------------------------------------- assert it
-- The migration proves its own end state. A future `create or replace view`
-- that drops the option again fails HERE on replay rather than surfacing weeks
-- later as a linter warning nobody is reading.
do $$
declare
  v_bad text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'v'
     and not coalesce(
           (select true from unnest(coalesce(c.reloptions, '{}')) o
             where o = 'security_invoker=on'), false);

  if v_bad is not null then
    raise exception 'view(s) in public without security_invoker=on: %', v_bad;
  end if;
end;
$$;
