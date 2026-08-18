-- Ranking every player-season on demand cost 292ms, because season_base_points
-- has to walk the jsonb of all 7100 rows before a single profile can be drawn,
-- and that grows with every season synced. The ranks only change when the
-- season stats or the scoring rules change, so they are materialised. The same
-- profile call is 10ms against this.
--
-- Deliberately NOT granted to authenticated: a matview cannot carry RLS, so the
-- only way in is player_profile(), which is security definer and returns one
-- player. Nothing here is sensitive, but an ungoverned readable surface is not
-- something to create by accident.
--
-- Superseded immediately by 20260818120000, which rebuilds this to handle
-- seasons the provider never reported. Kept as its own step because the
-- performance change and the correctness change are separate decisions.
create materialized view public.player_season_ranks as
select s.player_id,
       s.season,
       p.position_abbreviation as pos,
       s.games_played,
       public.season_base_points(s.raw) as base_fp,
       rank() over (
         partition by s.season, p.position_abbreviation
         order by public.season_base_points(s.raw) desc
       ) as pos_rank,
       count(*) over (partition by s.season, p.position_abbreviation) as rank_pool
  from public.player_season_stats s
  join public.players p on p.id = s.player_id
 where not s.postseason
   and p.position_abbreviation is not null;

-- Unique index is required for REFRESH ... CONCURRENTLY, which is what keeps a
-- refresh from blocking readers mid-season.
create unique index player_season_ranks_pk on public.player_season_ranks (player_id, season);
create index player_season_ranks_season_idx on public.player_season_ranks (season, pos);

create or replace function public.refresh_player_season_ranks()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  refresh materialized view concurrently public.player_season_ranks;
end;
$$;

revoke execute on function public.refresh_player_season_ranks() from public, anon, authenticated;
