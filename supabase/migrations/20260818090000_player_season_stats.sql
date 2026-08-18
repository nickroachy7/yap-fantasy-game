-- Career history for the player profile (build plan task 20, profile build-out).
--
-- The provider's /season_stats endpoint returns 63 aggregate fields per player
-- per season, going back to at least 2015, with `season` REQUIRED and singular
-- — so a career is one request per season, not one per player. That shape is
-- why this is a synced table rather than an on-demand fetch: a profile page
-- would otherwise make ten upstream calls before it could draw anything.
--
-- Same discipline as stat_lines: the whole payload lands in `raw` untouched and
-- points are computed from it, so a scoring change is a recompute and a
-- provider field we do not read yet is not lost.
create table public.player_season_stats (
  player_id    uuid    not null references public.players on delete cascade,
  season       integer not null,
  -- The provider splits regular season and postseason into separate rows.
  postseason   boolean not null default false,
  games_played integer,
  raw          jsonb   not null default '{}'::jsonb,
  synced_at    timestamptz not null default now(),
  primary key (player_id, season, postseason)
);

create index player_season_stats_season_idx on public.player_season_stats (season, postseason);

-- Team record, for the "who does he play for and are they any good" context
-- that a profile needs and a player row cannot carry.
create table public.team_standings (
  team_id            uuid    not null references public.teams on delete cascade,
  season             integer not null,
  wins               integer,
  losses             integer,
  ties               integer,
  points_for         integer,
  points_against     integer,
  point_differential integer,
  playoff_seed       integer,
  win_streak         integer,
  overall_record     text,
  conference_record  text,
  division_record    text,
  home_record        text,
  road_record        text,
  synced_at          timestamptz not null default now(),
  primary key (team_id, season)
);

alter table public.player_season_stats enable row level security;
alter table public.team_standings      enable row level security;

-- Reference data: readable by any authenticated user, writable by nobody.
-- The sync function uses the service role, which bypasses RLS.
create policy "season stats are readable"
  on public.player_season_stats for select to authenticated using (true);
create policy "standings are readable"
  on public.team_standings for select to authenticated using (true);

/* ---------------------------------------------------------------------------
 * Fantasy points from a SEASON TOTAL.
 *
 * This is deliberately NOT the same number as summing a season of per-game
 * scores, and the difference is not a rounding error. The active rules carry
 * three per-game bonuses — +3 at 300 passing / 100 rushing / 100 receiving
 * yards — and a threshold crossed in individual games cannot be recovered from
 * a season total. A back with 1,200 rushing yards might have had six 100-yard
 * games or none; the total is identical either way.
 *
 * So this applies only the LINEAR `perStat` terms, which are exactly derivable
 * from totals, and the caller is expected to label the result as such. Every
 * historical season on the profile is understated by whatever bonuses the
 * player actually earned — single digits of a percent for most, more for a
 * boom/bust player.
 *
 * The exact number needs per-game rows, which means backfilling stat_lines for
 * past seasons. That is a much larger ingestion and is not what this is.
 * ------------------------------------------------------------------------- */
create or replace function public.season_base_points(p_raw jsonb, p_rules_version integer default null)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  with rules as (
    select r.rules->'perStat' as per_stat
      from public.scoring_rules r
     where r.version = coalesce(p_rules_version, (select version from public.scoring_rules where is_active limit 1))
  )
  select coalesce(round(sum(
           coalesce((p_raw ->> kv.key)::numeric, 0) * (kv.value)::numeric
         ), 2), 0)
    from rules, jsonb_each_text(rules.per_stat) kv;
$$;

grant execute on function public.season_base_points(jsonb, integer) to authenticated;
