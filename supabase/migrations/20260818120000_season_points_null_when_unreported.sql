-- A season the provider has no stats for is not a season worth zero points.
--
-- McCaffrey's 2021 row arrives with games_played = 7 and 5 of 62 fields
-- populated: he played, the provider simply has no offensive totals for it.
-- Summing that produced 0.00, which on a profile reads as "he was useless in
-- 2021" rather than "we do not have this". Distinguishing the two is the
-- difference between a stat page and a misleading one.
--
-- So: NULL when not one scoring input is present, a number otherwise. A player
-- who genuinely did nothing still scores 0, because the provider reports his
-- zeroes as zeroes rather than omitting them.
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
  ),
  terms as (
    select kv.key,
           (kv.value)::numeric as weight,
           p_raw ? kv.key and jsonb_typeof(p_raw -> kv.key) <> 'null' as reported,
           coalesce((p_raw ->> kv.key)::numeric, 0) as amount
      from rules, jsonb_each_text(rules.per_stat) kv
  )
  select case
           when not bool_or(reported) then null
           else round(sum(amount * weight), 2)
         end
    from terms;
$$;

grant execute on function public.season_base_points(jsonb, integer) to authenticated;

-- Rebuild the ranks. `nulls last` is load-bearing: Postgres orders NULLs FIRST
-- for DESC, so without it every unreported season would rank first at its
-- position — the exact seasons we have no evidence for would outrank the ones
-- we do.
drop materialized view public.player_season_ranks;

create materialized view public.player_season_ranks as
select s.player_id,
       s.season,
       p.position_abbreviation as pos,
       s.games_played,
       public.season_base_points(s.raw) as base_fp,
       case when public.season_base_points(s.raw) is null then null else
         rank() over (
           partition by s.season, p.position_abbreviation,
                        (public.season_base_points(s.raw) is null)
           order by public.season_base_points(s.raw) desc nulls last
         )
       end as pos_rank,
       -- The pool counts only seasons we actually have numbers for, so the
       -- denominator matches what the rank was computed against.
       count(*) filter (where public.season_base_points(s.raw) is not null)
         over (partition by s.season, p.position_abbreviation) as rank_pool
  from public.player_season_stats s
  join public.players p on p.id = s.player_id
 where not s.postseason
   and p.position_abbreviation is not null;

create unique index player_season_ranks_pk on public.player_season_ranks (player_id, season);
create index player_season_ranks_season_idx on public.player_season_ranks (season, pos);
