-- ===========================================================================
-- THE SHOP BECOMES FOUR RUNGS: BASE -> PRO -> ALL-PRO -> ELITE
-- ===========================================================================
--
-- WHY THIS IS A SECOND MIGRATION AND NOT AN EDIT TO 20260905140000. That file
-- shipped, was applied, and then kept being revised while the shelf was tuned —
-- so its text on disk no longer describes what ran. A version already recorded
-- in `supabase_migrations.schema_migrations` is SKIPPED SILENTLY by `db push`,
-- with no error and no warning: the file changes, the database does not, and
-- the two drift apart in a way nothing surfaces until somebody reads the shelf
-- and finds an old price on it. Which is exactly how this was found.
--
-- So the rule this follows, and the one to keep following: ONCE APPLIED, A
-- MIGRATION IS HISTORY. Change the world with a new one.
--
-- 20260905140000's text on disk is the final design and this file is the same
-- design again, which makes a fresh replay apply it twice and land in the same
-- place. Every statement here is written to be idempotent for that reason.
--
-- WHAT ACTUALLY LAGGED, measured against the live database rather than assumed:
--
--   `card_pull_tiers`  flat cuts (top 6/24/60 for every position) -> 30 elites
--   the shop rows      Scout 75, Squad 200, Elite 400x1 card, Pro 600
--
--   `open_pack` and `pack_odds` were already current and are not touched.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. THE CUTS SCALE WITH THE LINEUP, AND THEY TIGHTEN
-- ---------------------------------------------------------------------------
--
-- The applied version cut every position at the same absolute rank — top 6, 24,
-- 60 — and the sample packs are why that is gone. There are about 32 starting
-- quarterbacks against 402 receivers, so QB60 was a third-stringer sitting in
-- the same tier as WR60, a real flex piece. Dealt, that produced an 800-coin
-- pack holding Mason Rudolph, Josh Johnson and Carson Wentz, and a `bench`
-- kicker who was 41st of 41.
--
-- The cut is now `n x slots`, where slots is that position in a lineup — three
-- WR, two RB, one each of QB, TE and K — so a tier measures a player against
-- the job rather than against the length of his position's list. And `elite`
-- and `starter` tighten on top of that, from 3x/12x to 2x/8x:
--
--     tier      cut               n    by position           avg coins  floor
--     elite     top 2 x slots    16    WR6 RB4 QB2 TE2 PK2        335     0%
--     starter   top 8 x slots    48    WR18 RB12 QB6 TE6 PK6      168     4%
--     bench     top 24 x slots  128    WR48 RB32 QB16 TE16 PK16    59    19%
--     depth     the rest        784    WR330 TE185 RB155 QB97      14    90%
--
-- Sixteen elite cards in the whole game, down from thirty.
create or replace view public.card_pull_tiers as
select c.id                       as card_id,
       c.player_id,
       c.season,
       pv.position_abbreviation,
       tm.abbreviation            as team_abbreviation,
       pv.pos_rank,
       pv.pos_pool,
       /* A card whose player has no value row is `depth` rather than excluded:
          eight cards are in that state, and a pack that silently deals fewer
          cards than it promised is worse than one that deals a nobody. */
       case
         when pv.pos_rank is null then 'depth'
         when pv.pos_rank <=  2 * (case pv.position_abbreviation
                                     when 'WR' then 3 when 'RB' then 2 else 1 end)
           then 'elite'
         when pv.pos_rank <=  8 * (case pv.position_abbreviation
                                     when 'WR' then 3 when 'RB' then 2 else 1 end)
           then 'starter'
         when pv.pos_rank <= 24 * (case pv.position_abbreviation
                                     when 'WR' then 3 when 'RB' then 2 else 1 end)
           then 'bench'
         else 'depth'
       end                        as pull_tier
  from public.cards c
  left join public.player_values pv
         on pv.player_id = c.player_id
        and pv.season    = c.season
  left join public.players pl on pl.id = c.player_id
  left join public.teams   tm on tm.id = pl.team_id
 where c.is_mintable;

comment on view public.card_pull_tiers is
  'What tier of player a mintable card is, by rank within its own position, scaled by how many of that position a lineup starts. The axis packs roll over; see 20260905183000.';

grant select on public.card_pull_tiers to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. THE CODES MOVE, ONCE
-- ---------------------------------------------------------------------------
--
-- `pro` is wanted by the new 260-coin middle rung, and it is currently held by
-- the old 600-coin pack that becomes All-Pro. So the old one is renamed first
-- and the new one inserted after. `packs.code` is unique and `pack_openings`
-- points at `packs.id`, so both renames keep every opening ever recorded.
--
-- GUARDED ON THE TARGET CODE, WHICH IS WHAT MAKES THIS SAFE TO RUN TWICE. On
-- the live database `allpro` does not exist, so the rename happens. On a fresh
-- database 20260905140000 has already created `allpro`, so it does not — and
-- crucially the guard cannot mistake the NEW `pro` for the old one and rename
-- it away, which a naive `where code = 'pro'` would do on the second pass.
do $$
begin
  if exists (select 1 from public.packs where code = 'pro')
     and not exists (select 1 from public.packs where code = 'allpro') then
    update public.packs set code = 'allpro' where code = 'pro';
  end if;

  if exists (select 1 from public.packs where code = 'standard')
     and not exists (select 1 from public.packs where code = 'base') then
    update public.packs set code = 'base' where code = 'standard';
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 3. THE FOUR RUNGS
-- ---------------------------------------------------------------------------
--
-- Simulated over 6,000 opens of each against the live catalogue before any of
-- it was written. Every tier's chance rises at every step and depth's falls at
-- every step, which is the whole design:
--
--                   Base      Pro     All-Pro    Elite
--     price          140      260        680     1,200
--     cards            5        7          8         5
--     depth        92.0%    81.9%      40.1%        0%
--     bench         7.4%    16.1%      48.1%     48.0%
--     starter       0.5%     1.8%      10.8%     27.1%
--     elite         0.1%     0.2%       1.0%     24.9%
--     >=1 starter    3.2%    13.4%      63.1%      100%
--     >=1 elite      0.6%     1.5%       7.5%      100%
--     returns        64%      65%        65%       65%
--
-- ELITE IS BOTH THE TOP RUNG AND THE TOP TIER, and that is a promise rather
-- than a collision: the Elite Pack is the only pack that guarantees an elite
-- card. A draft had `Elite` as the third rung under a `Legendary` top, which
-- put an Elite Pack beside an `elite` tier it did not guarantee — the same word
-- meaning two different things one rung apart. `All-Pro` escalates off `Pro` in
-- a way any reader of a football page already knows, and claims nothing about
-- what is inside.
--
-- NO GUARANTEE BELOW THE TOP, which is the load-bearing economy decision. A
-- guarantee in the pack people open most makes the thing it guarantees
-- worthless — every pack containing a bench player means bench players are
-- wallpaper — and it costs expected value, which forces the price up, which is
-- fewer packs opened. Volume is bought with price, not with floors.

