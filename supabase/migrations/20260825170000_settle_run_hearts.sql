-- Settling a week against the runs that were exposed to it.
--
-- ---------------------------------------------------------------------------
-- THE WHOLE WEEK NETS OUT AT ONCE, AND THIS IS THE DESIGN
-- ---------------------------------------------------------------------------
--
-- A player can be in several contests on one slate. Settling them one at a
-- time creates a question with no good answer: if the WR Room takes your last
-- heart and the Flex Three you also entered would have healed it, are you dead?
-- Under per-contest settlement the answer depends on which row was processed
-- first, which means it depends on a sort order no player will ever see.
--
-- So the week is one transaction and one delta. Every result on the slate is
-- recorded, summed per run, and applied together — a player who went 1-1 on a
-- last heart with a healing win in the pair survives, and survives for a
-- reason they can reconstruct from their own week. Ordering stops mattering
-- because there is no ordering left.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENCE IS THE PRIMARY KEY, NOT A FLAG
-- ---------------------------------------------------------------------------
--
-- `settle_week_payouts` is on a schedule and is re-run by hand during gameday;
-- everything it calls has to be safe to call again. Here that safety comes from
-- `run_contest_results` having a primary key of (run_id, contest_id) and the
-- insert being `on conflict do nothing ... returning`: the second run inserts
-- nothing, so it RETURNS nothing, so the aggregate is empty and no hearts move.
--
-- Deliberately not a `settled` boolean on the run or a high-water week mark.
-- Both of those are a second fact that can disagree with the first, and the
-- failure mode of getting it wrong is charging a heart twice — which is the
-- single least forgivable bug this feature can have.

create table public.run_contest_results (
  run_id       uuid not null references public.runs on delete cascade,
  contest_id   uuid not null references public.contests on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  lineup_id    uuid not null references public.lineups on delete cascade,
  result       text not null check (result in ('W','L','T')),
  -- Frozen at settlement, like `sold_for` and `committed_for`: re-pricing a
  -- contest later must never rewrite what a run actually paid or was paid.
  hearts_delta smallint not null,
  settled_at   timestamptz not null default now(),
  primary key (run_id, contest_id)
);

create index run_contest_results_user_idx on public.run_contest_results (user_id, settled_at desc);

alter table public.run_contest_results enable row level security;

create policy "own results are readable" on public.run_contest_results
  for select to authenticated using (user_id = auth.uid());

comment on table public.run_contest_results is
  'One row per run per contest, written once. The run''s history, and the thing that makes heart settlement exactly-once.';

-- --------------------------------------------------------------- settlement

