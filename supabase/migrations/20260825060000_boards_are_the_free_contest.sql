-- The season's standings are the FREE contest, and nothing else.
--
-- ---------------------------------------------------------------------------
-- THE BUG THIS CLOSES, AND IT IS PAY-TO-WIN
-- ---------------------------------------------------------------------------
--
-- Every ranking in the game keyed on a SLATE: season, season_type, week. That
-- was an exact key for as long as a week held one lineup per player, and
-- 20260825010000 made it a partial one. `20260825050000` then shipped a lobby
-- contest you can pay 40 gems to enter — so the moment anybody does:
--
--   `leaderboard`      sums total_points across ALL of a user's lineups, so a
--                      paid entry ADDS to their season total. Gems buy rank.
--   `board_record`     grades every entry against the week's median AND builds
--                      that median out of the same rows — so an entrant is
--                      graded twice, and their three-card lobby score drags the
--                      median down for everybody else.
--   `board_best_week`  double-counts `weeks_played`.
--   `week_recap`       `select * into v_lineup` with no LIMIT. plpgsql does not
--                      raise on multiple rows unless INTO STRICT, so the recap
--                      would silently describe whichever lineup came back
--                      first — possibly the three-card one.
--
-- None of these is a rounding error. A paid contest that moves the free
-- contest's standings is the single worst thing this feature could have done,
-- and it would have been invisible until a tester entered and quietly went top.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY *NOT* SCOPED
-- ---------------------------------------------------------------------------
--
-- The rule is: **the season competition is the free contest; a card's EARNINGS
-- follow the card.** So these stay exactly as they are —
--
--   `score_week`             scores every lineup. A lobby card played; its
--                            points are real and its tier should move.
--   `award_score_gems`       pays per slot, so the card is paid for what it
--                            did. This is the faucet the entry fee prices
--                            against, and scoping it would break that trade.
--   `award_position_bonuses` ranks PLAYERS from `stat_lines` — the league's own
--                            numbers, not lineups — and pays whichever slot
--                            holds one. Exclusivity means a card sits in one
--                            contest, so nothing can be paid twice.
--
-- `median_record` was already scoped in 20260825010000.
--
-- Built by reading the four live definitions back with `pg_get_functiondef` and
-- adding one join to each, per the standing rule in 20260824230000. The alias
-- is `c_free` rather than `c` because three of the four already use `c`.

