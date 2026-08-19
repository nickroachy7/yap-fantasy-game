-- Community ownership for one player, for the DIRECTORY profile.
--
-- The directory profile answers "who is this player and should I want him".
-- Half of that question, in a collection game, is about the OTHER copies: how
-- many exist, who has actually played theirs, and what the best one in the
-- game looks like. None of that is visible from a user's own collection, and
-- all of it is what turns a stat page into a scouting page.
--
-- WHY security definer, AND WHAT IT DELIBERATELY EXPOSES
--
-- `card_instances` is scoped by RLS to its owner, so an invoker-rights function
-- would see only the caller's own copies and every count would read 1. This is
-- therefore `security definer` with a locked search_path, and — exactly like
-- `leaderboard` — the exposed values are an explicit, reviewable list rather
-- than a view someone can widen by accident:
--
--   * counts and tier histograms, which name nobody;
--   * ONE display name, that of the single highest-earning copy in the game.
--
-- That last one is a deliberate exposure and it is the same one the leaderboard
-- already makes: display_name against a fantasy-point total, globally visible.
-- Nothing else about another user is readable through here — not user ids, not
-- who owns the other copies, not anyone's collection.
--
-- WHAT "IN CIRCULATION" MEANS
--
-- Selling is a soft delete (see sell_card), because lineup history has to keep
-- resolving. So `minted` counts every copy ever pulled and `held` counts the
-- ones someone still has. The gap between them is real information — a player
-- people dump is a different proposition from one nobody has pulled — and the
-- screen shows both rather than quietly picking one.
--
-- One statement, not a temp table: this is `stable`, so it must not do DDL, and
-- every figure below comes off the same single scan of the player's copies.
create or replace function public.player_market(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_out  jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- A player who does not exist is null, not an empty market: the caller can
  -- then draw "player not found" rather than "nobody owns him".
  if not exists (select 1 from public.players where id = p_player_id) then
    return null;
  end if;

  with copies as (
    select ci.id, ci.user_id, ci.tier, ci.career_fp, ci.lineup_starts,
           ci.acquired_at, ci.sold_at, c.season
      from public.card_instances ci
      join public.cards c on c.id = ci.card_id
     where c.player_id = p_player_id
  ),
  held as (
    select * from copies where sold_at is null
  ),
  totals as (
    select jsonb_build_object(
             'minted',  (select count(*) from copies),
             'held',    (select count(*) from held),
             'sold',    (select count(*) from copies where sold_at is not null),
             'owners',  (select count(distinct user_id) from held),
             -- The number that says whether this player is actually PLAYED, as
             -- opposed to merely held. career_fp only moves when a copy starts.
             'started', (select count(*) from held where lineup_starts > 0),
             'total_fp', (select coalesce(round(sum(career_fp), 1), 0) from held),
             'avg_fp',  (select case when count(*) > 0
                                     then round(sum(career_fp) / count(*), 1) end
                           from held)
           ) as j
  ),
  -- Every tier, always, including the ones at zero. A histogram with rows
  -- missing reads as "no diamonds exist" when it means "none of THIS player".
  tiers as (
    select jsonb_agg(
             jsonb_build_object(
               'tier',    t.tier,
               'copies',  coalesce(x.copies, 0),
               'owners',  coalesce(x.owners, 0),
               'best_fp', x.best_fp
             ) order by t.sort_order
           ) as j
      from public.tier_thresholds t
      left join (
        select tier, count(*) as copies, count(distinct user_id) as owners,
               round(max(career_fp), 1) as best_fp
          from held group by tier
      ) x on x.tier = t.tier
  ),
  /* The best copy in the game.
   *
   * Only returned once some copy has actually earned something. With every
   * copy on zero the "highest" is whichever row sorted first, which is noise
   * dressed as a leaderboard — the screen says "nobody has started one yet"
   * instead, which is both true and more interesting. */
  top as (
    select jsonb_build_object(
             'display_name',  pr.display_name,
             'is_you',        h.user_id = v_user,
             'tier',          h.tier,
             'career_fp',     round(h.career_fp, 1),
             'lineup_starts', h.lineup_starts,
             'season',        h.season,
             'acquired_at',   h.acquired_at
           ) as j
      from held h
      join public.profiles pr on pr.id = h.user_id
     where h.career_fp > 0
     -- Ties break toward the copy that did it in fewer starts, then toward the
     -- one held longest. Both are ordinary "who did it better".
     order by h.career_fp desc, h.lineup_starts asc, h.acquired_at asc
     limit 1
  ),
  mine as (
    select * from held where user_id = v_user
  ),
  yours as (
    select case when (select count(*) from mine) = 0 then null else
      jsonb_build_object(
        'copies',    (select count(*) from mine),
        'best_fp',   (select round(max(career_fp), 1) from mine),
        'best_tier', (select tier from mine order by career_fp desc limit 1),
        /* Competition rank of the caller's best copy among every held copy.
         * count-of-better + 1 rather than a window function: same answer,
         * without ranking rows nobody asked about. */
        'best_rank', (select count(*) + 1 from held o
                       where o.career_fp > (select max(career_fp) from mine))
      ) end as j
  ),
  -- A card is minted per player per season, so this is how many of each year's
  -- card have been added to the set.
  seasons as (
    select jsonb_agg(
             jsonb_build_object('season', s.season, 'held', s.held, 'minted', s.minted)
             order by s.season desc
           ) as j
      from (
        select season,
               count(*) filter (where sold_at is null) as held,
               count(*)                                as minted
          from copies group by season
      ) s
  )
  select jsonb_build_object(
           'player_id', p_player_id,
           'totals',    totals.j,
           'tiers',     coalesce(tiers.j, '[]'::jsonb),
           'top',       top.j,
           'yours',     yours.j,
           'seasons',   coalesce(seasons.j, '[]'::jsonb)
         )
    into v_out
    -- LEFT JOINs against the single-row CTEs: `top` produces NO row when no
    -- copy has earned anything, and a plain CROSS JOIN would then collapse the
    -- whole result to null rather than to "no top copy yet".
    from totals
    left join tiers   on true
    left join top     on true
    left join yours   on true
    left join seasons on true;

  return v_out;
end;
$$;

revoke execute on function public.player_market(uuid) from public, anon;
grant  execute on function public.player_market(uuid) to authenticated;

comment on function public.player_market(uuid) is
  'Community ownership of one player: circulation counts, tier histogram, and the single highest-earning copy in the game. security definer by necessity — card_instances is RLS-scoped to its owner — and exposes only aggregates plus that one display name, on the same basis as leaderboard().';
