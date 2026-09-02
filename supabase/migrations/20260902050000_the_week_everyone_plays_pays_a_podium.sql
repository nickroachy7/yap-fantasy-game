-- The contest everybody has to play now pays the people who win it.
--
-- ---------------------------------------------------------------------------
-- THE GAP
-- ---------------------------------------------------------------------------
--
-- The free weekly contest is the one nobody chose to be in, the only one with
-- the season riding on it, and the only one a player has entered every single
-- week. Winning it paid NOTHING. The card said so, once the per-point rate came
-- out of the reward column and left the side empty enough to notice:
--
--     RISK  ♥ 1 heart          WIN  Season record
--
-- A heart on the table against a line in a table. Meanwhile every paid row in
-- the lobby now has a real pool behind it (`20260901020000`), so the weekly
-- contest — the one with the most entrants, the most history and the most
-- attention on it — was the worst-rewarded thing in the game.
--
-- The game does already pay for playing well, and it is worth being precise
-- about what it pays for, because this is not a duplicate of it:
--
--   award_score_coins       per CARD, for the points it scored
--   award_position_bonuses  per CARD, for finishing top of its position
--   mvp_bonus               per CARD, for being the week's highest scorer
--
-- Every one of those is about a player you rostered. NOTHING has ever paid for
-- the thing the game is actually asking you to do, which is assemble the best
-- TEAM in the field. This does.
--
-- ---------------------------------------------------------------------------
-- WHY THIS COIN IS MINTED, AND WHY THAT IS NOT THE RULE BEING BROKEN
-- ---------------------------------------------------------------------------
--
-- `20260825050000` and `20260826020000` set a hard rule: a contest prize comes
-- out of the fees that contest COLLECTED and never from a grant. This podium is
-- minted — the free contest collects nothing — so it has to be squared with
-- that rule rather than waved past it.
--
-- The rule exists to stop ARBITRAGE. Its exact failure mode is a paid contest
-- that pays back more than it takes: enter with three worthless cards, collect
-- more than the fee, repeat. Everything about it is about the relationship
-- between a FEE and a PAYOUT.
--
-- The free contest has no fee. There is nothing to arbitrage, no worst-cards
-- strategy that beats it, and no way to enter it twice — it is one entry per
-- account per week, automatically, and `20260825010000`'s unique index makes a
-- second one impossible. What is left is a faucet, and this game already has
-- four (the weekly grant, the per-point award, the position bonuses, the daily
-- pack). This is a fifth, and it is the most skill-weighted of them: you cannot
-- receive it by turning up.
--
-- The rule that DOES bind is `contests_free_pays_no_prize`, which forbids a
-- `prize_pool_bps` on a free contest. That constraint stands untouched and is
-- still right: bps means "a share of collected fees", and a share of nothing
-- funded by minting is exactly the confusion it prevents. The podium is a
-- different column with a different name for a different kind of money.
--
-- ---------------------------------------------------------------------------
-- A FIXED POT, NOT A PER-ENTRANT ONE
-- ---------------------------------------------------------------------------
--
-- Minted money must not scale with the field or the game inflates as it grows,
-- and the inflation would arrive exactly when there are most people to feel it.
-- So the pot is a flat weekly figure and the FIELD SIZE changes how hard it is
-- to win rather than how much is won. At seven accounts the podium is a real
-- chance; at seven hundred it is a genuine achievement, and it costs the
-- economy the same either way.
--
-- 700 COINS, AND THE NUMBER COMES FROM THE PACK SHELF. A Pro Pack is 400. A
-- week's income for an active account is roughly 450–600 (150 grant, ~145 of
-- per-point on a full lineup, dailies, the odd bonus). So:
--
--   1st   382    a Pro Pack, with change
--   2nd   191
--   3rd   127
--
-- Winning your week buys the best thing on the shelf. That is the sentence this
-- is sized to make true, and it is why the figure is not larger: at a level
-- where first place is worth two Pro Packs, the weekly contest starts to
-- out-earn everything else in the game and the rest of the economy becomes
-- decoration.
--
-- The split is the `steep` curve from `20260901020000` — weights 1, 1/2, 1/3 —
-- so it is the same arithmetic the tournament rows use rather than a second
-- ladder to keep in step.
--
-- ---------------------------------------------------------------------------
-- PAID BY RANK, WHICH IS NOT THIS CONTEST'S WIN CONDITION
-- ---------------------------------------------------------------------------
--
-- This is the one genuinely delicate thing here.
--
-- The free contest is scored on the MEDIAN and it has to stay that way. That is
-- what `median_record` reads for the season record, and it is what decides the
-- heart — `20260825130000` chose it deliberately, because a top-three rule on
-- the contest nobody can leave would take a heart off nearly everyone every
-- week and kill the median player's run in a handful of weeks for no reason
-- they could name.
--
-- So the podium CANNOT be the win condition. A player who finishes fourth still
-- beat the median, still records a W, still keeps their heart — and wins no
-- coins. Those are two different questions about one week and they are allowed
-- to have different answers:
--
--   did you beat the field's middle   -> your record, your heart
--   were you one of the best three    -> the podium
--
-- Hence a separate function rather than a branch inside `contest_payouts`.
-- Folding it in would mean the fee-funded path and the minted path sharing a
-- rank rule that only one of them wants.
--
-- ---------------------------------------------------------------------------
-- THERE MUST BE SOMEBODY TO BEAT
-- ---------------------------------------------------------------------------
--
-- Places paid is `least(podium_places, entrants - 1)`, so a contest of one pays
-- nobody and a contest of two pays only its winner. Without it, the first
-- account to file in a quiet week would collect 382 coins for being the only
-- entry — which is the closest thing to an exploit this design has, and it is
-- arithmetic rather than vigilance that closes it.
--
-- Ties share a place, exactly as `contest_results` lets them (`rank()`), and
-- the payout normalises by the weights that actually exist — so two players
-- tied at first take equal halves of the first two rungs rather than the pot
-- paying out more than it holds.

