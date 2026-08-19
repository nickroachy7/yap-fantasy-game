-- The PLAYER's season production, on the collection row.
--
-- WHY THIS IS NOT A PROJECTION, AND MUST NOT BE LABELLED AS ONE
--
-- The card's fixture line now has room beside it for "what should I expect
-- from him this week". The honest answer available to us is what he has
-- actually averaged; the dishonest one is a projection. balldontlie does not
-- sell projections — verified 404s, recorded in docs/sleeper-spec-coverage.md —
-- and the standing rule is that nothing in this app fabricates one. An average
-- dressed up as a forecast is exactly that fabrication, so this column is named
-- for what it is and the card labels it FP/G.
--
-- TWO NUMBERS THAT ARE NOT THE SAME THING, ON ONE ROW
--
-- `career_fp` is the CARD's earned total and only moves in weeks the copy was
-- started. `fp_per_game` is the PLAYER's production and moves whenever he
-- plays, for everyone holding him. A card with 0 career_fp beside a 21.3
-- FP/G is not a contradiction — it is a good player you have never started,
-- which is the single most useful thing the collection grid can tell you.
--
-- Same lateral shape `player_directory` already uses, so the two surfaces
-- cannot disagree about a player's season: scored rows only, under the ACTIVE
-- ruleset, for the card's own season.
--
-- `create or replace view` requires the existing columns in their existing
-- order, so this is appended rather than slotted in beside career_fp.
create or replace view public.my_collection
with (security_invoker = on) as
  select ci.id,
         ci.user_id,
         ci.card_id,
         p.full_name              as player_name,
         p.position_abbreviation,
         t.abbreviation           as team_abbreviation,
         p.injury_status,
         ci.tier,
         ci.career_fp,
         ci.lineup_starts,
         cur.min_career_fp        as tier_floor_fp,
         nxt.min_career_fp        as next_tier_at,
         nxt.tier                 as next_tier_label,
         c.season,
         ci.acquired_at,
         c.player_id,
         cur.sell_value,
         -- Null, not zero, when he has no scored games this season: "we have
         -- no number for him yet" and "he averages nothing" are different
         -- claims, and the card draws them differently.
         case when coalesce(agg.games_played, 0) > 0
              then round(agg.season_fp / agg.games_played, 1)
         end                      as fp_per_game
    from public.card_instances ci
    join public.cards c   on c.id = ci.card_id
    join public.players p on p.id = c.player_id
    left join public.teams t on t.id = p.team_id
    join public.tier_thresholds cur on cur.tier = ci.tier
    left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1
    left join lateral (
      select sum(fp.points) as season_fp, count(*) as games_played
        from public.stat_lines sl
        join public.fantasy_points fp
          on fp.stat_line_id = sl.id
         and fp.rules_version = (select version from public.scoring_rules where is_active limit 1)
       where sl.player_id = p.id
         and sl.season = c.season
    ) agg on true
   where ci.sold_at is null;

grant select on public.my_collection to authenticated;
revoke all on public.my_collection from anon;

comment on column public.my_collection.fp_per_game is
  'The PLAYER''s fantasy points per scored game this season. Not a projection — the provider sells none. Null when he has no scored games yet.';
