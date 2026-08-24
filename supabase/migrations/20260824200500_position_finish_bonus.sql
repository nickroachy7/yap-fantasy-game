-- Paying for being right, not for showing up.
--
-- ---------------------------------------------------------------------------
-- WHY NOT "WHOEVER STARTED THE WEEK'S TOP SCORER"
-- ---------------------------------------------------------------------------
--
-- That was the first shape considered and it is a LOTTERY, not a skill reward.
-- The player who drops 45 in a week is usually a three-touchdown afternoon from
-- somebody nobody would roster on purpose; you cannot aim at it, so it cannot
-- teach anyone which players to keep. In a small league it also pays either
-- nobody or everybody, which is the worst property a headline prize can have.
--
-- What IS aimable is POSITIONAL FINISH. "I think this receiver is a top-3
-- receiver this week" is a real read, it is checkable, and it fires every
-- single week for somebody. So the bonus below is a ladder on the player's
-- rank within their own position that week, and the league-wide MVP survives
-- only as a small extra on top: the confetti, not the mechanic.
--
-- ---------------------------------------------------------------------------
-- SIZING, AGAINST THE 150 FLAT GRANT
-- ---------------------------------------------------------------------------
--
--   #1 at position   100
--   top 3             40
--   top 10            15
--   league MVP       150  (stacks with the #1 above, so an MVP start is 250)
--
-- A sharp week hits one #1 and a couple of top-10s — about 130, which sits just
-- under the flat grant, so skill can roughly double the fixed half of income
-- without ever eclipsing the per-point rate that pays for points themselves. A
-- flat week hits nothing. An exceptional week can exceed the grant, and should.
--
-- RANKED OVER EVERY PLAYER WHO SCORED, not merely over rostered cards. A bonus
-- ranked within the league's own collections would get easier as the game got
-- smaller, and would mean two players could hold the same card in the same week
-- and be told different things about how it did.
--
-- ZERO IS NOT A RANK. Players who did not score are excluded before ranking, so
-- a position where eleven people scored does not hand out top-10 money to
-- someone who posted nothing. Ties share the better rank, as rank() does.

-- ---------------------------------------------------------------- the ladder

create table if not exists public.position_bonus_tiers (
  max_rank    integer primary key check (max_rank > 0),
  reward_gems integer not null check (reward_gems >= 0),
  label       text    not null
);

alter table public.position_bonus_tiers enable row level security;

drop policy if exists "position bonus tiers are readable" on public.position_bonus_tiers;
create policy "position bonus tiers are readable"
  on public.position_bonus_tiers for select to authenticated
  using (true);

insert into public.position_bonus_tiers (max_rank, reward_gems, label) values
  (1,  100, 'Best at position'),
  (3,   40, 'Top 3 at position'),
  (10,  15, 'Top 10 at position')
on conflict (max_rank) do update
  set reward_gems = excluded.reward_gems,
      label       = excluded.label;

comment on table public.position_bonus_tiers is
  'Gem ladder for a started card''s finish within its own position that week. Lowest matching max_rank wins. Tunable with an UPDATE.';

insert into public.game_config (key, value, description) values
  ('mvp_bonus_gems', 150,
   'Extra gems for starting the single highest-scoring player in football that week. Stacks with the #1-at-position bonus.')
on conflict (key) do update
  set value = excluded.value, description = excluded.description, updated_at = now();

-- ---------------------------------------------------------------- stamping

alter table public.lineup_slots
  add column if not exists position_rank integer,
  add column if not exists bonus_gems    integer,
  add column if not exists was_week_mvp  boolean;

comment on column public.lineup_slots.position_rank is
  'Where this card''s player finished among everyone who scored at their position that week. Null until the week is awarded, or if they scored nothing.';
comment on column public.lineup_slots.bonus_gems is
  'Position-finish plus MVP gems this start paid, on top of gems_awarded.';

-- ---------------------------------------------------------------- the award

create or replace function public.award_position_bonuses(
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
  v_mvp     integer;
  v_slots   integer;
  v_pos     bigint;
  v_mvps    bigint;
begin
  select version into v_version from public.scoring_rules where is_active limit 1;
  if v_version is null then
    raise exception 'no active scoring rules' using errcode = '22023';
  end if;

  -- Same gate, same reason as award_score_gems: ranks computed over a partial
  -- slate would be stamped and never revisited.
  if not public.week_is_complete(p_season, p_season_type, p_week) then
    return jsonb_build_object(
      'week', p_week, 'awarded_to', 0, 'skipped', 'week is not complete');
  end if;

  v_mvp := public.game_config_value('mvp_bonus_gems', 150);

  with scored_players as (
    select pl.id                       as player_id,
           pl.position_abbreviation    as pos,
           sum(fp.points)              as pts
      from public.stat_lines sl
      join public.fantasy_points fp on fp.stat_line_id = sl.id
                                   and fp.rules_version = v_version
      join public.players pl on pl.id = sl.player_id
     where sl.season = p_season
       and sl.season_type = p_season_type
       and sl.week = p_week
       and pl.position_abbreviation is not null
     group by pl.id, pl.position_abbreviation
    having sum(fp.points) > 0            -- zero is not a rank
  ),
  ranked as (
    select player_id, pos, pts,
           rank() over (partition by pos order by pts desc) as pos_rank,
           rank() over (order by pts desc)                  as overall_rank
      from scored_players
  ),
  slot_bonus as (
    select ls.id,
           l.user_id,
           r.pos_rank,
           (r.overall_rank = 1)                                  as is_mvp,
           coalesce(ladder.reward_gems, 0)
             + case when r.overall_rank = 1 then v_mvp else 0 end as gems
      from public.lineup_slots ls
      join public.lineups        l  on l.id  = ls.lineup_id
      join public.card_instances ci on ci.id = ls.card_instance_id
      join public.cards          cd on cd.id = ci.card_id
      join ranked                r  on r.player_id = cd.player_id
      -- Lowest matching rung wins: rank 2 matches max_rank 3 and 10, and 3 is
      -- the one that pays.
      left join lateral (
        select pb.reward_gems
          from public.position_bonus_tiers pb
         where r.pos_rank <= pb.max_rank
         order by pb.max_rank asc
         limit 1
      ) ladder on true
     where l.season = p_season
       and l.season_type = p_season_type
       and l.week = p_week
       and l.scored_at is not null
       and ls.bonus_gems is null
  ),
  stamped as (
    update public.lineup_slots ls
       set position_rank = sb.pos_rank,
           bonus_gems    = sb.gems,
           was_week_mvp  = sb.is_mvp
      from slot_bonus sb
     where ls.id = sb.id
    returning ls.id
  )
  select count(*) into v_slots from stamped;

  -- Two ledger rows per user, because the two answer different questions and a
  -- combined row could not be re-tuned independently. See the enum migrations.
  with paid as (
    select l.user_id,
           sum(coalesce(ls.bonus_gems, 0)) filter (where not coalesce(ls.was_week_mvp, false))
             + sum(greatest(0, coalesce(ls.bonus_gems, 0) - v_mvp)) filter (where coalesce(ls.was_week_mvp, false))
             as position_gems,
           (count(*) filter (where coalesce(ls.was_week_mvp, false)) * v_mvp) as mvp_gems
      from public.lineups l
      join public.lineup_slots ls on ls.lineup_id = l.id
     where l.season = p_season
       and l.season_type = p_season_type
       and l.week = p_week
       and l.scored_at is not null
     group by l.user_id
  ),
  rows_to_write as (
    select user_id, position_gems::integer as amount, 'position_bonus'::public.gem_reason as reason,
           format('position_bonus:%s:%s:%s:%s', user_id, p_season, p_season_type, p_week) as key
      from paid where position_gems > 0
    union all
    select user_id, mvp_gems::integer, 'mvp_bonus'::public.gem_reason,
           format('mvp_bonus:%s:%s:%s:%s', user_id, p_season, p_season_type, p_week)
      from paid where mvp_gems > 0
  ),
  inserted as (
    insert into public.gems_ledger (user_id, amount, reason, idempotency_key)
    select r.user_id, r.amount, r.reason, r.key from rows_to_write r
    on conflict (idempotency_key) where idempotency_key is not null
      do nothing
    returning user_id, amount, reason
  ),
  moved as (
    update public.gem_balances gb
       set balance = gb.balance + i.amount, updated_at = now()
      from inserted i
     where gb.user_id = i.user_id
    returning i.amount, i.reason
  )
  select coalesce(sum(amount) filter (where reason = 'position_bonus'), 0),
         coalesce(sum(amount) filter (where reason = 'mvp_bonus'), 0)
    into v_pos, v_mvps
    from moved;

  return jsonb_build_object(
    'week', p_week, 'slots_priced', v_slots,
    'position_gems', v_pos, 'mvp_gems', v_mvps);
end;
$$;

revoke execute on function public.award_position_bonuses(integer, smallint, integer) from public, anon, authenticated;

comment on function public.award_position_bonuses(integer, smallint, integer) is
  'Pays each started card for where its player finished within its position that week, plus an MVP extra for the week''s overall top scorer. Idempotent; refuses until the week is complete.';