-- ------------------------------------------------------------------ columns

alter table public.contests
  add column if not exists podium_coins  integer  not null default 0
    check (podium_coins >= 0),
  add column if not exists podium_places smallint not null default 0
    check (podium_places >= 0);

alter table public.contest_templates
  add column if not exists podium_coins  integer  not null default 0
    check (podium_coins >= 0),
  add column if not exists podium_places smallint not null default 0
    check (podium_places >= 0);

-- A pot with no places to pay, or places with no pot, is a seed that looks
-- configured and is not — the failure `20260825130000` built its win_rank
-- constraint to prevent.
alter table public.contests add constraint contests_podium_is_whole
  check ((podium_coins > 0) = (podium_places > 0));
alter table public.contest_templates add constraint contest_templates_podium_is_whole
  check ((podium_coins > 0) = (podium_places > 0));

comment on column public.contests.podium_coins is
  'A MINTED weekly pot paid to the top finishers by rank, independent of win_condition. Flat rather than per-entrant so the field size changes how hard it is to win, not how much. Distinct from prize_pool_bps, which is a share of collected fees.';
comment on column public.contests.podium_places is
  'How many places the podium pays. Actual places paid is least(this, entrants - 1), so there is always somebody to have beaten.';

-- -------------------------------------------------------------------- payout

