-- A card is worth who it is, not just what it has done.
--
-- Until now `sell_card` priced a copy off ONE axis: `tier_thresholds.sell_value`,
-- keyed on the tier the copy has earned. Every bronze card in the game therefore
-- sold for 8 coins — a bronze Puka Nacua and a bronze camp body, the same 8.
--
-- Price now has a second input: a per-player VALUE SCORE, continuous, so the
-- best receiver in football is worth more than the second best and the second
-- best is worth more than the third — by a little where they are close and by a
-- lot where they are not.
--
-- ---------------------------------------------------------------------------
-- WHY NOT JUST USE `cards.rarity`
--
-- Because rarity is five buckets. 687 of the 968 mintable cards are `common`,
-- so pricing off the band gives the set five prices and puts 70% of it on one
-- of them. Rarity is also the wrong TOOL: it is pull scarcity, frozen when the
-- set was printed, and re-banding it mid-season changes what is rare underneath
-- people who already collected (see the header of 20260819100000).
--
-- So the two stay separate and each keeps one job:
--
--   cards.rarity   how hard this player is to PULL. Frozen for the set.
--   player_values  what this player is WORTH. Continuous, and free to move.
--
-- Both are computed from the same 2025 production today. They come apart the
-- moment `refresh_player_values` starts blending in the current season, which is
-- the point of building it this way now rather than later.
--
-- ---------------------------------------------------------------------------
-- THE VALUE SCORE, AND WHY IT IS PRODUCTION AND NOT RANK
--
-- The obvious shape is ordinal — rank the position, price off the rank. It was
-- tried and rejected, because rank throws away the thing that makes the ladder
-- honest. Puka Nacua scored 393.0 in 2025 and Jaxon Smith-Njigba 386.9: they are
-- one rank apart AND they are 1.5% apart, and the price should say the second
-- thing. Amon-Ra St. Brown is one further rank back and 12% down; the price
-- should say that too. An ordinal treats both gaps as "one place".
--
-- So the score is production, normalised inside the player's own position:
--
--     value_score = clamp01( (season_fp - replacement_fp) / (best_fp - replacement_fp) )
--
-- ---------------------------------------------------------------------------
-- REPLACEMENT LEVEL IS LOAD-BEARING, AND KICKERS ARE WHY
--
-- The first cut of this divided by the position's best alone. It was measured
-- before it was believed, and it was wrong — every inflated price in the pool
-- was a kicker:
--
--     Cairo Santos, PK17 of 41, 114.0 FP  ->  priced 38
--     Justin Jefferson, WR20,   210.5 FP  ->  priced 30
--
-- The cause is that positions have wildly different SHAPES. Measured over the
-- 2026 mintable pool on 2025 production:
--
--     pos   cards   best     median    median as % of best
--     RB      203   428.6      6.4            1%
--     WR      402   393.0      0.1            0%
--     QB      121   371.6      3.9            1%
--     TE      209   324.9      1.7            1%
--     PK       41   171.0    106.0           62%
--
-- Half of all receivers scored essentially nothing; half of all kickers scored
-- 62% of what the best kicker scored. Dividing by the max therefore hands the
-- median kicker a huge share and the median receiver none, and the median kicker
-- out-prices a genuine star.
--
-- Subtracting a REPLACEMENT baseline — the position's own median — removes
-- exactly that. Each position is then measured across the range that separates
-- its startable players from its filler, whatever that range happens to be, and
-- the same 0..1 score means the same thing at every position. Cairo Santos falls
-- from 38 to 15 and Jefferson rises to 38. Kickers keep a real top end (the best
-- kicker in football scores 1.000 and prices like any other position's best,
-- which is correct — K is a required slot every week), and the bottom two-thirds
-- of the position fall to the floor, which is also correct.
--
-- ---------------------------------------------------------------------------
-- THE CURVE, AND WHERE THE MONEY IS
--
-- price = floor + (ceiling - floor) * value_score ^ curve
--
-- `floor` and `ceiling` are game_config, and this base is the whole price of a
-- BRONZE card with no points — which is every card the moment it is pulled. The
-- floor is 8, exactly the bronze price that shipped before this migration, so a
-- card with no value score at all is priced exactly as it is today and nobody
-- loses a coin. That matters: 393 of the 968 mintable cards (40.6%) have no 2025
-- production, and every one of them holds its price.
--
-- The exponent lives in `game_config.value_curve_bps` so it can be tuned without
-- recomputing a single score. It is 1.50, chosen by measuring the pack economy
-- against the real pool and the real odds rather than by taste:
--
--     curve   standard pack (100)   pro pack (400)
--     1.50           64.1                134.4
--     2.00           56.4                111.5
--     2.50           51.8                 96.0
--     3.00           48.9                 85.1
--
-- Every setting is safe — buying a pack to dump it loses money at all of them —
-- so the choice is about the FREE daily pack, which is the faucet that actually
-- matters (20260824200400). 2.00 holds it inside its bracket and 1.50 does not.
-- A steeper curve costs nothing at the top, which is where the separation lives:
-- the best player at a position still prices at the ceiling either way, because
-- his score is 1.000 and 1.000 to any power is 1.000.
--
-- These figures are measured on a PER-GAME basis, which is what the blend below
-- produces. An earlier cut normalised on season totals and read differently;
-- totals cannot work once the season is under way, because three games and
-- seventeen are not comparable numbers.
--
-- WHAT IT LOOKS LIKE at bronze (floor 8, ceiling 64) and diamond (500 / 1000):
--
--     WR1  Puka Nacua          393.0   score 1.000    64    1000
--     WR2  Jaxon Smith-Njigba  386.9   score 0.984    63     992
--     WR3  Amon-Ra St. Brown   339.0   score 0.863    56     931
--     WR4  Ja'Marr Chase       334.6   score 0.851    56     926
--     WR20 Justin Jefferson    210.5   score 0.536    38     768
--     WR60 Jalen Nailor        101.7   score 0.259    22     629
--     PK1  Jason Myers         171.0   score 1.000    64    1000
--     PK17 Cairo Santos        114.0   score 0.123    15     562
--     any card with no signal            score  —      8     500
--
-- ---------------------------------------------------------------------------
-- TWO PROPERTIES THAT ARE NOT NEGOTIABLE
--
-- 1. STARTING A CARD NEVER MAKES IT CHEAPER. Both the floor and the ceiling rise
--    with tier, and the score is held constant across tiers, so every player's
--    price rises monotonically as their copy climbs. Asserted in
--    supabase/tests/card_prices.test.sql, not just intended.
-- 2. BUYING TO SELL LOSES. The only place cards arrive in bulk is packs, and
--    every pulled card mints at BRONZE — so the guard is the bronze row against
--    the pack price, under that pack's own odds. Also asserted, against the live
--    `packs` rows rather than against numbers copied into this comment.
--
-- ---------------------------------------------------------------------------
-- WHY ONE VIEW AND NINE REWRITTEN CALLERS
--
-- `sell_value` was read in eight places, each doing its own
-- `join tier_thresholds on tier = ci.tier`. Adding an input to eight independent
-- lookups is how a sell button and a commit button start quoting different
-- numbers for the same card. Every one of them now joins `card_prices` on
-- (card_id, tier), and there is exactly one definition of price.
--
-- `tier_thresholds.sell_value` is left in place but is no longer read by
-- anything; its comment says so. `min_career_fp` and `gem_multiplier` on that
-- table are untouched and still load-bearing.

