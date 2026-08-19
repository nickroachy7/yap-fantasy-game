-- Card rarity from 2025 production (build plan task 13).
--
-- `cards.rarity` is TEMPLATE SCARCITY: how hard a player is to pull out of a
-- pack. It is NOT the same axis as `card_instances.tier`, which is EARNED by
-- starting a card in a lineup and climbs bronze -> diamond through
-- `tier_thresholds`. Two users holding the same legendary card can hold it at
-- different tiers, and a common card that starts every week outgrows a
-- legendary that sits on the bench. Nothing here touches tier.
--
-- Until now every one of the 968 season-2026 cards was rarity='common',
-- rarity_source='fallback'. open_pack() rolls a rarity from packs.odds and then
-- looks for a card in that band, falling back to "any mintable card" when the
-- band is empty — so with every card common, that fallback fired on every
-- single pull and packs were uniform. Populating the bands is what turns the
-- odds column from decoration into the actual pull experience.
--
-- ---------------------------------------------------------------------------
-- WHY SEASON STATS AND NOT DFS SALARY
--
-- The plan named DFS salary bands as the primary source with 2025 season stats
-- as the documented fallback. The DFS route was measured and rejected: salary
-- is flat in preseason, so it carries almost no ordering information at the
-- exact moment we need to ship. This is the documented fallback, promoted.
--
-- ---------------------------------------------------------------------------
-- WHICH PRODUCTION NUMBER
--
-- Two exist and they are not the same thing:
--
--   * EXACT — per-game `stat_lines` scored through the engine into
--     `fantasy_points`. Includes the three per-game yardage bonuses
--     (+3 at 300 pass / 100 rush / 100 rec), because it sees each game.
--   * BASE — `season_base_points()` over `player_season_stats.raw`, which is a
--     season TOTAL and can therefore only apply the linear `perStat` terms. A
--     threshold crossed in one game is invisible in a season sum.
--
-- We prefer EXACT and fall back to BASE, because 2024 and 2025 game logs were
-- backfilled and exact agrees with our own leaderboard.
--
-- MEASURED, and worth writing down: for season 2025 the BASE fallback fires for
-- exactly ZERO cards. Every card whose player has a 2025 `player_season_stats`
-- row also has 2025 per-game stat lines, at all five positions. The coalesce is
-- kept because it costs nothing and a future season could be banded before its
-- game logs are backfilled — but today it is dead code, not a load-bearing
-- half of the signal. Do not read the coalesce as "we blend two sources".
--
-- Production is the REGULAR season only (season_type = 2). Postseason would
-- quietly reward playing for a good team, which is not what scarcity means.
--
-- Season TOTAL, not per-game rate. This is a season-long collection game where
-- a card is started week after week, so availability is genuinely part of what
-- a template is worth — a player who missed ten games contributed ten weeks of
-- nothing. A rate stat would also be violently noisy at the bottom of the
-- sample, where a receiver with one 25-point game would outrank a season-long
-- starter and land in a top band on the strength of a single afternoon.
--
-- ---------------------------------------------------------------------------
-- RANKED WITHIN POSITION GROUP, NOT GLOBALLY
--
-- Checked empirically before choosing, because it is the decision that is
-- expensive to reverse. Banding all 575 cards that have a 2025 signal by raw
-- fantasy points on one global list produces:
--
--     pos   legendary  epic
--     PK        0        0
--     TE        0        1
--     QB        4       12
--     RB        5       10
--     WR        3        6
--
-- Two of the five positions can never produce a top-band card under a global
-- ranking, at any threshold, because the best kicker in the league (171.0 FP)
-- cannot out-score a mid-tier quarterback. That is not scarcity, it is a unit
-- mismatch: fantasy points are not comparable across positions. Ranking within
-- `players.position_abbreviation` fixes it. Note kickers are 'PK', not 'K'.
--
-- A consequence to be aware of rather than surprised by: because every position
-- gets a full ladder, a legendary kicker exists and is worth far less in lineup
-- points than a legendary receiver. That is correct for a scarcity axis — he
-- genuinely is the scarcest kicker — but it is a product judgement, and capping
-- PK at, say, rare is a defensible alternative. Left as-is deliberately.
--
-- ---------------------------------------------------------------------------
-- ROOKIES AND PLAYERS WITH NO 2025 PRODUCTION
--
-- A real and large population: 393 of the 968 mintable cards (40.6%) have no
-- 2025 signal at all. Measured breakdown — none of them have a 2025
-- `player_season_stats` row either, and only 73 of the 393 have ANY prior
-- season, so the bulk are genuine rookies and camp bodies.
--
-- They are assigned COMMON, explicitly and by rule, not by accident:
--
--   * Not legendary. We have no evidence they are good. Guessing a rookie into
--     the top band on draft position would be fabricating a signal we do not
--     have — the provider serves no projections, no depth charts and no
--     rankings, so there is nothing to guess FROM.
--   * Not left untouched. Leaving them on the 'fallback' source would mean 40%
--     of the pool still routes through open_pack's empty-band escape hatch,
--     which is the exact behaviour this migration exists to end.
--
-- So absence of production is itself treated as the signal, and these cards get
-- rarity_source='season_stats' like everything else. `rarity_source` records
-- WHICH RULE set the band, not whether a number was found.
--
-- The known cost: a genuinely good 2026 rookie is a common card all season.
-- This function is re-runnable precisely so that can be revisited once 2026
-- games have been played — but whether to re-band mid-season is a product
-- decision (it changes what is scarce underneath people who already collected),
-- and it is deliberately NOT made here.

