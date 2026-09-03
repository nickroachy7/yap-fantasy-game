-- Friends: the first thing in this game that is a RELATIONSHIP rather than a
-- number, and the first table two players write to about each other.
--
-- ---------------------------------------------------------------------------
-- WHY ONE ROW PER PAIR, NOT ONE PER DIRECTION
-- ---------------------------------------------------------------------------
--
-- The obvious schema is two rows — `a follows b`, `b follows a` — and it is the
-- right one for a FOLLOW, which is unilateral. A friendship is not: it is one
-- fact ("these two are friends") that happens to be established by a request
-- travelling one way. Two rows for one fact means the two can disagree, and the
-- disagreement is silent: A's row says accepted, B's says pending, and each
-- player sees a different truth about the same friendship.
--
-- So: ONE ROW PER PAIR, holding both the fact and its direction. `requester_id`
-- and `addressee_id` say who asked whom — which is what the inbox needs — and
-- `state` says where the ask got to. The unique index is on the pair ORDERED
-- (`least`, `greatest`), so A→B and B→A collide on insert rather than becoming
-- two rows nobody reconciles.
--
-- The consequence to know about: accepting does NOT rewrite the row into a
-- symmetric shape. An accepted friendship still remembers who asked. Every
-- reader below therefore normalises with `case when requester_id = me then
-- addressee_id else requester_id end` — "the other one" — and that expression
-- is the whole trick to reading this table.
--
-- ---------------------------------------------------------------------------
-- ASKING BACK IS ACCEPTING
-- ---------------------------------------------------------------------------
--
-- Two people who each open the other's profile and press the button both
-- expect to end up friends. With a unique pair index the second press would
-- otherwise be a constraint violation shown as "something went wrong", which
-- is the worst possible answer to a mutual yes. `friend_request` therefore
-- looks for a pending row pointing AT the caller and accepts it. Pressing the
-- button twice in the same direction is idempotent for the same reason.
--
-- ---------------------------------------------------------------------------
-- A DECLINE IS REMEMBERED, AND ONLY THE DECLINER CAN CLEAR IT
-- ---------------------------------------------------------------------------
--
-- Deleting the row on decline is simpler and it is what most beta code does.
-- It also means "no" costs the asker nothing: they can re-send immediately and
-- forever, and the only tool the declined-to has is to keep pressing no. So a
-- decline sets `declined` and the row stays. The requester cannot ask again.
--
-- It is deliberately NOT a block. The person who declined may still send their
-- own request later — `friend_request` flips the row's direction and reopens it
-- — and may clear the decline with `friend_remove`. What they cannot do is
-- receive another ask from someone they have already answered.
--
-- ---------------------------------------------------------------------------
-- NO CLIENT WRITES, AS EVERYWHERE ELSE
-- ---------------------------------------------------------------------------
--
-- There is a SELECT policy scoped to the two participants and NO insert,
-- update or delete policy, so the four verbs below are the only way this table
-- changes. That is the house rule from `20260818010000`, and it earns its keep
-- twice here: the pair-flip on a mutual request and the "only the addressee may
-- decline" rule are both invariants a client-side write could not be trusted
-- with. Assume Charles Proxy.
--
-- ---------------------------------------------------------------------------
-- WHAT THE READERS DO NOT EXPOSE
-- ---------------------------------------------------------------------------
--
-- No email, ever. `manager_profile` returns what the six community boards
-- already publish about every account — points, record, collection value, tier
-- counts, set rungs — plus a display name and a join date. Nothing here widens
-- what one player can learn about another; it re-cuts it by person instead of
-- by rank. That is also why the numbers come FROM the board functions rather
-- than from fresh aggregates: a profile that disagreed with the leaderboard
-- about someone's points would be a bug with two plausible sources.

-- ---------------------------------------------------------------- table

