-- What a contest costs you to lose, and what losing it means.
--
-- ---------------------------------------------------------------------------
-- WHY THE WIN CONDITION HAS TO BE PER-CONTEST
-- ---------------------------------------------------------------------------
--
-- Until now there has been one way to win, because there has been one contest
-- worth winning: `median_record` scores you against the middle of the free
-- contest's field. That is a fine rule and a terrible ONLY rule, because of
-- what it does to a heart:
--
--   the median loses half the field EVERY WEEK, by construction.
--
-- Not half the bad players — half the field, including a player who did
-- everything right in a week where the field ran hot. At three hearts that
-- kills the median player in about six weeks of an eighteen-week season, and
-- it kills them for no reason they can name. A run has to end because of
-- something the player did. Median-relative death never is.
--
-- So the win condition becomes a property of the contest, and the free contest
-- keeps the median while risking nothing (`hearts_at_risk` 0 — see the seed at
-- the bottom, and the note there about why that is a floor and not a shrug).
--
-- ---------------------------------------------------------------------------
-- HEARTS AT RISK MUST BE PRICED AGAINST THE LOSS RATE
-- ---------------------------------------------------------------------------
--
-- These do not cost the same thing:
--
--   median          ~50% of entrants lose
--   top 3 of 20      85% of entrants lose
--
-- At a flat one heart each, every player enters the median contest and no
-- player ever enters the other one, and the lobby collapses to whichever row
-- has the softest loss condition. `hearts_at_risk` is per-contest so the harsh
-- ones can be made cheap to lose, and it sits next to `entry_fee_gems` because
-- it is the same kind of fact: a price the row charges.
--
-- The prize side of that trade is `hearts_on_win`, and it is a heart rather
-- than gems ON PURPOSE. A gem prize cannot be paid yet — the standing rule in
-- `20260825050000_contest_entry_fees` is that prizes come out of fees
-- collected and not from a grant, and there is no pool to pay from. But a
-- heart is not a grant. It is a return of something the contest itself put at
-- risk, so it can be paid today without inventing an economy.
--
-- It also fixes a problem the run has on its own: four systems in this game
-- take things away and only the dailies give anything back. A resource that
-- can only ever drain is a countdown, not a mechanic — the player's whole
-- relationship with it is watching it go. `hearts_on_win` makes the harsh
-- contest the place hearts come FROM, which is what turns entering one into a
-- decision rather than a toll.
--
-- ---------------------------------------------------------------------------
-- WHY head_to_head IS NOT IN THIS ENUM
-- ---------------------------------------------------------------------------
--
-- It was wanted, and it is missing on purpose rather than by oversight.
--
-- `median` and `top_n` are both pure reads of a rank over `lineups.total_points`
-- — no new table, nothing to store, and re-runnable at any time to the same
-- answer, which is what makes settlement idempotent. Head-to-head is not a
-- rank. It needs an OPPONENT, which means a stored pairing per entrant per
-- week, which means deciding what happens to an odd entrant, what a bye is
-- worth, and whether a pairing survives somebody leaving the contest before
-- kickoff. That is its own migration and its own table.
--
-- Adding the value later is one `alter type`. Adding it NOW, with settlement
-- unable to evaluate it, would mean a contest could be seeded into a state
-- where hearts are at risk and no result can ever be computed — which is the
-- worst outcome available here, so the enum simply does not offer it.

create type public.contest_win_condition as enum ('median', 'top_n');

alter table public.contests
  add column win_condition  public.contest_win_condition not null default 'median',
  -- Only meaningful for `top_n`: the last place that still counts as a win.
  add column win_rank       integer check (win_rank is null or win_rank > 0),
  add column hearts_at_risk smallint not null default 0 check (hearts_at_risk >= 0),
  add column hearts_on_win  smallint not null default 0 check (hearts_on_win >= 0);

-- A `top_n` contest with no cutoff has no win condition at all, and a cutoff on
-- a median contest is a number nothing reads — either one is a seed that looks
-- configured and is not.
alter table public.contests add constraint contests_win_rank_matches_condition
  check ((win_condition = 'top_n') = (win_rank is not null));

comment on column public.contests.hearts_at_risk is
  'Hearts a loss in this contest costs the run. 0 means the contest cannot end anybody, which is what the free contest is for.';
comment on column public.contests.hearts_on_win is
  'Hearts a win in this contest heals, capped at the run''s max_hearts. The reward side of a harsh loss condition, for as long as there is no gem prize pool to be the reward instead.';
comment on column public.contests.win_rank is
  'For top_n: the last finishing place that still counts as a win. Null on every other condition, enforced.';

-- --------------------------------------------------------------- the seeds

-- THE FREE CONTEST RISKS NOTHING, and this is load-bearing rather than
-- cautious. It is the one contest every account is in and never opts out of,
-- and a player whose run has just died still has it. If hearts rode on it, a
-- dead player would have no reason to open the app until the next slate — a
-- roguelike whose death screen is followed by a week of waiting is not a
-- roguelike, it is a suspension. The free contest is the floor underneath the
-- run, so the run has somewhere to fall to.
update public.contests
   set win_condition = 'median', win_rank = null, hearts_at_risk = 0, hearts_on_win = 0
 where kind = 'free';

-- The existing Flex Three keeps the median and starts risking one heart. It is
-- the gentlest possible first stake: an even-money condition the player already
-- understands from their season record, for the smallest unit the run has.
update public.contests
   set win_condition = 'median', win_rank = null, hearts_at_risk = 1, hearts_on_win = 0
 where kind = 'lobby' and format_code = 'flex3';

-- And the harsh one, so the lobby has a shape rather than a single row.
--
-- Top three of a WR room loses most of its field, so it is priced at one heart
-- like the median contest rather than more — the loss RATE is the risk, and
-- charging extra on top of it would make the row unenterable. What makes it
-- worth entering anyway is that it PAYS a heart: it is the only place in the
-- game a run can be healed, so a player who wants a longer run has to go
-- through the contest most likely to end it.
--
-- That is the trade the whole lobby is built to offer, stated in two columns:
-- risk 1, win 1, lose most of the time.
insert into public.contests (code, kind, format_code, season, season_type, week, name,
                             entry_fee_gems, win_condition, win_rank, hearts_at_risk, hearts_on_win)
select format('wr_room:%s:%s:%s', g.season, g.season_type, g.week),
       'lobby', 'wr_room', g.season, g.season_type, g.week,
       'WR Room', 40, 'top_n', 3, 1, 1
  from (select distinct season, season_type, week from public.games
         where week is not null and season = 2026) g
on conflict (code) do nothing;
