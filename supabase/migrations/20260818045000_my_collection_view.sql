-- Flattens everything a card needs to render into one row, so the collection
-- screen makes a single request instead of four.
--
-- security_invoker = on is the important part: the view runs as the CALLER, so
-- card_instances' RLS still applies and a user sees only their own copies. A
-- default (definer) view here would quietly expose every user's collection.
create view public.my_collection
with (security_invoker = on) as
select
  ci.id,
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
  ci.acquired_at
from public.card_instances ci
join public.cards            c   on c.id = ci.card_id
join public.players          p   on p.id = c.player_id
left join public.teams       t   on t.id = p.team_id
join public.tier_thresholds  cur on cur.tier = ci.tier
left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1;

grant select on public.my_collection to authenticated;
