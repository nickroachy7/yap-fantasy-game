-- The sell sheet shows its working.
--
-- 20260902060000 made a sale (base + settled points) x tier and published all
-- three parts on `card_prices`, but `card_profile` carried only the total
-- through to the screen. That was fine when the price was a flat per-tier
-- constant and is not fine now: a diamond that used to read 500 now reads
-- 1271, and a number that large with no account of itself reads as a bug.
--
-- So the card screen gets the two halves it already had joined and was not
-- returning. Additive only — every existing key is untouched, and the parts do
-- not reconcile to the total exactly (the tier multiplies their sum and the
-- result is floored), so they are for display and never for arithmetic.
--
-- `sell_card` has returned them since 20260902060000; this is the read side
-- catching up with the write side.
--
-- ---------------------------------------------------------------------------
-- AND `next_tier_sell_value` WAS QUIETLY WRONG
--
-- 20260902060000 priced the next tier using the points the copy has TODAY. That
-- is arithmetically true and practically a lie: you cannot arrive at silver
-- without 50 settled points, so quoting a bronze "31 at silver" describes a
-- copy that cannot exist. It made the whole line pointless — the honest answer
-- for that card is 91, and 91 is an argument for starting it where 31 is an
-- argument for selling it now.
--
-- It now prices at the floor of the tier being reached, or the copy's own
-- points if it somehow already has more. Same function, so a hypothetical and a
-- real sale still cannot be computed two different ways.

CREATE OR REPLACE FUNCTION public.card_profile(p_card_instance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
         cp.base_coins,
         cp.fp_coins,
         nxt.min_career_fp as next_tier_at,
         nxt.tier          as next_tier_label,
         -- What this copy would be worth one tier up, at its own value score and
         -- its points as they stand. The screen already says how far the next
         -- tier is; this says what reaching it is worth, which is the argument
         -- for starting the card. Through sale_value() so a hypothetical and a
         -- real sale cannot be computed two different ways.
         public.sale_value(nxt.tier, coalesce(pv.value_score, 0),
                           greatest(ci.settled_fp, nxt.min_career_fp, 0)) as next_tier_sell_value
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
      'base_coins',     v_card.base_coins,
      'fp_coins',       v_card.fp_coins,
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

comment on function public.card_profile(uuid) is
  'One owned copy, for the card screen: its identity, its standing, every week it started, and what it would sell for — total plus the player and points halves it is made of.';

revoke execute on function public.card_profile(uuid) from public, anon;
grant  execute on function public.card_profile(uuid) to authenticated;
