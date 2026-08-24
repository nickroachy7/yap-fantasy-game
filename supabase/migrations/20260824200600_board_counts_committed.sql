-- A card committed to a set is not gone, and the board should stop saying so.
--
-- ---------------------------------------------------------------------------
-- THE BUG WAS IN THE REASONING, NOT THE SQL
-- ---------------------------------------------------------------------------
--
-- `board_collection` filtered on `is_held`, justified like this:
--
--   "A sold copy is gone and a copy burnt into a set is gone; a board that
--    counted either would let a shelf grow by emptying it."
--
-- The guard is right and the two cases are not the same. Selling REMOVES a card
-- from your collection and hands you gems for it — counting it would indeed let
-- a shelf grow by emptying it. Committing does not remove anything. The card is
-- still yours; it is displayed in a set; it simply cannot be played or sold
-- again. Immobilised is not gone.
--
-- The old rule had a consequence nobody chose: COMMITTING TO A SET LOWERED YOUR
-- RANK ON THE GAME'S HEADLINE BOARD. The one screen that pins your own row to
-- the top moved against you every time you engaged with the Sets tab. Players
-- were being quietly punished for using a mechanic we then wondered why nobody
-- used.
--
-- ---------------------------------------------------------------------------
-- WHY THIS DOES NOT MAKE SETS A FREE STORAGE LOCKER
-- ---------------------------------------------------------------------------
--
-- Because tier is earned by STARTING a card, and a committed card can never be
-- started again. Its value freezes at whatever tier it held on the day it went
-- in. So the board still ranks the three exits exactly as the game intends:
--
--   PLAY it     value grows   8 -> 40 -> 150 -> 500 as it earns its tier
--   COMMIT it   value frozen  at whatever it had earned by then
--   SELL it     value gone    and this is now the only lossy exit
--
-- That ordering is the whole point. Under a roster cap the player is forced to
-- pick an exit for every card, and this is what makes committing the default
-- for anything you do not want and selling the choice you make only when you
-- need gems today. No forcing required — just an honest scoreboard.
--
-- `sold_at is null` rather than `is_held or committed_at is not null`: the two
-- are identical by the definition of the generated column, and the short form
-- says the actual rule, which is that SELLING is what costs you.

-- Dropped rather than replaced: two columns are new and `create or replace
-- function` cannot change a return type. Same reason `my_sets` was dropped when
-- its ladder columns arrived.
drop function if exists public.board_collection(integer, integer);

create function public.board_collection(
  p_season integer default null,
  p_limit  integer default 100
)
returns table (
  rank         bigint,
  user_id      uuid,
  display_name text,
  value_gems   bigint,
  held         bigint,
  -- Split out so the board can show what a shelf is made of. `in_sets` is the
  -- frozen half: cards that still count but will never grow again.
  in_sets      bigint,
  in_sets_gems bigint,
  players      bigint,
  gold_plus    bigint,
  diamond      bigint,
  career_fp    numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with owned as (
    select ci.user_id,
           count(*) filter (where ci.is_held)                     as held,
           count(*) filter (where ci.committed_at is not null)     as in_sets,
           count(distinct ci.card_id)                             as players,
           sum(t.sell_value)::bigint                              as value_gems,
           sum(t.sell_value) filter (where ci.committed_at is not null)::bigint as in_sets_gems,
           count(*) filter (where ci.tier in ('gold', 'diamond'))  as gold_plus,
           count(*) filter (where ci.tier = 'diamond')             as diamond,
           sum(ci.career_fp)                                       as career_fp
      from public.card_instances ci
      join public.cards c            on c.id = ci.card_id
      join public.tier_thresholds t  on t.tier = ci.tier
     where ci.sold_at is null
       and (p_season is null or c.season = p_season)
     group by ci.user_id
  )
  select rank() over (order by o.value_gems desc, pr.display_name asc),
         o.user_id,
         pr.display_name,
         o.value_gems,
         o.held,
         o.in_sets,
         coalesce(o.in_sets_gems, 0),
         o.players,
         o.gold_plus,
         o.diamond,
         o.career_fp
    from owned o
    join public.profiles pr on pr.id = o.user_id
   order by o.value_gems desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.board_collection(integer, integer) from public, anon;
grant  execute on function public.board_collection(integer, integer) to authenticated;

comment on function public.board_collection(integer, integer) is
  'Collections ranked by what they are worth, priced off tier_thresholds.sell_value. Counts cards you still own — held or committed to a set. Selling is the only exit that removes value.';
