-- An invitation you have said yes to is not still an invitation.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS MISSING
-- ---------------------------------------------------------------------------
--
-- `20260903180441` gave an invite two states: live, or declined. That was
-- enough while invitations were a shelf you scrolled to — an invite you had
-- accepted simply became the contest sitting there, and there was no counter
-- anywhere to be wrong.
--
-- There is one now. The lobby's header carries a badge for invitations waiting
-- on you, and a badge needs a definition of ANSWERED that is not "entered".
-- Without one, the only way to clear it would be to file a lineup — so a
-- player who accepted an invitation on Tuesday and meant to pick their team on
-- Sunday would carry a red dot for five days telling them to do a thing they
-- had already done.
--
-- Accepting is therefore its own act, and deliberately a CHEAP one: it costs
-- nothing, takes nothing, and commits to nothing. It means "keep this, I am
-- interested" — the contest moves onto the Friendly shelf where it can be
-- entered at leisure. Entering is still `set_lineup`, still takes the fee, and
-- is still the only thing that puts you in the field.
--
-- ---------------------------------------------------------------------------
-- WHY THE COLUMN DEFAULTS TO now() RATHER THAN TO NULL
-- ---------------------------------------------------------------------------
--
-- Three rows get written to this table and only ONE of them is an invitation:
--
--   * the creator's own seat, written by `create_friendly_contest`
--   * a self-admission through the join code, written by `join_friendly`
--   * an actual invitation, written by `invite_to_friendly`
--
-- The first two are already answered by construction — you built it, or you
-- typed the code in. Only the third is a question. So the DEFAULT is "answered"
-- and `invite_to_friendly` is the one writer that explicitly passes null.
--
-- That is also what keeps this migration small: the other two functions are
-- untouched, and there is no backfill to get wrong. Every row that exists
-- before this runs is one of those three, and every one of them should read as
-- answered — a live invitation that predates the badge has already been seen on
-- the shelf.

alter table public.contest_invites
  add column if not exists accepted_at timestamptz default now();

comment on column public.contest_invites.accepted_at is
  'When this manager said yes — or when they let themselves in, or built the thing. Null ONLY on an unanswered invitation from somebody else, which is what my_friendly_invites() counts. Accepting costs nothing and enters nothing; set_lineup is still the entry.';

-- The badge's index: unanswered invitations, per person.
create index if not exists contest_invites_unanswered_idx
  on public.contest_invites (user_id)
  where declined_at is null and accepted_at is null;

