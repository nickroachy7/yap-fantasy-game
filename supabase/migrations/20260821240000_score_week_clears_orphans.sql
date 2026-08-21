-- Reset a card that no longer fills any slot.
--
-- `score_week` recomputes `career_fp`, `settled_fp` and `lineup_starts` from
-- the slots a card fills, and it is careful to be idempotent about it — the
-- figures are SET from source rather than added to, so running the sweep ten
-- times says what running it once says.
--
-- It only ever said that about cards it could SEE. The aggregate it updates
-- from is an inner join on `lineup_slots`, so a card with no slots left is not
-- in the result at all, and `update ... from` simply does not touch it. Its
-- last known figures stay on the row forever.
--
-- A card reaches that state by ordinary play. Start a card one week, take it
-- out again, and its slot is deleted by `set_lineup`; do that for every week it
-- ever appeared in and it has no slots at all. Committing a starter to a set now
-- deletes a slot too. The card then keeps the points it earned while it was in
-- the lineup — and keeps the TIER those points bought, and the sell value that
-- tier carries.
--
-- 129 cards in this database were in that state, 65 of them tiered above bronze
-- on points they no longer had any claim to. Every gold and every diamond was
-- one of them. It is also an exploit: start a card, earn a tier, bench it, sell
-- it at the higher price forever.
--
-- The fix is one more statement rather than a rewrite of the aggregate. It says
-- exactly what it means, and it cannot disturb the recomputation above it: the
-- two sets are disjoint by construction, since a card is either in some slot or
-- it is not.
--
-- The `<> 0` guard keeps the sweep quiet. Without it this rewrites every card
-- in the game on every tick, which for a sweep that runs each minute is a lot
-- of dead writes and a lot of trigger work — `sync_card_tier` fires on each one.

create or replace function public.score_week(p_season integer, p_season_type smallint, p_week integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_version  integer;
  v_slots    integer;
  v_lineups  integer;
  v_cards    integer;
  v_cleared  integer;
  v_complete boolean;
begin
  select version into v_version
    from public.scoring_rules where is_active limit 1;
  if v_version is null then
    raise exception 'no active scoring rules' using errcode = '22023';
  end if;

  v_complete := public.week_is_complete(p_season, p_season_type, p_week);

  -- 1. each started card scores whatever its player scored that week.
  --    LEFT JOINs so a card whose player did not play resolves to 0, not to a
  --    missing row (which would leave a stale value behind).
  with slot_points as (
    select ls.id as slot_id, coalesce(sum(fp.points), 0) as pts
      from public.lineup_slots ls
      join public.lineups        l  on l.id  = ls.lineup_id
      join public.card_instances ci on ci.id = ls.card_instance_id
      join public.cards          cd on cd.id = ci.card_id
      left join public.stat_lines sl
             on sl.player_id   = cd.player_id
            and sl.season      = l.season
            and sl.season_type = l.season_type
            and sl.week        = l.week
      left join public.fantasy_points fp
             on fp.stat_line_id  = sl.id
            and fp.rules_version = v_version
     where l.season = p_season and l.season_type = p_season_type and l.week = p_week
     group by ls.id
  )
  update public.lineup_slots ls
     set points = sp.pts
    from slot_points sp
   where ls.id = sp.slot_id;
  get diagnostics v_slots = row_count;

  -- 2. lineup total is the sum of its slots.
  update public.lineups l
     set total_points = coalesce(
           (select sum(ls.points) from public.lineup_slots ls where ls.lineup_id = l.id), 0),
         scored_at = now(),
         finalized_at = case when v_complete then coalesce(l.finalized_at, now()) else l.finalized_at end
   where l.season = p_season and l.season_type = p_season_type and l.week = p_week;
  get diagnostics v_lineups = row_count;

  -- 3. career_fp is the SUM of every slot the card has ever filled, and
  --    settled_fp the same sum over finished weeks only. Both are recomputed
  --    from source, which is what makes this function idempotent.
  --
  --    The sweep is global rather than restricted to p_week on purpose. A week
  --    completing is not an event this function is told about — it is simply
  --    true on some later pass than it was on the one before.
  with complete_weeks as (
    select g.season, g.season_type, g.week
      from public.games g
     where g.week is not null
     group by g.season, g.season_type, g.week
    having count(*) filter (where g.status_state is distinct from 'final') = 0
  )
  update public.card_instances ci
     set career_fp     = agg.total,
         settled_fp    = agg.settled,
         lineup_starts = agg.starts
    from (
      select ls.card_instance_id,
             coalesce(sum(ls.points), 0)                                 as total,
             coalesce(sum(ls.points) filter (where cw.week is not null), 0) as settled,
             count(*) filter (where l.scored_at is not null)             as starts
        from public.lineup_slots ls
        join public.lineups l on l.id = ls.lineup_id
        left join complete_weeks cw
               on cw.season = l.season
              and cw.season_type = l.season_type
              and cw.week = l.week
       group by ls.card_instance_id
    ) agg
   where ci.id = agg.card_instance_id
     and (ci.career_fp is distinct from agg.total
       or ci.settled_fp is distinct from agg.settled
       or ci.lineup_starts is distinct from agg.starts);
  get diagnostics v_cards = row_count;

  -- 4. AND THE CARDS THE AGGREGATE ABOVE CANNOT SEE.
  --
  --    Step 3 updates FROM an inner join on lineup_slots, so a card that fills
  --    no slot is absent from it and keeps whatever it last earned — points,
  --    starts, and the tier and sell value they bought. See this migration's
  --    header for how a card gets there and why it matters.
  --
  --    Disjoint from step 3 by construction: a card either fills a slot or it
  --    does not. The `<> 0` guard is what stops this rewriting every bronze
  --    card in the game on every one-minute tick.
  update public.card_instances ci
     set career_fp = 0, settled_fp = 0, lineup_starts = 0
   where not exists (
     select 1 from public.lineup_slots ls where ls.card_instance_id = ci.id
   )
     and (ci.career_fp <> 0 or ci.settled_fp <> 0 or ci.lineup_starts <> 0);
  get diagnostics v_cleared = row_count;

  return jsonb_build_object(
    'season', p_season, 'season_type', p_season_type, 'week', p_week,
    'rules_version', v_version,
    'week_complete', v_complete,
    'slots_scored', v_slots, 'lineups_scored', v_lineups,
    'cards_updated', v_cards, 'cards_cleared', v_cleared
  );
end;
$function$;
