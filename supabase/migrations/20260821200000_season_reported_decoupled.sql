-- "Do we have data for this season" stops depending on "what does the ruleset
-- pay for".
--
-- ---------------------------------------------------------------------------
-- HOW THIS SURFACED
-- ---------------------------------------------------------------------------
--
-- 20260818120000 gave `season_base_points` a null return for a season nothing
-- was reported for, so that seasons we have no evidence about stop outranking
-- the ones we do. It decides "reported" like this:
--
--     p_raw ? kv.key and jsonb_typeof(p_raw -> kv.key) <> 'null'
--
-- where `kv` iterates THE ACTIVE RULESET'S KEYS. That ties the question "does
-- this season have any numbers" to the question "which numbers do we currently
-- score", and those are not the same question. Remove a key from the ruleset and
-- seasons whose only non-null value lived under that key silently become
-- unknown.
--
-- Which is exactly what happened when v2 dropped the two defensive touchdown
-- fields: 97 rosterable seasons flipped from 0.0 to no-figure-at-all. They are
-- real seasons — Demarcus Robinson's 2016 is 16 games with four tackles and no
-- receptions, Jeremy McNichols' 2017 is two games with one tackle. Those players
-- scored NOTHING, which is a fact worth printing. "We have no idea" is a
-- different and weaker claim, and it drops them out of the rank pool as well.
--
-- ---------------------------------------------------------------------------
-- THE FIX
-- ---------------------------------------------------------------------------
--
-- A season is reported when the provider gave us ANY statistic for it, scored or
-- not. Tackles count. Punt-return yards count. They are evidence that the row
-- describes a player who took the field, and that is all "reported" ever needed
-- to mean.
--
-- Three keys are excluded because every row carries them and none is evidence of
-- anything: `season` and `postseason` are the row's own identity, and
-- `games_played` is present even for a season with no appearances.
--
-- The points arithmetic below is unchanged from 20260818120000 — same perStat
-- sum, same rounding, same bonuses left out on purpose (this is BASE points; the
-- exact figure comes from the per-game lines through `fantasy_points`).
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
  -- Evidence that this season happened at all, independent of the ruleset.
  reported as (
    select exists (
      select 1 from jsonb_each(p_raw) f(key, value)
       where f.key not in ('season', 'postseason', 'games_played')
         and jsonb_typeof(f.value) <> 'null'
    ) as any_stat
  ),
  terms as (
    select coalesce((p_raw ->> kv.key)::numeric, 0) * (kv.value)::numeric as term
      from rules, jsonb_each_text(rules.per_stat) kv
  )
  select case
           when not (select any_stat from reported) then null
           else coalesce(round((select sum(term) from terms), 2), 0)
         end;
$$;

grant execute on function public.season_base_points(jsonb, integer) to authenticated;

comment on function public.season_base_points(jsonb, integer) is
  'Season points from provider season totals under a ruleset''s perStat weights. Returns null ONLY when the provider reported no statistic at all for the season — a player who appeared and scored nothing returns 0, which is a different and stronger claim. Bonuses are deliberately excluded; this is base points.';

-- The matview stores the result, so it has to be rebuilt for any of this to be
-- visible. Not CONCURRENTLY: that requires the view to be populated and takes a
-- lock this migration would rather not hold open, and a migration is already a
-- moment where nobody is reading.
refresh materialized view public.player_season_ranks;