-- Idempotent because `db push` has no transaction: a migration that fails
-- halfway is re-run by hand, and `create type` is the one statement here that
-- would then be the thing that failed.
do $$
begin
  if not exists (select 1 from pg_type t
                   join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'friend_state') then
    create type public.friend_state as enum ('pending', 'accepted', 'declined');
  end if;
end $$;

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users on delete cascade,
  addressee_id uuid not null references auth.users on delete cascade,
  state        public.friend_state not null default 'pending',
  created_at   timestamptz not null default now(),
  -- When the addressee answered: the friendship's start date on an accepted
  -- row, and the refusal's date on a declined one. Null while pending.
  answered_at  timestamptz,
  constraint friendships_not_self check (requester_id <> addressee_id)
);

comment on table public.friendships is
  'One row per PAIR of managers, whichever way the request travelled. Read "the other one" as case when requester_id = auth.uid() then addressee_id else requester_id end. Written only by friend_request / friend_accept / friend_decline / friend_remove.';

-- The pair, ordered, is the real key. This is what makes A→B and B→A the same
-- row and turns a mutual request into an accept rather than a 23505.
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- One index per direction rather than one on the pair: every read below asks
-- "rows where I am either end", which is two index scans of these and no scan
-- of the expression index above.
create index if not exists friendships_requester_idx on public.friendships (requester_id, state);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, state);

-- ---------------------------------------------------------------- RLS

alter table public.friendships enable row level security;

-- Both participants can read their own row and nobody else's. Deliberately no
-- write policy: see the header.
drop policy if exists "participants read their friendships" on public.friendships;
create policy "participants read their friendships"
  on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ---------------------------------------------------------------- caps

insert into public.game_config (key, value, description) values
  ('friend_cap', 200,
   'Accepted friendships one account may hold. A ceiling against a scraped follow-everyone account, not a social limit anybody should reach.'),
  ('friend_pending_cap', 50,
   'Outgoing requests one account may have unanswered at once. This is the actual anti-spam number: a bot cannot queue a thousand asks.')
on conflict (key) do update
  set value       = excluded.value,
      description = excluded.description,
      updated_at  = now();

-- ---------------------------------------------------------------- the link

/**
 * Where two managers stand with each other, from the FIRST one's point of view.
 *
 * Every screen that draws a name needs this one word, and it has to be said
 * from a point of view: the same row is 'outgoing' to one of them and
 * 'incoming' to the other. The vocabulary is closed and the client switches on
 * it, so it is worth reading as a list:
 *
 *   self       the viewer
 *   none       no row — the button says "Send friend request"
 *   friends    accepted
 *   outgoing   the viewer asked and is waiting
 *   incoming   the other one asked; the viewer can accept or decline
 *   declined   the viewer asked and was refused. The one dead end.
 *   dismissed  the VIEWER refused them, and may still ask them themselves.
 */
