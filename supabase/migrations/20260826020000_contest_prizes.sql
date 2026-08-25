-- A paid contest pays gems, and the pool is the fees it collected.
--
-- ---------------------------------------------------------------------------
-- WHY THERE HAS TO BE A PRIZE AT ALL
-- ---------------------------------------------------------------------------
--
-- `20260825050000` priced the entry at 40 gems and left the reward side empty
-- on purpose: what an entry bought was career_fp on three cards that were
-- earning nothing, which is the one currency packs cannot sell. That is still
-- the REASON to enter and this migration does not change it.
--
-- What it fixes is that a contest you pay gems for has to be able to pay gems
-- back. Not because the expected value demands it — it does not, see the
-- ceiling below — but because "spend 40 gems, win nothing denominated in gems"
-- is a trade a player has no way to price. Tier is a slow, invisible return;
-- a pool is the visible one that makes the slow one worth waiting for. You
-- enter to level cards up and you hope to win gems.
--
-- ---------------------------------------------------------------------------
-- 25%, AND WHY IT CANNOT BE MUCH MORE
-- ---------------------------------------------------------------------------
--
-- The same arithmetic that set the fee sets the pool, and it runs the other
-- way. From `20260825050000`: a flex-three entry is filled from the BENCH by
-- construction, ~6.5 a card, ~20 points a week, and `award_score_gems` pays
-- 1.5 a point at a bronze multiplier — **about 30 gems back** on a 40 gem fee.
-- Every entrant collects that whether they win or lose.
--
-- So the marginal entry is already about −10 gems, and that is the entire
-- budget a prize can spend before entering becomes gem-POSITIVE:
--
--     expected prize per entrant <= 10 gems  ==  25% of a 40 gem fee
--
-- Past that, the contest stops being a place you take three benched cards to
-- earn tier and becomes an arbitrage you run with your three WORST cards,
-- which is precisely the failure `20260825050000` priced the fee to prevent.
-- The other 75% is not rake for its own sake: it is the sink that was the
-- point of charging in the first place.
--
-- STORED IN BASIS POINTS, PER CONTEST, because 25% is a starting position and
-- not a law. A contest with a harsher win condition can justify a fatter pool
-- out of the same fee — most of a `top_n` field loses, so the same 25% is
-- concentrated on fewer players and the WINNER's prize is much larger without
-- the average moving at all. That is the knob; the average is the constraint.
--
-- ---------------------------------------------------------------------------
-- THE POOL IS COLLECTED FEES, NEVER A GRANT
-- ---------------------------------------------------------------------------
--
-- `20260825050000` ends with the rule this migration exists to keep:
--
--     "When prizes land they must come OUT of the fees collected and not from
--      a grant, or this whole calculation inverts."
--
-- So the pool is read from the LEDGER, not computed as `entry_fee_gems ×
-- entrants`. Three things follow, all of them things the multiplication gets
-- wrong:
--
--  - A fee changed after people entered cannot retroactively inflate or shrink
--    a pool. The same reason `leave_contest` reads the ledger to size a refund.
--  - A player who LEFT took their fee with them, and their lineup went with it,
--    so their entry drops out of the pool automatically. There is no cleanup
--    step and no window where the pool is promising gems that have been
--    refunded.
--  - A pool can never exceed what was actually taken, whatever anybody does to
--    the columns. It is not an invariant we maintain; it is one the query
--    cannot express a violation of.
--
-- IN A FOUR-TESTER BETA THIS POOL IS SMALL, and it is meant to be visibly
-- small. Four entries at 40 gems is a 40 gem pool. Topping that up to a
-- respectable-looking number is exactly the grant the rule forbids, and it
-- would invert the maths precisely when the field is thinnest and the
-- arbitrage is easiest. The client draws the live figure and says it grows
-- with the field, which is true and self-correcting.
--
-- ---------------------------------------------------------------------------
-- AND THE BUG FOUND ON THE WAY IN
-- ---------------------------------------------------------------------------
--
-- `my_contest_cards` decided W/L with the MEDIAN rule for every contest,
-- including `top_n` ones. `contest_results` — which is what settlement and the
-- run's hearts actually read — decides `top_n` by rank. So the WR Room's card
-- could show a player a W for beating the middle of the field while settlement
-- recorded the L that took their heart. Two functions answering "did I win"
-- with different rules is the parallel-copy problem with a heart riding on it.
--
-- The card's result is `contest_results` now. It was always the one that
-- counted.

-- ------------------------------------------------------------------ column

alter table public.contests
  add column prize_pool_bps smallint not null default 0
    check (prize_pool_bps between 0 and 10000);

comment on column public.contests.prize_pool_bps is
  'Basis points of the fees this contest COLLECTED that are paid back out as prizes. 2500 = 25%, the ceiling that keeps a marginal entry gem-negative once award_score_gems is counted. The remainder is the sink the fee exists to be.';