create or replace function public.assign_card_rarity(
  p_season            integer,
  p_production_season integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prod    integer;
  v_changed integer;
  v_summary jsonb;
begin
  if p_season is null then
    raise exception 'season is required' using errcode = '22023';
  end if;

  -- Band the 2026 cards on 2025 production. Overridable so a test can point at
  -- a season it controls instead of whatever the real data happens to hold.
  v_prod := coalesce(p_production_season, p_season - 1);

  with exact as (
    -- Per-game rows through the scoring engine: includes the yardage bonuses.
    select sl.player_id, round(sum(fp.points), 2) as fp
      from public.stat_lines sl
      join public.fantasy_points fp
        on fp.stat_line_id = sl.id
       and fp.rules_version = (select version from public.scoring_rules where is_active limit 1)
     where sl.season = v_prod
       and sl.season_type = 2
     group by sl.player_id
  ),
  base as (
    -- Season totals: linear terms only. Currently fires for zero cards; see the
    -- header. season_base_points() already returns NULL rather than 0 for a
    -- season the provider never reported, which is the distinction that matters
    -- here — an unreported season must not be banded as "produced nothing".
    select s.player_id, public.season_base_points(s.raw) as fp
      from public.player_season_stats s
     where s.season = v_prod
       and not s.postseason
  ),
  scored as (
    select c.id                    as card_id,
           p.position_abbreviation as pos,
           coalesce(e.fp, b.fp)    as fp
      from public.cards c
      join public.players p on p.id = c.player_id
      left join exact e on e.player_id = c.player_id
      left join base  b on b.player_id = c.player_id
     where c.season = p_season
       and c.is_mintable
  ),
  ranked as (
    -- `nulls last` is load-bearing: Postgres orders NULLs FIRST for DESC, so
    -- without it every player we have no 2025 data for would rank ahead of
    -- McCaffrey. The card_id tiebreak makes the ordering total, which is what
    -- makes a re-run land on the same answer instead of reshuffling ties.
    select s.card_id, s.pos, s.fp,
           row_number() over (partition by s.pos order by s.fp desc nulls last, s.card_id) as rn,
           -- The pool counts only the cards we actually have a number for, so
           -- the percentile cuts below are taken against evidence rather than
           -- being diluted by the 40% with no signal.
           count(s.fp) over (partition by s.pos) as pool
      from scored s
  ),
  -- The ladder is built one rung at a time so each cut can be forced strictly
  -- above the one before it. Fractions alone would let a small pool collapse a
  -- band to nothing or invert the ladder; kickers are the smallest pool at 31.
  rung_leg as (
    select r.*, greatest(2, ceil(r.pool * 0.03))::bigint as leg_cut from ranked r
  ),
  rung_epic as (
    select r.*, greatest(r.leg_cut + 1, ceil(r.pool * 0.10))::bigint as epic_cut from rung_leg r
  ),
  rung_rare as (
    select r.*, greatest(r.epic_cut + 1, ceil(r.pool * 0.25))::bigint as rare_cut from rung_epic r
  ),
  rung_unc as (
    select r.*, greatest(r.rare_cut + 1, ceil(r.pool * 0.50))::bigint as unc_cut from rung_rare r
  ),
  banded as (
    select r.card_id,
           case
             -- Both guards come FIRST and are the reason no rookie is silently
             -- promoted: a NULL fp sorts to the bottom of rn, but a position
             -- with a tiny signal pool has cuts that could otherwise reach it.
             when r.fp  is null then 'common'::rarity
             when r.pos is null then 'common'::rarity
             when r.rn <= r.leg_cut  then 'legendary'::rarity
             when r.rn <= r.epic_cut then 'epic'::rarity
             when r.rn <= r.rare_cut then 'rare'::rarity
             when r.rn <= r.unc_cut  then 'uncommon'::rarity
             else 'common'::rarity
           end as band
      from rung_unc r
  ),
  upd as (
    -- Only rows that actually move are written. That is what makes a second run
    -- a genuine no-op: `rarity_updated_at` stays put, so the column keeps
    -- meaning "when this card's band last changed" rather than "when the job
    -- last ran", and the idempotency check has something to assert on.
    update public.cards c
       set rarity            = b.band,
           rarity_source     = 'season_stats',
           rarity_updated_at = now()
      from banded b
     where c.id = b.card_id
       and (c.rarity is distinct from b.band
            or c.rarity_source is distinct from 'season_stats')
    returning 1
  )
  select count(*) into v_changed from upd;

  -- Read the realised state back out of the table, so the summary reports what
  -- IS rather than what we meant to write.
  with counts as (
    select coalesce(p.position_abbreviation, 'unknown') as pos,
           c.rarity::text as band,
           count(*) as n
      from public.cards c
      join public.players p on p.id = c.player_id
     where c.season = p_season
       and c.is_mintable
     group by 1, 2
  ),
  per_pos as (
    select pos, jsonb_object_agg(band, n) as bands from counts group by pos
  )
  select jsonb_object_agg(pos, bands) into v_summary from per_pos;

  return jsonb_build_object(
    'season',            p_season,
    'production_season', v_prod,
    'cards_changed',     v_changed,
    'bands',             coalesce(v_summary, '{}'::jsonb)
  );
end;
$$;

-- Admin only. Rebanding the whole set underneath live collections is not
-- something a signed-in user gets to do, and Postgres grants EXECUTE to PUBLIC
-- by default, so the revoke is the mechanism — same pattern as gameday_sweep().
revoke execute on function public.assign_card_rarity(integer, integer) from public, anon, authenticated;

-- Band the 2026 set on 2025 production.
select public.assign_card_rarity(2026);
