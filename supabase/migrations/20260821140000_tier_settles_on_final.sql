-- Points move live. Tier does not.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
--
-- `sync_card_tier` is a pure function of `career_fp` with no floor under it,
-- and `score_week` recomputes `career_fp` from source rows every sweep — which,
-- on a gameday, is every minute. Together those two facts mean a card promotes
-- to silver in the third quarter and demotes again on Tuesday when the provider
-- takes back a catch. Promotion is the thing an owner screenshots; it is the
-- one number in this game that must never be handed over and then withdrawn.
--
-- The fix is not to stop `career_fp` moving. Watching your total climb while
-- your player is on the field is the entire point of live scoring, and the
-- brief for this work was explicit that a started card's TFP should rise as the
-- points land. So the LIVE total and the total TIER IS JUDGED ON become two
-- different columns, and the trigger moves to the second one.
--
--   career_fp   every slot this card has ever filled          -> what you watch
--   settled_fp  the same, restricted to weeks that are over   -> what you keep
--
-- They are equal at every moment except during a week in progress, and the
-- invariant the rest of the schema relies on — tier is a pure function of a
-- stored number, recomputed by trigger, never set by hand — is untouched.
--
-- ---------------------------------------------------------------------------
-- WHY A WHOLE WEEK, AND NOT EACH GAME
-- ---------------------------------------------------------------------------
--
-- Per-game would settle a Thursday starter on Thursday night. It is also the
-- version that is wrong in a way nobody would catch: a card whose player did
-- not appear has no stat line, so there is no game to ask about, and settling
-- it would mean joining out through the player's team to a fixture that may
-- itself have been moved. Week-level needs one fact — are all sixteen games
-- final — and cannot be wrong about a card it has no data for.
--
-- The cost is that tier moves once a week rather than continuously, which on
-- inspection is not a cost at all. Eight starters promoting together on a
-- Tuesday morning is a better moment than eight promotions scattered across
-- five days, and it is a moment that can be built on later.

alter table public.card_instances
  add column if not exists settled_fp numeric(10,2) not null default 0
    check (settled_fp >= 0);

comment on column public.card_instances.career_fp is
  'Every slot this card has filled, including a week still being played. Moves live during games. Display only — tier is judged on settled_fp.';
comment on column public.card_instances.settled_fp is
  'career_fp restricted to weeks whose games are all final. What tier is computed from, so a promotion can never be taken back by a live swing.';

-- The trigger itself is unchanged in body; only what it watches moves. Stated
-- as a full replacement rather than an ALTER so the whole rule reads in one
-- place, which is how 20260818020000 wrote it and how the next person will
-- look for it.
drop trigger if exists card_instances_sync_tier on public.card_instances;

create or replace function public.sync_card_tier()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select t.tier into new.tier
    from public.tier_thresholds t
   where new.settled_fp >= t.min_career_fp
   order by t.sort_order desc
   limit 1;

  -- Below the lowest threshold (or table empty): fall back to the base tier.
  if new.tier is null then
    new.tier := 'bronze';
  end if;

  return new;
end;
$$;

create trigger card_instances_sync_tier
  before insert or update of settled_fp on public.card_instances
  for each row execute function public.sync_card_tier();

-- ------------------------------------------------------------------ lineups
--
-- `scored_at` has quietly changed meaning and the column now says so.
--
-- It was written when scoring happened once, after the week. The live sweep
-- sets it on every pass, so from the first snap of Thursday night it is
-- non-null for a week that has barely started — and the client was reading it
-- as "this week is done", which is how a lineup came to describe itself as
-- scored while the game was in the first quarter.
--
-- Two columns, two questions: when was this last recomputed, and is it over.
alter table public.lineups
  add column if not exists finalized_at timestamptz;

comment on column public.lineups.scored_at is
  'Last time score_week touched this lineup. On a gameday that is a minute ago. NOT a signal that the week is over — see finalized_at.';
comment on column public.lineups.finalized_at is
  'Set once every game in the week is final. Null while the week is still being played. This is the flag a client should gate "final" on.';

-- ---------------------------------------------------------------- score_week
--
-- Steps 1 and 2's slot and total arithmetic are byte-for-byte what they were in
-- 20260818032000. What is new is only the settling: which weeks are over, the
-- second sum restricted to them, and finalized_at.
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
  v_version  integer;
  v_slots    integer;
  v_lineups  integer;
  v_cards    integer;
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
  --    finalized_at is set ONCE and never cleared: a week that has finished
  --    cannot un-finish, and a later stat correction re-runs this function with
  --    v_complete still true. coalesce keeps the original instant rather than
  --    advancing it on every subsequent correction sweep.
  update public.lineups l
     set total_points = coalesce(
           (select sum(ls.points) from public.lineup_slots ls where ls.lineup_id = l.id), 0),
         scored_at = now(),
         finalized_at = case when v_complete then coalesce(l.finalized_at, now()) else l.finalized_at end
   where l.season = p_season and l.season_type = p_season_type and l.week = p_week;
  get diagnostics v_lineups = row_count;

  -- 3. career_fp is the SUM of every slot the card has ever filled, and
  --    settled_fp the same sum over finished weeks only. Both are recomputed
  --    from source, which is what makes this function idempotent: running it
  --    ten times gives the same answer as running it once.
  --
  --    The sweep is global rather than restricted to p_week on purpose. A week
  --    completing is not an event this function is told about — it is simply
  --    true on some later pass than it was on the one before — so every pass
  --    re-asks the question of every week, and a week that finished during the
  --    last five minutes settles on the next tick without anything having to
  --    notice.
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

  return jsonb_build_object(
    'season', p_season, 'season_type', p_season_type, 'week', p_week,
    'rules_version', v_version,
    'week_complete', v_complete,
    'slots_scored', v_slots, 'lineups_scored', v_lineups, 'cards_updated', v_cards
  );
end;
$$;

revoke execute on function public.score_week(integer, smallint, integer) from public, anon, authenticated;

-- ----------------------------------------------------------------- backfill
--
-- Existing cards carry a career_fp earned entirely in weeks that are long
-- final, so settled_fp starts equal to it. Written as its own statement rather
-- than left to the next sweep because the trigger now reads settled_fp: until
-- this runs, every card in the database would be judged on a default of 0 and
-- the whole collection would read bronze.
--
-- The weeks are re-derived rather than assumed, so a card that happens to hold
-- points from the week currently in play settles at the correct, lower figure.
with complete_weeks as (
  select g.season, g.season_type, g.week
    from public.games g
   where g.week is not null
   group by g.season, g.season_type, g.week
  having count(*) filter (where g.status_state is distinct from 'final') = 0
)
update public.card_instances ci
   set settled_fp = agg.settled
  from (
    select ls.card_instance_id,
           coalesce(sum(ls.points) filter (where cw.week is not null), 0) as settled
      from public.lineup_slots ls
      join public.lineups l on l.id = ls.lineup_id
      left join complete_weeks cw
             on cw.season = l.season
            and cw.season_type = l.season_type
            and cw.week = l.week
     group by ls.card_instance_id
  ) agg
 where ci.id = agg.card_instance_id
   and ci.settled_fp is distinct from agg.settled;

-- Lineups from weeks already over are finalized retroactively, so the client's
-- new "is it over" test does not read every historical week as still in play.
update public.lineups l
   set finalized_at = coalesce(l.finalized_at, l.scored_at, l.submitted_at)
 where l.scored_at is not null
   and public.week_is_complete(l.season, l.season_type, l.week);