create or replace function public.friend_link(p_viewer uuid, p_other uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_viewer is null or p_other is null then 'none'
    when p_viewer = p_other                  then 'self'
    else coalesce((
      select case
               when f.state = 'accepted' then 'friends'
               when f.state = 'pending'  then case when f.requester_id = p_viewer
                                                   then 'outgoing' else 'incoming' end
               else                           case when f.requester_id = p_viewer
                                                   then 'declined' else 'dismissed' end
             end
        from public.friendships f
       where least(f.requester_id, f.addressee_id)    = least(p_viewer, p_other)
         and greatest(f.requester_id, f.addressee_id) = greatest(p_viewer, p_other)
    ), 'none')
  end;
$$;

-- ---------------------------------------------------------------- verbs

/**
 * Ask, or answer an ask that is already pointing at you.
 *
 * Returns the state the pair is in afterwards — 'pending' or 'accepted' — so
 * the button that called it can redraw itself without a second read.
 */
create or replace function public.friend_request(p_user uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me      uuid := auth.uid();
  v_row     public.friendships;
  v_pending integer;
  v_friends integer;
begin
  if v_me is null then
    raise exception 'Sign in to add friends.';
  end if;
  if p_user is null or p_user = v_me then
    raise exception 'You cannot send yourself a friend request.';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_user) then
    raise exception 'No manager with that account.';
  end if;

  -- Locked, because two mutual requests landing at once would both see no row
  -- and both insert, and only the unique index would notice.
  select * into v_row
    from public.friendships f
   where least(f.requester_id, f.addressee_id)    = least(v_me, p_user)
     and greatest(f.requester_id, f.addressee_id) = greatest(v_me, p_user)
     for update;

  if found then
    if v_row.state = 'accepted' then
      return 'accepted';                      -- already friends; nothing to do
    elsif v_row.state = 'pending' then
      if v_row.requester_id = v_me then
        return 'pending';                     -- pressing again is not a second ask
      end if;
      -- They asked first. Asking back IS accepting — see the header.
      update public.friendships
         set state = 'accepted', answered_at = now()
       where id = v_row.id;
      return 'accepted';
    elsif v_row.requester_id = v_me then
      -- They said no. This is the one dead end in the vocabulary.
      raise exception 'That manager is not accepting a request from you.';
    else
      -- The viewer declined them once and is now asking. Same pair, new
      -- direction, clean slate.
      update public.friendships
         set requester_id = v_me,
             addressee_id = p_user,
             state        = 'pending',
             created_at   = now(),
             answered_at  = null
       where id = v_row.id;
      return 'pending';
    end if;
  end if;

  select count(*) into v_pending
    from public.friendships f
   where f.requester_id = v_me and f.state = 'pending';
  if v_pending >= public.game_config_value('friend_pending_cap', 50) then
    raise exception 'You have too many unanswered friend requests. Wait for a reply first.';
  end if;

  select count(*) into v_friends
    from public.friendships f
   where f.state = 'accepted' and v_me in (f.requester_id, f.addressee_id);
  if v_friends >= public.game_config_value('friend_cap', 200) then
    raise exception 'Your friends list is full.';
  end if;

  insert into public.friendships (requester_id, addressee_id, state)
  values (v_me, p_user, 'pending');
  return 'pending';
end;
$$;

/** Say yes. Only the addressee of a pending row can. */
create or replace function public.friend_accept(p_user uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me      uuid := auth.uid();
  v_friends integer;
  v_id      uuid;
begin
  if v_me is null then
    raise exception 'Sign in to answer friend requests.';
  end if;

  select f.id into v_id
    from public.friendships f
   where f.addressee_id = v_me and f.requester_id = p_user and f.state = 'pending'
     for update;
  if not found then
    -- Includes "already accepted", which is not an error worth showing.
    if public.friend_link(v_me, p_user) = 'friends' then
      return 'accepted';
    end if;
    raise exception 'That request is no longer waiting.';
  end if;

  select count(*) into v_friends
    from public.friendships f
   where f.state = 'accepted' and v_me in (f.requester_id, f.addressee_id);
  if v_friends >= public.game_config_value('friend_cap', 200) then
    raise exception 'Your friends list is full.';
  end if;

  update public.friendships
     set state = 'accepted', answered_at = now()
   where id = v_id;
  return 'accepted';
end;
$$;

/** Say no. The row stays, so they cannot ask again — see the header. */
create or replace function public.friend_decline(p_user uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to answer friend requests.';
  end if;

  select f.id into v_id
    from public.friendships f
   where f.addressee_id = auth.uid() and f.requester_id = p_user and f.state = 'pending'
     for update;
  if not found then
    raise exception 'That request is no longer waiting.';
  end if;

  update public.friendships
     set state = 'declined', answered_at = now()
   where id = v_id;
  return 'dismissed';
end;
$$;

/**
 * Undo whatever there is to undo: withdraw an ask nobody has answered, unfriend
 * someone, or clear a decline you gave so they can ask again.
 *
 * ONE VERB FOR THREE ACTIONS, because the client's need is one — "put this pair
 * back to nothing" — and the three differ only in which row happens to be
 * there. What it deliberately CANNOT do is clear a decline you RECEIVED: that
 * row is the other person's answer, not yours.
 */
create or replace function public.friend_remove(p_user uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Sign in to manage your friends.';
  end if;

  delete from public.friendships f
   where least(f.requester_id, f.addressee_id)    = least(v_me, p_user)
     and greatest(f.requester_id, f.addressee_id) = greatest(v_me, p_user)
     and (
       -- mine to undo: a friendship, or an ask I sent
       (f.state <> 'declined' and v_me in (f.requester_id, f.addressee_id))
       -- or a no I gave, which I am allowed to take back
       or (f.state = 'declined' and f.addressee_id = v_me)
     );
  return 'none';
end;
$$;

-- ---------------------------------------------------------------- readers

/**
 * Your friends, with enough of each one's season to be worth a row.
 *
 * The numbers come from `leaderboard` and `board_collection` — one call each,
 * joined to the friend list — rather than from aggregates written here. Two
 * places computing "points this season" is two places to keep in step, and the
 * boards are the ones players compare against.
 *
 * `rank` and the collection figures are therefore NULL for a friend outside the
 * boards' 500-row window, which is the same dash the account screen already
 * draws for a rank it cannot stand behind.
 */
create or replace function public.my_friends(p_season integer default null, p_season_type smallint default null)
returns table (
  user_id      uuid,
  display_name text,
  friends_since timestamptz,
  points       numeric,
  weeks_played bigint,
  rank         bigint,
  cards        bigint,
  value_coins  bigint
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
  mine as (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as uid,
           f.answered_at
      from public.friendships f
     where f.state = 'accepted'
       and auth.uid() in (f.requester_id, f.addressee_id)
  ),
  lb as (
    select l.* from slate s, public.leaderboard(s.season, s.season_type, null, 500) l
  ),
  coll as (
    select b.* from slate s, public.board_collection(s.season, 500) b
  )
  select m.uid,
         pr.display_name,
         m.answered_at,
         lb.total_points,
         lb.weeks_played,
         lb.rank,
         coll.held,
         coll.value_coins
    from mine m
    join public.profiles pr on pr.id = m.uid
    left join lb   on lb.user_id   = m.uid
    left join coll on coll.user_id = m.uid
   order by pr.display_name asc;
$$;

/**
 * The inbox and the outbox in one list, because they are one panel: three
 * people waiting on you and one waiting on them is four rows, not two lists of
 * which one is usually empty.
 */
create or replace function public.my_friend_requests()
returns table (
  user_id      uuid,
  display_name text,
  direction    text,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end,
         pr.display_name,
         case when f.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
         f.created_at
    from public.friendships f
    join public.profiles pr
      on pr.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
   where f.state = 'pending'
     and auth.uid() in (f.requester_id, f.addressee_id)
   -- Incoming first: one of the two is something to DO.
   order by (f.requester_id = auth.uid()), f.created_at desc;
$$;

/**
 * Find someone to add.
 *
 * AN EMPTY QUERY IS A DIRECTORY, not an empty result. With a beta this size
 * "search for your friends by name" is a box that answers nothing until you
 * already know who is here; listing everybody is both more useful and, at this
 * scale, cheaper than the search.
 *
 * `friend_state` comes back on every row so the list can draw the right button
 * per person — half of them will already be friends, and an "Add" button that
 * errors is worse than no button.
 */
create or replace function public.find_managers(p_query text default null, p_limit integer default 25)
returns table (
  user_id      uuid,
  display_name text,
  friend_state text,
  cards        bigint,
  member_since timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with hits as (
    select pr.id, pr.display_name, pr.created_at
      from public.profiles pr
     where pr.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
       and (p_query is null or btrim(p_query) = ''
            or pr.display_name ilike '%' || btrim(p_query) || '%')
     -- A name that STARTS with what was typed is the one being looked for.
     order by (case when p_query is null or btrim(p_query) = '' then 1
                    when pr.display_name ilike btrim(p_query) || '%' then 0
                    else 1 end),
              pr.display_name asc
     limit greatest(1, least(coalesce(p_limit, 25), 100))
  ),
  held as (
    -- Counted against the shortlist, not the whole table.
    select ci.user_id, count(*) as cards
      from public.card_instances ci
     where ci.is_held and ci.user_id in (select id from hits)
     group by ci.user_id
  )
  select h.id,
         h.display_name,
         public.friend_link(auth.uid(), h.id),
         coalesce(held.cards, 0),
         h.created_at
    from hits h
    left join held on held.user_id = h.id;
$$;

/**
 * Somebody else's account screen — and your own, read the same way.
 *
 * ONE CALL FOR THE WHOLE SHEET. Six figures on this page come from five board
 * functions, and five round trips to open a profile is a sheet that fills in
 * over a second and a half. Each board is called ONCE here and filtered twice
 * (the manager's row, and the field size around it), which is also what makes
 * the rank on this page the same number as the rank on the board.
 *
 * Everything returned is already public on one of those boards. The one thing
 * that is not a board figure is `friend_state`, which is about the VIEWER and
 * is why this cannot be a view.
 */
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
         me_coll.gold_plus,
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

-- ---------------------------------------------------------------- grants
-- Every function states its own audience — see 20260902010000.

revoke execute on function public.friend_link(uuid, uuid)                from public, anon;
revoke execute on function public.friend_request(uuid)                   from public, anon;
revoke execute on function public.friend_accept(uuid)                    from public, anon;
revoke execute on function public.friend_decline(uuid)                   from public, anon;
revoke execute on function public.friend_remove(uuid)                    from public, anon;
revoke execute on function public.my_friends(integer, smallint)          from public, anon;
revoke execute on function public.my_friend_requests()                   from public, anon;
revoke execute on function public.find_managers(text, integer)           from public, anon;
revoke execute on function public.manager_profile(uuid, integer, smallint) from public, anon;

grant execute on function public.friend_link(uuid, uuid)                to authenticated;
grant execute on function public.friend_request(uuid)                   to authenticated;
grant execute on function public.friend_accept(uuid)                    to authenticated;
grant execute on function public.friend_decline(uuid)                   to authenticated;
grant execute on function public.friend_remove(uuid)                    to authenticated;
grant execute on function public.my_friends(integer, smallint)          to authenticated;
grant execute on function public.my_friend_requests()                   to authenticated;
grant execute on function public.find_managers(text, integer)           to authenticated;
grant execute on function public.manager_profile(uuid, integer, smallint) to authenticated;

-- The table is read through its policy and written through nothing.
grant select on public.friendships to authenticated;

-- ---------------------------------------------------------------- assertions
-- `db push` has no transaction, so a half-applied migration ships looking fine.
-- These are the two things that would be silently wrong: a function anon can
-- reach, and a write policy nobody meant to create.

do $$
declare v_open text;
begin
  select string_agg(distinct p.proname, ', ')
    into v_open
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(p.proacl) x
   where n.nspname = 'public'
     and p.proname in ('friend_link', 'friend_request', 'friend_accept', 'friend_decline',
                       'friend_remove', 'my_friends', 'my_friend_requests', 'find_managers',
                       'manager_profile')
     and x.privilege_type = 'EXECUTE'
     and (x.grantee = 0 or pg_get_userbyid(x.grantee) = 'anon');
  if v_open is not null then
    raise exception 'friend functions still executable by anon/PUBLIC: %', v_open;
  end if;

  select string_agg(policyname || ' (' || cmd || ')', ', ')
    into v_open
    from pg_policies
   where schemaname = 'public' and tablename = 'friendships' and cmd <> 'SELECT';
  if v_open is not null then
    raise exception 'friendships has a write policy: %', v_open;
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'friendships'
       and indexname = 'friendships_pair_idx'
  ) then
    raise exception 'the pair index is missing — A and B can become two rows';
  end if;
end $$;