-- BASE is the pack the game is actually played with: 92% depth, and that is the
-- point rather than a compromise. 32 team sets ask for 977 cards between them
-- and take any tier, so depth cards are the supply line the sets economy eats.
update public.packs
   set name        = 'Base Pack',
       card_count  = 5,
       coin_cost   = 140,
       tier_odds   = jsonb_build_object('depth', 92, 'bench', 7.4, 'starter', 0.5, 'elite', 0.1),
       guarantee   = '{}'::jsonb,
       pool_filter = '{}'::jsonb,
       is_active   = true
 where code = 'base';

-- PRO: more of the same, with a real chance at somebody.
insert into public.packs (code, name, coin_cost, card_count, once_per_user,
                          daily_limit, odds, guaranteed_positions,
                          tier_odds, guarantee, pool_filter, is_active)
values ('pro', 'Pro Pack', 260, 7, false, null, '{}'::jsonb, '{}'::jsonb,
        jsonb_build_object('depth', 82, 'bench', 16, 'starter', 1.8, 'elite', 0.2),
        '{}'::jsonb, '{}'::jsonb, true)
on conflict (code) do update
   set name        = excluded.name,
       coin_cost   = excluded.coin_cost,
       card_count  = excluded.card_count,
       tier_odds   = excluded.tier_odds,
       guarantee   = excluded.guarantee,
       pool_filter = excluded.pool_filter,
       is_active   = excluded.is_active;

-- ALL-PRO is where depth becomes the minority — the first rung bought for the
-- lineup rather than for the collection.
insert into public.packs (code, name, coin_cost, card_count, once_per_user,
                          daily_limit, odds, guaranteed_positions,
                          tier_odds, guarantee, pool_filter, is_active)
values ('allpro', 'All-Pro Pack', 680, 8, false, null, '{}'::jsonb, '{}'::jsonb,
        jsonb_build_object('depth', 40, 'bench', 48, 'starter', 11, 'elite', 1),
        '{}'::jsonb, '{}'::jsonb, true)
on conflict (code) do update
   set name        = excluded.name,
       coin_cost   = excluded.coin_cost,
       card_count  = excluded.card_count,
       tier_odds   = excluded.tier_odds,
       guarantee   = excluded.guarantee,
       pool_filter = excluded.pool_filter,
       is_active   = excluded.is_active;

-- ELITE is the top, and the only guarantee on the shelf: no depth at all, and
-- one card that is certainly elite. Five cards rather than one — an earlier
-- draft made it a single card and that was wrong, because opening is the verb
-- this whole shop sells and one card is a purchase rather than an opening.
insert into public.packs (code, name, coin_cost, card_count, once_per_user,
                          daily_limit, odds, guaranteed_positions,
                          tier_odds, guarantee, pool_filter, is_active)
values ('elite', 'Elite Pack', 1200, 5, false, null, '{}'::jsonb, '{}'::jsonb,
        jsonb_build_object('bench', 60, 'starter', 34, 'elite', 6),
        jsonb_build_object('min_tier', 'elite', 'count', 1),
        '{}'::jsonb, true)
on conflict (code) do update
   set name        = excluded.name,
       coin_cost   = excluded.coin_cost,
       card_count  = excluded.card_count,
       tier_odds   = excluded.tier_odds,
       guarantee   = excluded.guarantee,
       pool_filter = excluded.pool_filter,
       is_active   = excluded.is_active;

-- The two free packs, which sit outside the shop because neither is a thing you
-- choose between. The Daily's odds sit a shade above Base: a free pack worse
-- than the cheapest paid one is a free pack nobody opens.
update public.packs
   set name       = 'Daily Pack',
       card_count = 5,
       tier_odds  = jsonb_build_object('depth', 88, 'bench', 10.5, 'starter', 1.4, 'elite', 0.1),
       guarantee  = '{}'::jsonb
 where code = 'daily';

-- Onboarding is the one place a floor is unarguable: a first session that deals
-- ten nobodies cannot field a lineup, and a player who cannot field a lineup has
-- nothing to do. Ten is the ceiling `packs_card_count_check` allows.
update public.packs
   set name        = 'Starter Pack',
       card_count  = 10,
       pool_filter = jsonb_build_object('min_tier', 'bench')
 where code = 'starter';

-- Scout was a rung in a draft of this shop that had five. Retired rather than
-- deleted — `pack_openings` has rows pointing at it, and `is_active` is what
-- the shelf reads.
update public.packs set is_active = false where code = 'scout';