-- Every paid contest on the slate, before the constraint below makes it a rule.
update public.contests
   set prize_pool_bps = 2500
 where kind <> 'free' and entry_fee_gems > 0;

-- IF IT COSTS GEMS IT PAYS GEMS. Structural rather than remembered: a future
-- migration seeding a new lobby contest cannot forget the prize side, because
-- the insert fails without it. The free contest collects nothing, so a pool on
-- it could only ever be minted — which is the one thing the rule forbids.
alter table public.contests add constraint contests_paid_contests_pay_out
  check (entry_fee_gems = 0 or prize_pool_bps > 0);

alter table public.contests add constraint contests_free_pays_no_prize
  check (kind <> 'free' or prize_pool_bps = 0);

-- -------------------------------------------------------------------- pool

-- What a contest currently has to pay out.
--
-- SECURITY DEFINER because it counts other people's entries, which RLS hides —
-- the same reason `contest_entrants` is. It returns one integer and never a
-- row, so nothing about who paid what escapes.
create or replace function public.contest_prize_pool(p_contest uuid)
returns integer
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select floor(
           coalesce((
             -- Entry rows are negative; the pool is what was taken. Joined
             -- through `lineups` so a refunded entry — whose lineup was
             -- deleted by `leave_contest` — cannot contribute to a pool it
             -- has taken its gems back out of.
             select -sum(g.amount)
               from public.gems_ledger g
               join public.lineups l on l.id = g.reference_id
              where l.contest_id = p_contest
                and g.reason = 'contest_entry'
           ), 0)::numeric
           * coalesce((select prize_pool_bps from public.contests where id = p_contest), 0)
           / 10000
         )::integer;
$$;

grant execute on function public.contest_prize_pool(uuid) to authenticated;

comment on function public.contest_prize_pool(uuid) is
  'Gems this contest will pay out: the fees it has actually collected, times prize_pool_bps. Read from the ledger so a refunded entry withdraws from the pool and a re-priced contest cannot rewrite it.';

-- ----------------------------------------------------------------- payouts

-- Who gets what out of the pool.
--
-- THE SPLIT IS THE WIN CONDITION'S OWN SHAPE, not a table of percentages:
--
--  - `median` is even money and pays everybody who beat the middle an EQUAL
--    share. Weighting it by rank would be inventing a placing where the
--    contest deliberately has none — it asks one question and half the field
--    answers it correctly.
--  - `top_n` weights by place, `win_rank + 1 - rnk`. Top three comes out
--    3:2:1 — near enough the 50/30/20 anybody would have hand-written, with
--    no constant to keep in step with `win_rank` when it changes.
--
-- NORMALISED BY THE ACTUAL WEIGHTS RATHER THAN A NOMINAL DENOMINATOR, which is
-- what makes ties safe. `contest_results` lets a tie SHARE a place — two
-- players tied at 1 are both rank 1 and rank 2 is vacant — so a fixed
-- denominator would pay out more than the pool holds. Dividing by the weights
-- that exist cannot.
--
-- The floor keeps the remainder in the sink. A pool of 40 split three ways
-- pays 20/13/6 and the last gem stays where the other 75% went.
create or replace function public.contest_payouts(p_contest uuid)
returns table (user_id uuid, lineup_id uuid, rnk bigint, gems integer)
language sql
stable security definer
set search_path = public, pg_temp
as $fn$
  with c as (
    select win_condition, win_rank from public.contests where id = p_contest
  ),
  pool as (select public.contest_prize_pool(p_contest) as gems),
  winners as (
    select r.user_id, r.lineup_id, r.rnk,
           (case when c.win_condition = 'top_n'
                 then greatest(1, c.win_rank + 1 - r.rnk)
                 else 1 end)::numeric as weight
      from public.contest_results(p_contest) r
      cross join c
     -- Null is NO RESULT — week not final, field too small to be a contest.
     -- Nothing is owed until there is a result.
     where r.result = 'W'
  ),
  total as (select sum(weight) as weight from winners)
  select w.user_id, w.lineup_id, w.rnk,
         floor((select gems from pool) * w.weight
               / nullif((select weight from total), 0))::integer
    from winners w
   where (select gems from pool) > 0;
$fn$;

grant execute on function public.contest_payouts(uuid) to authenticated;

comment on function public.contest_payouts(uuid) is
  'One row per winner with the gems they are owed out of the pool. Even split under `median`, weighted by place under `top_n`, normalised by the weights that actually exist so shared places cannot overpay.';

-- ------------------------------------------------------------------- award

