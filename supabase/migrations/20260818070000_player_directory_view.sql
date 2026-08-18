-- Read-only scouting surface for the Cards tab: every mintable player with the
-- season production actually ingested for them.
--
-- security_invoker so the caller's RLS applies. Everything here is reference
-- data readable by any authenticated user — no ownership is exposed, which is
-- the point: this is "who exists", not "what you have".
create or replace view public.player_directory
with (security_invoker = on) as
select
  c.id                      as card_id,
  p.id                      as player_id,
  c.season,
  p.full_name               as player_name,
  p.position_abbreviation,
  t.abbreviation            as team_abbreviation,
  p.injury_status,
  c.rarity,
  coalesce(agg.season_fp, 0)      as season_fp,
  coalesce(agg.games_played, 0)   as games_played,
  case when coalesce(agg.games_played, 0) > 0
       then round(agg.season_fp / agg.games_played, 2)
       else 0 end                 as fp_per_game
from public.cards c
join public.players p on p.id = c.player_id
left join public.teams t on t.id = p.team_id
left join lateral (
  select sum(fp.points) as season_fp, count(*) as games_played
    from public.stat_lines sl
    join public.fantasy_points fp
      on fp.stat_line_id = sl.id
     and fp.rules_version = (select version from public.scoring_rules where is_active limit 1)
   where sl.player_id = p.id
     and sl.season = c.season
) agg on true
where c.is_mintable;

grant select on public.player_directory to authenticated;