create or replace function public.settle_run_week(
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
  v_recorded integer := 0;
  v_died     integer := 0;
begin
  with scored as (
    select l.run_id, c.id as contest_id, l.user_id, l.id as lineup_id, r.result,
           (case when r.result = 'W' then  c.hearts_on_win
                 when r.result = 'L' then -c.hearts_at_risk
                 else 0 end)::smallint as hearts_delta
      from public.contests c
      join public.lineups l
        on l.contest_id = c.id
      join lateral public.contest_results(c.id) r
        on r.lineup_id = l.id
     where c.season = p_season
       and c.season_type = p_season_type
       and c.week = p_week
       -- A contest with nothing at stake settles nothing. The free contest is
       -- scored by the sweep like always; it just never reaches a run.
       and c.hearts_at_risk > 0
       -- An entry filed before this feature existed, or filed into a contest
       -- whose stake was raised above zero after the fact, carries no run and
       -- cannot retroactively be charged for one.
       and l.run_id is not null
       -- Null is NO RESULT — week not final, field too small, did not enter.
       -- It must never reach the ledger, because a row here is permanent.
       and r.result is not null
  ),
  fresh as (
    insert into public.run_contest_results
      (run_id, contest_id, user_id, lineup_id, result, hearts_delta)
    select run_id, contest_id, user_id, lineup_id, result, hearts_delta from scored
    on conflict (run_id, contest_id) do nothing
    returning run_id, result, hearts_delta
  ),
  agg as (
    select run_id,
           count(*) filter (where result = 'W')::integer as wins,
           count(*) filter (where result = 'L')::integer as losses,
           coalesce(sum(hearts_delta), 0)::integer       as delta,
           count(*)::integer                             as rows_written
      from fresh group by run_id
  ),
  applied as (
    update public.runs r
       set wins   = r.wins   + a.wins,
           losses = r.losses + a.losses,
           -- Clamped both ends in one expression. The ceiling is what stops a
           -- long healing streak from banking a run into invulnerability; the
           -- floor is what makes "risk two hearts holding one" legal rather
           -- than a constraint violation.
           hearts = greatest(0, least(r.max_hearts, r.hearts + a.delta))
      from agg a
     where r.id = a.run_id
       -- A run that died on an earlier week still has its later entries
       -- recorded above — they are history — but they cost and pay nothing.
       -- Re-opening a dead run to charge it is how a settled carry gets
       -- silently invalidated.
       and r.ended_at is null
    returning 1
  )
  select coalesce(sum(rows_written), 0) into v_recorded from agg;

  -- Death is its own statement rather than a CASE in the update above, because
  -- it has to see the CLAMPED result. A run that took three hearts of damage
  -- holding one is at zero, not at minus two, and only the stored value knows.
  update public.runs
     set ended_at = now(), ended_reason = 'out_of_hearts'
   where ended_at is null and hearts = 0;
  get diagnostics v_died = row_count;

  return jsonb_build_object(
    'season', p_season, 'season_type', p_season_type, 'week', p_week,
    'results_recorded', v_recorded, 'runs_ended', v_died);
end;
$$;

revoke execute on function public.settle_run_week(integer, smallint, integer) from public, anon, authenticated;

comment on function public.settle_run_week(integer, smallint, integer) is
  'Applies one slate''s contest results to the runs that were exposed to them, as a single netted delta per run. Idempotent: re-running records nothing and moves no hearts.';

-- --------------------------------------------------- into the weekly settle

-- 20260824201100's body with one `perform` added. It goes LAST in the week:
-- the gem awards above it pay for points scored, which a run's death does not
-- change and must not be able to withhold. You are paid for the week you
-- played, and then the week decides whether the run survived it.
create or replace function public.settle_week_payouts(p_season integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season integer;
  v_week   record;
  v_paid   jsonb := '[]'::jsonb;
  v_runs   jsonb;
begin
  v_season := coalesce(p_season, (select max(season) from public.games));
  if v_season is null then
    return jsonb_build_object('settled', 0, 'reason', 'no games');
  end if;
  for v_week in
    select g.season, g.season_type, g.week
      from public.games g
     where g.season = v_season
       and g.week is not null
     group by g.season, g.season_type, g.week
    having count(*) filter (where g.status_state is distinct from 'final') = 0
     order by g.season_type, g.week
  loop
    perform public.grant_weekly_gems(v_week.season, v_week.season_type::smallint, v_week.week);
    perform public.award_score_gems(v_week.season, v_week.season_type::smallint, v_week.week);
    perform public.award_position_bonuses(v_week.season, v_week.season_type::smallint, v_week.week);
    v_runs := public.settle_run_week(v_week.season, v_week.season_type::smallint, v_week.week);
    v_paid := v_paid || jsonb_build_array(
      jsonb_build_object('season_type', v_week.season_type, 'week', v_week.week,
                         'runs', v_runs));
  end loop;
  return jsonb_build_object('season', v_season, 'weeks', v_paid,
                            'settled', jsonb_array_length(v_paid));
end;
$$;

revoke execute on function public.settle_week_payouts(integer) from public, anon, authenticated;
comment on function public.settle_week_payouts(integer) is
  'Pays the weekly grant, the per-point award and the positional bonuses for every complete week of a season, then settles that week against the runs exposed to it. Idempotent throughout: safe to run on a schedule and safe to re-run.';