-- ---------------------------------------------------------------------------
-- What a sale pays, and the three parts it is made of.
--
--     sale = ( base + settled_fp * rate ) * tier_multiplier
--
--   base            what the PLAYER is worth. 8 at the bottom of a position,
--                   64 for the best in the league, continuous in between. This
--                   is the part the rest of this migration computes.
--   settled_fp*rate what THIS COPY has earned. 1.50 coins a point, matching the
--                   weekly rate.
--   tier_multiplier what the copy's tier is worth. Subtle by design —
--                   1.00 / 1.10 / 1.25 / 1.40 — and it multiplies the TOTAL, so
--                   the base is no longer priced per tier.
--
-- ---------------------------------------------------------------------------
-- A NUMBER TO DECIDE ON PURPOSE: the sale rate pays for points a second time
--
-- `score_coins_per_point_bps` (1.50) is already paid out WEEKLY, as the card
-- scores — that is the skill faucet from 20260824200400, and it lands in the
-- balance every Tuesday whether the card is ever sold or not. Paying 1.50 again
-- at the sale means a card pays 3.00 a point over its life, not 1.50.
--
-- That is not a loop, and it is worth being precise about why: the points come
-- from STARTS, and starts are capped by the lineup — 8 slots a week, no matter
-- how many cards you own. Total coins in the game are bounded by the lineup, not
-- by the collection, so doubling the per-point rate scales the faucet without
-- opening a new one. What it does change is the size of the economy, and what a
-- high-tier card is worth relative to a 100-coin pack:
--
--     tier      settled fp   base   fp coins   x mult   sale     was
--     bronze         0          8         0     1.00        8       8
--     silver        50          8        75     1.10       91      40
--     gold         200          8       300     1.25      385     150
--     diamond      600          8       900     1.40     1271     500
--
-- Nothing gets cheaper — the bronze floor is still exactly 8 — but a diamond is
-- worth two and a half times what it was. The rate is therefore its OWN config
-- key rather than a reuse of the weekly one, so the sale can be tuned down to
-- 0.50 or 0.75 with a single UPDATE without touching what a Sunday pays.
--
-- ---------------------------------------------------------------------------
-- WHERE THIS LEAVES THE PLAYER VALUE
--
-- At bronze the base IS the price: 8 for a camp body, 64 for Puka Nacua, and
-- every fresh pull is bronze. At diamond it is 64 against 900 of earned points —
-- about 5% of the sale. That reads like the feature evaporating and it is
-- actually the principle holding: who the player is, is all there is before the
-- copy has done anything, and what the copy DID takes over once it has. The
-- collection screen is full of bronze cards, which is exactly where the
-- distinction does its work.
--
-- The pack economy is unchanged by any of this, for the same reason: every
-- pulled card mints at bronze with zero settled points, so the guard is still
-- the base band against the pack price, and still measured in
-- supabase/tests/card_prices.test.sql.
--
-- SETTLED points, never career. `settled_fp` counts only weeks in which every
-- game is final (20260821140000) — the same discipline the tier ladder uses, and
-- the same reason: a price that moves while a game is being played would dip at
-- kickoff and recover by the fourth quarter.
-- ---------------------------------------------------------------------------
alter table public.tier_thresholds
  add column if not exists sale_multiplier numeric(4,2) not null default 1.00
    check (sale_multiplier >= 1.00 and sale_multiplier <= 5.00);

update public.tier_thresholds set sale_multiplier = v.m
  from (values ('bronze', 1.00), ('silver', 1.10), ('gold', 1.25), ('diamond', 1.40))
    as v(tier, m)
 where public.tier_thresholds.tier = v.tier::public.card_tier;

comment on column public.tier_thresholds.sale_multiplier is
  'What this tier multiplies a SALE by — the base plus the copy''s earned points, together. Seeded to the same ladder as coin_multiplier but deliberately a separate column: coin_multiplier tunes what a Sunday pays, and a change there must not silently reprice every collection in the game.';

insert into public.game_config (key, value, description) values
  ('sale_base_floor_coins', 8,
   'What a card with no player value at all sells for before tier and points — the bottom of every position, and deliberately the pre-20260902060000 bronze price so nothing lost value.'),
  ('sale_base_ceiling_coins', 64,
   'What the single best player at a position is worth before tier and points. Raise it to make WHO the player is matter more against what the copy has earned; measure the pack economy afterwards, since every pulled card is bronze with zero points and the base is therefore the entire pack return.'),
  ('sale_coins_per_point_bps', 150,
   'Coins a sale pays per settled fantasy point the copy has earned, in hundredths: 150 = 1.50 a point. SEPARATE from score_coins_per_point_bps, which already paid the same points weekly — see the header of 20260902060000 before assuming these should match.')
on conflict (key) do update
  set value = excluded.value, description = excluded.description;

-- ---------------------------------------------------------------------------
-- What each player is worth, on a 0..1 scale, within his own position.
--
-- One row per (player, season). Recomputed by refresh_player_values(); nothing
-- else writes it. `value_score` is the LINEAR share — the curve is applied at
-- price time — so re-tuning the curve never means recomputing a score, and the
-- stored number stays a readable "how far between replacement and the best".
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- What each player is worth, on a 0..1 scale, within his own position.
--
-- One row per (player, season). Recomputed by refresh_player_values() on a cron
-- and by nothing else. `value_score` is the LINEAR share — the curve is applied
-- at price time — so re-tuning the curve is never a recompute, and the stored
-- number stays a readable "how far between replacement and the best".
--
-- The inputs are kept alongside the answer rather than thrown away. When a
-- player's price moves and somebody asks why, `prior_ppg`, `current_ppg` and
-- `current_games` are the whole explanation, and `source` says in one word
-- which side of the blend is doing the work.
-- ---------------------------------------------------------------------------
create table if not exists public.player_values (
  player_id       uuid    not null references public.players on delete cascade,
  season          integer not null,
  position_abbreviation text,

  -- The two sides of the blend, per game, regular season only.
  prior_ppg       numeric(8,3),
  prior_games     integer,
  current_ppg     numeric(8,3),
  -- COMPLETED weeks only. See the header of refresh_player_values: a week still
  -- being played must not move a price.
  current_games   integer not null default 0,

  -- What the blend produced, and what it was measured against.
  blended_ppg     numeric(8,3),
  replacement_ppg numeric(8,3),
  best_ppg        numeric(8,3),

  value_score     numeric(6,5) not null default 0
    check (value_score >= 0 and value_score <= 1),
  pos_rank        integer,
  pos_pool        integer,

  -- 'prior_season' until this player has a completed game, 'blended' after.
  -- Reading a whole season's worth of these is how you watch the changeover
  -- happen rather than assuming it did.
  source          text not null default 'prior_season'
    check (source in ('prior_season', 'blended')),
  source_season   integer,
  updated_at      timestamptz not null default now(),
  primary key (player_id, season)
);

comment on table public.player_values is
  'What a player is worth this season, 0..1, measured inside his own position between replacement level and the best in the league. Drives card_prices. Written only by refresh_player_values().';
comment on column public.player_values.value_score is
  'clamp01((blended_ppg - replacement_ppg) / (best_ppg - replacement_ppg)). LINEAR — game_config.value_curve_bps shapes it at price time, so tuning the curve is not a recompute.';
comment on column public.player_values.replacement_ppg is
  'The position median. Subtracting it is what stops a middling kicker out-pricing a star receiver — see the header of 20260902060000.';
comment on column public.player_values.current_games is
  'Games this player has completed THIS season. It is both the blend weight and the reason preseason cannot distort a price: preseason is excluded, so a camp body with three August games has zero games of evidence.';

create index if not exists player_values_season_idx
  on public.player_values (season, value_score desc);

alter table public.player_values enable row level security;

drop policy if exists "player values are readable" on public.player_values;
create policy "player values are readable"
  on public.player_values for select to authenticated using (true);

