-- `manager_profile` reads `board_collection`, and `board_collection` changed.
--
-- Dropping `gold_plus` from that board (20260903210500) broke this function at
-- RUNTIME rather than at migration time: a SQL function's body is not resolved
-- until it is called, so `db push` was clean and the profile sheet — and the
-- friends suite that exercises it — went red on the next call. A column removed
-- from a function that other functions select from is a signature change, and
-- this is the half of it that was missed.
--
-- WHAT IT DOES NOT DO IS RENAME ANYTHING. `manager_profile` still returns
-- `gold_plus`, still meaning gold and better, so `friends.ts` and every reader
-- of the profile sheet are untouched. The board underneath it counts each tier
-- separately now, and gold-plus is a sum of two of them.
--
-- `create or replace`: the return type is unchanged, so the ACL survives.

create or replace function public.manager_profile(
  p_user        uuid,
  p_season      integer default null,
  p_season_type smallint default null
)
returns table (
  user_id       uuid,
  display_name  text,
  member_since  timestamptz,
  season        integer,
  season_type   smallint,
  friend_state  text,
  friends_since timestamptz,
  friend_count  bigint,
  points        numeric,
  weeks_played  bigint,
  points_rank   bigint,
  field_size    bigint,
  best_week     integer,
  best_points   numeric,
  wins          bigint,
  losses        bigint,
  ties          bigint,
  win_pct       numeric,
  cards         bigint,
  in_sets       bigint,
  players       bigint,
  gold_plus     bigint,
  diamond       bigint,
  value_coins   bigint,
  career_fp     numeric,
  value_rank    bigint,
  sets_done     bigint,
  rungs         bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with slate as (
    select coalesce(p_season, (select s.season from public.current_slate() s),
                    (select max(g.season) from public.games g)) as season,
           coalesce(p_season_type, (select s.season_type from public.current_slate() s),
                    2::smallint) as season_type
  ),
  lb    as (select l.* from slate s, public.leaderboard(s.season, s.season_type, null, 500) l),
  best  as (select b.* from slate s, public.board_best_week(s.season, s.season_type, 500) b),
  rec   as (select r.* from slate s, public.board_record(s.season, s.season_type, 500) r),
  coll  as (select c.* from slate s, public.board_collection(s.season, 500) c),
  -- Not `sets`: that is a keyword in GROUPING SETS and a CTE by that name
  -- is a fight with the parser for no gain.
  setb  as (select x.* from public.board_sets(500) x)
  select pr.id,
         pr.display_name,
         pr.created_at,
         (select season from slate),
         (select season_type from slate),
         public.friend_link(auth.uid(), pr.id),
         (select f.answered_at
            from public.friendships f
           where f.state = 'accepted'
             and least(f.requester_id, f.addressee_id)    = least(auth.uid(), pr.id)
             and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), pr.id)),
         (select count(*)
            from public.friendships f
           where f.state = 'accepted' and pr.id in (f.requester_id, f.addressee_id)),
         me_lb.total_points,
         me_lb.weeks_played,
         me_lb.rank,
         (select count(*) from lb),
         me_best.week,
         me_best.points,
         me_rec.wins,
         me_rec.losses,
         me_rec.ties,
         me_rec.win_pct,
         me_coll.held,
         me_coll.in_sets,
         me_coll.players,
         -- `board_collection` returns a count per tier now; this column keeps
         -- its old name and meaning, which is gold and better.
         coalesce(me_coll.gold, 0) + coalesce(me_coll.diamond, 0),
         me_coll.diamond,
         me_coll.value_coins,
         me_coll.career_fp,
         me_coll.rank,
         me_sets.completed,
         me_sets.rungs
    from public.profiles pr
    left join lb      me_lb   on me_lb.user_id   = pr.id
    left join best    me_best on me_best.user_id = pr.id
    left join rec     me_rec  on me_rec.user_id  = pr.id
    left join coll    me_coll on me_coll.user_id = pr.id
    left join setb    me_sets on me_sets.user_id = pr.id
   where pr.id = p_user;
$$;
