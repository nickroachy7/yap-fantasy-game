-- A settled lineup row says what the card EARNED, not just what it scored.
--
-- ---------------------------------------------------------------------------
-- WHAT THE ROW COULD NOT SAY
-- ---------------------------------------------------------------------------
--
-- `EntryLineup` draws a finished entry: eight names, a slot badge, a tier
-- letter and a figure. It is the only place in the app where a card's week is
-- reported and the card itself is not — so a 9.8 sat there as a bare number,
-- with nothing to say that 9.8 is the whole reason the card is closer to
-- silver than it was on Saturday.
--
-- That is the story the screen is actually about. `career_fp` is a running
-- total of every slot the card has ever filled (see 20260821140000), so the
-- points already on the row ARE the increment — the row was holding one half
-- of a subtraction and could not reach the other.
--
-- Four columns close it, and they are the same four every other card surface
-- in this schema already returns: `my_collection`, `card_profile` and
-- `sell_card` all carry career_fp with the current tier's floor and the next
-- tier's threshold beside it. This is not a new vocabulary, it is the one the
-- lineup board and the card profile already speak, arriving somewhere it was
-- missing.
--
--   career_fp        what the card has earned, all weeks           -> the total
--   tier_floor_fp    where its CURRENT tier begins                 -> did it just cross
--   next_tier_at     where the next one begins                     -> how far to go
--   next_tier_label  which one that is                             -> to where
--
-- `tier_floor_fp` is the one that is not merely decorative. With it the client
-- can ask whether `career_fp - points` fell BELOW the floor the card is now
-- standing on — which is exactly the question "did this contest promote it",
-- and it cannot be answered from any three of the four.
--
-- CAREER_FP AND NOT SETTLED_FP, deliberately, and the distinction is the one
-- 20260821140000 drew: `settled_fp` is what tier is judged on, `career_fp` is
-- what a player watches. Every other display surface in the app shows
-- career_fp against next_tier_at, so showing settled_fp here would make the
-- same card report two different totals on two screens — a worse failure than
-- the live-swing optimism it would be protecting against, which the tier
-- letter itself is already immune to.
--
-- ---------------------------------------------------------------------------
-- IT IS EVERYONE'S CARD, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT
-- ---------------------------------------------------------------------------
--
-- This function is `security definer` over OTHER PEOPLE'S lineups, so its
-- column list is its access control and every addition to it is a disclosure.
-- These four are disclosed knowingly:
--
--   `contest_field` already returns every entrant's display name, avatar,
--   total, rank, result and prize. This function already returns each card's
--   TIER — which is career_fp with a threshold applied to it, so the class of
--   fact is not new; only its precision is.
--
--   A contest is a public comparison. "Whose cards have played more football"
--   is the substance of that comparison, not a leak from beside it.
--
-- What stays out: anything about the OWNER rather than the card — what they
-- paid, what they hold, what else they entered. The gate below is unchanged
-- and still refuses a user who is not in this contest.

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
  next_tier_label public.card_tier
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
           nxt.tier
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
     where l.contest_id = p_contest
       and l.user_id = p_user
     order by fs.display_order nulls last, ls.slot;
end;
$$;

-- Re-granted rather than inherited: a `drop`/`create` takes the old grants with
-- it, and 20260830020000 exists because this function was once reachable by
-- `anon`. Authenticated only, and nothing else, every time it is rewritten.
grant execute on function public.contest_lineup(uuid, uuid) to authenticated;
