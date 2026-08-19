-- Real football stats on the player directory.
--
-- The directory could say what a player was WORTH (fantasy points) but not what
-- he actually DID, so "who is the fourth-best tight end" was answerable and
-- "why" was not. The row redesign puts a stat strip under every name, and this
-- is what fills it.
--
-- The sums ride inside the LATERAL that already computes season_fp, so they
-- cost no extra scan of stat_lines — the same rows are already being walked.
--
-- Deliberately inside the same fantasy_points join, which means a stat line
-- that has not been scored under the ACTIVE ruleset contributes to neither the
-- points nor the stats. That is the consistent choice: games_played, season_fp
-- and the stat strip then always describe the same set of games. The
-- alternative — stats from every line, points from scored lines only — produces
-- a row whose receptions do not reconcile with its own points.
--
-- nullif(...,'') before the cast because the provider occasionally sends an
-- empty string rather than omitting a key, and ''::numeric raises.

create or replace view public.player_directory as
  select c.id  as card_id,
         p.id  as player_id,
         c.season,
         p.full_name as player_name,
         p.position_abbreviation,
         t.abbreviation as team_abbreviation,
         p.injury_status,
         c.rarity,
         coalesce(agg.season_fp, 0::numeric)  as season_fp,
         coalesce(agg.games_played, 0::bigint) as games_played,
         case
           when coalesce(agg.games_played, 0::bigint) > 0
             then round(agg.season_fp / agg.games_played::numeric, 2)
           else 0::numeric
         end as fp_per_game,
         coalesce(agg.receptions, 0)             as receptions,
         coalesce(agg.receiving_targets, 0)      as receiving_targets,
         coalesce(agg.receiving_yards, 0)        as receiving_yards,
         coalesce(agg.receiving_touchdowns, 0)   as receiving_touchdowns,
         coalesce(agg.rushing_attempts, 0)       as rushing_attempts,
         coalesce(agg.rushing_yards, 0)          as rushing_yards,
         coalesce(agg.rushing_touchdowns, 0)     as rushing_touchdowns,
         coalesce(agg.passing_completions, 0)    as passing_completions,
         coalesce(agg.passing_attempts, 0)       as passing_attempts,
         coalesce(agg.passing_yards, 0)          as passing_yards,
         coalesce(agg.passing_touchdowns, 0)     as passing_touchdowns,
         coalesce(agg.passing_interceptions, 0)  as passing_interceptions,
         coalesce(agg.field_goals_made, 0)       as field_goals_made,
         coalesce(agg.field_goal_attempts, 0)    as field_goal_attempts,
         coalesce(agg.extra_points_made, 0)      as extra_points_made
    from cards c
    join players p on p.id = c.player_id
    left join teams t on t.id = p.team_id
    left join lateral (
      select sum(fp.points)                                            as season_fp,
             count(*)                                                  as games_played,
             sum(nullif(sl.raw->>'receptions','')::numeric)            as receptions,
             sum(nullif(sl.raw->>'receiving_targets','')::numeric)     as receiving_targets,
             sum(nullif(sl.raw->>'receiving_yards','')::numeric)       as receiving_yards,
             sum(nullif(sl.raw->>'receiving_touchdowns','')::numeric)  as receiving_touchdowns,
             sum(nullif(sl.raw->>'rushing_attempts','')::numeric)      as rushing_attempts,
             sum(nullif(sl.raw->>'rushing_yards','')::numeric)         as rushing_yards,
             sum(nullif(sl.raw->>'rushing_touchdowns','')::numeric)    as rushing_touchdowns,
             sum(nullif(sl.raw->>'passing_completions','')::numeric)   as passing_completions,
             sum(nullif(sl.raw->>'passing_attempts','')::numeric)      as passing_attempts,
             sum(nullif(sl.raw->>'passing_yards','')::numeric)         as passing_yards,
             sum(nullif(sl.raw->>'passing_touchdowns','')::numeric)    as passing_touchdowns,
             sum(nullif(sl.raw->>'passing_interceptions','')::numeric) as passing_interceptions,
             sum(nullif(sl.raw->>'field_goals_made','')::numeric)      as field_goals_made,
             sum(nullif(sl.raw->>'field_goal_attempts','')::numeric)   as field_goal_attempts,
             sum(nullif(sl.raw->>'extra_points_made','')::numeric)     as extra_points_made
        from stat_lines sl
        join fantasy_points fp
          on fp.stat_line_id = sl.id
         and fp.rules_version = (select version from scoring_rules where is_active limit 1)
       where sl.player_id = p.id
         and sl.season = c.season
    ) agg on true
   where c.is_mintable;
