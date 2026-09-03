-- The guest list has three states now, and it was drawing two.
--
-- `friendly_members` predates `accept_friendly` (`20260903190000`) and reports
-- `entered` — has this person filed a lineup — as the only thing that has
-- happened to them. That was complete when an invitation had two outcomes;
-- there are three now, and the middle one is the interesting one:
--
--   ASKED     invited, has not answered. The host may want to nudge them.
--   IN        said yes, has not picked a team yet. Nothing to chase.
--   PLAYING   filed. In the field.
--
-- Collapsing the middle into the first is the wrong way round to be wrong: it
-- tells the host that somebody who has already agreed still needs asking, which
-- is the one thing this panel exists to tell them and the one message they will
-- act on. Two of the four testers accepting on Tuesday would leave a host
-- looking at a room of "ASKED" all week.
--
-- One column added and nothing else changed.
--
-- DROP AND CREATE, because `create or replace` cannot widen a `returns table`
-- — Postgres answers "cannot change return type of existing function"
-- (42P13). The grants below are therefore load-bearing rather than tidy: a
-- dropped function comes back with PUBLIC's default EXECUTE, which on this
-- project means `anon` could call it. That is `20260830020000`'s bug, and it is
-- the reason every function in this feature re-states its ACL.
drop function if exists public.friendly_members(text);

create function public.friendly_members(p_contest_code text)
returns table(
  user_id  uuid,
  name     text,
  invited  boolean,
  accepted boolean,
  entered  boolean,
  declined boolean,
  is_owner boolean
)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select i.user_id,
         coalesce(p.display_name, 'Manager'),
         i.invited_by is not null,
         i.accepted_at is not null,
         exists (select 1 from public.lineups l
                  where l.contest_id = c.id and l.user_id = i.user_id),
         i.declined_at is not null,
         c.created_by = i.user_id
    from public.contests c
    join public.contest_invites i on i.contest_id = c.id
    left join public.profiles p on p.id = i.user_id
   where c.code = p_contest_code
     and c.kind = 'friendly'
     and public.can_see_contest(c.id)
   order by (c.created_by = i.user_id) desc, i.created_at;
$$;

revoke execute on function public.friendly_members(text) from public, anon;
grant  execute on function public.friendly_members(text) to authenticated;