-- Paying them, exactly once.
--
-- IDEMPOTENT ON THE LINEUP, like the entry charge it is the other half of. The
-- lineup row IS the entry (`20260825050000`), so `contest_prize:<lineup>` is
-- the natural key for "this entry has been paid" — and it survives a re-run
-- during gameday, which is the whole reason `settle_week_payouts` can be on a
-- schedule and still be run by hand.
create or replace function public.award_contest_prizes(
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
  v_paid integer := 0;
  v_gems bigint  := 0;
begin
  -- Same gate as every other payout on the slate. A prize paid mid-week would
  -- be paid against a field that has not finished moving, and the idempotency
  -- key means nothing would ever correct it.
  if not public.week_is_complete(p_season, p_season_type, p_week) then
    return jsonb_build_object(
      'week', p_week, 'awarded_to', 0, 'skipped', 'week is not complete');
  end if;

  with payable as (
    select p.user_id, p.lineup_id, p.gems,
           format('contest_prize:%s', p.lineup_id) as key
      from public.contests c
      join lateral public.contest_payouts(c.id) p on true
     where c.season = p_season
       and c.season_type = p_season_type
       and c.week = p_week
       and c.prize_pool_bps > 0
       and p.gems > 0
  ),
  inserted as (
    insert into public.gems_ledger (user_id, amount, reason, reference_id, idempotency_key)
    select user_id, gems, 'contest_prize', lineup_id, key from payable
    on conflict (idempotency_key) where idempotency_key is not null
      do nothing
    returning user_id, amount
  ),
  moved as (
    -- Upsert rather than update. A prize is the first gems some accounts will
    -- ever be paid outside the signup bonus, and an UPDATE against a missing
    -- balance row moves nothing and reports success — a prize that appears in
    -- the ledger and never in the wallet.
    insert into public.gem_balances (user_id, balance, updated_at)
    select user_id, amount, now() from inserted
    on conflict (user_id) do update
      set balance = gem_balances.balance + excluded.balance, updated_at = now()
    returning user_id
  )
  select count(*), coalesce(sum(amount), 0) into v_paid, v_gems
    from inserted;

  return jsonb_build_object('week', p_week, 'awarded_to', v_paid, 'gems', v_gems);
end;
$$;

revoke execute on function public.award_contest_prizes(integer, smallint, integer)
  from public, anon, authenticated;

comment on function public.award_contest_prizes(integer, smallint, integer) is
  'Pays every contest prize on a complete week, out of the fees that contest collected. Idempotent on the lineup, like the entry charge it settles.';

-- --------------------------------------------------------------- settlement

-- The week's payouts, with prizes in them.
--
-- Placed after the three faucet awards and before the hearts: gems first, then
-- what the week did to the run. `settle_run_week` is unaffected — a prize
-- cannot save a run and a death cannot cancel a prize, because they settle
-- different ledgers and the entry was paid for either way.
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
    perform public.award_contest_prizes(v_week.season, v_week.season_type::smallint, v_week.week);
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
  'Pays the weekly grant, the per-point award, the positional bonuses and the contest prizes for every complete week of a season, then settles that week against the runs exposed to it. Idempotent throughout: safe to run on a schedule and safe to re-run.';

-- -------------------------------------------------------------------- lobby

-- The lobby, now carrying what a row PAYS as well as what it costs.
--
-- `prize_pool` is the live figure — it grows as people enter, which is the
-- honest way to draw a pool funded by entries and the only way to draw one
-- without promising gems that have not been collected.
drop function if exists public.contest_lobby();

create or replace function public.contest_lobby()
returns table(
  id uuid, code text, kind public.contest_kind, name text,
  format_code text, format_name text, slot_count smallint,
  entry_fee_gems integer, max_entrants integer, entrants integer,
  season integer, season_type smallint, week integer,
  my_lineup_id uuid, my_filled integer, affordable boolean,
  win_condition public.contest_win_condition, win_rank integer,
  hearts_at_risk smallint, hearts_on_win smallint,
  my_hearts smallint,
  prize_pool_bps smallint, prize_pool integer
)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  with slate as (select * from public.lineup_slate() limit 1),
  wallet as (
    select coalesce((select balance from public.gem_balances where user_id = auth.uid()), 0) as balance
  ),
  run as (
    select hearts from public.runs where user_id = auth.uid() and ended_at is null
  )
  select c.id, c.code, c.kind, c.name,
         c.format_code, f.name, f.slot_count,
         c.entry_fee_gems, c.max_entrants,
         public.contest_entrants(c.id),
         c.season, c.season_type, c.week,
         l.id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = l.id), 0),
         (l.id is not null or (select balance from wallet) >= c.entry_fee_gems),
         c.win_condition, c.win_rank,
         c.hearts_at_risk, c.hearts_on_win,
         (select hearts from run),
         c.prize_pool_bps,
         public.contest_prize_pool(c.id)
    from public.contests c
    join slate s
      on s.season = c.season and s.season_type = c.season_type and s.week = c.week
    join public.contest_formats f on f.code = c.format_code
    left join public.lineups l
           on l.contest_id = c.id and l.user_id = auth.uid()
   order by c.kind, c.hearts_at_risk, c.entry_fee_gems, c.name;
