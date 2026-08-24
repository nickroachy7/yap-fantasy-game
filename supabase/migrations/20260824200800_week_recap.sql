-- Sunday night, in one payload.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS
-- ---------------------------------------------------------------------------
--
-- Every problem this economy has had has been a LEGIBILITY problem rather than
-- an incentive one. Tiers move and nobody sees it. Sets pay and nobody notices.
-- Scoring happens silently inside a sweep that runs every minute, so the single
-- most interesting moment in a fantasy game — finding out how your guys did —
-- has had no moment at all.
--
-- This is that moment. It is deliberately a READ of what was already written:
-- `award_score_gems` and `award_position_bonuses` stamp every figure onto the
-- slot when they pay it, so nothing here recomputes anything and nothing here
-- can disagree with the wallet.
--
-- ---------------------------------------------------------------------------
-- PER PLAYER, NOT PER LINEUP
-- ---------------------------------------------------------------------------
--
-- The lineup total is one number and it teaches nothing. The per-card rows are
-- the whole point: they are what makes the tier multiplier visible every single
-- week, and they are what makes the roster cap's decision — which of these do I
-- actually believe in — an informed one instead of a guess.
--
-- A row carries what it earned AND why: points, the tier it was paid at, the
-- multiplier, the positional finish, and any promotion it earned on the way. A
-- promotion is reported by comparing the tier stamped at award time against the
-- card's tier now, which is exactly the "you played him at BRONZE, he earned
-- SILVER, next week he pays more" line the ladder is shaped to produce.
--
-- ---------------------------------------------------------------------------
-- THE FOOTER IS WHERE SETS GET SOLD
-- ---------------------------------------------------------------------------
--
-- `closest_sets` is the reason this payload is worth building. A rung you are
-- two cards away from, shown at the moment you are happiest, converts better
-- than any incentive that could be bolted onto the Sets tab — because the Sets
-- tab is a place you have to decide to visit and this is not.
--
-- `roster` rides along for the same reason: the cap should be something a
-- player is reminded of on a calm Sunday, not something they discover at 12:55
-- the following week when they try to swap an inactive starter.

create or replace function public.week_recap(
  p_season      integer,
  p_season_type smallint,
  p_week        integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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

  select * into v_lineup
    from public.lineups
   where user_id = v_user and season = p_season
     and season_type = p_season_type and week = p_week;

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
$$;

revoke execute on function public.week_recap(integer, smallint, integer) from public, anon;
grant  execute on function public.week_recap(integer, smallint, integer) to authenticated;

comment on function public.week_recap(integer, smallint, integer) is
  'One week, per started card: what it scored, what it paid, the tier it was paid at, any promotion it earned, plus the set rungs the caller is closest to and their roster standing.';
