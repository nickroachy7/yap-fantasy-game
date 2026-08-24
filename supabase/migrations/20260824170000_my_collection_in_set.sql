-- "This player is already in a set", on the grid rather than after the fact.
--
-- The inventory can multi-select and push a handful of spares into sets, and it
-- had no way to say which of them a set would actually take. So you ticked
-- three duplicates, pressed Add, and got back "0 added — 3 skipped". The
-- information existed the whole time; it was just only reachable by trying.
--
-- ---------------------------------------------------------------------------
-- WHAT THE FLAG MEANS, PRECISELY
-- ---------------------------------------------------------------------------
--
-- `in_set` is TRUE when one of your OTHER copies of this same printed card has
-- already been committed. It is a fact about the player, not about the copy:
-- the copy in the grid is still held, still yours, still sellable and still
-- startable — what has gone is the slot it might have filled.
--
-- That is a narrower claim than "no set can take this", and deliberately so.
-- A card can belong to a team set AND to today's daily; committing it to the
-- daily fills that slot and leaves the team's open. So a card may be `in_set`
-- and still commitable somewhere else, and the client must not read this as
-- "ineligible" — `card_actions` remains the only thing that answers that, per
-- card, with `can_commit`.
--
-- WHY THE NARROW ONE IS THE ONE THAT GOES ON THE VIEW. The full question needs
-- the set membership joined and each set's requirement counted, per row, on a
-- view that renders an entire collection on one screen. The narrow one is a
-- single EXISTS on `card_id` against a partial index, and it happens to be the
-- exact thing a player wants to see on a duplicate: this man is already in.
-- The eligibility question is asked once, of the selection, at the moment it
-- matters — which is what the Add button already does.
--
-- Appended rather than inserted. `create or replace view` can only add columns
-- at the end, and every existing column keeps its name, type and position so
-- nothing that selects from this has to change.
--
-- `security_invoker = on`, spelled the way every other view in this schema
-- spells it. `= true` is the identical setting and Postgres stores the literal
-- you wrote, so the option came back as `security_invoker=true` and
-- view_security.test.sql — which matched the string — reported this view as
-- SECURITY DEFINER. The test now matches the VALUE; this matches the house
-- style, and either alone would have been enough.

create or replace view public.my_collection
with (security_invoker = on) as
 SELECT ci.id,
    ci.user_id,
    ci.card_id,
    p.full_name AS player_name,
    p.position_abbreviation,
    t.abbreviation AS team_abbreviation,
    p.injury_status,
    ci.tier,
    ci.career_fp,
    ci.lineup_starts,
    cur.min_career_fp AS tier_floor_fp,
    nxt.min_career_fp AS next_tier_at,
    nxt.tier AS next_tier_label,
    c.season,
    ci.acquired_at,
    c.player_id,
    cur.sell_value,
        CASE
            WHEN COALESCE(agg.games_played, 0::bigint) > 0 THEN round(agg.season_fp / agg.games_played::numeric, 1)
            ELSE NULL::numeric
        END AS fp_per_game,
    -- Scoped by `ci.user_id` rather than by `auth.uid()`. The view is
    -- security_invoker and carries the owning user on every row, so the
    -- correlation is both cheaper and correct for any caller RLS lets through.
    EXISTS (
      SELECT 1
        FROM card_instances mine
       WHERE mine.card_id = ci.card_id
         AND mine.user_id = ci.user_id
         AND mine.committed_at IS NOT NULL
    ) AS in_set
   FROM card_instances ci
     JOIN cards c ON c.id = ci.card_id
     JOIN players p ON p.id = c.player_id
     LEFT JOIN teams t ON t.id = p.team_id
     JOIN tier_thresholds cur ON cur.tier = ci.tier
     LEFT JOIN tier_thresholds nxt ON nxt.sort_order = (cur.sort_order + 1)
     LEFT JOIN LATERAL ( SELECT sum(fp.points) AS season_fp,
            count(*) AS games_played
           FROM stat_lines sl
             JOIN fantasy_points fp ON fp.stat_line_id = sl.id AND fp.rules_version = (( SELECT scoring_rules.version
                   FROM scoring_rules
                  WHERE scoring_rules.is_active
                 LIMIT 1))
          WHERE sl.player_id = p.id AND sl.season = c.season) agg ON true
  WHERE ci.is_held;

comment on column public.my_collection.in_set is
  'True when another copy of this same printed card has already been committed to a set. A fact about the player, not about this copy — and NOT the same as "no set can take this"; see card_actions.can_commit.';