CREATE OR REPLACE FUNCTION public.leaderboard(p_season integer, p_season_type smallint DEFAULT 2, p_week integer DEFAULT NULL::integer, p_limit integer DEFAULT 100)
 RETURNS TABLE(rank bigint, user_id uuid, display_name text, total_points numeric, weeks_played bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with totals as (
    select l.user_id,
           sum(l.total_points) as pts,
           count(*)            as weeks
      from public.lineups l
      join public.contests c_free on c_free.id = l.contest_id and c_free.kind = 'free'
     where l.season = p_season
       and l.season_type = p_season_type
       and l.scored_at is not null
       and (p_week is null or l.week = p_week)
     group by l.user_id
  )
  select rank() over (order by t.pts desc, pr.display_name asc),
         t.user_id,
         pr.display_name,
         t.pts,
         t.weeks
    from totals t
    join public.profiles pr on pr.id = t.user_id
   order by t.pts desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$
;

CREATE OR REPLACE FUNCTION public.board_record(p_season integer, p_season_type smallint DEFAULT 2, p_limit integer DEFAULT 100)
 RETURNS TABLE(rank bigint, user_id uuid, display_name text, wins bigint, losses bigint, ties bigint, weeks bigint, win_pct numeric, points numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with entries as (
    select l.week, l.user_id, l.total_points as pts
      from public.lineups l
      join public.contests c_free on c_free.id = l.contest_id and c_free.kind = 'free'
     where l.season = p_season
       and l.season_type = p_season_type
       and exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  field as (
    select e.week,
           count(*) as entrants,
           round(
             (percentile_cont(0.5) within group (order by e.pts::double precision))::numeric,
             2
           ) as median
      from entries e
     group by e.week
  ),
  finality as (
    select g.week,
           bool_and(lower(coalesce(g.status_state, '')) in ('final', 'complete', 'completed'))
             as final
      from public.games g
     where g.season = p_season
       and g.season_type = p_season_type
       and g.week is not null
     group by g.week
  ),
  graded as (
    select e.user_id,
           e.pts,
           case when e.pts > f.median then 1 else 0 end as w,
           case when e.pts < f.median then 1 else 0 end as l,
           case when e.pts = f.median then 1 else 0 end as t
      from entries e
      join field f on f.week = e.week
      left join finality fin on fin.week = e.week
     where coalesce(fin.final, false)
       and f.entrants >= 2
  ),
  tallied as (
    select g.user_id,
           sum(g.w)   as wins,
           sum(g.l)   as losses,
           sum(g.t)   as ties,
           count(*)   as weeks,
           sum(g.pts) as points,
           -- A tie is half a win, which is how every sport that has ties does
           -- it, and it keeps a 1-0-1 ahead of a 1-1-0 without inventing a
           -- rule for the tie column.
           round((sum(g.w) + sum(g.t) / 2.0) / count(*), 3) as win_pct
      from graded g
     group by g.user_id
  )
  -- Ordered by RATE and then by wins. Rate is what a record means, and the
  -- secondary sort on wins is what stops a 1-0 outranking a 6-0 on a technical
  -- tie — the player with more weeks has proved the same rate against more of
  -- the season.
  select rank() over (order by ta.win_pct desc, ta.wins desc, pr.display_name asc),
         ta.user_id,
         pr.display_name,
         ta.wins,
         ta.losses,
         ta.ties,
         ta.weeks,
         ta.win_pct,
         ta.points
    from tallied ta
    join public.profiles pr on pr.id = ta.user_id
   order by ta.win_pct desc, ta.wins desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$
;

CREATE OR REPLACE FUNCTION public.board_best_week(p_season integer, p_season_type smallint DEFAULT 2, p_limit integer DEFAULT 100)
 RETURNS TABLE(rank bigint, user_id uuid, display_name text, week integer, points numeric, weeks_played bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with weeks as (
    select l.user_id, l.week, l.total_points as pts
      from public.lineups l
      join public.contests c_free on c_free.id = l.contest_id and c_free.kind = 'free'
     where l.season = p_season
       and l.season_type = p_season_type
       and l.scored_at is not null
  ),
  best as (
    -- Ties on points go to the EARLIER week: the first time you hit a number is
    -- when you posted it, and repeating it later does not move the record.
    select distinct on (w.user_id) w.user_id, w.week, w.pts
      from weeks w
     order by w.user_id, w.pts desc, w.week asc
  ),
  played as (
    select w.user_id, count(*) as n from weeks w group by w.user_id
  )
  select rank() over (order by b.pts desc, pr.display_name asc),
         b.user_id,
         pr.display_name,
         b.week,
         b.pts,
         pl.n
    from best b
    join public.profiles pr on pr.id = b.user_id
    join played pl on pl.user_id = b.user_id
   order by b.pts desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$
;

CREATE OR REPLACE FUNCTION public.week_recap(p_season integer, p_season_type smallint, p_week integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user   uuid := auth.uid();
  v_lineup public.lineups%rowtype;
  v_cards  jsonb;
  v_sets   jsonb;
  v_rank   bigint;
  v_of     bigint;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- `l.*`, and the join, are both load-bearing. This was `select * from
  -- public.lineups where user_id/season/type/week` — a SELECT INTO with no
  -- LIMIT, which was an exact key until a week could hold two lineups and is
  -- now a coin toss between your main lineup and a three-card lobby entry.
  -- plpgsql does not raise on multiple rows unless INTO STRICT; it just takes
  -- one. The recap is about the season contest, so it takes the free one.
  select l.* into v_lineup
    from public.lineups l
    join public.contests c_free on c_free.id = l.contest_id and c_free.kind = 'free'
   where l.user_id = v_user and l.season = p_season
     and l.season_type = p_season_type and l.week = p_week;

  if not found then
    return jsonb_build_object(
      'season', p_season, 'season_type', p_season_type, 'week', p_week,
      'has_lineup', false);
  end if;

  -- Where the week finished against everyone else who played it. Computed over
  -- scored lineups only, so an unscored week does not rank you above people who
  -- simply have not been swept yet.
  select r.rk, r.total into v_rank, v_of
    from (
      select l.user_id,
             rank() over (order by l.total_points desc) as rk,
             count(*) over ()                           as total
        from public.lineups l
      join public.contests c_free on c_free.id = l.contest_id and c_free.kind = 'free'
       where l.season = p_season and l.season_type = p_season_type
         and l.week = p_week and l.scored_at is not null
    ) r
   where r.user_id = v_user;

  -- ------------------------------------------------------------- the cards
  select coalesce(jsonb_agg(row order by row->>'display_order'), '[]'::jsonb)
    into v_cards
    from (
      select jsonb_build_object(
               'slot',            ls.slot,
               'display_order',   lpad(c.display_order::text, 3, '0'),
               'card_instance_id',ci.id,
               'player_id',       pl.id,
               'player_name',     pl.full_name,
               'position',        pl.position_abbreviation,
               'team',            tm.abbreviation,
               'points',          ls.points,
               -- Null until the week is awarded. The client draws a "pending"
               -- row rather than a zero, because those are different states.
               'awarded',         ls.gems_awarded is not null,
               'tier_at_award',   ls.tier_at_award,
               'gem_multiplier',  ls.gem_multiplier,
               'gems',            ls.gems_awarded,
               'position_rank',   ls.position_rank,
               'bonus_gems',      ls.bonus_gems,
               'was_week_mvp',    coalesce(ls.was_week_mvp, false),
               'tier_now',        ci.tier,
               -- The forward pull. True only when the card has climbed since it
               -- was paid, which is what makes next week worth turning up for.
               'promoted',        ls.tier_at_award is not null
                                    and ci.tier is distinct from ls.tier_at_award,
               'career_fp',       ci.career_fp
             ) as row
        from public.lineup_slots ls
        join public.lineup_slot_config c on c.slot = ls.slot
        join public.card_instances ci on ci.id = ls.card_instance_id
        join public.cards          cd on cd.id = ci.card_id
        join public.players        pl on pl.id = cd.player_id
        left join public.teams     tm on tm.id = pl.team_id
       where ls.lineup_id = v_lineup.id
    ) rows;

  -- ------------------------------------------------------- what you're near
  --
  -- The three unfinished rungs this player is closest to, counted in cards
  -- they ALREADY HOLD and could commit today. A rung that is close only in
  -- theory is not a call to action, so `ready` is what orders this and cards
  -- still to be pulled are not counted.
  select coalesce(jsonb_agg(row order by (row->>'still_needed')::int asc), '[]'::jsonb)
    into v_sets
    from (
      select jsonb_build_object(
               'code',         s.code,
               'name',         s.name,
               'family',       s.family,
               'committed',    p.committed,
               'next_at',      k.cards,
               'next_reward',  k.gems,
               'still_needed', k.cards - p.committed,
               'ready_now',    least(r.ready, k.cards - p.committed)
             ) as row
        from public.card_sets s
        cross join lateral (
          select count(distinct ci.card_id)::integer as committed
            from public.card_instances ci
           where ci.committed_to = s.id
             and ci.committed_at is not null
             and ci.user_id = v_user
        ) p
        cross join lateral (
          select count(distinct mm.card_id)::integer as ready
            from public.card_set_members mm
            join public.card_instances ci
              on ci.card_id = mm.card_id
             and ci.is_held
             and ci.user_id = v_user
           where mm.set_id = s.id
             and not exists (
               select 1 from public.card_instances cc
                where cc.committed_to = s.id and cc.card_id = mm.card_id
                  and cc.committed_at is not null and cc.user_id = v_user
             )
        ) r
        join lateral (
          select ceil(s.required_count * ms.threshold_pct / 100.0)::integer as cards,
                 ms.reward_gems as gems
            from public.card_set_milestones ms
           where ms.set_id = s.id
             and ceil(s.required_count * ms.threshold_pct / 100.0) > p.committed
           order by ms.threshold_pct asc
           limit 1
        ) k on true
       where s.is_active
         and s.family <> 'daily'      -- a daily expires tonight; not a chase
         and r.ready > 0              -- only rungs they can act on right now
       order by (k.cards - p.committed) asc, r.ready desc
       limit 3
    ) rows;

  return jsonb_build_object(
    'season',       p_season,
    'season_type',  p_season_type,
    'week',         p_week,
    'has_lineup',   true,
    'scored',       v_lineup.scored_at is not null,
    'finalized',    v_lineup.finalized_at is not null,
    'total_points', v_lineup.total_points,
    'rank',         v_rank,
    'of',           v_of,
    'cards',        v_cards,
    -- Summed from the same stamped columns the ledger was written from.
    'gems_points',  (select coalesce(sum(gems_awarded), 0) from public.lineup_slots where lineup_id = v_lineup.id),
    'gems_bonus',   (select coalesce(sum(bonus_gems), 0)   from public.lineup_slots where lineup_id = v_lineup.id),
    'closest_sets', v_sets,
    'roster',       public.roster_status());
end;
$function$


