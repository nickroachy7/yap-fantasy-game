-- Weekly scoring rollup (build plan task 23).
--
-- The live job calls this every 5 minutes on gamedays, so it MUST be safe to
-- run repeatedly. Every write below is a recomputation from source rows, never
-- an increment — running it ten times gives the same answer as running it once.
-- An "add this week's points to career_fp" design would inflate every card on
-- the second sweep.
create or replace function public.score_week(
  p_season      integer,
  p_season_type smallint,
  p_week        integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version integer;
  v_slots   integer;
  v_lineups integer;
  v_cards   integer;
begin
  select version into v_version
    from public.scoring_rules where is_active limit 1;
  if v_version is null then
    raise exception 'no active scoring rules' using errcode = '22023';
  end if;

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

  -- 2. lineup total is the sum of its slots
  update public.lineups l
     set total_points = coalesce(
           (select sum(ls.points) from public.lineup_slots ls where ls.lineup_id = l.id), 0),
         scored_at = now()
   where l.season = p_season and l.season_type = p_season_type and l.week = p_week;
  get diagnostics v_lineups = row_count;

  -- 3. career_fp is the SUM of every slot the card has ever filled. This is what
  --    makes the whole function idempotent, and it is what drives tier: the
  --    card_instances_sync_tier trigger fires on this update.
  update public.card_instances ci
     set career_fp     = agg.total,
         lineup_starts = agg.starts
    from (
      select ls.card_instance_id,
             coalesce(sum(ls.points), 0)                        as total,
             count(*) filter (where l.scored_at is not null)    as starts
        from public.lineup_slots ls
        join public.lineups l on l.id = ls.lineup_id
       group by ls.card_instance_id
    ) agg
   where ci.id = agg.card_instance_id
     and (ci.career_fp is distinct from agg.total
       or ci.lineup_starts is distinct from agg.starts);
  get diagnostics v_cards = row_count;

  return jsonb_build_object(
    'season', p_season, 'season_type', p_season_type, 'week', p_week,
    'rules_version', v_version,
    'slots_scored', v_slots, 'lineups_scored', v_lineups, 'cards_updated', v_cards
  );
end;
$$;

revoke execute on function public.score_week(integer, smallint, integer) from public, anon, authenticated;
