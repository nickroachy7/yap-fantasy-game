-- The game log, across every season we hold, including games not yet played.
--
-- Two different questions are being answered and they need different sources,
-- which is why this is not one simple select:
--
--   past seasons  -> the games this player ACTUALLY PLAYED, found through his
--                    stat lines. He may have been on another team then, so his
--                    current team_id cannot be used to find them.
--   this season   -> his current team's WHOLE fixture list, so the reader can
--                    look ahead at what is still to come, with stats filled in
--                    for the games already played.
--
-- Merging them means an upcoming fixture and a completed game are the same
-- kind of row to the screen, distinguished by `played` rather than by being
-- fetched from somewhere else.
create or replace function public.player_game_log(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_team    uuid;
  v_season  integer;
  v_rules   integer;
  v_out     jsonb;
begin
  select team_id into v_team from public.players where id = p_player_id;
  -- The latest season we hold fixtures for, which is the one still being
  -- played. Derived rather than passed in so the screen cannot ask for a
  -- season that does not exist.
  select max(season) into v_season from public.games;
  select version into v_rules from public.scoring_rules where is_active limit 1;

  with played as (
    select sl.game_id, sl.season, sl.season_type, sl.week, sl.team_id, sl.raw,
           fp.points, true as played
      from public.stat_lines sl
      left join public.fantasy_points fp
        on fp.stat_line_id = sl.id
       and fp.rules_version = v_rules
     where sl.player_id = p_player_id
  ),
  scheduled as (
    select g.id, g.season, g.season_type, g.week, v_team,
           null::jsonb, null::numeric, false
      from public.games g
     where v_team is not null
       and g.season = v_season
       and (g.home_team_id = v_team or g.visitor_team_id = v_team)
       and not exists (select 1 from played p where p.game_id = g.id)
  ),
  merged as (
    select * from played
    union all
    select * from scheduled
  )
  select jsonb_agg(
           jsonb_build_object(
             'game_id',      m.game_id,
             'season',       m.season,
             'season_type',  m.season_type,
             'week',         m.week,
             'starts_at',    g.starts_at,
             'status_state', g.status_state,
             'played',       m.played,
             'points',       m.points,
             -- Home/away is only asserted when we know which side he was on.
             'is_home',      case when m.team_id is null then null
                                  else m.team_id = g.home_team_id end,
             'opponent',     case
                               when m.team_id = g.home_team_id then vt.abbreviation
                               when m.team_id = g.visitor_team_id then ht.abbreviation
                               else null end,
             'team_score',   case
                               when m.team_id = g.home_team_id then g.home_score
                               when m.team_id = g.visitor_team_id then g.visitor_score
                               else null end,
             'opp_score',    case
                               when m.team_id = g.home_team_id then g.visitor_score
                               when m.team_id = g.visitor_team_id then g.home_score
                               else null end,
             'stats',        m.raw
           )
           -- Newest season first; within a season, week ASCENDING, because a
           -- game log is read forwards through a season even though the
           -- seasons themselves are stacked newest-first.
           order by m.season desc, m.season_type desc, m.week asc nulls last
         )
    into v_out
    from merged m
    join public.games g on g.id = m.game_id
    left join public.teams ht on ht.id = g.home_team_id
    left join public.teams vt on vt.id = g.visitor_team_id;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

revoke execute on function public.player_game_log(uuid) from public, anon;
grant execute on function public.player_game_log(uuid) to authenticated;
