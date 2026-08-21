-- Correcting the backfill in 20260821140000, which was right about the rule and
-- wrong about the population.
--
-- ---------------------------------------------------------------------------
-- WHAT IT ASSUMED
-- ---------------------------------------------------------------------------
--
-- That migration seeded `settled_fp` by summing `lineup_slots` over finished
-- weeks — reasoning that `career_fp` is itself a sum of slot points, so the two
-- derivations must agree. That is what `score_week` maintains, and for a card
-- this game has actually scored it holds exactly: all eighteen such cards came
-- out with settled_fp matching their slot totals.
--
-- It is not true of the table as a whole. 392 card_instances hold 48,360
-- career_fp between them while every lineup slot ever played is worth 1.7
-- points, because `scripts/seed-demo-managers.sql` writes career_fp DIRECTLY on
-- insert to fabricate a populated leaderboard. Those cards have no slots to sum,
-- so the backfill left 65 of them showing silver, gold and diamond on a
-- settled_fp of zero — a row that is not wrong on screen today only because
-- nothing has updated it yet, and that demotes to bronze the first time
-- anything does.
--
-- ---------------------------------------------------------------------------
-- THE RULE, STATED SO IT COVERS BOTH
-- ---------------------------------------------------------------------------
--
-- Settled points are the career total LESS whatever is still being played:
--
--     settled_fp = career_fp - (slot points in weeks that are not complete)
--
-- Subtractive rather than additive, and that is the whole repair. It needs no
-- opinion about where career_fp came from, so it is correct for a card whose
-- total this engine computed and for a card whose total was handed to it. The
-- two populations stop being different cases.
--
-- It also states the intent more honestly than the sum did. "Everything you
-- have earned except the part that is still in the air" is the sentence the
-- column exists to make true; the original backfill wrote a different sentence
-- that happened to agree on the rows it could see.

with in_play as (
  -- Slot points belonging to a week that is not yet complete. Grouped per card,
  -- so a card started in both a finished and an unfinished week keeps the first
  -- and defers only the second.
  select ls.card_instance_id,
         coalesce(sum(ls.points), 0) as pending
    from public.lineup_slots ls
    join public.lineups l on l.id = ls.lineup_id
   where not public.week_is_complete(l.season, l.season_type, l.week)
   group by ls.card_instance_id
)
update public.card_instances ci
   set settled_fp = greatest(ci.career_fp - coalesce(ip.pending, 0), 0)
  from (select id from public.card_instances) all_cards
  left join in_play ip on ip.card_instance_id = all_cards.id
 where ci.id = all_cards.id
   and ci.settled_fp is distinct from greatest(ci.career_fp - coalesce(ip.pending, 0), 0);

-- `greatest(..., 0)` is not defensive dressing: settled_fp carries a
-- `>= 0` check constraint, and a negative would abort the whole sweep rather
-- than skip one card. It can only arise if career_fp and the slot rows
-- disagree — which is precisely the state this migration exists because of.
