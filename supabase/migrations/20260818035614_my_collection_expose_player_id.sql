-- Reconstructed 2026-08-18 from the live view definition.
--
-- This migration was applied to the project but never committed, so the repo
-- could not rebuild the database it describes — `db push` into a fresh
-- environment would have produced a my_collection without player_id, and the
-- collection grid would have lost its links to player detail with no error to
-- explain why. Recorded here so the migration history is the source of truth
-- again.
--
-- The column itself: the grid needs to navigate to a PLAYER, but the view
-- exposed only card_id, so use-collection.ts was resolving card_id -> player_id
-- in a second round trip against `cards`.
create or replace view public.my_collection
with (security_invoker = on) as
select ci.id,
       ci.user_id,
       ci.card_id,
       p.full_name              as player_name,
       p.position_abbreviation,
       t.abbreviation           as team_abbreviation,
       p.injury_status,
       ci.tier,
       ci.career_fp,
       ci.lineup_starts,
       cur.min_career_fp        as tier_floor_fp,
       nxt.min_career_fp        as next_tier_at,
       nxt.tier                 as next_tier_label,
       c.season,
       ci.acquired_at,
       c.player_id
  from public.card_instances ci
  join public.cards c   on c.id = ci.card_id
  join public.players p on p.id = c.player_id
  left join public.teams t on t.id = p.team_id
  join public.tier_thresholds cur on cur.tier = ci.tier
  left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1;

grant select on public.my_collection to authenticated;
