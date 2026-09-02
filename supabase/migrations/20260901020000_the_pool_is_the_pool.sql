-- A contest pays out what it collected, and the shape of that payout is the
-- contest's own.
--
-- ---------------------------------------------------------------------------
-- WHAT 25% ACTUALLY BOUGHT, AND WHY IT WAS THE WRONG KNOB
-- ---------------------------------------------------------------------------
--
-- `20260826020000` set `prize_pool_bps` to 2500 and derived the number like
-- this: a flex-three entry is three bench cards, ~20 points, and
-- `award_score_coins` pays ~30 coins back on a 40 coin fee. So the marginal
-- entry is already −10, and 25% of 40 is exactly 10 — past which entering
-- becomes coin-POSITIVE and the contest turns into an arbitrage you run with
-- your three worst cards.
--
-- The arithmetic is right. The accounting underneath it is not, and
-- `20260901010000` is what makes that visible: the per-point rate is not
-- something a CONTEST pays. It is what a CARD earns for playing, anywhere, in
-- any row, including the free one. Folding it into the contest's expected value
-- charges the contest for income the game hands out for starting a card, and
-- then uses that charge to justify keeping three quarters of the entry fees.
--
-- Look at what the player was actually offered. A 40 coin Flex Three:
--
--     lose      +30 baseline  −40 fee              =  −10
--     win       +30 baseline  −40 fee  +20 pool    =  +10
--
-- A twenty coin spread between winning and losing — half of one entry fee,
-- a fifth of a Standard Pack. THE CONTEST BARELY CARED WHO WON. That is the
-- thing to fix, and the rake is what was doing it.
--
-- ---------------------------------------------------------------------------
-- 90%, AND WHAT STILL STOPS THE ARBITRAGE
-- ---------------------------------------------------------------------------
--
-- The protection `20260826020000` wanted is real and this migration keeps it.
-- It just moves to the knob that was always doing the work: THE FEE.
--
--     lose      baseline(your cards)  −  fee
--     win       baseline(your cards)  −  fee  +  share of 90%
--
-- A losing entry takes nothing from the pool. So as long as the fee is larger
-- than the baseline a WEAK entry produces, entering with your three worst cards
-- still loses coins — exactly as before, and for a reason a player can read off
-- the row rather than one hidden in a rake. Same 40 coin Flex Three at 90%:
--
--     lose      +30  −40           =  −10        (unchanged)
--     win       +30  −40  +72      =  +62
--
-- The loser is in the same place they were. The winner is somewhere worth
-- getting to. That is the entire change.
--
-- ---------------------------------------------------------------------------
-- CONTESTS ARE NOT THE SINK ANY MORE. SAY SO OUT LOUD.
-- ---------------------------------------------------------------------------
--
-- At 25% the lobby was a net drain on the coin supply and that was deliberate.
-- At 90% it is roughly neutral: the 10% that stays behind is a rake, not a
-- furnace, and across a week of entries the lobby returns a little more than it
-- takes once the baseline is counted.
--
-- This is a deliberate handover, not an oversight. THE SINK IS PACKS. A player
-- should want to win a contest because winning buys a Pro Pack — that is the
-- loop, and it only works if winning is worth a pack. 400 coins is a Pro Pack;
-- a 20 coin edge for beating the field was never going to reach one.
--
-- The supply consequence is bounded and it is the consequence we want: the
-- extra coins in the game are the baseline earned by cards that are OFF THE
-- BENCH. Paying more to people who play more cards is not a leak in an
-- anti-hoard game. It is the mechanism.
--
-- The 10% remains a real sink and remains the dial. It is per-contest and
-- always was, so a row that needs to drain harder can, without moving the rest.
--
-- ---------------------------------------------------------------------------
-- THE CURVE IS THE OTHER HALF OF "WHAT DO I WIN"
-- ---------------------------------------------------------------------------
--
-- `contest_payouts` hardcoded one split per win condition: `median` paid every
-- winner equally, `top_n` weighted by `win_rank + 1 - rnk`. That coupling is
-- what stops a lobby having any shape. A double-up and a tournament can both be
-- "top third wins" and be completely different offers — the double-up pays its
-- winners the same, the tournament pays first place a chunk. There was no way
-- to say which, because the split was implied by the rule for deciding winners.
--
-- So the split becomes a column, with four shapes and no numbers:
--
--   flat              everybody who won takes the same. Cash games: 50/50s,
--                     double-ups, beat-the-number. The point of a cash game is
--                     that squeaking in pays what cruising in pays.
--   linear            weight = (last winning place + 1 − yours). Top three
--                     comes out 3:2:1. This is what `top_n` already did, kept
--                     so nothing re-tunes by being migrated.
--   steep             weight = 1/place. Top five is 44/22/15/11/9. The
--                     tournament curve: first place is worth chasing and the
--                     tail still pays something back.
--   winner_take_all   one place, the whole pool. What a duel is.
--
-- WEIGHTS, NOT PERCENTAGES, and normalised by the weights that actually exist —
-- which is the property `20260826020000` built in and this keeps. Ties SHARE a
-- place (two players tied at 1 are both rank 1 and rank 2 is vacant), so any
-- fixed denominator would pay out more than the pool holds. Dividing by the
-- weights present cannot, whatever the field does.
--
-- `linear` reads the last WINNING place rather than `win_rank`, because
-- `win_rank` is about to stop being the only way a contest names its winners
-- (see `20260901030000`). The two agree whenever the field is deep enough to
-- fill the places, which is every case the old expression was correct for.

