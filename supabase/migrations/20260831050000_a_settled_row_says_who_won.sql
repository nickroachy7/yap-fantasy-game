-- A settled lineup row carries its FIXTURE, so it can be the same row.
--
-- ---------------------------------------------------------------------------
-- TWO ROWS FOR ONE OBJECT, AND THE DIFFERENCE WAS THE COLUMN LIST
-- ---------------------------------------------------------------------------
--
-- The lineup board draws a card in three lines: who he is, WHAT HIS GAME WAS,
-- and what the card has earned. `contest_lineup` returned the first and the
-- third and nothing at all for the second, so a settled entry drew a two-line
-- row where the board draws a three-line one — a different object, in the one
-- place a player is comparing the two.
--
-- `started` was the whole of what this function knew about the fixture, and it
-- is a boolean: enough to grey a figure, not enough to name a game. So a card
-- on a bye and a card whose quarterback was benched looked identical, and the
-- most-asked question about a finished week — who won — was answerable nowhere
-- on the screen reporting it.
--
--   opponent      the other club's abbreviation, from this card's side
--   home          which side that was
--   starts_at     so an UNPLAYED row can still say when
--   status_state  scheduled / in progress / final, the provider's own word
--   status_text   `Final/OT`, or a quarter and a clock
--   team_score    his club's points
--   opp_score     theirs
--
-- The last two are what let the row say `W 27–13 vs BUF` instead of `FINAL vs
-- BUF`. THE MARK IS DERIVED ON THE CLIENT rather than sent as a letter,
-- because a W is a comparison of two numbers this function is already
-- returning, and a server that sends both the numbers and the verdict is a
-- server that can be caught disagreeing with itself.
--
-- ---------------------------------------------------------------------------
-- NONE OF THIS IS A DISCLOSURE
-- ---------------------------------------------------------------------------
--
-- This function is `security definer` over other people's lineups, so every
-- column added to it is a decision — see 20260831020000, which set that rule,
-- and 20260831040000, which weighed the money columns against it.
--
-- These seven need no weighing at all. A GAME IS PUBLIC. Who played whom, when
-- they kicked off and what the score was is the same fact on the Scores tab,
-- on every other lineup in the contest, and on television. Nothing here is a
-- fact about the card's owner, or even about the card.
--
-- `starts_at` deserves the one sentence: it is the only column that says
-- anything about the future, and what it says is when a fixture the whole
-- league shares begins. `game_has_started` was already reading it inside this
-- function to compute `started`; returning it lets the row say "Sun 1:05p"
-- where it could previously only say nothing.
--
-- ---------------------------------------------------------------------------
-- THE JOIN IS UNCHANGED, INCLUDING ITS ONE KNOWN WEAKNESS
-- ---------------------------------------------------------------------------
--
-- `games` is joined on the week plus "this player's club is one of the two
-- sides", which is how every other fixture read in this schema does it and
-- which is why a bye returns no row and reads as null throughout. It is a LEFT
-- join and stays one: a card whose club is not playing must still appear in
-- the lineup it was filed into.

drop function if exists public.contest_lineup(uuid, uuid);

create function public.contest_lineup(p_contest uuid, p_user uuid)
returns table (
  slot            text,
  player_id       uuid,
  player_name     text,
  pos             text,
  team            text,
  tier            public.card_tier,
  points          numeric,
  started         boolean,
  career_fp       numeric,
  tier_floor_fp   numeric,
  next_tier_at    numeric,
  next_tier_label public.card_tier,
  gems            integer,
  bonus_gems      integer,
  awarded         boolean,
  opponent        text,
  home            boolean,
  starts_at       timestamptz,
  status_state    text,
  status_text     text,
  team_score      integer,
  opp_score       integer
)
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  v_exists boolean;
begin
  select true into v_exists
    from public.lineups l
   where l.contest_id = p_contest
     and l.user_id = p_user
   limit 1;

  if v_exists is null then
    raise exception 'that player is not in this contest' using errcode = '22023';
  end if;

  return query
    select ls.slot,
           p.id,
           p.full_name,
           -- THE ABBREVIATION, not `position`. The old peek drew `p.position`
           -- and rendered "Wide Receiver" into a row sized for "WR"; the
           -- lineup page this now feeds is the same shape as the owner's own
           -- board, where the code is what the eye reads.
           coalesce(p.position_abbreviation, p.position),
           t.abbreviation,
           ci.tier,
           ls.points,
           coalesce(public.game_has_started(g.status_state, g.starts_at), false),
           ci.career_fp,
           cur.min_career_fp,
           nxt.min_career_fp,
           nxt.tier,
           ls.gems_awarded,
           ls.bonus_gems,
           -- The SCORE award is what decides this, not the bonus. Bonuses are
           -- paid to a handful of slots a week (`award_position_bonuses` pays
           -- the top finishers at each position and nobody else), so keying
           -- off `bonus_gems` would report every ordinary card in a fully paid
           -- week as still waiting.
           ls.gems_awarded is not null,
           -- The fixture, always from THIS CARD'S SIDE. Same shape as
           -- `player_game_log` writes it, and for the same reason: a row that
           -- returned home and away and left the client to work out which one
           -- it was looking at would be handing over a subtraction nobody
           -- should have to do twice.
           case
             when p.team_id = g.home_team_id    then vt.abbreviation
             when p.team_id = g.visitor_team_id then ht.abbreviation
           end,
           case when p.team_id is null then null else p.team_id = g.home_team_id end,
           g.starts_at,
           g.status_state,
           g.status,
           case
             when p.team_id = g.home_team_id    then g.home_score
             when p.team_id = g.visitor_team_id then g.visitor_score
           end,
           case
             when p.team_id = g.home_team_id    then g.visitor_score
             when p.team_id = g.visitor_team_id then g.home_score
           end
      from public.lineups l
      join public.contests  ct on ct.id = l.contest_id
      join public.lineup_slots  ls on ls.lineup_id = l.id
      join public.card_instances ci on ci.id = ls.card_instance_id
      join public.cards   cd on cd.id = ci.card_id
      join public.players p  on p.id  = cd.player_id
      left join public.teams t on t.id = p.team_id
      -- The ladder, exactly as `card_profile` reads it: the tier the card is
      -- standing on, and the one above it if there is one. `nxt` is a LEFT
      -- join because the top tier has nothing above it and must still return
      -- its row — a diamond card that vanished from a settled lineup would be
      -- the worst possible way to learn this join was inner.
      join public.tier_thresholds cur on cur.tier = ci.tier
      left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1
      left join public.contest_format_slots fs
             on fs.format_code = ct.format_code and fs.slot = ls.slot
      left join public.games g
             on g.season = l.season and g.season_type = l.season_type and g.week = l.week
            and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
      -- Both clubs, so the CASEs above can pick whichever one is not his. Left
      -- joins off a left join: on a bye there is no `g` to have sides.
      left join public.teams ht on ht.id = g.home_team_id
      left join public.teams vt on vt.id = g.visitor_team_id
     where l.contest_id = p_contest
       and l.user_id = p_user
     order by fs.display_order nulls last, ls.slot;
end;
$$;

-- Both lines, every time. See 20260831040000: a `grant` on its own does not
-- undo Postgres's default of EXECUTE-to-PUBLIC on a newly created function, and
-- leaving the revoke off is how this `security definer` function came to be
-- reachable by `anon` twice.
grant  execute on function public.contest_lineup(uuid, uuid) to authenticated;
revoke execute on function public.contest_lineup(uuid, uuid) from public, anon;