$$;

grant execute on function public.contest_lobby() to authenticated;

-- --------------------------------------------------------------- my cards

-- The card for each contest you are in — with the mark its bar should actually
-- draw, and a result that agrees with settlement.
--
-- `cut` IS THE POINT OF THIS REWRITE. Under `top_n` the median decides nothing:
-- a player can sit comfortably above the middle of the field and be sixth in a
-- contest that pays three. The card drew the median regardless, labelled it,
-- and let people read a threshold that could not win them anything. The cut is
-- the lowest score still INSIDE the places that pay, which is the only line on
-- that axis worth crossing. It is null under `median`, where the median is the
-- line and always was.
drop function if exists public.my_contest_cards(text);

create or replace function public.my_contest_cards(p_include text default null)
returns table(
  contest_id uuid, code text, kind public.contest_kind, name text,
  format_code text, format_name text, slot_count smallint,
  entry_fee_gems integer, season integer, season_type smallint, week integer,
  lineup_id uuid, filled integer,
  entrants bigint, low numeric, median numeric, average numeric, high numeric,
  final boolean, my_points numeric, my_rank bigint, ahead bigint, result text,
  hearts_at_risk smallint, hearts_on_win smallint,
  win_condition public.contest_win_condition, win_rank integer, cut numeric,
  prize_pool integer, my_prize integer
)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  with slate as (select * from public.lineup_slate() limit 1),
  mine as (
    select c.*, l.id as lineup_id, l.total_points as my_points
      from public.contests c
      join slate s on s.season = c.season and s.season_type = c.season_type and s.week = c.week
      left join public.lineups l on l.contest_id = c.id and l.user_id = auth.uid()
     where l.id is not null or c.code = p_include
  ),
  entries as (
    select l.contest_id, l.user_id, l.total_points as pts
      from public.lineups l
      join mine m on m.id = l.contest_id
     where exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  field as (
    select e.contest_id,
           count(*) as entrants,
           min(e.pts) as low,
           round((percentile_cont(0.5) within group (order by e.pts::double precision))::numeric, 2) as median,
           round(avg(e.pts), 2) as average,
           max(e.pts) as high
      from entries e
     group by e.contest_id
  ),
  ranked as (
    select e.contest_id, e.user_id, e.pts,
           rank() over (partition by e.contest_id order by e.pts desc) as rnk
      from entries e
  ),
  -- The lowest score still inside the paying places. `min` rather than a
  -- window pick because `rank()` shares places on ties, so the Nth place may
  -- be occupied by two lineups or by none.
  cutline as (
    select r.contest_id, min(r.pts) as cut
      from ranked r
      join mine m on m.id = r.contest_id
     where m.win_condition = 'top_n' and r.rnk <= m.win_rank
     group by r.contest_id
  ),
  finality as (
    select bool_and(lower(coalesce(g.status_state, '')) in ('final','complete','completed')) as final
      from public.games g, slate s
     where g.season = s.season and g.season_type = s.season_type and g.week = s.week
  )
  select m.id, m.code, m.kind, m.name,
         m.format_code, f.name, f.slot_count, m.entry_fee_gems,
         m.season, m.season_type, m.week,
         m.lineup_id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = m.lineup_id), 0),
         coalesce(fl.entrants, 0), fl.low, fl.median, fl.average, fl.high,
         coalesce((select final from finality), false),
         m.my_points,
         r.rnk,
         case when r.pts is null then null
              else (select count(*) from entries x where x.contest_id = m.id and x.pts < r.pts) end,
         -- ONE ANSWER TO "DID I WIN", and it is settlement's. See the header.
         cr.result,
         m.hearts_at_risk, m.hearts_on_win,
         m.win_condition, m.win_rank, cl.cut,
         public.contest_prize_pool(m.id),
         -- Null until the week is final and the places are decided. A running
         -- "you would win 60" is a projection, and this codebase does not sell
         -- projections it cannot stand behind.
         cp.gems
    from mine m
    join public.contest_formats f on f.code = m.format_code
    left join field   fl on fl.contest_id = m.id
    left join ranked  r  on r.contest_id = m.id and r.user_id = auth.uid()
    left join cutline cl on cl.contest_id = m.id
    left join lateral (
      select res.result from public.contest_results(m.id) res
       where res.user_id = auth.uid()
    ) cr on true
    left join lateral (
      select pay.gems from public.contest_payouts(m.id) pay
       where pay.user_id = auth.uid()
    ) cp on true
   order by m.kind, m.entry_fee_gems, m.name;
$$;

grant execute on function public.my_contest_cards(text) to authenticated;
