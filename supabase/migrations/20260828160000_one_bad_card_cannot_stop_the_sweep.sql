-- One bad card must not stop the league.
--
-- On 2026-08-27 a single quarterback took scoring down for twelve hours. The
-- proximate cause was a check constraint that disagreed with the scoring rules
-- (fixed in 20260828150000), but the reason ONE row could stop EVERY user is
-- this function, and that reason survives the constraint that exposed it.
--
-- Steps 3 and 4 each write every card in a single statement. Postgres aborts a
-- statement whole: one row that a constraint or a trigger rejects discards the
-- other 48, score_week raises, gameday_sweep propagates, and the per-minute
-- cron records a failure and rolls back the entire tick — including steps 1 and
-- 2, which had already succeeded. Nothing partial survives. The sweep then
-- fails identically every minute until a human intervenes, because the input
-- that provoked it is still sitting there.
--
-- So the fast path stays exactly as it was, and a fallback appears underneath
-- it. The bulk statement runs first; if it raises, the subtransaction unwinds
-- and the same aggregate is replayed one card at a time, each in its own block.
-- A card that cannot be written is counted, named, and stepped over. Every card
-- that CAN be written is.
--
-- Two deliberate choices about how loud this is.
--
--   * The failure is never swallowed. It is counted in `cards_failed`, the ids
--     go in `failed_card_ids`, and `degraded` is true — all of which land in
--     sweep_log.scored, the one table built to outlive pg_net's 6h TTL and
--     pg_cron's uselessly terse "1 row". A `raise warning` puts the first
--     error text in the Postgres log as well. A silent fallback would trade a
--     loud outage for quiet wrong numbers, which is a worse trade: an outage
--     announces itself, a wrong career_fp does not.
--
--   * The slow path costs a subtransaction per card, so it runs ONLY after the
--     bulk statement has already failed. A healthy tick executes precisely the
--     statement it executed before, and pays nothing for this.
--
-- What this does NOT do is make bad data good. A card in `failed_card_ids` is
-- still wrong and still needs a fix; it just no longer takes the other users
-- down with it while it waits for one.

create or replace function public.score_week(p_season integer, p_season_type smallint, p_week integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_version    integer;
  v_slots      integer;
  v_lineups    integer;
  v_cards      integer := 0;
  v_cleared    integer := 0;
  v_complete   boolean;
  v_failed     integer := 0;
  v_failed_ids uuid[]  := '{}';
  v_first_err  text;
  v_bulk_err   text;
  r            record;
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
  --
  --    THE FAST PATH. Unchanged, and the only path a healthy tick takes.
  begin
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
  exception when others then
    -- The whole statement is gone, including the cards that were fine.
    v_bulk_err := sqlerrm;
    v_cards    := 0;
  end;

  --    THE SLOW PATH. Same aggregate, one card at a time, each isolated so a
  --    row that cannot be written costs only itself.
  if v_bulk_err is not null then
    for r in
      with complete_weeks as (
        select g.season, g.season_type, g.week
          from public.games g
         where g.week is not null
         group by g.season, g.season_type, g.week
        having count(*) filter (where g.status_state is distinct from 'final') = 0
      )
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
    loop
      begin
        update public.card_instances ci
           set career_fp     = r.total,
               settled_fp    = r.settled,
               lineup_starts = r.starts
         where ci.id = r.card_instance_id
           and (ci.career_fp is distinct from r.total
             or ci.settled_fp is distinct from r.settled
             or ci.lineup_starts is distinct from r.starts);
        if found then
          v_cards := v_cards + 1;
        end if;
      exception when others then
        v_failed     := v_failed + 1;
        v_failed_ids := array_append(v_failed_ids, r.card_instance_id);
        v_first_err  := coalesce(v_first_err, sqlerrm);
      end;
    end loop;

    raise warning
      'score_week(%,%,%): bulk card rollup failed (%); per-card fallback wrote %, could not write % — first error: %',
      p_season, p_season_type, p_week, v_bulk_err, v_cards, v_failed, v_first_err;
  end if;

  -- 4. AND THE CARDS THE AGGREGATE ABOVE CANNOT SEE.
  --
  --    Step 3 updates FROM an inner join on lineup_slots, so a card that fills
  --    no slot is absent from it and keeps whatever it last earned — points,
  --    starts, and the tier and sell value they bought. See
  --    20260821240000_score_week_clears_orphans.sql for how a card gets there.
  --
  --    Disjoint from step 3 by construction: a card either fills a slot or it
  --    does not. The `<> 0` guard is what stops this rewriting every bronze
  --    card in the game on every one-minute tick.
  --
  --    Same shape as step 3: bulk, then per-card if the bulk cannot land. This
  --    one writes constant zeros rather than computed values, so it is far less
  --    likely to be rejected — but it writes the same columns on the same table
  --    behind the same trigger, and "less likely" is not a reason to let it
  --    take the tick down.
  begin
    update public.card_instances ci
       set career_fp = 0, settled_fp = 0, lineup_starts = 0
     where not exists (
       select 1 from public.lineup_slots ls where ls.card_instance_id = ci.id
     )
       and (ci.career_fp <> 0 or ci.settled_fp <> 0 or ci.lineup_starts <> 0);
    get diagnostics v_cleared = row_count;
  exception when others then
    v_bulk_err  := coalesce(v_bulk_err, sqlerrm);
    v_first_err := coalesce(v_first_err, sqlerrm);
    v_cleared   := 0;

    for r in
      select ci.id as card_instance_id
        from public.card_instances ci
       where not exists (
         select 1 from public.lineup_slots ls where ls.card_instance_id = ci.id
       )
         and (ci.career_fp <> 0 or ci.settled_fp <> 0 or ci.lineup_starts <> 0)
    loop
      begin
        update public.card_instances
           set career_fp = 0, settled_fp = 0, lineup_starts = 0
         where id = r.card_instance_id;
        if found then
          v_cleared := v_cleared + 1;
        end if;
      exception when others then
        v_failed     := v_failed + 1;
        v_failed_ids := array_append(v_failed_ids, r.card_instance_id);
      end;
    end loop;

    raise warning
      'score_week(%,%,%): bulk orphan clear failed; per-card fallback cleared %, could not write %',
      p_season, p_season_type, p_week, v_cleared, v_failed;
  end;

  return jsonb_build_object(
    'season', p_season, 'season_type', p_season_type, 'week', p_week,
    'rules_version', v_version,
    'week_complete', v_complete,
    'slots_scored', v_slots, 'lineups_scored', v_lineups,
    'cards_updated', v_cards, 'cards_cleared', v_cleared,
    -- Present on every tick so a dashboard can read them without a null check,
    -- and so a run of zeros is positive evidence rather than absence of news.
    'degraded', v_bulk_err is not null,
    'cards_failed', v_failed,
    -- Capped: sweep_log takes a row a minute and nobody debugs from id 500.
    'failed_card_ids', to_jsonb(v_failed_ids[1:20]),
    'first_error', v_first_err
  );
end;
$function$;

comment on function public.score_week(integer, smallint, integer) is
  'Recompute a week''s slots, lineup totals and card rollups. Idempotent. A card that cannot be written is counted in cards_failed and named in failed_card_ids rather than aborting the sweep.';
