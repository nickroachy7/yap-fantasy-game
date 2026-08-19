-- Everything the CARD profile needs, in one call.
--
-- TWO PROFILES, AND WHY THEY ARE DIFFERENT SCREENS
--
-- `player_profile` answers "who is this player" — bio, career, usage, the game
-- log. It is about a person, it is identical for every user, and it exposes no
-- ownership.
--
-- This answers a different question: "what is THIS copy of him worth to me".
-- A card_instance is not a player. It has its own earned total, its own tier,
-- its own history of the weeks it was started, and — the part that only exists
-- in a collection game — its own STANDING among every other copy. Two people
-- holding the same player hold genuinely different objects, and until now
-- nothing in the app said so with numbers.
--
-- WHAT DRIVES career_fp, RESTATED HERE BECAUSE THIS IS THE SCREEN THAT SHOWS IT
--
-- A copy earns only in weeks it was STARTED. Sitting on the bench earns nothing
-- — see score_week, which recomputes career_fp as the sum of the card's
-- lineup_slots and touches no card that has never filled one. `starts` below is
-- the receipt for that: every row in it is a week this copy was in the lineup,
-- and there is no other way for the total to have moved.
--
-- OWNERSHIP
--
-- The caller must own the copy. `security definer` is needed for the RANKS —
-- they are computed against every user's copies, which RLS would otherwise
-- hide — but the card itself is gated on auth.uid() first, so this cannot be
-- used to read someone else's card. The ranks that come back are counts and
-- pool sizes: no other user is named or identified.
--
-- A SOLD copy still resolves. It is gone from my_collection, but a deep link to
-- one should say "you sold this" rather than "not found", and its rank is then
-- the position it WOULD hold — flagged by `sold_at` so the screen can say so.

-- The overall rank counts copies above a given total. Held copies only, which
-- is what the partial index matches.
create index if not exists card_instances_career_fp_idx
  on public.card_instances (career_fp desc)
  where sold_at is null;

create or replace function public.card_profile(p_card_instance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_card   record;
  v_starts jsonb;
  v_out    jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Ownership gate, before anything definer-rights is read.
  select ci.id, ci.user_id, ci.tier, ci.career_fp, ci.lineup_starts,
         ci.acquired_at, ci.sold_at, ci.sold_for, ci.source,
         c.id as card_id, c.season, c.rarity,
         p.id as player_id, p.full_name as player_name,
         p.position_abbreviation, p.injury_status,
         t.abbreviation as team_abbreviation,
         cur.min_career_fp as tier_floor_fp,
         cur.sell_value,
         nxt.min_career_fp as next_tier_at,
         nxt.tier          as next_tier_label
    into v_card
    from public.card_instances ci
    join public.cards   c on c.id = ci.card_id
    join public.players p on p.id = c.player_id
    left join public.teams t on t.id = p.team_id
    join public.tier_thresholds cur on cur.tier = ci.tier
    left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1
   where ci.id = p_card_instance_id
     and ci.user_id = v_user;

  if v_card.id is null then
    return null;
  end if;

  /* Every week this copy was started, and what it earned.
   *
   * `scored` separates "played for nothing" from "not swept yet", which the
   * lineup screen already distinguishes and this one must not flatten: a slot
   * in an unscored lineup carries points 0 because that is the column default,
   * not because the player blanked. */
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'season',      l.season,
             'season_type', l.season_type,
             'week',        l.week,
             'slot',        ls.slot,
             'points',      case when l.scored_at is not null then ls.points end,
             'scored',      l.scored_at is not null,
             'lineup_total', l.total_points
           ) order by l.season desc, l.season_type desc, l.week desc
         ), '[]'::jsonb)
    into v_starts
    from public.lineup_slots ls
    join public.lineups l on l.id = ls.lineup_id
   where ls.card_instance_id = p_card_instance_id;

  select jsonb_build_object(
    'card', jsonb_build_object(
      'id',             v_card.id,
      'card_id',        v_card.card_id,
      'player_id',      v_card.player_id,
      'player_name',    v_card.player_name,
      'position_abbreviation', v_card.position_abbreviation,
      'team_abbreviation',     v_card.team_abbreviation,
      'injury_status',  v_card.injury_status,
      'season',         v_card.season,
      'rarity',         v_card.rarity,
      'tier',           v_card.tier,
      'career_fp',      round(v_card.career_fp, 1),
      'lineup_starts',  v_card.lineup_starts,
      'fp_per_start',   case when v_card.lineup_starts > 0
                             then round(v_card.career_fp / v_card.lineup_starts, 1) end,
      'acquired_at',    v_card.acquired_at,
      'source',         v_card.source,
      'sold_at',        v_card.sold_at,
      'sold_for',       v_card.sold_for,
      'sell_value',     v_card.sell_value,
      'tier_floor_fp',  v_card.tier_floor_fp,
      'next_tier_at',   v_card.next_tier_at,
      'next_tier_label', v_card.next_tier_label
    ),
    /* Standing. Competition rank — count of copies strictly above this one,
     * plus one — so ties share a place instead of being ordered arbitrarily
     * by an id nobody can see. Pools are held copies only; a sold copy is not
     * competing, and counting it would inflate every pool over time. */
    'rank', jsonb_build_object(
      'among_player', (
        select count(*) + 1
          from public.card_instances ci
          join public.cards c on c.id = ci.card_id
         where c.player_id = v_card.player_id
           and ci.sold_at is null
           and ci.career_fp > v_card.career_fp
      ),
      'player_pool', (
        select count(*)
          from public.card_instances ci
          join public.cards c on c.id = ci.card_id
         where c.player_id = v_card.player_id
           and ci.sold_at is null
      ),
      'overall', (
        select count(*) + 1 from public.card_instances
         where sold_at is null and career_fp > v_card.career_fp
      ),
      'overall_pool', (
        select count(*) from public.card_instances where sold_at is null
      )
    ),
    'starts', v_starts
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.card_profile(uuid) from public, anon;
grant  execute on function public.card_profile(uuid) to authenticated;

comment on function public.card_profile(uuid) is
  'One owned card_instance: its earned total, tier progress, per-week start log, and its rank among copies of the same player and among every card in the game. Gated on auth.uid() ownership; security definer only so the ranks can see other users'' copies as counts.';