create or replace function public.contest_podium_payouts(p_contest uuid)
returns table (user_id uuid, lineup_id uuid, rnk bigint, coins integer)
language sql
stable security definer
set search_path = public, pg_temp
as $fn$
  with c as (
    select id, season, season_type, week, podium_coins, podium_places
      from public.contests where id = p_contest and podium_coins > 0
  ),
  -- A lineup row with no slots is not an entrant, for the same reason
  -- `contest_results` says so: `set_lineup` writes the row before the slots.
  entries as (
    select l.id, l.user_id, l.total_points as pts
      from public.lineups l
      join c on c.id = l.contest_id
     where exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  final as (
    select bool_and(lower(coalesce(g.status_state,'')) in ('final','complete','completed')) as done
      from public.games g, c
     where g.season = c.season and g.season_type = c.season_type and g.week = c.week
  ),
  ranked as (
    select e.id, e.user_id, e.pts,
           rank() over (order by e.pts desc) as rnk,
           count(*) over ()                  as entrants
      from entries e
  ),
  paid as (
    select r.*, least(c.podium_places, r.entrants - 1) as places
      from ranked r cross join c
     where coalesce((select done from final), false)
  ),
  -- The `steep` curve: weights 1, 1/2 … 1/p. Same arithmetic as
  -- `contest_payouts`, deliberately, rather than a second ladder.
  winners as (
    select p.user_id, p.id as lineup_id, p.rnk, p.places,
           (1.0 / p.rnk)::numeric as weight
      from paid p
     where p.places > 0 and p.rnk <= p.places
  ),
  total as (select sum(weight) as weight from winners)
  select w.user_id, w.lineup_id, w.rnk,
         floor((select podium_coins from c) * w.weight
               / nullif((select weight from total), 0))::integer
    from winners w;
$fn$;

revoke execute on function public.contest_podium_payouts(uuid) from public, anon;
grant  execute on function public.contest_podium_payouts(uuid) to authenticated;

comment on function public.contest_podium_payouts(uuid) is
  'One row per podium finisher with the minted coins they are owed. Ranked on points regardless of the contest win condition, steeply split, and never paying a place nobody had to beat.';

-- --------------------------------------------------------------------- award

create or replace function public.award_weekly_podium(
  p_season integer, p_season_type smallint, p_week integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_paid integer := 0; v_coins bigint := 0;
begin
  -- The same gate as every other payout on the slate: a podium settled against
  -- a field still moving would be keyed and never corrected.
  if not public.week_is_complete(p_season, p_season_type, p_week) then
    return jsonb_build_object('week', p_week, 'awarded_to', 0,
                              'skipped', 'week is not complete');
  end if;

  with payable as (
    select p.user_id, p.lineup_id, p.coins,
           format('weekly_podium:%s', p.lineup_id) as key
      from public.contests c
      join lateral public.contest_podium_payouts(c.id) p on true
     where c.season = p_season and c.season_type = p_season_type and c.week = p_week
       and c.podium_coins > 0 and p.coins > 0
  ),
  inserted as (
    insert into public.coins_ledger (user_id, amount, reason, reference_id, idempotency_key)
    select user_id, coins, 'weekly_podium', lineup_id, key from payable
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning user_id, amount
  ),
  -- Upsert, for the reason `award_contest_prizes` gives: an UPDATE against a
  -- missing balance row moves nothing and reports success.
  moved as (
    insert into public.coin_balances (user_id, balance, updated_at)
    select user_id, amount, now() from inserted
    on conflict (user_id) do update
      set balance = coin_balances.balance + excluded.balance, updated_at = now()
    returning user_id
  )
  select count(*), coalesce(sum(amount), 0) into v_paid, v_coins from inserted;

  return jsonb_build_object('week', p_week, 'awarded_to', v_paid, 'coins', v_coins);
end;
$$;

revoke execute on function public.award_weekly_podium(integer, smallint, integer)
  from public, anon, authenticated;

comment on function public.award_weekly_podium(integer, smallint, integer) is
  'Pays the minted podium on every contest that has one, for a complete week. Idempotent on the lineup, like every other payout on the slate.';

-- ---------------------------------------------------------------- settlement

-- `settle_week_payouts` with the podium in it, read back from the database with
-- pg_get_functiondef and changed in exactly one line. Placed after the contest
-- prizes and before the hearts: all coin, then what the week did to the run.
CREATE OR REPLACE FUNCTION public.settle_week_payouts(p_season integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    perform public.grant_weekly_coins(v_week.season, v_week.season_type::smallint, v_week.week);
    perform public.award_score_coins(v_week.season, v_week.season_type::smallint, v_week.week);
    perform public.award_position_bonuses(v_week.season, v_week.season_type::smallint, v_week.week);
    perform public.award_contest_prizes(v_week.season, v_week.season_type::smallint, v_week.week);
    perform public.award_weekly_podium(v_week.season, v_week.season_type::smallint, v_week.week);
    v_runs := public.settle_run_week(v_week.season, v_week.season_type::smallint, v_week.week);
    v_paid := v_paid || jsonb_build_array(
      jsonb_build_object('season_type', v_week.season_type, 'week', v_week.week,
                         'runs', v_runs));
  end loop;
  return jsonb_build_object('season', v_season, 'weeks', v_paid,
                            'settled', jsonb_array_length(v_paid));
end;
$function$;

-- --------------------------------------------------------------------- reads

-- Both read functions widened by the same two columns and nothing else, taken
-- from the live definitions rather than from a migration file — the rule
-- `20260825010000` set after rebuilding `set_lineup` from a stale copy twice.
drop function if exists public.contest_lobby();
CREATE OR REPLACE FUNCTION public.contest_lobby()
 RETURNS TABLE(id uuid, code text, kind contest_kind, name text, format_code text, format_name text, slot_count smallint, entry_fee_coins integer, max_entrants integer, entrants integer, season integer, season_type smallint, week integer, my_lineup_id uuid, my_filled integer, affordable boolean, win_condition contest_win_condition, win_rank integer, hearts_at_risk smallint, hearts_on_win smallint, my_hearts smallint, prize_pool_bps smallint, prize_pool integer, recap boolean, payout_curve contest_payout_curve, win_pct smallint, target_points numeric, score_rate numeric, podium_coins integer, podium_places smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with slate as (select * from public.lineup_slate() limit 1),
  past as (select * from public.recap_slate() limit 1),
  wallet as (
    select coalesce((select balance from public.coin_balances where user_id = auth.uid()), 0) as balance
  ),
  run as (
    select hearts from public.runs where user_id = auth.uid() and ended_at is null
  ),
  rows as (
    select c.*, false as recap
      from public.contests c
      join slate s
        on s.season = c.season and s.season_type = c.season_type and s.week = c.week
    union all
    select c.*, true
      from public.contests c
      join past p
        on p.season = c.season and p.season_type = c.season_type and p.week = c.week
     where exists (
       select 1 from public.lineups l
        where l.contest_id = c.id and l.user_id = auth.uid()
     )
  )
  select c.id, c.code, c.kind, c.name,
         c.format_code, f.name, f.slot_count,
         c.entry_fee_coins, c.max_entrants,
         public.contest_entrants(c.id),
         c.season, c.season_type, c.week,
         l.id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = l.id), 0),
         (l.id is not null or (select balance from wallet) >= c.entry_fee_coins),
         c.win_condition, c.win_rank,
         c.hearts_at_risk, c.hearts_on_win,
         (select hearts from run),
         c.prize_pool_bps,
         public.contest_prize_pool(c.id),
         c.recap,
         c.payout_curve,
         c.win_pct, c.target_points,
         -- The baseline, carried on every row so the reward column never has to
         -- hardcode it. Same number on every contest, which is the entire point
         -- — see `20260901010000`.
         public.score_rate(),
         c.podium_coins, c.podium_places
    from rows c
    join public.contest_formats f on f.code = c.format_code
    left join public.lineups l
           on l.contest_id = c.id and l.user_id = auth.uid()
   -- Free first, then cheapest, then by name. The fee is the ladder a player
   -- reads the lobby down, so it leads once the free rows are past.
   order by c.recap, c.kind, c.entry_fee_coins, c.name;
$function$;

revoke execute on function public.contest_lobby() from public, anon;
grant  execute on function public.contest_lobby() to authenticated;

drop function if exists public.my_contest_cards(text);
CREATE OR REPLACE FUNCTION public.my_contest_cards(p_include text DEFAULT NULL::text)
 RETURNS TABLE(contest_id uuid, code text, kind contest_kind, name text, format_code text, format_name text, slot_count smallint, entry_fee_coins integer, season integer, season_type smallint, week integer, lineup_id uuid, filled integer, entrants bigint, low numeric, median numeric, average numeric, high numeric, final boolean, my_points numeric, my_rank bigint, ahead bigint, result text, hearts_at_risk smallint, hearts_on_win smallint, win_condition contest_win_condition, win_rank integer, cut numeric, prize_pool integer, my_prize integer, my_coins integer, recap boolean, payout_curve contest_payout_curve, win_pct smallint, target_points numeric, score_rate numeric, podium_coins integer, podium_places smallint, my_podium integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with slate as (select * from public.lineup_slate() limit 1),
  past as (select * from public.recap_slate() limit 1),
  mine as (
    select c.*, l.id as lineup_id, l.total_points as my_points, false as recap
      from public.contests c
      join slate s on s.season = c.season and s.season_type = c.season_type and s.week = c.week
      left join public.lineups l on l.contest_id = c.id and l.user_id = auth.uid()
     where l.id is not null or c.code = p_include or c.kind = 'free'
    union all
    select c.*, l.id, l.total_points, true
      from public.contests c
      join past p on p.season = c.season and p.season_type = c.season_type and p.week = c.week
      join public.lineups l on l.contest_id = c.id and l.user_id = auth.uid()
  ),
  entries as (
    select l.contest_id, l.user_id, l.total_points as pts
      from public.lineups l
      join mine m on m.id = l.contest_id
     where exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  field as (
    select e.contest_id, count(*) as entrants, min(e.pts) as low,
           round((percentile_cont(0.5) within group (order by e.pts::double precision))::numeric, 2) as median,
           round(avg(e.pts), 2) as average, max(e.pts) as high
      from entries e group by e.contest_id
  ),
  ranked as (
    select e.contest_id, e.user_id, e.pts,
           rank() over (partition by e.contest_id order by e.pts desc) as rnk
      from entries e
  ),
  -- The last paying place, however this contest decides how many there are.
  -- Same floor-and-at-least-one as `contest_results`, deliberately the same
  -- arithmetic rather than the same constant.
  places as (
    select m.id as contest_id,
           case m.win_condition
             when 'top_n'   then m.win_rank::bigint
             when 'top_pct' then greatest(1, floor(coalesce(fl.entrants, 0) * m.win_pct / 100.0))::bigint
           end as cut_rank
      from mine m
      left join field fl on fl.contest_id = m.id
  ),
  cutline as (
    select r.contest_id, min(r.pts) as cut
      from ranked r
      join places p on p.contest_id = r.contest_id
     where p.cut_rank is not null and r.rnk <= p.cut_rank
     group by r.contest_id
  ),
  -- A ONE-PLACE CONTEST HAS NO CUT TO SPEAK OF, and taking one degenerates.
  --
  -- `cutline` is "the lowest score still inside the paying places", which is
  -- exactly right at three places and nonsense at one: the only score inside
  -- the places is the leader's, so the leader is drawn against THEMSELVES —
  -- their own total on both sides of the scoreboard and a margin of zero. The
  -- Duel (`20260901050000`) is the first contest to pay one place, so this has
  -- never fired before.
  --
  -- The honest line where one place pays is the best score that is not yours.
  -- Second sees the leader they have to catch; the leader sees the runner-up
  -- they have to stay above. Both are the number that decides it, which is what
  -- this column is for.
  sololine as (
    select r.contest_id, max(r.pts) as cut
      from ranked r
      join places p on p.contest_id = r.contest_id
     where p.cut_rank = 1
       and r.user_id is distinct from auth.uid()
     group by r.contest_id
  )
  select m.id, m.code, m.kind, m.name,
         m.format_code, f.name, f.slot_count, m.entry_fee_coins,
         m.season, m.season_type, m.week, m.lineup_id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = m.lineup_id), 0),
         coalesce(fl.entrants, 0), fl.low, fl.median, fl.average, fl.high,
         coalesce(fin.final, false), m.my_points, r.rnk,
         case when r.pts is null then null
              else (select count(*) from entries x where x.contest_id = m.id and x.pts < r.pts) end,
         cr.result, m.hearts_at_risk, m.hearts_on_win,
         m.win_condition, m.win_rank,
         -- A target is known before a ball is thrown; a cut is not known until
         -- the field has scored. Both are "the number to beat".
         case when m.win_condition = 'target' then m.target_points
              else coalesce(sl.cut, cl.cut) end,
         public.contest_prize_pool(m.id),
         cp.coins,
         (select sum(coalesce(ls.coins_awarded, 0) + coalesce(ls.bonus_coins, 0))::integer
            from public.lineup_slots ls
           where ls.lineup_id = m.lineup_id and ls.coins_awarded is not null),
         m.recap,
         m.payout_curve, m.win_pct, m.target_points, public.score_rate(),
         m.podium_coins, m.podium_places, pod.coins
    from mine m
    join public.contest_formats f on f.code = m.format_code
    left join field fl on fl.contest_id = m.id
    left join ranked r on r.contest_id = m.id and r.user_id = auth.uid()
    left join cutline cl on cl.contest_id = m.id
    left join sololine sl on sl.contest_id = m.id
    left join lateral (
      select bool_and(lower(coalesce(g.status_state, '')) in ('final','complete','completed')) as final
        from public.games g
       where g.season = m.season and g.season_type = m.season_type and g.week = m.week
    ) fin on true
    left join lateral (
      select res.result from public.contest_results(m.id) res where res.user_id = auth.uid()
    ) cr on true
    left join lateral (
      select pay.coins from public.contest_payouts(m.id) pay where pay.user_id = auth.uid()
    ) cp on true
    left join lateral (
      select p.coins from public.contest_podium_payouts(m.id) p where p.user_id = auth.uid()
    ) pod on true
   order by m.recap, m.kind, m.entry_fee_coins, m.name;
$function$;

revoke execute on function public.my_contest_cards(text) from public, anon;
grant  execute on function public.my_contest_cards(text) to authenticated;

-- --------------------------------------------------------------------- seeds

-- THE FREE CONTEST, on every week that has not kicked off. The template table
-- does not own this row — `ensure_free_contest` creates it — so the seed is an
-- update against the contests themselves, on the same `week_has_started` line
-- every re-terming in this series has used.
update public.contests c
   set podium_coins = 700, podium_places = 3
 where c.kind = 'free'
   and not public.week_has_started(c.season, c.season_type, c.week);

-- THE WARM-UP, at a tenth of the size and one place.
--
-- It is the other contest with no fee, and removing `hearts_on_win` took away
-- the only thing it paid — it was built as "the one place a heart can be won
-- without being risked" (`20260901060000`) and that sentence is now false. Left
-- alone it would be a row offering nothing at all.
--
-- 100 to a single winner, which is a Standard Pack. Deliberately not a third of
-- the weekly podium: this is three cards against a fixed bar with no fee and no
-- heart at stake, so it is the softest offer in the lobby and is priced like
-- one. What it is FOR is unchanged — a target settles for a single entrant
-- where median and top-N cannot, so it is the row that still works in a thin
-- week, and now it pays for clearing the bar as well as saying you did.
--
-- One place rather than three because at three cards and no stake the field is
-- shallow; paying a podium there would spread a small pot into rounding.
update public.contest_templates
   set podium_coins = 100, podium_places = 1
 where code = 'warmup';

update public.contests c
   set podium_coins = 100, podium_places = 1
  from public.contest_templates t
 where t.code = 'warmup'
   and c.code like 'warmup:%'
   and not public.week_has_started(c.season, c.season_type, c.week);

-- `ensure_free_contest` must create future weeks already carrying it, or a week
-- slated after today would quietly be the one week with no podium.
create or replace function public.ensure_free_contest(
  p_season integer, p_season_type smallint, p_week integer)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id   uuid;
  v_code text := format('free:%s:%s:%s', p_season, p_season_type, p_week);
begin
  select id into v_id from public.contests where code = v_code;
  if v_id is not null then return v_id; end if;

  insert into public.contests (code, kind, format_code, season, season_type, week, name,
                               hearts_at_risk, hearts_on_win, podium_coins, podium_places)
  values (v_code, 'free', 'main', p_season, p_season_type, p_week,
          case when p_season_type = 1 then format('Preseason Week %s', p_week)
               else format('Week %s', p_week) end,
          1, 0, 700, 3)
  on conflict (code) do nothing
  returning id into v_id;

  if v_id is null then select id into v_id from public.contests where code = v_code; end if;
  return v_id;
end;
$fn$;

revoke execute on function public.ensure_free_contest(integer, smallint, integer) from public, anon;
grant  execute on function public.ensure_free_contest(integer, smallint, integer) to authenticated;

-- ---------------------------------------------------------------- assertions

do $$
declare v_n integer; v_top integer;
begin
  select count(*) into v_n from public.contests
   where kind = 'free' and podium_coins = 700 and podium_places = 3
     and not public.week_has_started(season, season_type, week);
  if v_n = 0 then raise exception 'no free contest carries a podium'; end if;

  -- NO ROW MAY OFFER NOTHING. A contest with no fee, no podium and no heart to
  -- win is a lobby row with an empty reward column, which is what removing
  -- hearts_on_win did to The Warm-Up. This is the check that catches the next
  -- one — a free contest is only legal here if it pays a podium.
  select count(*) into v_n from public.contests c
   where c.entry_fee_coins = 0 and c.podium_coins = 0
     and not public.week_has_started(c.season, c.season_type, c.week);
  if v_n > 0 then
    raise exception '% free contests offer no reward at all', v_n;
  end if;

  -- The headline the pot is sized to make true: first place buys a Pro Pack.
  -- 700 on a steep three-way split is 382, against a 400 coin Pro Pack.
  select floor(700 * 1.0 / (1 + 0.5 + (1.0/3)))::integer into v_top;
  if v_top < 350 or v_top > 450 then
    raise exception 'podium top prize is % coins, no longer near a Pro Pack', v_top;
  end if;
end $$;