-- The two tunables, as DATA. Same decision packs.odds and scoring_rules made.
insert into public.game_config (key, value, description) values
  ('value_curve_bps', 200,
   'Exponent applied to player_values.value_score when pricing a card, in hundredths: 200 = ^2.00. Higher is steeper, which cheapens the middle of the league and tightens the pack economy without touching the top. Measure against the live packs before changing — see the header of 20260902060000.'),
  ('value_prior_games', 4,
   'How many games of prior-season evidence the blend is worth. A player with this many completed games this season is valued 50/50 on the two seasons. Measured at 4 against 2024 -> 2025; the optimum is flat from 2 to 8, so this is a robust setting rather than a tuned one.'),
  ('value_prior_min_games', 8,
   'Floor on the divisor when turning a prior season into a per-game rate, so a three-game cameo is not read as a full season of that form. Half a season. Costs a genuinely good player who was injured some value until he plays again this season — which is correct, and self-correcting.')
on conflict (key) do update
  set value = excluded.value, description = excluded.description;

-- ---------------------------------------------------------------------------
-- refresh_player_values
--
-- Re-runnable, idempotent, and the ONLY writer of player_values.
--
-- ---------------------------------------------------------------------------
-- THE BLEND, AND WHY IT IS WEIGHTED BY GAMES AND NOT BY WEEK
--
--     blended_ppg = (prior_ppg * k + current_ppg * games) / (k + games)   k = 4
--
-- Measured, not assumed. Taking 2024 as the prior, 2025 as the season in
-- progress, and rest-of-2025 as the thing being predicted, over the
-- fantasy-relevant population:
--
--     k        correlation with what the player went on to do
--     0  (current season only)   0.659
--     2                          0.752
--     4                          0.761   <- shipped
--     6                          0.759
--     8                          0.755
--     inf (prior season only)    0.705
--
-- The blend beats BOTH pure sources, and the optimum is flat from 2 to 8, so the
-- setting is robust rather than fitted. Crossover for the pure sources lands at
-- week 4-5, which is the same answer from a different direction.
--
-- Weighting by GAMES rather than by calendar week is the part that matters, and
-- it is what makes the preseason problem solve itself rather than needing a
-- special case:
--
--   * A star who has not played sits on 100% of his prior. Correct — and it is
--     the common case in September. Of 2025's top 25 scorers only 8 had a single
--     2026 preseason line, against 66% of everyone ranked 201st or worse; the
--     nine best fantasy players in football played zero preseason snaps.
--   * A camp body with three preseason games has ZERO games of evidence, because
--     preseason is excluded outright (season_type 1). He stays on his prior,
--     which is nothing, and stays cheap.
--
-- A calendar ramp would have got both of those wrong.
--
-- ---------------------------------------------------------------------------
-- COMPLETED WEEKS ONLY, AND WHY A PRICE MUST NOT MOVE MID-SLATE
--
-- The current-season side counts only weeks in which every game is final. This
-- is the same discipline `settled_fp` already applies to tier
-- (20260821140000: "a live in-game swing cannot promote a card and then take it
-- back"), and for a price the argument is stronger still:
--
--   * A stat line appears the moment a player takes the field. Counting a game
--     in progress means `current_games` rises before any points do, so every
--     starting player's price DIPS at kickoff and recovers by the fourth
--     quarter. Nobody would ever believe that was intentional.
--   * `card_actions` quotes a commit payout and `commit_card_to_set` pays it. If
--     the price can move between the two, the quote is a lie.
--
-- So value moves once a week, when the last game of a week goes final — which
-- is Tuesday morning in practice. That is genuinely live: the board reshuffles
-- every week on what has actually been played. It simply does not twitch while
-- somebody is watching a game.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_player_values(
  p_season            integer default null,
  p_production_season integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_season  integer;
  v_prod    integer;
  v_k       numeric;
  v_min     numeric;
  v_written integer;
  v_summary jsonb;
  v_blended integer;
begin
  -- Defaulted off the slate rather than off the clock, so the cron can call this
  -- with no arguments and a January run still means last autumn's season.
  v_season := coalesce(p_season, (select season from public.current_slate()));
  if v_season is null then
    raise exception 'no season to price: current_slate() is empty and none was given'
      using errcode = '22023';
  end if;

  v_prod := coalesce(p_production_season, v_season - 1);

  select value::numeric into v_k from public.game_config where key = 'value_prior_games';
  v_k := coalesce(v_k, 4);

  select value::numeric into v_min from public.game_config where key = 'value_prior_min_games';
  v_min := greatest(coalesce(v_min, 8), 1);

  with rules as (
    select version from public.scoring_rules where is_active limit 1
  ),
  -- Weeks of the season being priced in which EVERY game is final. See the
  -- header: a week still being played must not move a price.
  complete_weeks as (
    select g.season, g.season_type, g.week
      from public.games g
     where g.week is not null
       and g.season = v_season
       and g.season_type = 2
     group by g.season, g.season_type, g.week
    having count(*) filter (where g.status_state is distinct from 'final') = 0
  ),
  -- PRIOR SEASON, per game. Regular season only: season_type 1 is preseason and
  -- 3 is the playoffs, which would quietly reward playing for a good team.
  prior_exact as (
    select sl.player_id, sum(fp.points) as fp, count(*) as g
      from public.stat_lines sl
      join public.fantasy_points fp
        on fp.stat_line_id = sl.id
       and fp.rules_version = (select version from rules)
     where sl.season = v_prod
       and sl.season_type = 2
     group by sl.player_id
  ),
  -- Fallback for a prior season whose game logs were never backfilled. Season
  -- totals can only carry the linear terms, and season_base_points returns NULL
  -- rather than 0 for a season the provider never reported — the distinction
  -- that keeps "unreported" from reading as "produced nothing".
  prior_base as (
    select s.player_id,
           public.season_base_points(s.raw) as fp,
           nullif(s.games_played, 0) as g
      from public.player_season_stats s
     where s.season = v_prod
       and not s.postseason
  ),
  current_done as (
    select sl.player_id, sum(fp.points) as fp, count(*) as g
      from public.stat_lines sl
      join public.fantasy_points fp
        on fp.stat_line_id = sl.id
       and fp.rules_version = (select version from rules)
      join complete_weeks cw
        on cw.season = sl.season
       and cw.season_type = sl.season_type
       and cw.week = sl.week
     where sl.season = v_season
       and sl.season_type = 2
     group by sl.player_id
  ),
  -- The pool is every player who has a card in the season being priced. Ranking
  -- against the whole `players` table would measure each position against
  -- retirees and practice-squad bodies we never printed.
  scored as (
    select distinct on (p.id)
           p.id                    as player_id,
           p.position_abbreviation as pos,
           -- DIVIDED BY AT LEAST v_min GAMES, not by however few he played. A
           -- rate off a three-game sample is not evidence of that rate, and
           -- without the floor it out-ranks a full season: measured on 2025,
           -- Ben Sauls reached PK3 on three games and Spencer Shrader PK2 on
           -- five. It also restores the availability penalty that a per-game
           -- basis otherwise throws away — a player who missed most of a season
           -- did contribute most of a season of nothing. Self-correcting: once
           -- he plays this season the blend below weights his current form and
           -- he climbs back on his own.
           coalesce(pe.fp / greatest(pe.g, v_min),
                    pb.fp / greatest(pb.g, v_min))::numeric as prior_ppg,
           coalesce(pe.g, pb.g)                             as prior_games,
           (cd.fp / nullif(cd.g, 0))::numeric                                  as cur_ppg,
           coalesce(cd.g, 0)                                                   as cur_games
      from public.cards c
      join public.players p on p.id = c.player_id
      left join prior_exact  pe on pe.player_id = p.id
      left join prior_base   pb on pb.player_id = p.id
      left join current_done cd on cd.player_id = p.id
     where c.season = v_season
       and c.is_mintable
  ),
  blended as (
    select s.*,
           -- Both sides coalesce to 0 rather than to null: "has never produced"
           -- is a real, low value, not an unknown one.
           ( coalesce(s.prior_ppg, 0) * v_k
             + coalesce(s.cur_ppg, 0) * s.cur_games
           ) / (v_k + s.cur_games) as ppg
      from scored s
  ),
  -- Aggregated separately rather than as window functions: percentile_cont is an
  -- ordered-set aggregate and Postgres does not accept OVER on one.
  pos_stats as (
    select b.pos,
           max(b.ppg) as best,
           -- REPLACEMENT LEVEL. The position's own median, which is what makes
           -- one 0..1 scale mean the same thing at PK as it does at WR.
           (percentile_cont(0.5) within group (order by b.ppg))::numeric as repl
      from blended b
     group by b.pos
  ),
  shaped as (
    select b.*, ps.best, ps.repl,
           -- Total order, so a re-run lands on the same answer rather than
           -- reshuffling ties.
           row_number() over (partition by b.pos order by b.ppg desc, b.player_id) as rn,
           count(*) over (partition by b.pos) as pool
      from blended b
      left join pos_stats ps on ps.pos is not distinct from b.pos
  ),
  final as (
    select s.*,
           case
             -- A position with no spread at all would divide by zero. Everyone
             -- floors, which is the honest answer: nothing here separates them.
             when s.best is null or s.repl is null or s.best <= s.repl then 0::numeric
             else greatest(0, least(1, (s.ppg - s.repl) / (s.best - s.repl)))
           end as score
      from shaped s
  ),
  upd as (
    insert into public.player_values as pv
      (player_id, season, position_abbreviation, prior_ppg, prior_games,
       current_ppg, current_games, blended_ppg, replacement_ppg, best_ppg,
       value_score, pos_rank, pos_pool, source, source_season, updated_at)
    select f.player_id, v_season, f.pos,
           round(f.prior_ppg, 3), f.prior_games,
           round(f.cur_ppg, 3),   f.cur_games,
           round(f.ppg, 3), round(f.repl, 3), round(f.best, 3),
           round(f.score, 5), f.rn, f.pool,
           case when f.cur_games > 0 then 'blended' else 'prior_season' end,
           v_prod, now()
      from final f
    on conflict (player_id, season) do update
      set position_abbreviation = excluded.position_abbreviation,
          prior_ppg       = excluded.prior_ppg,
          prior_games     = excluded.prior_games,
          current_ppg     = excluded.current_ppg,
          current_games   = excluded.current_games,
          blended_ppg     = excluded.blended_ppg,
          replacement_ppg = excluded.replacement_ppg,
          best_ppg        = excluded.best_ppg,
          value_score     = excluded.value_score,
          pos_rank        = excluded.pos_rank,
          pos_pool        = excluded.pos_pool,
          source          = excluded.source,
          source_season   = excluded.source_season,
          updated_at      = now()
      -- Only rows that actually move are written, so `updated_at` keeps meaning
      -- "when this player's value last changed" rather than "when the job ran",
      -- and a quiet midweek run is a genuine no-op.
      where pv.value_score is distinct from excluded.value_score
         or pv.pos_rank    is distinct from excluded.pos_rank
         or pv.source      is distinct from excluded.source
    returning 1
  )
  select count(*) into v_written from upd;

  -- Read back out of the table, so the summary reports what IS rather than what
  -- was meant. `blended` is the number to watch in September: it is 0 until the
  -- first week finalises and then climbs, which is the changeover made visible.
  select count(*) filter (where source = 'blended')
    into v_blended
    from public.player_values where season = v_season;

  select jsonb_object_agg(pos, n) into v_summary
    from (
      select coalesce(position_abbreviation, 'unknown') as pos, count(*) as n
        from public.player_values
       where season = v_season
       group by 1
    ) x;

  return jsonb_build_object(
    'season',            v_season,
    'production_season', v_prod,
    'prior_games_k',     v_k,
    'players_changed',   v_written,
    'players_blended',   v_blended,
    'positions',         coalesce(v_summary, '{}'::jsonb)
  );
end;
$function$;

comment on function public.refresh_player_values(integer, integer) is
  'Recomputes every player''s 0..1 value score for a season, blending the prior season with completed games of the current one weighted by games played. The only writer of player_values. Safe to re-run; a run that changes nothing writes nothing.';

-- Admin and cron only. Repricing the league underneath live collections is not
-- something a signed-in user gets to do, and Postgres grants EXECUTE to PUBLIC
-- by default, so the revoke is the mechanism — same posture as
-- assign_card_rarity() and gameday_sweep().
revoke execute on function public.refresh_player_values(integer, integer)
  from public, anon, authenticated;

-- Seed the table before the view that reads it is created, so card_prices is
-- never briefly correct-but-empty.
select public.refresh_player_values(2026);

-- ---------------------------------------------------------------------------
-- On the clock.
--
-- HOURLY, not weekly-on-a-day-name. The job is a no-op unless a week has just
-- gone final — the `where` clause on the upsert sees to that — so running it
-- often costs nothing and removes the need to predict when the last game of a
-- week ends. Monday night football, a Saturday slate in December, a game moved
-- for weather: all of them just land on the next hour.
--
-- :35 keeps it clear of the other rotations (:10 daily set, :15 weekly set,
-- :20 payouts) so a slow run cannot delay a payout.
-- ---------------------------------------------------------------------------
do $$
begin
  -- to_regPROCEDURE, not to_regproc. `cron.schedule` is overloaded — there is a
  -- two-argument form as well — and to_regproc takes a bare NAME, so handing it
  -- a signature returns null for a function that is plainly installed. The guard
  -- then skips silently and the job is never scheduled, which looks exactly like
  -- success. Caught here only because the schedule was checked afterwards.
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron not installed — refresh-player-values not scheduled';
    return;
  end if;
  perform cron.unschedule('refresh-player-values')
    where exists (select 1 from cron.job where jobname = 'refresh-player-values');
  perform cron.schedule('refresh-player-values', '35 * * * *',
                        $cron$ select public.refresh_player_values(); $cron$);
end;
$$;


-- ---------------------------------------------------------------------------
-- sale_value — the formula, in one place, callable on a hypothetical.
--
-- A function as well as a view because two callers need to price a copy that
-- does not exist yet: the card screen answers "what would this be worth one tier
-- up", and any future preview does the same. Duplicating the arithmetic to
-- answer that is how the preview and the sale start disagreeing.
--
-- STABLE, not IMMUTABLE: it reads game_config and tier_thresholds, so it is
-- constant within a statement and not across them.
-- ---------------------------------------------------------------------------
create or replace function public.sale_value(
  p_tier        public.card_tier,
  p_value_score numeric,
  p_settled_fp  numeric
)
returns integer
language sql
stable
set search_path = public, pg_temp
as $function$
  select greatest(0, floor(
           ( cfg.floor_coins
             + round((cfg.ceiling_coins - cfg.floor_coins)
                     * power(greatest(least(coalesce(p_value_score, 0), 1), 0), cfg.curve))
             -- Points cannot subtract from a sale. Fantasy points are signed
             -- (20260828150000), so a card that has only ever lost points would
             -- otherwise price below its floor.
             + greatest(coalesce(p_settled_fp, 0), 0) * cfg.rate
           ) * coalesce(t.sale_multiplier, 1.00)
         ))::integer
    from (
      select max(value) filter (where key = 'sale_base_floor_coins')::numeric    as floor_coins,
             max(value) filter (where key = 'sale_base_ceiling_coins')::numeric  as ceiling_coins,
             max(value) filter (where key = 'value_curve_bps')::numeric / 100    as curve,
             max(value) filter (where key = 'sale_coins_per_point_bps')::numeric / 100 as rate
        from public.game_config
       where key in ('sale_base_floor_coins', 'sale_base_ceiling_coins',
                     'value_curve_bps', 'sale_coins_per_point_bps')
    ) cfg
    left join public.tier_thresholds t on t.tier = p_tier;
$function$;

comment on function public.sale_value(public.card_tier, numeric, numeric) is
  'The sale formula: (base + settled_fp * rate) * tier multiplier, where base interpolates the player value score across the configured band. The one definition — card_prices is a view over it.';

grant execute on function public.sale_value(public.card_tier, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- card_prices — what each OWNED COPY sells for.
--
-- Keyed on card_instance_id, not on the printed card, because two of the three
-- inputs belong to the copy: its tier and the points it has settled. A view
-- rather than a stored column because it is derived from four tunables and two
-- live numbers, and materialising it would add a third thing that can be stale —
-- staleness in a price is a player watching the wrong number reach their balance.
--
-- LEFT JOIN on player_values, deliberately: a copy whose player has no value row
-- prices at the floor rather than vanishing. A copy that cannot be priced would
-- make every caller's inner join drop it, and a card you cannot sell is a worse
-- bug than a card that sells cheap.
--
-- The parts are exposed alongside the total so a screen can show its working —
-- "8 for the player, 900 for what it did, x1.40 for diamond" — without anybody
-- re-deriving the arithmetic client-side and getting it subtly different.
-- ---------------------------------------------------------------------------
create or replace view public.card_prices
with (security_invoker = on) as
  select ci.id      as card_instance_id,
         ci.card_id as card_id,
         ci.tier    as tier,
         public.sale_value(ci.tier, coalesce(pv.value_score, 0), 0)      as base_coins,
         public.sale_value(ci.tier, 0, greatest(ci.settled_fp, 0))
           - public.sale_value(ci.tier, 0, 0)                            as fp_coins,
         t.sale_multiplier,
         public.sale_value(ci.tier, coalesce(pv.value_score, 0),
                           greatest(ci.settled_fp, 0))                   as sell_value,
         coalesce(pv.value_score, 0) as value_score,
         pv.pos_rank,
         pv.pos_pool
    from public.card_instances ci
    join public.cards c on c.id = ci.card_id
    join public.tier_thresholds t on t.tier = ci.tier
    left join public.player_values pv
           on pv.player_id = c.player_id
          and pv.season    = c.season;

comment on view public.card_prices is
  'What each owned copy sells for right now, and the parts it is made of. The single source of price — sell_card, commit_card_to_set, my_collection, card_profile, card_actions, set_checklist and board_collection all read it. Keyed on card_instance_id because tier and settled points belong to the copy, not to the printed card.';

grant select on public.card_prices to authenticated;

-- Every copy must price, and nothing may price below the floor. Asserted rather
-- than trusted, because `db push` has no transaction and a half-built view would
-- ship looking fine.
do $$
declare
  v_copies integer;
  v_priced integer;
  v_floor  integer;
  v_under  integer;
begin
  select count(*) into v_copies from public.card_instances;
  select count(*), count(*) filter (where sell_value is null)
    into v_priced, v_under from public.card_prices;

  if v_priced <> v_copies then
    raise exception 'card_prices returns % rows against % copies', v_priced, v_copies;
  end if;
  if v_under > 0 then
    raise exception 'card_prices priced % copies at null', v_under;
  end if;

  select value into v_floor from public.game_config where key = 'sale_base_floor_coins';
  select count(*) into v_under from public.card_prices where sell_value < v_floor;
  if v_under > 0 then
    raise exception '% copies price below the floor of %', v_under, v_floor;
  end if;
end;
$$;

comment on column public.tier_thresholds.sell_value is
  'SUPERSEDED by the card_prices view and sale_value(). Read by nothing as of 20260902060000 and kept only so the old flat ladder is legible next to the formula that replaced it. Do not join it for price.';

-- ---------------------------------------------------------------------------
-- my_collection / my_lost_cards
--
-- `cur` stays: min_career_fp and sort_order are still read from it, and only the
-- price moves to `cp`. CREATE OR REPLACE VIEW cannot reorder or retype existing
-- columns, so `sell_value` keeps its slot and `rarity` is appended at the end —
-- the client can now say WHY a card is worth what it is, which is most of the
-- point of doing this at all.
-- ---------------------------------------------------------------------------
create or replace view public.my_collection
with (security_invoker = on) as
  select ci.id,
         ci.user_id,
         ci.card_id,
         p.full_name as player_name,
         p.position_abbreviation,
         t.abbreviation as team_abbreviation,
         p.injury_status,
         ci.tier,
         ci.career_fp,
         ci.lineup_starts,
         cur.min_career_fp as tier_floor_fp,
         nxt.min_career_fp as next_tier_at,
         nxt.tier          as next_tier_label,
         c.season,
         ci.acquired_at,
         c.player_id,
         cp.sell_value,
         case when coalesce(agg.games_played, 0) > 0
              then round(agg.season_fp / agg.games_played::numeric, 1)
         end as fp_per_game,
         exists (
           select 1 from public.card_instances mine
            where mine.card_id = ci.card_id
              and mine.user_id = ci.user_id
              and mine.committed_at is not null
         ) as in_set,
         c.rarity,
         -- Appended so a row can say WHY it is priced where it is: where this
         -- player stands at his position, and how far up the band that puts him.
         cp.pos_rank,
         cp.pos_pool,
         cp.value_score
    from public.card_instances ci
    join public.cards   c on c.id = ci.card_id
    join public.players p on p.id = c.player_id
    left join public.teams t on t.id = p.team_id
    join public.tier_thresholds cur on cur.tier = ci.tier
    left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1
    join public.card_prices cp on cp.card_instance_id = ci.id
    left join lateral (
      select sum(fp.points) as season_fp, count(*) as games_played
        from public.stat_lines sl
        join public.fantasy_points fp
          on fp.stat_line_id = sl.id
         and fp.rules_version = (select version from public.scoring_rules where is_active limit 1)
       where sl.player_id = p.id
         and sl.season = c.season
    ) agg on true
   where ci.is_held;

create or replace view public.my_lost_cards
with (security_invoker = on) as
  select ci.id,
         ci.user_id,
         ci.card_id,
         p.full_name as player_name,
         p.position_abbreviation,
         t.abbreviation as team_abbreviation,
         p.injury_status,
         ci.tier,
         ci.career_fp,
         ci.lineup_starts,
         cur.min_career_fp as tier_floor_fp,
         nxt.min_career_fp as next_tier_at,
         nxt.tier          as next_tier_label,
         c.season,
         ci.acquired_at,
         c.player_id,
         cp.sell_value,
         case when coalesce(agg.games_played, 0) > 0
              then round(agg.season_fp / agg.games_played::numeric, 1)
         end as fp_per_game,
         exists (
           select 1 from public.card_instances mine
            where mine.card_id = ci.card_id
              and mine.user_id = ci.user_id
              and mine.committed_at is not null
         ) as in_set,
         c.rarity,
         -- Appended so a row can say WHY it is priced where it is: where this
         -- player stands at his position, and how far up the band that puts him.
         cp.pos_rank,
         cp.pos_pool,
         cp.value_score
    from public.card_instances ci
    join public.cards   c on c.id = ci.card_id
    join public.players p on p.id = c.player_id
    left join public.teams t on t.id = p.team_id
    join public.tier_thresholds cur on cur.tier = ci.tier
    left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1
    join public.card_prices cp on cp.card_instance_id = ci.id
    left join lateral (
      select sum(fp.points) as season_fp, count(*) as games_played
        from public.stat_lines sl
        join public.fantasy_points fp
          on fp.stat_line_id = sl.id
         and fp.rules_version = (select version from public.scoring_rules where is_active limit 1)
       where sl.player_id = p.id
         and sl.season = c.season
    ) agg on true
   where ci.wiped_by_run is not null
     and ci.wiped_by_run = (
       select r.id from public.runs r
        where r.user_id = auth.uid()
          and r.ended_at is not null
          and r.settled_at is null
        order by r.ended_at desc
        limit 1
     );

-- ---------------------------------------------------------------------------
-- sell_card
--
-- Unchanged apart from the price lookup. Every guard, every lock and the lock
-- ORDER (wallet, then card — see 20260818161000) are exactly as they were.
-- ---------------------------------------------------------------------------
create or replace function public.sell_card(p_card_instance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user    uuid := auth.uid();
  v_balance integer;
  v_card    public.card_instances%rowtype;
  v_price   integer;
  v_name    text;
  v_rarity  public.rarity;
  v_rank    integer;
  v_base    integer;
  v_fp      integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select balance into v_balance
    from public.coin_balances
   where user_id = v_user
     for update;

  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;

  select * into v_card
    from public.card_instances
   where id = p_card_instance_id
     and user_id = v_user
     for update;

  if not found then
    raise exception 'card does not belong to you' using errcode = '42501';
  end if;

  if v_card.sold_at is not null then
    raise exception 'card has already been sold' using errcode = '22023';
  end if;

  if v_card.committed_at is not null then
    raise exception 'card has been committed to a set' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.lineup_slots ls
      join public.lineups l on l.id = ls.lineup_id
     where ls.card_instance_id = p_card_instance_id
       and l.scored_at is null
  ) then
    raise exception 'card is in a lineup that has not been scored yet'
      using errcode = '55006';
  end if;

  -- THE ONLY CHANGE IN THIS FUNCTION. Price is (tier, rarity), not tier alone.
  -- Joined through `cards` because rarity is a property of the PRINTED card and
  -- not of this copy: every copy of the same card shares it.
  select cp.sell_value, c.rarity, cp.pos_rank, cp.base_coins, cp.fp_coins
    into v_price, v_rarity, v_rank, v_base, v_fp
    from public.card_prices cp
    join public.cards c on c.id = cp.card_id
   where cp.card_instance_id = p_card_instance_id;

  v_price := coalesce(v_price, 0);

  update public.card_instances
     set sold_at = now(), sold_for = v_price
   where id = p_card_instance_id;

  -- coins_ledger has CHECK (amount <> 0), so a zero-value row is recorded as a
  -- sale on the card and nothing in the ledger, rather than failing the sale.
  if v_price > 0 then
    update public.coin_balances
       set balance = balance + v_price, updated_at = now()
     where user_id = v_user;

    insert into public.coins_ledger (user_id, amount, reason, reference_id)
    values (v_user, v_price, 'card_sale', p_card_instance_id);
  end if;

  select pl.full_name into v_name
    from public.cards cd
    join public.players pl on pl.id = cd.player_id
   where cd.id = v_card.card_id;

  return jsonb_build_object(
    'card_instance_id', p_card_instance_id,
    'player_name',      v_name,
    'tier',             v_card.tier,
    -- Returned so the confirmation can name both axes behind the price: the
    -- tier this copy earned, and where the player stands at his position.
    'rarity',           v_rarity,
    'pos_rank',         v_rank,
    -- The parts, so the confirmation can show its working rather than a total
    -- the player is asked to take on trust.
    'base_coins',       v_base,
    'fp_coins',         v_fp,
    'sold_for',         v_price,
    'balance',          v_balance + v_price
  );
end;
$function$;

comment on function public.sell_card(uuid) is
  'Sells one owned copy for its card_prices (card, tier) value. Refuses a copy that is sold, committed to a set, or in a lineup that has not been scored.';

-- ---------------------------------------------------------------------------
-- commit_card_to_set
--
-- Same one-line substitution, against the copy the commit actually burns. The
-- payout is still floor(price * commit_payout_pct / 100) and still 50% of the
-- sell price everywhere — but the sell price is now rarity-aware, so burning a
-- legendary into a daily costs eight times what burning a common costs. That is
-- the intended consequence, not a side effect: sets should be fed with spares.
-- ---------------------------------------------------------------------------
create or replace function public.commit_card_to_set(p_set_code text, p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user      uuid := auth.uid();
  v_set       public.card_sets%rowtype;
  v_balance   integer;
  v_committed integer;
  v_copy      public.card_instances%rowtype;
  v_price     integer;
  v_payout    integer;
  v_name      text;
  v_freed     integer := 0;
  v_best      public.card_tier;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_set
    from public.card_sets
   where code = p_set_code
     and is_active;

  if not found then
    raise exception 'no such set' using errcode = '22023';
  end if;

  select balance into v_balance
    from public.coin_balances
   where user_id = v_user
     for update;

  if not found then
    raise exception 'no wallet for this user' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.card_set_members
     where set_id = v_set.id and card_id = p_card_id
  ) then
    raise exception 'that card is not in this set' using errcode = '22023';
  end if;

  select count(distinct card_id)::integer into v_committed
    from public.card_instances
   where committed_to = v_set.id
     and user_id = v_user
     and committed_at is not null;

  if v_committed >= v_set.required_count then
    raise exception 'this set is already complete' using errcode = '55006';
  end if;

  if exists (
    select 1 from public.card_instances
     where committed_to = v_set.id
       and card_id = p_card_id
       and user_id = v_user
       and committed_at is not null
  ) then
    raise exception 'that card is already in this set' using errcode = '22023';
  end if;

  select * into v_copy
    from public.card_instances
   where id = public.commit_candidate(p_card_id, v_set.min_tier)
     for update;

  if not found then
    if v_set.min_tier is not null then
      select ci.tier into v_best
        from public.card_instances ci
       where ci.card_id = p_card_id
         and ci.user_id = v_user
         and ci.is_held
       order by ci.tier desc
       limit 1;

      if v_best is not null then
        raise exception
          'this set needs a % copy or better, and your best copy of that card is %',
          v_set.min_tier, v_best
          using errcode = '55006';
      end if;
    end if;

    raise exception 'you do not hold a copy of that card' using errcode = '42501';
  end if;

  if not v_copy.is_held or v_copy.user_id <> v_user then
    raise exception 'you do not hold a copy of that card' using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.lineup_slots ls
      join public.lineups l  on l.id = ls.lineup_id
      join public.cards    cd on cd.id = v_copy.card_id
      join public.players  pl on pl.id = cd.player_id
      join public.games    g
        on g.season = l.season
       and g.season_type = l.season_type
       and g.week = l.week
       and (g.home_team_id = pl.team_id or g.visitor_team_id = pl.team_id)
     where ls.card_instance_id = v_copy.id
       and l.finalized_at is null
       and public.game_has_started(g.status_state, g.starts_at)
  ) then
    raise exception 'that player has already kicked off and cannot leave your lineup'
      using errcode = '55006';
  end if;

  delete from public.lineup_slots ls
   using public.lineups l
   where ls.lineup_id = l.id
     and ls.card_instance_id = v_copy.id
     and l.finalized_at is null;
  get diagnostics v_freed = row_count;

  -- THE ONLY CHANGE IN THIS FUNCTION. Priced off the copy actually being burnt,
  -- which is what `card_actions` and `set_checklist` quote — so the offer and
  -- the payout cannot disagree.
  select cp.sell_value into v_price
    from public.card_prices cp
   where cp.card_instance_id = v_copy.id;

  v_payout := floor(coalesce(v_price, 0) * v_set.commit_payout_pct / 100.0)::integer;

  update public.card_instances
     set committed_at  = now(),
         committed_to  = v_set.id,
         committed_for = v_payout
   where id = v_copy.id;

  if v_payout > 0 then
    update public.coin_balances
       set balance = balance + v_payout, updated_at = now()
     where user_id = v_user;

    insert into public.coins_ledger (user_id, amount, reason, reference_id)
    values (v_user, v_payout, 'set_commit', v_copy.id);
  end if;

  select pl.full_name into v_name
    from public.cards cd
    join public.players pl on pl.id = cd.player_id
   where cd.id = p_card_id;

  return jsonb_build_object(
    'set_code',         v_set.code,
    'set_name',         v_set.name,
    'card_id',          p_card_id,
    'card_instance_id', v_copy.id,
    'player_name',      v_name,
    'tier',             v_copy.tier,
    'paid',             v_payout,
    'sell_value',       coalesce(v_price, 0),
    'committed',        v_committed + 1,
    'required',         v_set.required_count,
    'complete',         (v_committed + 1) >= v_set.required_count,
    'balance',          v_balance + v_payout,
    'lineup_freed',     v_freed > 0
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- card_profile — the single-card screen. `cards` was already joined for rarity
-- (it is displayed), so this only redirects where the price comes from.
-- ---------------------------------------------------------------------------
create or replace function public.card_profile(p_card_instance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user   uuid := auth.uid();
  v_card   record;
  v_starts jsonb;
  v_out    jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select ci.id, ci.user_id, ci.tier, ci.career_fp, ci.lineup_starts,
         ci.acquired_at, ci.sold_at, ci.sold_for, ci.source,
         ci.committed_at, ci.committed_for, cs.code as committed_set_code,
         cs.name as committed_set_name,
         c.id as card_id, c.season, c.rarity,
         p.id as player_id, p.full_name as player_name,
         p.position_abbreviation, p.injury_status,
         t.abbreviation as team_abbreviation,
         cur.min_career_fp as tier_floor_fp,
         cp.sell_value,
         nxt.min_career_fp as next_tier_at,
         nxt.tier          as next_tier_label,
         -- What this copy would be worth one tier up, at its own value score and
         -- its points as they stand. The screen already says how far the next
         -- tier is; this says what reaching it is worth, which is the argument
         -- for starting the card. Through sale_value() so a hypothetical and a
         -- real sale cannot be computed two different ways.
         public.sale_value(nxt.tier, coalesce(pv.value_score, 0),
                           greatest(ci.settled_fp, 0)) as next_tier_sell_value
    into v_card
    from public.card_instances ci
    join public.cards   c on c.id = ci.card_id
    join public.players p on p.id = c.player_id
    left join public.teams t on t.id = p.team_id
    left join public.card_sets cs on cs.id = ci.committed_to
    join public.tier_thresholds cur on cur.tier = ci.tier
    left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1
    join public.card_prices cp on cp.card_instance_id = ci.id
    left join public.player_values pv
           on pv.player_id = p.id and pv.season = c.season
   where ci.id = p_card_instance_id
     and ci.user_id = v_user;

  if v_card.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'season',      l.season,
             'season_type', l.season_type,
             'week',        l.week,
             'slot',        ls.slot,
             'points',      case when l.scored_at is not null then ls.points end,
             'scored',      l.scored_at is not null,
             'lineup_total', l.total_points
           ) order by l.season desc, l.season_type desc, l.week desc
         ), '[]'::jsonb)
    into v_starts
    from public.lineup_slots ls
    join public.lineups l on l.id = ls.lineup_id
   where ls.card_instance_id = p_card_instance_id;

  select jsonb_build_object(
    'card', jsonb_build_object(
      'id',             v_card.id,
      'card_id',        v_card.card_id,
      'player_id',      v_card.player_id,
      'player_name',    v_card.player_name,
      'position_abbreviation', v_card.position_abbreviation,
      'team_abbreviation',     v_card.team_abbreviation,
      'injury_status',  v_card.injury_status,
      'season',         v_card.season,
      'rarity',         v_card.rarity,
      'tier',           v_card.tier,
      'career_fp',      round(v_card.career_fp, 1),
      'lineup_starts',  v_card.lineup_starts,
      'fp_per_start',   case when v_card.lineup_starts > 0
                             then round(v_card.career_fp / v_card.lineup_starts, 1) end,
      'acquired_at',    v_card.acquired_at,
      'source',         v_card.source,
      'sold_at',        v_card.sold_at,
      'sold_for',       v_card.sold_for,
      'committed_at',   v_card.committed_at,
      'committed_for',  v_card.committed_for,
      'committed_set_code', v_card.committed_set_code,
      'committed_set_name', v_card.committed_set_name,
      'sell_value',     v_card.sell_value,
      'next_tier_sell_value', v_card.next_tier_sell_value,
      'tier_floor_fp',  v_card.tier_floor_fp,
      'next_tier_at',   v_card.next_tier_at,
      'next_tier_label', v_card.next_tier_label
    ),
    'rank', jsonb_build_object(
      'among_player', (
        select count(*) + 1
          from public.card_instances ci
          join public.cards c on c.id = ci.card_id
         where c.player_id = v_card.player_id
           and ci.is_held
           and ci.career_fp > v_card.career_fp
      ),
      'player_pool', (
        select count(*)
          from public.card_instances ci
          join public.cards c on c.id = ci.card_id
         where c.player_id = v_card.player_id
           and ci.is_held
      ),
      'overall', (
        select count(*) + 1 from public.card_instances
         where is_held and career_fp > v_card.career_fp
      ),
      'overall_pool', (
        select count(*) from public.card_instances where is_held
      )
    ),
    'starts', v_starts
  ) into v_out;

  return v_out;
end;
$function$;

-- ---------------------------------------------------------------------------
-- card_actions — what the sell and commit buttons quote, in bulk.
--
-- Two price lookups here and they are NOT the same lookup: `copy` prices the
-- card you are asking about, `eligible` prices the copy a particular set would
-- burn under its own tier floor. They can differ in tier (never in rarity, since
-- both are copies of the same printed card) and the split already existed.
-- ---------------------------------------------------------------------------
create or replace function public.card_actions(p_card_instance_ids uuid[])
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $function$
  with asked as (
    select distinct unnest(coalesce(p_card_instance_ids, '{}'::uuid[])) as id
  ),

  copy as (
    select ci.id,
           ci.card_id,
           ci.tier,
           cd.rarity,
           ci.sold_at,
           ci.committed_at,
           ci.is_held,
           coalesce(cp.sell_value, 0) as sell_value,
           exists (
             select 1
               from public.lineup_slots ls
               join public.lineups l on l.id = ls.lineup_id
              where ls.card_instance_id = ci.id
                and l.scored_at is null
           ) as in_open_lineup
      from asked a
      join public.card_instances ci on ci.id = a.id and ci.user_id = auth.uid()
      join public.cards cd on cd.id = ci.card_id
      left join public.card_prices cp on cp.card_instance_id = ci.id
  ),

  burn as (
    select c.id,
           b.burn_id
      from copy c
      cross join lateral (select public.commit_candidate(c.card_id) as burn_id) b
  ),

  eligible as (
    select c.id,
           s.code,
           s.name,
           s.family,
           s.subtitle,
           s.required_count,
           s.commit_payout_pct,
           s.min_tier,
           cand.burn_id,
           coalesce(ccp.sell_value, 0) as burn_sell_value,
           (select count(distinct filled.card_id)::integer
              from public.card_instances filled
             where filled.committed_to = s.id
               and filled.user_id = auth.uid()
               and filled.committed_at is not null) as committed,
           exists (
             select 1
               from public.card_instances mine
              where mine.committed_to = s.id
                and mine.card_id = c.card_id
                and mine.user_id = auth.uid()
                and mine.committed_at is not null
           ) as slot_filled
      from copy c
      join public.card_set_members m on m.card_id = c.card_id
      join public.card_sets s on s.id = m.set_id and s.is_active
      cross join lateral (
        select public.commit_candidate(c.card_id, s.min_tier) as burn_id
      ) cand
      left join public.card_prices ccp on ccp.card_instance_id = cand.burn_id
  )

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'card_instance_id', c.id,
        'card_id',          c.card_id,
        'tier',             c.tier,
        -- Carried so a row can explain its own price without a second query.
        'rarity',           c.rarity,
        'sell_value',       c.sell_value,
        'held',             c.is_held,
        'sellable',         c.sold_at is null
                              and c.committed_at is null
                              and not c.in_open_lineup,
        'burns_this_copy',  b.burn_id is not distinct from c.id,
        'sets', coalesce(
          (select jsonb_agg(
                    jsonb_build_object(
                      'code',         e.code,
                      'name',         e.name,
                      'family',       e.family,
                      'subtitle',     e.subtitle,
                      'min_tier',     e.min_tier,
                      -- floor(), matching the commit exactly. A client rounding
                      -- this the other way would over-promise by a coin.
                      'pays',         floor(e.burn_sell_value * e.commit_payout_pct / 100.0)::integer,
                      'committed',    e.committed,
                      'required',     e.required_count,
                      'slot_filled',  e.slot_filled,
                      'set_complete', e.committed >= e.required_count,
                      'burns_this_copy', e.burn_id is not distinct from c.id,
                      'can_commit',   e.burn_id is not null
                                        and not e.slot_filled
                                        and e.committed < e.required_count
                    )
                    order by (e.family = 'daily') desc, (e.family = 'weekly') desc,
                             e.name, e.code
                  )
             from eligible e
            where e.id = c.id),
          '[]'::jsonb)
      )
      order by c.id
    ),
    '[]'::jsonb)
    from copy c
    join burn b on b.id = c.id;
