-- Everything the player profile screen needs, in one call.
--
-- Assembled server-side because the pieces come from four places (bio, career
-- aggregates, our own scored game rows, team standings) and a client that
-- fetched them separately would round-trip four times and still have to do the
-- ranking itself.
--
-- security_invoker is not available for functions; this is `security definer`
-- with a locked search_path and reads ONLY reference data that is already
-- readable by any authenticated user under RLS. It exposes no ownership.
create or replace function public.player_profile(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_player   record;
  v_career   jsonb;
  v_current  jsonb;
  v_usage    jsonb;
  v_team     jsonb;
  v_season   integer;
  v_type     smallint;
begin
  select p.id, p.full_name, p.position, p.position_abbreviation, p.jersey_number,
         p.height, p.weight, p.college, p.experience, p.age,
         p.injury_status, p.injury_comment, p.injury_updated_at,
         p.team_id, t.abbreviation as team_abbr, t.full_name as team_name,
         t.conference, t.division
    into v_player
    from public.players p
    left join public.teams t on t.id = p.team_id
   where p.id = p_player_id;

  if v_player.id is null then
    return null;
  end if;

  -- The slate we are playing now, for the "this season" numbers.
  select s.season, s.season_type into v_season, v_type from public.current_slate() s;

  /* ---- career ----------------------------------------------------------
   * Ranks come from the player_season_ranks matview. Computing them inline
   * meant scoring every row in the table before this page could draw — 292ms,
   * growing with every season synced.
   *
   * `rank_pool` travels with every rank because the pool is only players on a
   * roster TODAY: 126 RBs in 2025, 7 in 2017. A bare "RB1" off the 2017 pool
   * would be a fiction; "RB1 of 7 tracked" is a fact. The UI renders both.    */
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'season', r.season,
             'games_played', r.games_played,
             'base_fp', r.base_fp,
             'base_fp_per_game', case when coalesce(r.games_played, 0) > 0 and r.base_fp is not null
                                      then round(r.base_fp / r.games_played, 2) end,
             'pos_rank', r.pos_rank,
             'rank_pool', r.rank_pool,
             'stats', s.raw
           ) order by r.season desc
         ), '[]'::jsonb)
    into v_career
    from public.player_season_ranks r
    join public.player_season_stats s
      on s.player_id = r.player_id and s.season = r.season and not s.postseason
   where r.player_id = p_player_id;

  /* ---- this season, scored exactly -------------------------------------
   * Unlike the career rows these come from per-game stat_lines through the
   * scoring engine, so they DO include the per-game yardage bonuses that a
   * season total cannot express. The two numbers are not the same kind of
   * thing and the screen should not add them together.                     */
  select jsonb_build_object(
           'season', v_season,
           'season_type', v_type,
           'games', count(*),
           'fp', coalesce(round(sum(fp.points), 2), 0),
           'fp_per_game', case when count(*) > 0
                               then round(sum(fp.points) / count(*), 2) else null end
         )
    into v_current
    from public.stat_lines sl
    join public.fantasy_points fp
      on fp.stat_line_id = sl.id
     and fp.rules_version = (select version from public.scoring_rules where is_active limit 1)
   where sl.player_id = p_player_id
     and sl.season = v_season
     and sl.season_type = v_type;

  /* ---- usage share -----------------------------------------------------
   * The honest stand-in for a depth chart, which this provider does not
   * serve. Share of the team's targets and carries, plus where the player
   * sits among his own team and position by points — computed from our own
   * per-game rows, which carry team_id, so the attribution is exact rather
   * than inferred. Season aggregates could not do this: they have no team.  */
  with team_lines as (
    select sl.player_id,
           coalesce((sl.raw->>'receiving_targets')::numeric, 0) as targets,
           coalesce((sl.raw->>'rushing_attempts')::numeric, 0)  as carries,
           fp.points
      from public.stat_lines sl
      join public.fantasy_points fp
        on fp.stat_line_id = sl.id
       and fp.rules_version = (select version from public.scoring_rules where is_active limit 1)
     where sl.season = v_season
       and sl.season_type = v_type
       and sl.team_id = v_player.team_id
  ),
  by_player as (
    select tl.player_id, sum(tl.targets) as targets, sum(tl.carries) as carries,
           sum(tl.points) as points
      from team_lines tl group by tl.player_id
  ),
  totals as (
    select nullif(sum(targets), 0) as team_targets, nullif(sum(carries), 0) as team_carries
      from by_player
  ),
  pos_rank as (
    select bp.player_id,
           rank() over (order by bp.points desc) as rank_on_team,
           count(*) over () as pool
      from by_player bp
      join public.players pp on pp.id = bp.player_id
     where pp.position_abbreviation = v_player.position_abbreviation
  )
  select jsonb_build_object(
           'season', v_season,
           'targets', bp.targets,
           'carries', bp.carries,
           'target_share', case when t.team_targets is not null
                                then round(bp.targets / t.team_targets, 4) end,
           'carry_share',  case when t.team_carries is not null
                                then round(bp.carries / t.team_carries, 4) end,
           'rank_on_team', pr.rank_on_team,
           'position_group_size', pr.pool
         )
    into v_usage
    from by_player bp
    cross join totals t
    left join pos_rank pr on pr.player_id = bp.player_id
   where bp.player_id = p_player_id;

  -- Team record. Falls back to the most recent season we hold.
  select to_jsonb(ts) - 'team_id' into v_team
    from public.team_standings ts
   where ts.team_id = v_player.team_id
   order by ts.season desc
   limit 1;

  return jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_player.id,
      'name', v_player.full_name,
      'position', v_player.position,
      'position_abbreviation', v_player.position_abbreviation,
      'jersey_number', v_player.jersey_number,
      'height', v_player.height,
      'weight', v_player.weight,
      'college', v_player.college,
      'experience', v_player.experience,
      'age', v_player.age,
      'injury_status', v_player.injury_status,
      'injury_comment', v_player.injury_comment,
      'injury_updated_at', v_player.injury_updated_at,
      'team_abbreviation', v_player.team_abbr,
      'team_name', v_player.team_name,
      'conference', v_player.conference,
      'division', v_player.division
    ),
    'career',    coalesce(v_career, '[]'::jsonb),
    'current',   v_current,
    'usage',     v_usage,
    'standings', v_team
  );
end;
$$;

revoke execute on function public.player_profile(uuid) from public, anon;
grant execute on function public.player_profile(uuid) to authenticated;