-- ------------------------------------------------------------------- curve

create type public.contest_payout_curve as enum
  ('flat', 'linear', 'steep', 'winner_take_all');

alter table public.contests
  add column payout_curve public.contest_payout_curve not null default 'flat';

comment on column public.contests.payout_curve is
  'How the pool is divided among the winners. Independent of how winners are DECIDED — a top-third contest can pay flat (a double-up) or steep (a tournament), and those are different products.';

-- What each row was already doing, preserved exactly, so this migration moves
-- no money on its own.
update public.contests set payout_curve = 'linear' where win_condition = 'top_n';
update public.contests set payout_curve = 'flat'   where win_condition = 'median';

-- ------------------------------------------------- has the week started yet

-- One predicate for "this week is already being decided", used by this
-- migration and by `20260901050000`, so the two cannot come to disagree about
-- which contests may still be re-termed.
--
-- `week_is_complete` is the neighbouring function and it is the wrong test: it
-- asks whether EVERY game is final, and a week with one kickoff behind it is
-- already a week whose terms must not move — somebody has entered under the
-- stated deal and the result is being played out. `game_has_started` is the
-- per-game version this composes, so "started" means the same thing to a lineup
-- lock and to a contest's terms.
create or replace function public.week_has_started(
  p_season integer, p_season_type smallint, p_week integer
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.games g
     where g.season = p_season
       and g.season_type = p_season_type
       and g.week = p_week
       and public.game_has_started(g.status_state, g.starts_at)
  );
$$;

grant execute on function public.week_has_started(integer, smallint, integer) to authenticated;

comment on function public.week_has_started(integer, smallint, integer) is
  'True once any game in the week has kicked off. The line between a week whose contests can still be re-termed and one that is already being played.';

-- -------------------------------------------------------------------- rake

-- 2500 -> 9000 on every contest that collects anything AND HAS NOT BEEN PLAYED.
-- The free contest collects nothing and keeps 0, which
-- `contests_free_pays_no_prize` enforces.
--
-- A week that has kicked off is a week being decided. `award_contest_prizes` is
-- idempotent on the lineup, so re-pricing a settled contest would not repay
-- anybody — it would just make the app display a pool four times what that
-- contest actually paid, which is the "re-tuning cannot rewrite history" rule
-- `20260824200400` set for the faucet, and the same rule applies here. As of
-- this migration that spares the preseason and touches all eighteen weeks of a
-- regular season where no ball has yet been thrown.
update public.contests c
   set prize_pool_bps = 9000
 where c.kind <> 'free'
   and c.entry_fee_coins > 0
   and not public.week_has_started(c.season, c.season_type, c.week);

comment on column public.contests.prize_pool_bps is
  'Basis points of the fees this contest COLLECTED that are paid back out as prizes. 9000 = 90%, the rest a rake. Not an expected-value ceiling — what keeps a weak entry coin-negative is the fee being larger than the baseline that entry earns, which is a property of the fee. See 20260901020000.';

-- ----------------------------------------------------------------- payouts

-- Who gets what, under the contest's own curve.
--
-- `places` is the last place that actually WON, read off the winners rather
-- than off `win_rank`, so a `linear` split stays correct when a contest names
-- its winners some other way — and when a thin field means the places were
-- never filled.
create or replace function public.contest_payouts(p_contest uuid)
returns table (user_id uuid, lineup_id uuid, rnk bigint, coins integer)
language sql
stable security definer
set search_path = public, pg_temp
as $fn$
  with c as (
    select payout_curve from public.contests where id = p_contest
  ),
  pool as (select public.contest_prize_pool(p_contest) as coins),
  won as (
    select r.user_id, r.lineup_id, r.rnk
      from public.contest_results(p_contest) r
     -- Null is NO RESULT — week not final, field too small to be a contest.
     -- Nothing is owed until there is a result.
     where r.result = 'W'
  ),
  places as (select coalesce(max(rnk), 0) as last from won),
  weighted as (
    select w.user_id, w.lineup_id, w.rnk,
           (case c.payout_curve
              when 'flat'            then 1::numeric
              when 'linear'          then greatest(1, (select last from places) + 1 - w.rnk)::numeric
              when 'steep'           then 1::numeric / w.rnk
              when 'winner_take_all' then case when w.rnk = 1 then 1::numeric else 0::numeric end
            end) as weight
      from won w cross join c
  ),
  total as (select sum(weight) as weight from weighted)
  select w.user_id, w.lineup_id, w.rnk,
         floor((select coins from pool) * w.weight
               / nullif((select weight from total), 0))::integer
    from weighted w
   where (select coins from pool) > 0
     and w.weight > 0;
$fn$;

grant execute on function public.contest_payouts(uuid) to authenticated;

comment on function public.contest_payouts(uuid) is
  'One row per winner with the coins they are owed out of the pool, split under the contest''s payout_curve and normalised by the weights that actually exist so shared places cannot overpay.';

-- The client also has to be able to SAY which curve a row pays on, since "top
-- third wins" does not tell anybody whether first place is worth chasing.
-- Adding a column to `contest_lobby`'s result changes its return type, which
-- `create or replace` cannot do — so the lobby is rebuilt once, in
-- `20260901040000`, alongside the other two columns it is about to grow.