$function$;

-- ---------------------------------------------------------------------------
-- set_checklist — the commit offer, per member of one set. Priced through the
-- same candidate the commit resolves, now carrying that card's rarity into the
-- lookup so the checklist and the button agree.
-- ---------------------------------------------------------------------------
create or replace function public.set_checklist(p_set_code text)
returns table(card_id uuid, player_id uuid, player_name text,
              position_abbreviation text, team_abbreviation text, rarity rarity,
              season_fp numeric, committed boolean, held integer,
              commit_value integer, commit_tier card_tier)
language sql
stable
set search_path = public, pg_temp
as $function$
  with target as (
    select id, min_tier, commit_payout_pct
      from public.card_sets
     where code = p_set_code
       and is_active
  ),
  standing as (
    select m.card_id,
           t.id       as set_id,
           t.min_tier,
           t.commit_payout_pct,
           fill.id    as fill_id,
           coalesce(mine.held, 0) as held
      from target t
      join public.card_set_members m on m.set_id = t.id
      left join lateral (
        select ci.id
          from public.card_instances ci
         where ci.committed_to = t.id
           and ci.card_id = m.card_id
           and ci.committed_at is not null
         limit 1
      ) fill on true
      left join lateral (
        select count(*)::integer as held
          from public.card_instances ci
         where ci.card_id = m.card_id
           and ci.is_held
           and (t.min_tier is null or ci.tier >= t.min_tier)
      ) mine on true
     where t.min_tier is null
        or fill.id is not null
        or coalesce(mine.held, 0) > 0
  )
  select d.card_id,
         d.player_id,
         d.player_name,
         d.position_abbreviation,
         d.team_abbreviation,
         d.rarity,
         d.season_fp,
         (st.fill_id is not null)                    as committed,
         st.held                                     as held,
         coalesce(floor(cand.sell_value * st.commit_payout_pct / 100.0), 0)::integer
                                                     as commit_value,
         cand.tier                                   as commit_tier
    from standing st
    join public.player_directory d on d.card_id = st.card_id
    left join lateral (
      select cp.tier, cp.sell_value
        from public.card_prices cp
       where cp.card_instance_id = public.commit_candidate(st.card_id, st.min_tier)
    ) cand on true
   order by (st.fill_id is not null) desc, st.held desc, d.season_fp desc, d.player_name;
