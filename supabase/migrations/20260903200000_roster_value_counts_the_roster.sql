-- Roster value is the roster: a card committed to a set is not on it.
--
-- ---------------------------------------------------------------------------
-- THIS REVERSES 20260824200600_board_counts_committed
-- ---------------------------------------------------------------------------
--
-- That migration made committed copies count towards the board's figure, on
-- this reasoning:
--
--   "Committing does not remove anything. The card is still yours... The old
--    rule had a consequence nobody chose: COMMITTING TO A SET LOWERED YOUR RANK
--    ON THE GAME'S HEADLINE BOARD."
--
-- The reasoning is sound and it was answering the wrong question. It asked what
-- a player still OWNS. The board is read as an answer to what a player has on
-- their ROSTER — thirty slots, the ones that can be started, sold, and seen —
-- and those are different piles the moment anyone commits a card.
--
-- The gap was not theoretical. Roach held 30 cards worth 4,156 coins on the
-- Collect page and read 11,688 on a board labelled "Collection value", because
-- 305 committed copies the Collect page does not show were being added in.
-- Two screens, one phrase, a factor of nearly three between them, and nothing
-- anywhere saying why.
--
-- ---------------------------------------------------------------------------
-- WHAT STOPS THIS PUNISHING SET-BUILDING AGAIN
-- ---------------------------------------------------------------------------
--
-- The word. The board is `Roster value` now, not `Collection value`, and it
-- says what it counts: the cards on your roster. Committing a card takes it off
-- your roster — that is what committing IS — so a figure that falls when you
-- commit is not a penalty, it is the measure working. The old name promised to
-- count everything you owned and then had to be bent into keeping that promise.
--
-- Where the cards you have banked belong is the SETS board, which already ranks
-- rungs claimed and cards burnt getting there. Two boards, two piles, neither
-- pretending to be the other.
--
-- `in_sets` and `in_sets_coins` are still returned and still count committed
-- copies. They are true facts about a manager and the row may want them again;
-- they are simply no longer part of the figure this board ranks by.
--
-- ---------------------------------------------------------------------------
-- WHY THE OUTER FILTER STAYS `sold_at is null`
-- ---------------------------------------------------------------------------
--
-- Because `in_sets` still has to be countable. `is_held` is generated as "not
-- sold and not committed", so filtering the whole scan on it would report zero
-- committed cards for everybody. The scan keeps every unsold copy and each
-- aggregate says for itself which pile it is over.
--
-- `coalesce` on the sum is load-bearing: `sum(...) filter (where false)` is
-- NULL, not 0, so a manager who has committed every card they own would
-- otherwise rank with a null value rather than with nothing.
--
-- `create or replace`, not drop-and-create: the return type is unchanged, and a
-- dropped function loses its ACL and silently regains PUBLIC and anon.

create or replace function public.board_collection(
  p_season integer default null,
  p_limit  integer default 100
)
returns table (
  rank          bigint,
  user_id       uuid,
  display_name  text,
  value_coins   bigint,
  held          bigint,
  in_sets       bigint,
  in_sets_coins bigint,
  players       bigint,
  gold_plus     bigint,
  diamond       bigint,
  career_fp     numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with owned as (
    select ci.user_id,
           count(*) filter (where ci.is_held)                                  as held,
           -- Still every committed copy: see the note above on the outer filter.
           count(*) filter (where ci.committed_at is not null)                 as in_sets,
           count(distinct ci.card_id) filter (where ci.is_held)                as players,
           coalesce(sum(cp.sell_value) filter (where ci.is_held), 0)::bigint   as value_coins,
           coalesce(
             sum(cp.sell_value) filter (where ci.committed_at is not null), 0
           )::bigint                                                           as in_sets_coins,
           count(*) filter (where ci.is_held and ci.tier in ('gold', 'diamond')) as gold_plus,
           count(*) filter (where ci.is_held and ci.tier = 'diamond')          as diamond,
           -- Scoped to the roster like everything else on this board. The fantasy
           -- points a committed card earned are real and are the CARDS board's
           -- subject; here they would describe a pile this figure excludes.
           sum(ci.career_fp) filter (where ci.is_held)                         as career_fp
      from public.card_instances ci
      join public.cards c        on c.id = ci.card_id
      join public.card_prices cp on cp.card_instance_id = ci.id
     where ci.sold_at is null
       and (p_season is null or c.season = p_season)
     group by ci.user_id
  )
  select rank() over (order by o.value_coins desc, pr.display_name asc),
         o.user_id,
         pr.display_name,
         o.value_coins,
         o.held,
         o.in_sets,
         o.in_sets_coins,
         o.players,
         o.gold_plus,
         o.diamond,
         o.career_fp
    from owned o
    join public.profiles pr on pr.id = o.user_id
   order by o.value_coins desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

comment on function public.board_collection(integer, integer) is
  'Rosters ranked by what the cards on them would sell for, priced off card_prices.sell_value. Counts held copies only — a card committed to a set is off the roster and off this figure, and matches what the Collect page shows. in_sets still counts committed copies for the row to display.';
