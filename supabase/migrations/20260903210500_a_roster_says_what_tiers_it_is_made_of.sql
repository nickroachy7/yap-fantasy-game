-- A roster's value is a number; its TIERS are the story behind the number.
--
-- ---------------------------------------------------------------------------
-- WHAT THE BOARD COULD NOT SAY
-- ---------------------------------------------------------------------------
--
-- `board_collection` returned `gold_plus` and `diamond` and nothing below them,
-- with the reasoning recorded on `topTier`: "below gold the counts are not
-- returned separately, and guessing between silver and bronze from a valuation
-- would be a number pretending to be a fact."
--
-- That was right about the guess and wrong about the remedy, which is to return
-- the counts rather than to do without them. A roster of thirty is a roster of
-- thirty SOMETHINGS, and `30 CARDS` cannot tell a shelf of bronze duplicates
-- from one that has been played into gold — which is the single distinction the
-- whole economy turns on, since tier is earned by starting a card.
--
-- Four counts, one per tier, held copies only. They sum to `held`, so the total
-- the row used to print is still on the row; it is simply spelled out.
--
-- ---------------------------------------------------------------------------
-- `gold_plus` IS GONE, NOT KEPT ALONGSIDE
-- ---------------------------------------------------------------------------
--
-- It is `gold + diamond` and both are now returned. Leaving it in would be one
-- more column that has to agree with two others forever, and the first time it
-- did not, nothing would say which was wrong.
--
-- ---------------------------------------------------------------------------
-- DROP AND CREATE, AND THE GRANT THAT MUST FOLLOW IT
-- ---------------------------------------------------------------------------
--
-- The return type changes, and `create or replace function` cannot change one.
-- A dropped function loses its ACL and silently regains PUBLIC and anon, so the
-- revoke and grant below are not boilerplate — they are the reason this is
-- safe. `db push` has no transaction around it either, so they run in the same
-- file as the create and immediately after it.

drop function if exists public.board_collection(integer, integer);

create function public.board_collection(
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
  -- One per tier, and they sum to `held`.
  bronze        bigint,
  silver        bigint,
  gold          bigint,
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
           -- Still every committed copy: a card in a set is off the roster and
           -- off `value_coins`, but the count of them is a true fact about a
           -- manager. See the previous migration.
           count(*) filter (where ci.committed_at is not null)                 as in_sets,
           count(distinct ci.card_id) filter (where ci.is_held)                as players,
           coalesce(sum(cp.sell_value) filter (where ci.is_held), 0)::bigint   as value_coins,
           coalesce(
             sum(cp.sell_value) filter (where ci.committed_at is not null), 0
           )::bigint                                                           as in_sets_coins,
           count(*) filter (where ci.is_held and ci.tier = 'bronze')           as bronze,
           count(*) filter (where ci.is_held and ci.tier = 'silver')           as silver,
           count(*) filter (where ci.is_held and ci.tier = 'gold')             as gold,
           count(*) filter (where ci.is_held and ci.tier = 'diamond')          as diamond,
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
         o.bronze,
         o.silver,
         o.gold,
         o.diamond,
         o.career_fp
    from owned o
    join public.profiles pr on pr.id = o.user_id
   order by o.value_coins desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.board_collection(integer, integer) from public, anon;
grant  execute on function public.board_collection(integer, integer) to authenticated;

comment on function public.board_collection(integer, integer) is
  'Rosters ranked by what the cards on them would sell for, priced off card_prices.sell_value. Counts held copies only — a card committed to a set is off the roster and off this figure, and matches what the Collect page shows. Returns a count per tier, which sum to held; in_sets still counts committed copies.';