$function$;

-- ---------------------------------------------------------------------------
-- board_collection — the community value board. `cards` was already joined for
-- the season filter, so the rarity is free; only the price table moves.
--
-- Note this re-prices the ENTIRE board at once: value_coins is a live sum, not a
-- stored total. Because the common column is unchanged, no collection can fall.
-- ---------------------------------------------------------------------------
create or replace function public.board_collection(p_season integer default null, p_limit integer default 100)
returns table(rank bigint, user_id uuid, display_name text, value_coins bigint,
              held bigint, in_sets bigint, in_sets_coins bigint, players bigint,
              gold_plus bigint, diamond bigint, career_fp numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with owned as (
    select ci.user_id,
           count(*) filter (where ci.is_held)                     as held,
           count(*) filter (where ci.committed_at is not null)     as in_sets,
           count(distinct ci.card_id)                             as players,
           sum(cp.sell_value)::bigint                             as value_coins,
           sum(cp.sell_value) filter (where ci.committed_at is not null)::bigint as in_sets_coins,
           count(*) filter (where ci.tier in ('gold', 'diamond'))  as gold_plus,
           count(*) filter (where ci.tier = 'diamond')             as diamond,
           sum(ci.career_fp)                                       as career_fp
      from public.card_instances ci
      join public.cards c        on c.id = ci.card_id
      join public.card_prices cp on cp.card_instance_id = ci.id
     where ci.sold_at is null
       and (p_season is null or c.season = p_season)
     group by ci.user_id
  )
  select rank() over (order by o.value_coins desc, pr.display_name asc),
         o.user_id,
         pr.display_name,
         o.value_coins,
         o.held,
         o.in_sets,
         coalesce(o.in_sets_coins, 0),
         o.players,
         o.gold_plus,
         o.diamond,
         o.career_fp
    from owned o
    join public.profiles pr on pr.id = o.user_id
   order by o.value_coins desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$;

-- ---------------------------------------------------------------------------
-- Grants, re-asserted.
--
-- CREATE OR REPLACE keeps the existing ACL, so strictly none of this is needed
-- — but 20260902010000 is the migration that learned a dropped function silently
-- regains PUBLIC/anon, and re-stating the intended grant costs nothing and means
-- the posture is readable here rather than three migrations ago.
-- ---------------------------------------------------------------------------
revoke execute on function public.sell_card(uuid)                    from public, anon;
revoke execute on function public.commit_card_to_set(text, uuid)     from public, anon;
revoke execute on function public.card_profile(uuid)                 from public, anon;
revoke execute on function public.card_actions(uuid[])               from public, anon;
revoke execute on function public.set_checklist(text)                from public, anon;
revoke execute on function public.board_collection(integer, integer) from public, anon;

grant execute on function public.sell_card(uuid)                    to authenticated;
grant execute on function public.commit_card_to_set(text, uuid)     to authenticated;
grant execute on function public.card_profile(uuid)                 to authenticated;
grant execute on function public.card_actions(uuid[])               to authenticated;
grant execute on function public.set_checklist(text)                to authenticated;
grant execute on function public.board_collection(integer, integer) to authenticated;
