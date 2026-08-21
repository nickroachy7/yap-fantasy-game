-- The leaderboard was one board, and one board only ever answers one question:
-- who scored the most fantasy points. That is the question a fantasy app has to
-- answer, and it is also the only one this game's own mechanics make ANSWERABLE
-- for a player who has been here two weeks — by which time the points board is
-- settled enough that the bottom half has no reason to open it again.
--
-- Everything else the game asks you to do already produces a comparable number
-- and none of it was ever compared. You pull cards and watch one of them climb
-- to gold; nowhere says whether that is a good gold. You burn thirty cards into
-- the Bills; nowhere says whether anybody else did. You beat the median four
-- weeks running and finish eleventh on points because you started late; the one
-- board in the app records that as eleventh.
--
-- So: five more boards, each ranking the thing a different part of the game
-- actually produces.
--
--   best week   the single highest week anybody has posted
--   record      W-L-T against the field's median — the contest already played
--   collection  what a shelf is worth, in the gems it would sell for
--   cards       the best individual COPY in the game, whoever holds it
--   sets        rungs claimed, sets finished, cards burnt getting there
--
-- ---------------------------------------------------------------------------
-- WHY THESE ARE FUNCTIONS, AND WHY DEFINER
-- ---------------------------------------------------------------------------
--
-- Identical reasoning to `leaderboard()`, and it is worth restating because
-- these five widen the surface it opened. `lineups`, `card_instances` and
-- `set_milestone_claims` are all RLS-scoped to their owner, so an invoker-rights
-- version of any of these would aggregate exactly one row — the caller's own —
-- and return it as though it were the field. That is not a smaller answer, it
-- is a WRONG one, and it is indistinguishable from a real board.
--
-- A definer FUNCTION rather than a definer VIEW for the same reason as before:
-- the exposed columns become an explicit list somebody can read in a review.
-- What crosses the boundary here is a display name and aggregates over things
-- the game already publishes. Specifically NOT crossing it: gem balances, pack
-- history, what anybody paid for anything, and — on the cards board — anything
-- about a copy beyond the player it is of and how it has scored.
--
-- `card_instances.id` IS returned by board_cards, and it is safe: `card_profile`
-- filters on `ci.user_id = auth.uid()`, so the id of somebody else's copy opens
-- nothing. The client only makes the row pressable when the copy is yours.
--
-- ---------------------------------------------------------------------------
-- THE ONE RULE THESE ALL FOLLOW
-- ---------------------------------------------------------------------------
--
-- Each board ranks with `rank() over (order by <metric> desc, display_name asc)`
-- and then truncates, exactly as `leaderboard()` does. The name is the tiebreak
-- everywhere, so a tie needs an identical metric AND an identical name — which
-- makes every board's ordering reproducible on the client from the rows it was
-- handed, and that is what lets the screen sort, filter and find "you" without
-- a second round trip.

