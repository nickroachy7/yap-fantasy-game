-- A rival's lineup can be read the moment it is filed.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS REVERSES, AND WHY
-- ---------------------------------------------------------------------------
--
-- `20260826030000` gated the peek on a REVEAL RULE: a lineup opened only once
-- every card in it had kicked off, so the last person to file could not read
-- the field's shape before choosing. That argument is still true — it is a real
-- edge, and it grows with the base. It is being traded away deliberately.
--
-- What it cost was the whole point of drawing the field as people. Before
-- kickoff — which is where a contest spends five of its seven days, and the
-- only stretch in which anybody is still deciding anything — every row in the
-- field said "opens when their last card kicks off". A page whose entire
-- subject is who else is in this thing answered "not yet" for the days it was
-- being read, and answered it about everybody at once.
--
-- So the contest is OPEN INFORMATION now: entries are public the moment they
-- are filed, the way a DFS lobby is, and the counter-play — reading the field
-- and picking against it — becomes part of playing rather than something the
-- server prevents. `one card, one contest a week` is what actually stops a
-- lineup being copied wholesale: the cards in it are already spent.
--
-- ---------------------------------------------------------------------------
-- `open` BECAME `locked`, WHICH IS THE FACT THAT WAS UNDERNEATH IT ALL ALONG
-- ---------------------------------------------------------------------------
--
-- The column computed "every card in this lineup has kicked off" and named it
-- for the permission it was granting. The permission is gone; the fact is worth
-- keeping and worth naming honestly, because it is what tells a reader whether
-- what they are looking at can still change. An unlocked lineup is a draft.
--
-- Renaming an output column cannot be done with `create or replace`, hence the
-- drops. `contest_lineup` goes first — it reads `contest_field`.

drop function if exists public.contest_lineup(uuid, uuid);
drop function if exists public.contest_field(uuid);

create function public.contest_field(p_contest uuid)
returns table (
  user_id      uuid,
  display_name text,
  avatar_key   text,
  lineup_id    uuid,
  filled       integer,
  points       numeric,
  rnk          bigint,
  result       text,
  prize        integer,
  is_me        boolean,
  locked       boolean
)
language sql
stable security definer
set search_path = public, pg_temp
as $fn$
  with c as (
    select id, season, season_type, week from public.contests where id = p_contest
  ),
  -- A lineup with no slots is not an entrant, the same rule `contest_results`
  -- applies. "Opened the screen" is not a thing to rank.
  entries as (
    select l.id, l.user_id, l.total_points as pts,
           (select count(*)::integer from public.lineup_slots s where s.lineup_id = l.id) as filled
      from public.lineups l
      join c on c.id = l.contest_id
     where exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
  -- Nothing in it is still ahead of its kickoff, so nothing in it can be
  -- changed. A BYE MUST NOT HOLD A LINEUP OPEN FOREVER: the test is over games
  -- that EXIST, which is what the inner join makes the default rather than a
  -- special case — a player whose team is not playing has no fixture to start.
  lock as (
    select e.id,
           not exists (
             select 1
               from public.lineup_slots ls
               join public.card_instances ci on ci.id = ls.card_instance_id
               join public.cards   cd on cd.id = ci.card_id
               join public.players p  on p.id  = cd.player_id
               join public.games   g
                 on g.season = (select season from c)
                and g.season_type = (select season_type from c)
                and g.week = (select week from c)
                and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
              where ls.lineup_id = e.id
                and not public.game_has_started(g.status_state, g.starts_at)
           ) as locked
      from entries e
  )
  select e.user_id,
         pr.display_name,
         pr.avatar_key,
         e.id,
         e.filled,
         e.pts,
         rank() over (order by e.pts desc),
         cr.result,
         cp.gems,
         coalesce(e.user_id = auth.uid(), false),
         lk.locked
    from entries e
    join public.profiles pr on pr.id = e.user_id
    join lock lk on lk.id = e.id
    left join lateral (
      select r.result from public.contest_results(p_contest) r where r.lineup_id = e.id
    ) cr on true
    left join lateral (
      select p.gems from public.contest_payouts(p_contest) p where p.lineup_id = e.id
    ) cp on true
   order by e.pts desc, pr.display_name;
$fn$;

grant execute on function public.contest_field(uuid) to authenticated;

comment on function public.contest_field(uuid) is
  'Everybody in a contest: name, score, place, result, prize, and whether their lineup has locked. Security definer over RLS-hidden lineups, exposing only what a scoreboard needs.';

-- --------------------------------------------------------------- the lineup

-- One entrant's lineup.
--
-- IT STILL REFUSES ON A STRANGER, and that is the one refusal left: asking for
-- somebody who is not in this contest is a bad request rather than an empty
-- lineup, and returning nothing would make the two indistinguishable.
--
-- ORDERED BY THE FORMAT'S OWN SLOT ORDER, not by points. Points sorted a lineup
-- that had scored and randomised one that had not — which is now the common
-- case, since the page can be opened days before kickoff. `display_order` is
-- the order the owner filled the slots in and the order their own board draws
-- them, so a rival's lineup reads as the same object as yours.
create function public.contest_lineup(p_contest uuid, p_user uuid)
returns table (
  slot         text,
  player_id    uuid,
  player_name  text,
  pos          text,
  team         text,
  tier         public.card_tier,
  points       numeric,
  started      boolean
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
           coalesce(public.game_has_started(g.status_state, g.starts_at), false)
      from public.lineups l
      join public.contests  ct on ct.id = l.contest_id
      join public.lineup_slots  ls on ls.lineup_id = l.id
      join public.card_instances ci on ci.id = ls.card_instance_id
      join public.cards   cd on cd.id = ci.card_id
      join public.players p  on p.id  = cd.player_id
      left join public.teams t on t.id = p.team_id
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

grant execute on function public.contest_lineup(uuid, uuid) to authenticated;

comment on function public.contest_lineup(uuid, uuid) is
  'An entrant''s lineup, in the format''s own slot order. Public from the moment it is filed — see 20260830010000 for the trade that was made.';
