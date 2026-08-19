-- Community ownership for EVERY player at once, for the directory row.
--
-- `player_market(uuid)` already answers this for one player, in far more depth,
-- and it is the right shape for the profile screen it was built for. It is the
-- wrong shape for a list: the directory draws ~968 rows off a virtualised list
-- that pages 400 at a time, and one round trip per visible row is not a
-- strategy. This returns the five figures a ROW has space for, for the whole
-- set, in a single scan.
--
-- Deliberately NOT a superset of player_market, and not a replacement for it.
-- No display names, no per-owner detail, no seasons breakdown, nothing about
-- the caller's own copies — a row has room for a histogram and a high score,
-- and anything else read here would be read 968 times to be thrown away.
--
-- WHY security definer, AND WHAT IT EXPOSES
--
-- Same reasoning as player_market, and the same boundary. `card_instances` is
-- RLS-scoped to its owner, so an invoker-rights view would see only the
-- caller's copies and every count would read 1 — which is not a smaller answer
-- but a WRONG one, indistinguishable from "one exists in the game".
--
-- What crosses the boundary is counts and one maximum. No user ids, no display
-- names, no ownership, nothing that names anybody. This is strictly less than
-- player_market already exposes on the same tables.
--
-- ONLY HELD COPIES COUNT. Selling is a soft delete (see sell_card) because
-- lineup history has to keep resolving, so `sold_at is null` is what "exists in
-- the game right now" means. player_market shows minted and sold separately
-- because a player people dump is a different proposition from one nobody has
-- pulled; a row has no space for that distinction and takes the one that
-- answers "what could I be up against this week".
--
-- A PLAYER WITH NO COPIES GETS NO ROW, rather than a row of noughts. The caller
-- draws the difference: dashes for "not in circulation", figures for a player
-- who is. Today that is 951 of 968 players, and 951 rows of six zeroes is a
-- table telling you nothing at length.
create or replace function public.player_card_market()
returns table (
  player_id uuid,
  copies    integer,
  bronze    integer,
  silver    integer,
  gold      integer,
  diamond   integer,
  best_fp   numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
    select c.player_id,
           count(*)::integer,
           count(*) filter (where ci.tier = 'bronze')::integer,
           count(*) filter (where ci.tier = 'silver')::integer,
           count(*) filter (where ci.tier = 'gold')::integer,
           count(*) filter (where ci.tier = 'diamond')::integer,
           -- The best copy's EARNED total, which is what career_fp is: it only
           -- moves in weeks the copy was actually started. A great player
           -- nobody has ever started reads 0 here, and that is the true
           -- statement — see the note on career_fp in card_tier_progression.
           round(max(ci.career_fp), 1)
      from public.card_instances ci
      join public.cards c on c.id = ci.card_id
     where ci.sold_at is null
     group by c.player_id;
end;
$$;

revoke execute on function public.player_card_market() from public, anon;
grant  execute on function public.player_card_market() to authenticated;

comment on function public.player_card_market() is
  'Per-player community card counts for the directory list: copies held, the tier histogram, and the highest career_fp on any held copy. Bulk counterpart to player_market(uuid), which stays the source for the profile screen. security definer by necessity — card_instances is RLS-scoped to its owner — and exposes only aggregates, naming nobody.';
