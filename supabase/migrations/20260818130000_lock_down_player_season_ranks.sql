-- The matview was documented as unreachable except through player_profile(),
-- and it was not: Supabase's default privileges hand `authenticated` SELECT on
-- anything created in `public`, and a materialized view cannot carry RLS to
-- claw that back. So the comment was describing an intention again.
--
-- Nothing in here is sensitive — it is player, season, position, points, rank —
-- but the whole point of routing through a security definer function is that
-- the surface is one player wide. Revoked so that is actually true.
revoke select on public.player_season_ranks from authenticated, anon;