-- --------------------------------------------------------------------------
-- invite_to_friendly — one word changed
-- --------------------------------------------------------------------------
--
-- `20260903180441`'s body with `accepted_at` written as NULL, because this is
-- the writer whose rows are a QUESTION. Everything else — the friends-only
-- rule, the ownership check, the kickoff check, the room's ceiling, and
-- `do nothing` leaving a decline exactly where it is — is unchanged.
create or replace function public.invite_to_friendly(
  p_contest_code text,
  p_users        uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_c    record;
  v_n    integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_users is null or cardinality(p_users) = 0 then
    return 0;
  end if;

  select id, kind, name, created_by, max_entrants, season, season_type, week
    into v_c
    from public.contests where code = p_contest_code;
  if v_c.id is null then
    raise exception 'no such contest: %', p_contest_code using errcode = '22023';
  end if;
  if v_c.kind <> 'friendly' then
    raise exception '% is not a contest you can invite people to', v_c.name
      using errcode = '22023';
  end if;
  if v_c.created_by is distinct from v_user then
    raise exception 'only the manager who built % can invite to it', v_c.name
      using errcode = '42501';
  end if;
  if public.week_has_started(v_c.season, v_c.season_type, v_c.week) then
    raise exception '% has already kicked off', v_c.name using errcode = '55006';
  end if;

  if (select count(*) from public.contest_invites
       where contest_id = v_c.id and declined_at is null)
     + (select count(*) from unnest(p_users) u
         where not exists (select 1 from public.contest_invites i
                            where i.contest_id = v_c.id and i.user_id = u))
     > v_c.max_entrants then
    raise exception '% holds % managers and that would be more', v_c.name, v_c.max_entrants
      using errcode = '55006';
  end if;

  with friends as (
    select u as id
      from unnest(p_users) u
     where u <> v_user
       and exists (
         select 1 from public.friendships f
          where f.state = 'accepted'
            and ((f.requester_id = v_user and f.addressee_id = u)
              or (f.addressee_id = v_user and f.requester_id = u))
       )
  ),
  posted as (
    insert into public.contest_invites (contest_id, user_id, invited_by, accepted_at)
    -- THE NULL IS THE POINT. See the header: this is the one writer whose rows
    -- are a question rather than a record of a decision already taken.
    select v_c.id, f.id, v_user, null from friends f
    on conflict (contest_id, user_id) do nothing
    returning 1
  )
  select count(*)::integer into v_n from posted;

  return v_n;
end;
$$;

-- --------------------------------------------------------------------------
-- accept_friendly
-- --------------------------------------------------------------------------
--
-- Yes. Nothing is charged and nothing is entered — this only says the question
-- has been answered, which is what stops the badge from outliving the decision.
--
-- IDEMPOTENT, and it clears a previous decline. Saying no and changing your
-- mind is a thing people do, and the rule `20260903180441` set out is about
-- what the CREATOR may do (they cannot re-ask past a no), not about what you
-- may do with your own answer.
create or replace function public.accept_friendly(p_contest_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_c    record;
  v_in   integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id, name, max_entrants, season, season_type, week into v_c
    from public.contests where code = p_contest_code and kind = 'friendly';
  if v_c.id is null then
    raise exception 'no such contest: %', p_contest_code using errcode = '22023';
  end if;
  if public.week_has_started(v_c.season, v_c.season_type, v_c.week) then
    raise exception '% has already kicked off', v_c.name using errcode = '55006';
  end if;

  if not exists (select 1 from public.contest_invites
                  where contest_id = v_c.id and user_id = v_user) then
    raise exception 'you have not been invited to %', v_c.name using errcode = '42501';
  end if;

  -- The room's ceiling counts the people IN it, and un-declining is a way back
  -- in — so a seat given away while you were deciding is a refusal, not a
  -- silent overfill.
  select count(*) into v_in
    from public.contest_invites
   where contest_id = v_c.id and declined_at is null and user_id <> v_user;
  if v_in >= v_c.max_entrants then
    raise exception '% is full (% of %)', v_c.name, v_in, v_c.max_entrants
      using errcode = '55006';
  end if;

  update public.contest_invites
     set accepted_at = coalesce(accepted_at, now()),
         declined_at = null
   where contest_id = v_c.id and user_id = v_user;

  return jsonb_build_object('contest', v_c.name, 'code', p_contest_code);
end;
$$;

revoke execute on function public.accept_friendly(text) from public, anon;
grant  execute on function public.accept_friendly(text) to authenticated;

-- --------------------------------------------------------------------------
-- my_friendly_invites — now genuinely "waiting on you"
-- --------------------------------------------------------------------------
--
-- The `invited_by is not null` and `created_by <> me` tests are kept even
-- though `accepted_at is null` implies both: they are cheap, and they say in
-- the query what the DEFAULT says in the column, so a reader of either one
-- learns the rule.
--
-- THE "NOT ALREADY ENTERED" TEST IS ALSO KEPT. Accepting is the ordinary way an
-- invitation leaves this list, but entering one is an answer too — and an entry
-- can exist without an accept, because `set_lineup` knows nothing about this
-- table and never should.
create or replace function public.my_friendly_invites()
returns table(
  code        text,
  name        text,
  from_name   text,
  from_id     uuid,
  format_name text,
  slot_count  smallint,
  entry_fee_coins integer,
  max_entrants integer,
  entrants    integer,
  created_at  timestamptz
)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select c.code, c.name,
         coalesce(p.display_name, 'A manager'), i.invited_by,
         f.name, f.slot_count,
         c.entry_fee_coins, c.max_entrants,
         public.contest_entrants(c.id),
         i.created_at
    from public.contest_invites i
    join public.contests c on c.id = i.contest_id
    join public.contest_formats f on f.code = c.format_code
    join public.lineup_slate() s
      on s.season = c.season and s.season_type = c.season_type and s.week = c.week
    left join public.profiles p on p.id = i.invited_by
   where i.user_id = auth.uid()
     and i.declined_at is null
     and i.accepted_at is null
     and c.created_by is distinct from auth.uid()
     and i.invited_by is not null
     and not exists (select 1 from public.lineups l
                      where l.contest_id = c.id and l.user_id = auth.uid())
   order by i.created_at desc;
$$;

revoke execute on function public.my_friendly_invites() from public, anon;
grant  execute on function public.my_friendly_invites() to authenticated;

-- --------------------------------------------------------------------------
-- contest_lobby — an unanswered invitation is not yet a contest you have
-- --------------------------------------------------------------------------
--
-- `20260903180441`'s body with one clause added to the friendly test:
-- `accepted_at is not null`.
--
-- Without it the same contest is in two places at once — counted on the
-- header's badge as a question, and sitting on the Friendly shelf as though it
-- were already yours. Answering it would then move it from one list to a list
-- it was already in, which reads as nothing happening.
create or replace function public.contest_lobby()
returns table(
  id uuid, code text, kind public.contest_kind, name text,
  format_code text, format_name text, slot_count smallint,
  entry_fee_coins integer, max_entrants integer, entrants integer,
  season integer, season_type smallint, week integer,
  my_lineup_id uuid, my_filled integer, affordable boolean,
  win_condition public.contest_win_condition, win_rank integer,
  hearts_at_risk smallint, hearts_on_win smallint, my_hearts smallint,
  prize_pool_bps smallint, prize_pool integer, recap boolean,
  payout_curve public.contest_payout_curve, win_pct smallint,
  target_points numeric, score_rate numeric,
  podium_coins integer, podium_places smallint,
  created_by uuid, creator_name text, join_code text, invited integer
)
language sql
stable security definer
set search_path = public, pg_temp
as $function$
  with slate as (select * from public.lineup_slate() limit 1),
  past as (select * from public.recap_slate() limit 1),
  wallet as (
    select coalesce((select balance from public.coin_balances where user_id = auth.uid()), 0) as balance
  ),
  run as (
    select hearts from public.runs where user_id = auth.uid() and ended_at is null
  ),
  rows as (
    select c.*, false as recap
      from public.contests c
      join slate s
        on s.season = c.season and s.season_type = c.season_type and s.week = c.week
     where c.kind <> 'friendly'
        or exists (select 1 from public.contest_invites i
                    where i.contest_id = c.id
                      and i.user_id = auth.uid()
                      and i.declined_at is null
                      and i.accepted_at is not null)
    union all
    -- A SETTLED CONTEST IS NEVER HIDDEN BY AN UNANSWERED INVITE. You cannot
    -- have a lineup in something you did not answer, so the entry itself is
    -- the proof, and a recap must stay openable however the week began.
    select c.*, true
      from public.contests c
      join past p
        on p.season = c.season and p.season_type = c.season_type and p.week = c.week
     where exists (
       select 1 from public.lineups l
        where l.contest_id = c.id and l.user_id = auth.uid()
     )
  )
  select c.id, c.code, c.kind, c.name,
         c.format_code, f.name, f.slot_count,
         c.entry_fee_coins, c.max_entrants,
         public.contest_entrants(c.id),
         c.season, c.season_type, c.week,
         l.id,
         coalesce((select count(*)::integer from public.lineup_slots ls where ls.lineup_id = l.id), 0),
         (l.id is not null or (select balance from wallet) >= c.entry_fee_coins),
         c.win_condition, c.win_rank,
         c.hearts_at_risk, c.hearts_on_win,
         (select hearts from run),
         c.prize_pool_bps,
         public.contest_prize_pool(c.id),
         c.recap,
         c.payout_curve,
         c.win_pct, c.target_points,
         public.score_rate(),
         c.podium_coins, c.podium_places,
         c.created_by,
         case when c.kind = 'friendly'
              then coalesce((select display_name from public.profiles pr where pr.id = c.created_by),
                            'A manager')
         end,
         case when c.created_by = auth.uid() then c.join_code end,
         case when c.kind = 'friendly'
              then (select count(*)::integer from public.contest_invites i
                     where i.contest_id = c.id and i.declined_at is null)
         end
    from rows c
    join public.contest_formats f on f.code = c.format_code
    left join public.lineups l
           on l.contest_id = c.id and l.user_id = auth.uid()
   order by c.recap, c.kind, c.entry_fee_coins, c.name;
$function$;

-- `create or replace` keeps the ACL, unlike the drop-and-create in
-- `20260903180441`. Re-stated anyway, because `20260830020000` is what this
-- project learned about assuming otherwise.
revoke execute on function public.contest_lobby() from public, anon;
grant  execute on function public.contest_lobby() to authenticated;
