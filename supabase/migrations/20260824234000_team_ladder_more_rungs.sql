-- Six rungs on a team ladder instead of four, for the same 9,100 gems.
--
-- ---------------------------------------------------------------------------
-- THE PROBLEM: THE FIRST RUNG IS TOO FAR AWAY TO PULL ANYBODY IN
-- ---------------------------------------------------------------------------
--
-- A team set is a club's whole printed roster, ~30 cards, and the first rung
-- sat at 25% of it — eight cards. Eight distinct members of one specific club
-- is roughly 250 draws, which is most of a season's packs. Until then the row
-- shows a bar that has never paid anything, on all thirty-two clubs at once.
--
-- That is a long time to ask somebody to believe a mechanic before it has ever
-- given them anything, and it is the reason the Sets tab reads as somewhere you
-- watch progress rather than somewhere you do something.
--
-- ---------------------------------------------------------------------------
-- THE FIX IS A RESLICE, NOT A RAISE, AND THE TOTAL IS THE PROOF
-- ---------------------------------------------------------------------------
--
--   was    25%  400    50% 1200            75% 2500    100% 5000   = 9,100
--   now    10%  100    25%  300    40% 500    50% 700
--                                            75% 2500    100% 5000   = 9,100
--
-- The same money, cut into more pieces, with the first piece at three cards
-- instead of eight. Nothing is added to the faucet: this migration cannot
-- change what the set economy pays out in a season, only how often it pays
-- some of it. That property is why it can ship without re-deriving the whole
-- economy underneath it.
--
-- Resolved against a 30-card roster the rungs land at 3, 8, 12, 15, 23 and 30
-- cards. `ceil(required_count * pct / 100)` keeps them distinct across every
-- roster size the league actually has — 27 gives 3/7/11/14/21/27 and 33 gives
-- 4/9/14/17/25/33 — so no two rungs ever collapse onto the same card count and
-- pay twice for one commit.
--
-- ---------------------------------------------------------------------------
-- WHY THE TOP TWO DO NOT MOVE
-- ---------------------------------------------------------------------------
--
-- 75% and 100% are the chase, and 20260824201000_frontload_team_ladder.sql
-- deliberately left the money there because those rungs are thousands of draws
-- away and will not be claimed in a beta. Splitting the REACHABLE band is the
-- whole of this change; splitting the unreachable one would be rearranging
-- furniture in a room nobody enters.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT FIX, STATED PLAINLY
-- ---------------------------------------------------------------------------
--
-- IT DOES NOT MAKE ANYBODY COMMIT A GOOD CARD. A rung counts cards, and any
-- member fills a slot, so a player satisfies every rung below with the worst
-- copies they hold and keeps the ones they start. That is rational and this
-- migration leaves it rational — it buys pacing, not a reason to burn a card
-- you care about. The tier-gated weekly set in the next migration is the part
-- aimed at that.
--
-- AND THE REACHABLE BAND IS STILL A NET FAUCET, which is worth writing down
-- because the figure was reasoned about per-set and the honest frame is
-- across-sets. 20260819235600_set_milestones.sql made this argument once and it
-- did not survive the frontload: nobody buys packs to finish ONE team set,
-- because packs fill all thirty-two at once. A season is ~300 draws (60 packs,
-- 6,000 gems) and yields ~8 distinct cards from EVERY club, so the 10% and 25%
-- rungs are reached thirty-two times over: 32 x 400 = 12,800 gems out of 6,000
-- gems of packs.
--
-- That ratio is unchanged here — 100 + 300 is the 400 it already was — so this
-- migration neither causes it nor worsens it. Closing it means taking the
-- reachable band down to roughly 160 a club, and that is a separate decision
-- about how big the set faucet should be, made against the other faucets rather
-- than in the middle of a pacing change.

insert into public.card_set_ladder_defaults (family, threshold_pct, reward_gems) values
  ('team',  10,  100),
  ('team',  25,  300),
  ('team',  40,  500),
  ('team',  50,  700)
on conflict (family, threshold_pct) do update
  set reward_gems = excluded.reward_gems;

-- ---------------------------------------------------------------- apply now
--
-- `rebuild_card_sets` seeds `card_set_milestones` from the defaults table, so
-- re-running it is what puts the two new rungs onto the sets that already
-- exist and re-prices the two that moved. An UPDATE here would re-price but not
-- insert, and the new rungs would appear only on clubs that happened to sign
-- somebody afterwards.
--
-- Existing claims are untouched: `set_milestone_claims` is never rewritten, so
-- anybody already paid 400 at the 25% rung keeps the 400 they were paid and the
-- view goes on reporting that figure rather than today's 300.
do $$
declare
  v_season integer;
begin
  for v_season in select distinct season from public.cards where is_mintable order by 1 loop
    perform public.rebuild_card_sets(v_season);
  end loop;
end;
$$;
