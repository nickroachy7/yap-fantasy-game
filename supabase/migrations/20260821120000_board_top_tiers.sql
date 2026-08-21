-- The best card on each manager's shelf, in one letter.
--
-- WHY A LEADERBOARD NEEDS THIS AT ALL
--
-- The boards are drawn as the lineup screen draws a card, and a lineup row gets
-- its colour from two categorical facts: the player's POSITION after his name,
-- and his card's TIER leading the third line. Five of the six boards rank
-- MANAGERS, and a manager has neither — so those rows came out entirely white
-- and grey next to a bench that is full of accent, and read as unfinished
-- rather than as restrained.
--
-- A manager does have one categorical fact of exactly that kind, and it is the
-- one the game is about: the best card they hold. `board_collection` already
-- leads with it. This exposes the same letter to the other four boards.
--
-- WHY A SEPARATE FUNCTION RATHER THAN A COLUMN ON EACH BOARD
--
-- Two reasons, and the first is the binding one. `leaderboard()` — which the
-- points board reads — is a SHIPPED function with a declared return type, and
-- Postgres cannot add a column to one with CREATE OR REPLACE. Changing it means
-- DROP and recreate, which briefly removes the grant and rewrites a function
-- three screens depend on, for a decoration. Not worth it.
--
-- The second is that this is one row per MANAGER, not per board row: the same
-- answer serves all five boards, is the same size whichever board is showing,
-- and is a single extra round trip the client can make once.
--
-- SECURITY DEFINER for the same reason as every board next door: `card_instances`
-- is RLS-scoped to its owner, so an invoker-rights version would return exactly
-- one row — the caller's own — and every other manager would silently lose
-- their mark. What crosses the boundary is a user id and a tier name, which is
-- strictly less than `board_collection` already publishes about the same shelf.
create or replace function public.board_top_tiers()
returns table (
  user_id uuid,
  tier    public.card_tier
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ci.user_id,
         -- Ordered through `tier_thresholds.sort_order` rather than by the enum
         -- itself. The enum's own order happens to be right today, and relying
         -- on it would make the ladder's ORDER a property of a type declaration
         -- rather than of the table that defines the ladder.
         (array_agg(ci.tier order by t.sort_order desc))[1]
    from public.card_instances ci
    join public.tier_thresholds t on t.tier = ci.tier
   -- Held only: a sold or burnt card is gone, and a manager must not keep a
   -- diamond mark for a diamond they cashed in.
   where ci.is_held
   group by ci.user_id;
$$;

revoke execute on function public.board_top_tiers() from public, anon;
grant  execute on function public.board_top_tiers() to authenticated;

comment on function public.board_top_tiers() is
  'The highest tier each manager still holds. One row per manager; drives the tier mark on every leaderboard row.';