-- ---------------------------------------------------------------- best week
--
-- One row per player: their single best scored week, and which week it was.
--
-- The filter is `scored_at is not null` and nothing else, deliberately matching
-- `leaderboard()` rather than `median_record()`. The two disagree about what an
-- entrant is — the median excludes a lineup with no slots, because an empty
-- lineup is a nought that drags the middle down — and this board sits beside the
-- points board, so it has to agree with THAT one. An empty lineup can only ever
-- be somebody's best week if they have no other, in which case 0.0 is the true
-- answer to what their best week was.
create or replace function public.board_best_week(
  p_season      integer,
  p_season_type smallint default 2,
  p_limit       integer default 100
)
returns table (
  rank         bigint,
  user_id      uuid,
  display_name text,
  week         integer,
  points       numeric,
  weeks_played bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with weeks as (
    select l.user_id, l.week, l.total_points as pts
      from public.lineups l
     where l.season = p_season
       and l.season_type = p_season_type
       and l.scored_at is not null
  ),
  best as (
    -- Ties on points go to the EARLIER week: the first time you hit a number is
    -- when you posted it, and repeating it later does not move the record.
    select distinct on (w.user_id) w.user_id, w.week, w.pts
      from weeks w
     order by w.user_id, w.pts desc, w.week asc
  ),
  played as (
    select w.user_id, count(*) as n from weeks w group by w.user_id
  )
  select rank() over (order by b.pts desc, pr.display_name asc),
         b.user_id,
         pr.display_name,
         b.week,
         b.pts,
         pl.n
    from best b
    join public.profiles pr on pr.id = b.user_id
    join played pl on pl.user_id = b.user_id
   order by b.pts desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.board_best_week(integer, smallint, integer) from public, anon;
grant  execute on function public.board_best_week(integer, smallint, integer) to authenticated;

comment on function public.board_best_week(integer, smallint, integer) is
  'Every player''s single highest scored week, ranked. Same entrant rule as leaderboard().';

-- ---------------------------------------------------------------- record
--
-- The contest everybody is already playing, finally scored across the field.
--
-- `median_record` computes a week's median and tells the CALLER whether they
-- beat it. Every ingredient for everyone else's result was already in that
-- query and was thrown away at the last step, because the function's boundary
-- was "aggregates plus the caller's own line". This is the same computation
-- with the boundary drawn where `leaderboard()` draws it: names against
-- results, and nothing else.
--
-- THE ENTRANT RULE HERE IS median_record's, NOT leaderboard's, and the
-- difference is load-bearing. A lineup row with no slots is excluded, because
-- including it would move the MEDIAN — and a median computed one way here and
-- another way on the contest card would put two different numbers on two
-- screens describing the same week. Copy this predicate, never approximate it.
--
--   * `exists (lineup_slots)` — an opened screen is not an entry.
--   * FINAL weeks only. A live week has a moving median and no result yet.
--   * `entrants >= 2` — one entrant is their own median, and two is the
--     smallest field that has a middle somebody can be on one side of.
create or replace function public.board_record(
  p_season      integer,
  p_season_type smallint default 2,
  p_limit       integer default 100
)
returns table (
  rank         bigint,
  user_id      uuid,
  display_name text,
  wins         bigint,
  losses       bigint,
  ties         bigint,
  -- Weeks GRADED, which is not weeks played: a live week counts for neither.
  weeks        bigint,
  win_pct      numeric,
  -- Points over the graded weeks only, so the column never disagrees with the
  -- W-L beside it.
  points       numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with entries as (
    select l.week, l.user_id, l.total_points as pts
      from public.lineups l
     where l.season = p_season
       and l.season_type = p_season_type
       and exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  field as (
    select e.week,
           count(*) as entrants,
           round(
             (percentile_cont(0.5) within group (order by e.pts::double precision))::numeric,
             2
           ) as median
      from entries e
     group by e.week
  ),
  finality as (
    select g.week,
           bool_and(lower(coalesce(g.status_state, '')) in ('final', 'complete', 'completed'))
             as final
      from public.games g
     where g.season = p_season
       and g.season_type = p_season_type
       and g.week is not null
     group by g.week
  ),
  graded as (
    select e.user_id,
           e.pts,
           case when e.pts > f.median then 1 else 0 end as w,
           case when e.pts < f.median then 1 else 0 end as l,
           case when e.pts = f.median then 1 else 0 end as t
      from entries e
      join field f on f.week = e.week
      left join finality fin on fin.week = e.week
     where coalesce(fin.final, false)
       and f.entrants >= 2
  ),
  tallied as (
    select g.user_id,
           sum(g.w)   as wins,
           sum(g.l)   as losses,
           sum(g.t)   as ties,
           count(*)   as weeks,
           sum(g.pts) as points,
           -- A tie is half a win, which is how every sport that has ties does
           -- it, and it keeps a 1-0-1 ahead of a 1-1-0 without inventing a
           -- rule for the tie column.
           round((sum(g.w) + sum(g.t) / 2.0) / count(*), 3) as win_pct
      from graded g
     group by g.user_id
  )
  -- Ordered by RATE and then by wins. Rate is what a record means, and the
  -- secondary sort on wins is what stops a 1-0 outranking a 6-0 on a technical
  -- tie — the player with more weeks has proved the same rate against more of
  -- the season.
  select rank() over (order by ta.win_pct desc, ta.wins desc, pr.display_name asc),
         ta.user_id,
         pr.display_name,
         ta.wins,
         ta.losses,
         ta.ties,
         ta.weeks,
         ta.win_pct,
         ta.points
    from tallied ta
    join public.profiles pr on pr.id = ta.user_id
   order by ta.win_pct desc, ta.wins desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.board_record(integer, smallint, integer) from public, anon;
grant  execute on function public.board_record(integer, smallint, integer) to authenticated;

comment on function public.board_record(integer, smallint, integer) is
  'Every player''s W-L-T against the field''s weekly median. Shares median_record''s entrant and finality rules exactly — change both together or the two screens will print different medians.';

-- ---------------------------------------------------------------- collection
--
-- How big a shelf is, and what it is worth.
--
-- THE HEADLINE IS SELL VALUE, not the number of cards, and that is the whole
-- design of this board. Counting cards ranks whoever opened the most packs,
-- which is a measure of gems spent and nothing else. Sell value is
-- tier-weighted — 8 bronze, 40 silver, 150 gold, 500 diamond — and tier is
-- earned by STARTING a card, so the board rewards playing a collection rather
-- than hoarding it. A shelf of forty bronze is worth 320; one gold is worth 150
-- on its own.
--
-- It is priced off `tier_thresholds.sell_value`, the same table `sell_card`
-- pays out of, so the number on this board is the number you would actually
-- receive. If sell values are ever re-tuned this board moves with them, which
-- is correct: it is a valuation, not a record of anything that happened.
--
-- `is_held` only. A sold copy is gone and a copy burnt into a set is gone; a
-- board that counted either would let a shelf grow by emptying it.
create or replace function public.board_collection(
  -- Null means every season. There is one season in 2026, and this is here so
  -- that the second season does not silently pool with the first.
  p_season integer default null,
  p_limit  integer default 100
)
returns table (
  rank         bigint,
  user_id      uuid,
  display_name text,
  value_gems   bigint,
  held         bigint,
  -- DISTINCT cards, so three copies of one player count once. The difference
  -- between the two columns is how much of a shelf is duplicates.
  players      bigint,
  gold_plus    bigint,
  diamond      bigint,
  -- What the whole shelf has scored. Says whether it is played or stored.
  career_fp    numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with owned as (
    select ci.user_id,
           count(*)                                            as held,
           count(distinct ci.card_id)                          as players,
           sum(t.sell_value)::bigint                           as value_gems,
           -- The enum's own labels rather than a sort_order threshold: a magic
           -- `>= 3` is a silent lie the day a fifth tier is inserted.
           count(*) filter (where ci.tier in ('gold', 'diamond')) as gold_plus,
           count(*) filter (where ci.tier = 'diamond')           as diamond,
           sum(ci.career_fp)                                     as career_fp
      from public.card_instances ci
      join public.cards c            on c.id = ci.card_id
      join public.tier_thresholds t  on t.tier = ci.tier
     where ci.is_held
       and (p_season is null or c.season = p_season)
     group by ci.user_id
  )
  select rank() over (order by o.value_gems desc, pr.display_name asc),
         o.user_id,
         pr.display_name,
         o.value_gems,
         o.held,
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
  'Held collections ranked by what they would sell for, priced off tier_thresholds.sell_value.';

-- ---------------------------------------------------------------- cards
--
-- The best individual COPY in the game — not the best player, the best copy.
--
-- This is the board the game has been implying since tier progression shipped
-- and never showed. `career_fp` is per copy and only moves when the copy is
-- STARTED, so two people holding the same player have two different cards and
-- the difference between them is entirely what their owners did. Nothing else
-- in the app makes that legible.
--
-- `career_fp > 0` is a real filter, not a tidy-up. Every unplayed copy sits at
-- exactly 0.00, so without it this returns hundreds of rows tied at nothing and
-- ordered by the player's surname, which looks like a ranking and is not one.
-- An empty board before the first lineup is scored is the honest state and the
-- screen says so in words.
create or replace function public.board_cards(
  p_season   integer default null,
  -- 'QB' | 'RB' | 'WR' | 'TE' | 'PK'. Null is every position. Kickers are PK
  -- here as everywhere — the provider's spelling, kept end to end.
  p_position text    default null,
  p_limit    integer default 100
)
returns table (
  rank                  bigint,
  card_instance_id      uuid,
  user_id               uuid,
  display_name          text,
  player_id             uuid,
  player_name           text,
  position_abbreviation text,
  team_abbreviation     text,
  tier                  public.card_tier,
  career_fp             numeric,
  lineup_starts         integer,
  fp_per_start          numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rank() over (order by ci.career_fp desc, p.full_name asc),
         ci.id,
         ci.user_id,
         pr.display_name,
         p.id,
         p.full_name,
         p.position_abbreviation,
         t.abbreviation,
         ci.tier,
         ci.career_fp,
         ci.lineup_starts,
         -- Null rather than 0 when a copy has never started: it has no rate,
         -- which is a different claim from a rate of nothing. career_fp can
         -- only be positive here if it HAS started, so this is null only in the
         -- pathological case of points without a start.
         case when ci.lineup_starts > 0
              then round(ci.career_fp / ci.lineup_starts, 1) end
    from public.card_instances ci
    join public.cards   c  on c.id = ci.card_id
    join public.players p  on p.id = c.player_id
    left join public.teams t on t.id = p.team_id
    join public.profiles pr on pr.id = ci.user_id
   where ci.is_held
     and ci.career_fp > 0
     and (p_season is null or c.season = p_season)
     and (p_position is null or upper(p.position_abbreviation) = upper(p_position))
   order by ci.career_fp desc, p.full_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.board_cards(integer, text, integer) from public, anon;
grant  execute on function public.board_cards(integer, text, integer) to authenticated;

comment on function public.board_cards(integer, text, integer) is
  'The highest-scoring held card COPIES in the game, with the owner''s display name. Unplayed copies are excluded rather than tied at zero.';

-- ---------------------------------------------------------------- sets
--
-- What the Sets tab produced, ranked.
--
-- FOUR COUNTS, because a set is not one achievement. A team set pays at 25, 50,
-- 75 and 100 percent of its requirement, so "rungs" is the board's headline —
-- it is the number that moves most weeks and the one that separates two players
-- who have both finished nothing. `completed` is the prestige column and stays
-- at zero for most of a season, which is exactly why it cannot be the sort.
--
-- DAILIES ARE COUNTED SEPARATELY AND NEVER MIXED INTO `rungs`. A daily is a new
-- `card_sets` row every day and pays one rung each, so folding them in would
-- rank pure attendance above a season-long chase within about six weeks. Two
-- columns, two different things — which is the same split the Sets screen
-- itself draws.
--
-- `burned` counts copies committed. It is the price paid, printed next to what
-- it bought, and it is the one number here that can make a high rank look
-- expensive rather than impressive.
create or replace function public.board_sets(
  p_limit integer default 100
)
returns table (
  rank         bigint,
  user_id      uuid,
  display_name text,
  rungs        bigint,
  sets         bigint,
  completed    bigint,
  dailies      bigint,
  burned       bigint,
  gems         bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with claims as (
    select cl.user_id, cl.set_id, s.family, cl.threshold_pct, cl.reward_gems
      from public.set_milestone_claims cl
      join public.card_sets s on s.id = cl.set_id
  ),
  burnt as (
    select ci.user_id, count(*) as burned
      from public.card_instances ci
     where ci.committed_at is not null
     group by ci.user_id
  ),
  -- Driven by the union rather than by claims alone, so somebody who has burnt
  -- cards into a set and not yet reached its first rung still appears — showing
  -- a cost with nothing bought yet, which is a true and useful row.
  people as (
    select user_id from claims
    union
    select user_id from burnt
  ),
  tallied as (
    select pe.user_id,
           count(c.set_id) filter (where c.family <> 'daily')                       as rungs,
           count(distinct c.set_id) filter (where c.family <> 'daily')              as sets,
           count(c.set_id) filter (where c.family <> 'daily' and c.threshold_pct = 100) as completed,
           count(distinct c.set_id) filter (where c.family = 'daily')               as dailies,
           coalesce(sum(c.reward_gems), 0)::bigint                                  as gems
      from people pe
      left join claims c on c.user_id = pe.user_id
     group by pe.user_id
  )
  select rank() over (
           order by ta.rungs desc, ta.dailies desc, ta.gems desc, pr.display_name asc
         ),
         ta.user_id,
         pr.display_name,
         ta.rungs,
         ta.sets,
         ta.completed,
         ta.dailies,
         coalesce(b.burned, 0),
         ta.gems
    from tallied ta
    join public.profiles pr on pr.id = ta.user_id
    left join burnt b on b.user_id = ta.user_id
   order by ta.rungs desc, ta.dailies desc, ta.gems desc, pr.display_name asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.board_sets(integer) from public, anon;
grant  execute on function public.board_sets(integer) to authenticated;

comment on function public.board_sets(integer) is
  'Set progress across the community: team-set rungs and completions, dailies cleared, copies burnt, gems paid.';
