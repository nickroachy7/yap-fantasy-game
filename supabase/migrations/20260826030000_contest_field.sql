-- Who else is in this contest, and when you may look at what they played.
--
-- ---------------------------------------------------------------------------
-- THE CONTEST PAGE HAD NO FIELD IN IT
-- ---------------------------------------------------------------------------
--
-- `contest/[code]` could tell you the format, the fee and a count, and that is
-- the whole of what a contest was allowed to be: a number of anonymous
-- entrants. Which is a strange thing for a game whose entire opponent model is
-- "you are somewhere in a base of managers" — the base was never once drawn as
-- people.
--
-- RLS on `lineups` is own-rows-only and must stay that way, so this is
-- SECURITY DEFINER, and everything it exposes is deliberate rather than
-- incidental: a name, an avatar, a score, a place, a result, a prize. Nothing
-- about anybody's collection, their wallet, their run or their hearts.
--
-- ---------------------------------------------------------------------------
-- `open` — WHEN A RIVAL'S LINEUP MAY BE READ, AND WHY IT IS NOT SIMPLY "NEVER"
-- ---------------------------------------------------------------------------
--
-- Players lock ONE AT A TIME now (`20260821210000`), so a week is not open then
-- shut — it drains over four days. That makes "show everybody's lineup" and
-- "show nobody's" both wrong:
--
--  - Open early and the last person to file reads the field's whole shape
--    before choosing, which is a real edge and a growing one as the base grows.
--  - Open never and the most interesting hour of the week — everybody scoring
--    at once, nothing left to change — is spent looking at a list of numbers
--    with no lineups behind them.
--
-- So it opens PER LINEUP, when every card in it has kicked off. Nothing can be
-- learned from a lineup that can no longer be acted on, and the reveal lands
-- exactly when curiosity peaks.
--
-- A BYE MUST NOT SEAL A LINEUP SHUT. The test is over games that EXIST: a
-- player whose team is not playing has no fixture to start, cannot score, and
-- would otherwise hold their manager's lineup closed for the entire week. The
-- inner join is what makes that the default rather than a special case.
--
-- YOUR OWN LINEUP IS ALWAYS OPEN. It is yours; the board is already showing it.

create or replace function public.contest_field(p_contest uuid)
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
  open         boolean
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
  -- Locked when nothing in it is still ahead of its kickoff. See the header on
  -- why this joins games rather than left-joining them.
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
         coalesce(e.user_id = auth.uid(), false) or lk.locked
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
  'Everybody in a contest: name, score, place, result, prize, and whether their lineup has locked and may be read. Security definer over RLS-hidden lineups, exposing only what a scoreboard needs.';

-- --------------------------------------------------------------- the peek

-- One entrant's lineup, once it has locked.
--
-- REFUSES RATHER THAN RETURNS NOTHING. An empty result is indistinguishable
-- from an empty lineup, and the difference between "they have not filed" and
-- "you may not look yet" is the whole rule this function enforces. The client
-- should never be guessing which one it is holding.
create or replace function public.contest_lineup(p_contest uuid, p_user uuid)
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
  v_open boolean;
  v_name text;
begin
  select f.open, f.display_name into v_open, v_name
    from public.contest_field(p_contest) f
   where f.user_id = p_user;

  if v_open is null then
    raise exception 'that player is not in this contest' using errcode = '22023';
  end if;

  if not v_open then
    raise exception '% opens when their last card kicks off',
      coalesce(v_name || '''s lineup', 'that lineup')
      using errcode = '55006';
  end if;

  return query
    select ls.slot,
           p.id,
           p.full_name,
           p.position,
           t.abbreviation,
           ci.tier,
           ls.points,
           coalesce(public.game_has_started(g.status_state, g.starts_at), false)
      from public.lineups l
      join public.lineup_slots  ls on ls.lineup_id = l.id
      join public.card_instances ci on ci.id = ls.card_instance_id
      join public.cards   cd on cd.id = ci.card_id
      join public.players p  on p.id  = cd.player_id
      left join public.teams t on t.id = p.team_id
      left join public.games g
             on g.season = l.season and g.season_type = l.season_type and g.week = l.week
            and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
     where l.contest_id = p_contest
       and l.user_id = p_user
     order by ls.points desc, p.last_name;
end;
$$;

grant execute on function public.contest_lineup(uuid, uuid) to authenticated;

comment on function public.contest_lineup(uuid, uuid) is
  'An entrant''s lineup, refused until every card in it has kicked off. The reveal rule lives in contest_field.open; this enforces it.';
