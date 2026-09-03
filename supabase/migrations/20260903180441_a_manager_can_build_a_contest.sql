-- A manager builds a contest, invites their friends, and the game runs it.
--
-- ===========================================================================
-- THE WHOLE IDEA
-- ===========================================================================
--
-- `contests` has been a fully described row since `20260901050000`: a format, a
-- fee, a win condition, a curve, a cap, a stake and a pool share. The lobby is
-- eight of those rows stamped from `contest_templates` every week. Nothing in
-- the scoring, settlement or payout path knows where a row came from — they all
-- read the row.
--
-- So "let a player make one" is not a new engine. It is an INSERT the player is
-- allowed to perform, wrapped in the validation a migration author was trusted
-- to do by hand, plus the two things a user-authored contest needs that a
-- catalogue one does not: an author, and a guest list.
--
-- ===========================================================================
-- THE FOUR RULES A FRIENDLY CANNOT BREAK, AND WHY EACH ONE EXISTS
-- ===========================================================================
--
-- "Full customisation, as long as it works." These are what "works" means. All
-- four are CHECK constraints as well as validation inside the RPC, because the
-- RPC is a convenience and the constraint is the truth — see `20260818010000`
-- on why this schema assumes Charles Proxy.
--
-- ---------------------------------------------------------------------------
-- 1. A FRIENDLY COSTS COINS. This is the important one.
-- ---------------------------------------------------------------------------
--
-- `award_score_coins` pays `score_rate()` (1.5) coins for every point scored by
-- every slot in every lineup filed. The only thing bounding that faucet is
-- `card_plays_one_contest` — one card, one contest, one week — which caps a
-- manager at their whole roster and no more.
--
-- Today reaching that cap costs money: the lobby's fees are what a manager pays
-- to field the twenty-two cards behind their starters. A FREE user-authored
-- contest removes the price and leaves the cap, so two friends could file thirty
-- cards a week between them for nothing and mint score coins on all of them.
-- That is not an exploit somebody has to find; it is what the feature does by
-- default.
--
-- So a friendly charges, inside the same band `20260901050000` checks every
-- lobby row against:
--
--     slots × 10  <  fee  <  slots × 20
--
-- The floor is where losing stops printing coins. The ceiling is where a
-- Standard Pack becomes cheaper per card than playing the ones you own. Both
-- edges are derived in that migration's header and neither is re-derived here.
--
-- Ninety per cent of what a friendly collects goes back out as its pool, the
-- same share as every lobby row (`20260901020000`). The remaining tenth is the
-- sink that pays for the score coins the entries mint. A friendly therefore
-- moves coins between friends and burns a little; it cannot make any.
--
-- ---------------------------------------------------------------------------
-- 2. A FRIENDLY CANNOT TOUCH A RUN.
-- ---------------------------------------------------------------------------
--
-- `hearts_at_risk = 0`, always. `hearts_on_win` is already nought everywhere by
-- `20260902030000`, so both halves of `settle_run_week`'s test fail and it skips
-- friendlies entirely — no `run_contest_results` row, no delta, no wipe.
--
-- A run ending is the only irreversible thing in this game: `wipe_run` takes the
-- collection. Letting one manager author a contest that does that to another —
-- even one they accepted an invitation to — puts the game's single destructive
-- act in the hands of somebody with a motive. A friendly is played for coins.
--
-- ---------------------------------------------------------------------------
-- 3. A FRIENDLY IS BOUNDED AND WINNABLE.
-- ---------------------------------------------------------------------------
--
-- `max_entrants` is required, 2..64. The lobby's rows may be unlimited because
-- the lobby is the whole game's field; a friendly is a room, and a room with a
-- share code in it that has no door count is a room anybody can fill.
--
-- And the win condition has to be able to resolve. `contest_results` returns a
-- NULL result — no win, no loss, no payout — when a contest is not really a
-- contest: `top_n` with no more entrants than places, `top_pct` whose cut
-- reaches the whole field, anything field-relative with fewer than two entries.
-- A manager can build all of those by accident, and the failure is silent
-- eleven days later when nobody gets paid. `friendly_terms_are_playable` below
-- refuses them at build time instead, with the arithmetic in the message.
--
-- ---------------------------------------------------------------------------
-- 4. NO USER TEXT LEAVES THE ROOM.
-- ---------------------------------------------------------------------------
--
-- A manager names their contest and that name is read by the people they
-- invited — nobody else, ever, because `contests` RLS below scopes a friendly
-- to its guest list. The FORMAT they build is a row in `contest_formats`, which
-- is world-readable and always has been, so its name is DERIVED FROM ITS SHAPE
-- ("QB · 2×RB · 3×FLEX") rather than typed. There is no surface here where one
-- player's typing reaches a stranger, which is what keeps this feature from
-- needing a moderation story it does not have.
--
-- ===========================================================================
-- WHY THE FORMAT IS A REAL ROW AND NOT A JSON BLOB ON THE CONTEST
-- ===========================================================================
--
-- `contest_format_slots` is what `set_lineup` validates a submission against and
-- what the lineup editor draws its empty slots from. A custom shape stored
-- anywhere else would mean a second slot-validation path and a second slot
-- renderer — the parallel-copy problem, in the two places it would hurt most.
--
-- So a custom format is an ordinary format with a generated code. It costs one
-- row and 1..10 slot rows, it is deduplicated by shape so a hundred managers
-- building "three flex" all get `flex3`, and everything downstream cannot tell
-- it from a seeded one.
--
-- ===========================================================================
-- WHAT AN INVITE IS
-- ===========================================================================
--
-- A row in `contest_invites`, and it is a VISIBILITY grant rather than an
-- acceptance. Accepting is entering, which is `set_lineup`, which already
-- charges the fee and checks the roster and the cap; declining hides the row.
-- Modelling "accepted" separately would put a second, weaker record of
-- membership beside `lineups` — the table that IS the entry — and the two would
-- disagree the first time somebody used `leave_contest`.
--
-- Two ways in, per the product call:
--
--   * the creator invites accepted FRIENDS by id, and
--   * anybody holding the six-character `join_code` admits themselves.
--
-- The code exists because a six-person group needs fifteen friendships before a
-- friends-only invite list can describe it. It is checked against the same cap
-- and the same kickoff as an invite.

-- ========================================================================
-- CONTESTS GAIN AN AUTHOR AND A DOOR
-- ========================================================================

alter table public.contests
  add column if not exists created_by uuid references auth.users on delete set null,
  add column if not exists join_code  text;

comment on column public.contests.created_by is
  'The manager who built this friendly. Null on free and lobby contests, and null again if that account is deleted — the contest and its results outlive its author.';
comment on column public.contests.join_code is
  'Six characters from an unambiguous alphabet. Anyone holding it may admit themselves via join_friendly(). Null on every contest the game itself makes.';

-- `on delete set null` rather than cascade, and the constraint is one-way
-- because of it: only a friendly may have an author, but a friendly whose author
-- has deleted their account keeps running. Cascading would have deleted the
-- contest out from under `lineups`, which references it without one.
alter table public.contests drop constraint if exists contests_only_a_friendly_is_authored;
alter table public.contests add constraint contests_only_a_friendly_is_authored
  check (created_by is null or kind = 'friendly');

-- The code is the door and only a friendly has one. Unique where present.
alter table public.contests drop constraint if exists contests_only_a_friendly_has_a_code;
alter table public.contests add constraint contests_only_a_friendly_has_a_code
  check ((join_code is not null) = (kind = 'friendly'));

create unique index if not exists contests_join_code_idx
  on public.contests (join_code) where join_code is not null;

create index if not exists contests_created_by_idx
  on public.contests (created_by) where created_by is not null;

-- RULE 1 and RULE 2, as constraints. `contests_paid_contests_pay_out` already
-- forces a pool onto anything with a fee, so "costs coins" carries "pays coins"
-- with it and does not need restating.
alter table public.contests drop constraint if exists contests_friendly_costs_coins;
alter table public.contests add constraint contests_friendly_costs_coins
  check (kind <> 'friendly' or entry_fee_coins > 0);

alter table public.contests drop constraint if exists contests_friendly_risks_no_hearts;
alter table public.contests add constraint contests_friendly_risks_no_hearts
  check (kind <> 'friendly' or (hearts_at_risk = 0 and hearts_on_win = 0));

-- RULE 3, first half. The second half — winnability — is
-- `friendly_terms_are_playable`, below, because it needs the format's slot count
-- and a CHECK cannot join.
alter table public.contests drop constraint if exists contests_friendly_is_a_room;
alter table public.contests add constraint contests_friendly_is_a_room
  check (kind <> 'friendly'
         or (max_entrants is not null and max_entrants between 2 and 64));

-- `podium_coins` is the weekly podium `20260902050000` MINTS for the whole
-- game's field. A user-authored contest that could set it would be a print
-- button with a friendly's name on it.
alter table public.contests drop constraint if exists contests_friendly_pays_no_podium;
alter table public.contests add constraint contests_friendly_pays_no_podium
  check (kind <> 'friendly' or podium_coins = 0);

-- ========================================================================
-- FORMATS GAIN AN AUTHOR TOO
-- ========================================================================

-- Only so the lobby's format picker can tell a seeded shape from a generated
-- one. The rows are world-readable either way — a format is a slot list, and
-- its name is derived rather than typed (RULE 4).
alter table public.contest_formats
  add column if not exists created_by uuid references auth.users on delete set null;

-- ========================================================================
-- THE GUEST LIST
-- ========================================================================

create table if not exists public.contest_invites (
  contest_id  uuid not null references public.contests on delete cascade,
  user_id     uuid not null references auth.users      on delete cascade,
  -- Null when the member let themselves in with the join code. The distinction
  -- is worth keeping: it is the difference between "Nick invited you" and "you
  -- joined", which is the whole content of the row on screen.
  invited_by  uuid          references auth.users      on delete set null,
  -- Null while the invite is live. Set means "no thanks" — the row stays so the
  -- contest stops being offered and cannot be re-offered by the same creator.
  declined_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (contest_id, user_id)
);

comment on table public.contest_invites is
  'Who may SEE a friendly contest. Not who is in it — entering is a lineup, and lineups are the only record of membership. Written only by create_friendly_contest / invite_to_friendly / join_friendly / decline_friendly.';

create index if not exists contest_invites_user_idx
  on public.contest_invites (user_id) where declined_at is null;

alter table public.contest_invites enable row level security;

-- YOUR OWN ROWS AND NOTHING ELSE, and the narrowness is deliberate rather than
-- minimal. The obvious policy also lets a CREATOR read the whole guest list for
-- a contest they made — and that policy would have to reach into `public.contests`
-- to find out who the creator is, while the policy on `contests` (below) reaches
-- into THIS table to find out who was invited. Postgres detects that as
-- "infinite recursion detected in policy for relation contests" and every read
-- of either table fails.
--
-- So the guest list is served by `friendly_members()` instead, which is SECURITY
-- DEFINER and answers the creator's question without a policy that can loop.
-- No write policy at all: the four verbs below are the only way this table
-- changes, as everywhere else in this schema.
drop policy if exists "your own invites are readable" on public.contest_invites;
create policy "your own invites are readable"
  on public.contest_invites for select to authenticated
  using (user_id = auth.uid());

-- ========================================================================
-- A FRIENDLY IS ONLY VISIBLE TO ITS ROOM
-- ========================================================================

-- The policy was `using (true)` and could stay that way while every contest in
-- the database was one the whole game could enter. It cannot now: the name of a
-- friendly is the one piece of user-typed text in this feature, and a contest
-- nobody invited you to is not yours to read.
--
-- THIS IS LOAD-BEARING FOR THE CLIENT, NOT JUST FOR PRIVACY. `use-lineup-data`
-- reads `contests` DIRECTLY for the week and puts every row on the board's
-- carousel. Narrowing this policy is therefore also what stops a stranger's
-- friendly from appearing there — the client needs no filter of its own, which
-- is the right place for this rule to live.
--
-- Written inline rather than through a helper so the planner can use
-- `contest_invites_user_idx`. The subquery reads `contest_invites` under ITS
-- policy, whose own predicate is the same `user_id = auth.uid()` — which is
-- correct, not circular.
drop policy if exists "contests are readable" on public.contests;
create policy "contests are readable"
  on public.contests for select to authenticated
  using (
    kind <> 'friendly'
    or created_by = auth.uid()
    or exists (
      select 1 from public.contest_invites i
       where i.contest_id = id and i.user_id = auth.uid()
    )
  );

-- The same question, for the SECURITY DEFINER readers that bypass RLS entirely.
-- `contest_field`, `contest_lineup` and `contest_lobby` all take or return
-- contests by id and would otherwise hand a friendly's field to anybody who
-- guessed a uuid.
--
-- A DECLINED INVITE STILL SEES. You were asked, you said no, and the row is
-- still allowed to render if you go looking for it — declining hides a contest
-- from your lobby, it does not revoke a fact you already knew.
create or replace function public.can_see_contest(p_contest uuid)
returns boolean
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.contests c
     where c.id = p_contest
       and (c.kind <> 'friendly'
            or c.created_by = auth.uid()
            or exists (select 1 from public.contest_invites i
                        where i.contest_id = c.id and i.user_id = auth.uid()))
  );
$$;

revoke execute on function public.can_see_contest(uuid) from public, anon;
grant  execute on function public.can_see_contest(uuid) to authenticated;

-- ========================================================================
-- WINNABILITY, AS A TRIGGER
-- ========================================================================

-- RULE 3's second half. It is a trigger rather than a CHECK because it needs
-- `contest_formats.slot_count` for the fee band, which a CHECK cannot join to.
--
-- It fires on friendlies ONLY. The catalogue's rows are checked by their own
-- migration's `do $$` block and one of them — The Warm-Up, free, `target` — is
-- deliberately outside two of these rules.
create or replace function public.friendly_terms_are_playable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_slots integer;
begin
  if new.kind <> 'friendly' then
    return new;
  end if;

  select slot_count into v_slots
    from public.contest_formats where code = new.format_code;

  -- THE FEE BAND. `20260901050000` derives both edges; this is the same test
  -- applied to a row a player wrote instead of one a migration did.
  if new.entry_fee_coins <= v_slots * 10 then
    raise exception
      'a %-card contest must charge more than % coins, or losing it would still earn coins',
      v_slots, v_slots * 10
      using errcode = '22023';
  end if;
  if new.entry_fee_coins >= v_slots * 20 then
    raise exception
      'a %-card contest must charge less than % coins, or a Standard Pack is cheaper per card',
      v_slots, v_slots * 20
      using errcode = '22023';
  end if;

  -- THE WIN CONDITION HAS TO BE ABLE TO RESOLVE, against the smallest field
  -- this contest can legally have (two) and the largest (`max_entrants`).
  -- `contest_results` returns null — no result, no payout, no explanation —
  -- for each of the cases below, and it does so eleven days after the mistake
  -- was made.
  if new.win_condition = 'top_n' and new.win_rank >= new.max_entrants then
    raise exception
      'top %, in a room that holds %, pays everybody — nobody can lose it',
      new.win_rank, new.max_entrants
      using errcode = '22023';
  end if;

  -- `contest_results` floors the cut and takes at least one, then refuses to
  -- resolve when that reaches the whole field. At 99% of a two-player room the
  -- cut is 1 and it resolves; at 100 it would not, which `contests_win_pct_check`
  -- already forbids. The real trap is the other end.
  if new.win_condition = 'target' and new.target_points > 400 then
    raise exception 'a target of % points cannot be reached by any lineup', new.target_points
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists contests_friendly_terms_are_playable on public.contests;
create trigger contests_friendly_terms_are_playable
  before insert or update on public.contests
  for each row execute function public.friendly_terms_are_playable();

-- ========================================================================
-- BUILDING ONE
-- ========================================================================

-- The slot shape, rendered as a name. RULE 4: a format row is world-readable,
-- so its name is a function of its slots rather than anything a player typed.
--
--   QB · 2×RB · 3×FLEX
--
-- Consecutive slots sharing an eligibility list collapse into a count, and the
-- two lists the game has vocabulary for get their words back.
create or replace function public.format_shape_name(p_slots jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  with s as (
    select x.positions, min(x.ord) as ord, count(*) as cnt
      from jsonb_to_recordset(p_slots) as x(positions text[], ord integer)
     group by x.positions
  )
  select string_agg(
           case when s.cnt > 1 then s.cnt || '×' else '' end ||
           case
             when s.positions = array['QB','RB','WR','TE'] then 'SFLEX'
             when s.positions = array['RB','WR','TE']      then 'FLEX'
             else array_to_string(s.positions, '/')
           end,
           ' · ' order by s.ord)
    from s;
$$;

-- Six characters, no I/L/O/0/1, so it survives being read aloud.
create or replace function public.new_join_code()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try  integer := 0;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.contests where join_code = v_code);
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception 'could not find a free join code' using errcode = '55006';
    end if;
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.new_join_code() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- create_friendly_contest
-- --------------------------------------------------------------------------
--
-- One call: validate, find or build the format, insert the contest, seat the
-- creator, and post the invitations. It returns the contest's code so the
-- client can navigate straight to it, and the join code so it can be shown.
--
-- THE CREATOR IS NOT ENTERED, only invited. Entering is `set_lineup` and it
-- takes the fee; a create button that silently charged would be the ambush the
-- lobby's stake marks exist to prevent. They get an invite row like everybody
-- else, which is what makes them able to see their own contest.
create or replace function public.create_friendly_contest(
  p_name          text,
  p_slots         jsonb,
  p_entry_fee     integer,
  p_max_entrants  integer,
  p_win_condition text,
  p_win_rank      integer default null,
  p_win_pct       integer default null,
  p_target_points numeric default null,
  p_payout_curve  text    default 'flat',
  p_invite        uuid[]  default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_slate    record;
  v_name     text;
  v_n        integer;
  v_norm     jsonb;
  v_fmt      text;
  v_shape    text;
  v_code     text;
  v_join     text;
  v_id       uuid := gen_random_uuid();
  v_mine     integer;
  v_invited  integer := 0;
  v_positions constant text[] := array['QB','RB','WR','TE','PK'];
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- ------------------------------------------------------------------ name
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
  if length(v_name) < 3 or length(v_name) > 40 then
    raise exception 'a contest name is between 3 and 40 characters'
      using errcode = '22023';
  end if;
  if v_name !~ '[[:alnum:]]' then
    raise exception 'a contest name needs at least one letter or number'
      using errcode = '22023';
  end if;

  -- ----------------------------------------------------------------- slate
  --
  -- THE WEEK IS THE ONE THE BOARD IS ON, never the caller's. A contest for a
  -- week the client picked could be filed against a slate whose games have
  -- already kicked off, and `set_lineup` derives its own slate from the
  -- contest — so a wrong week here is a wrong week for every entry.
  select season, season_type, week into v_slate from public.lineup_slate() limit 1;
  if v_slate.season is null then
    raise exception 'there is no week to build a contest for' using errcode = '22023';
  end if;
  if public.week_has_started(v_slate.season, v_slate.season_type, v_slate.week) then
    raise exception 'this week has already kicked off — the next one opens when the slate turns over'
      using errcode = '55006';
  end if;

  -- HOW MANY A MANAGER MAY HAVE OPEN. Not an economic limit — the fee is that
  -- — but a limit on how much of one person's furniture the shelf can hold,
  -- and on how fast join codes can be minted.
  select count(*) into v_mine
    from public.contests
   where created_by = v_user
     and season = v_slate.season and season_type = v_slate.season_type
     and week = v_slate.week;
  if v_mine >= 5 then
    raise exception 'you already have 5 contests running this week'
      using errcode = '55006';
  end if;

  -- ----------------------------------------------------------------- slots
  --
  -- Normalised on the way in: names upper-cased, position lists deduplicated
  -- and put in a canonical order so that two managers describing the same
  -- shape land on the same format row rather than on two identical ones.
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be a json array' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object('slot', slot, 'positions', positions, 'ord', ord)
                   order by ord),
         count(*)
    into v_norm, v_n
    from (
      select upper(btrim(x.slot))            as slot,
             (select array_agg(p order by array_position(v_positions, p))
                from (select distinct upper(btrim(q)) as p
                        from unnest(x.positions) q) d
               where d.p = any (v_positions))  as positions,
             row_number() over ()             as ord
        from jsonb_to_recordset(p_slots) as x(slot text, positions text[])
    ) n;

  if v_n is null or v_n < 1 or v_n > 10 then
    raise exception 'a contest has between 1 and 10 slots' using errcode = '22023';
  end if;

  if exists (select 1 from jsonb_to_recordset(v_norm) as x(slot text)
              where x.slot is null or x.slot !~ '^[A-Z0-9]{1,6}$') then
    raise exception 'a slot name is 1 to 6 letters or digits, like QB or FLEX1'
      using errcode = '22023';
  end if;

  if exists (select 1 from jsonb_to_recordset(v_norm) as x(slot text)
              group by x.slot having count(*) > 1) then
    raise exception 'two slots cannot share a name' using errcode = '22023';
  end if;

  if exists (select 1 from jsonb_to_recordset(v_norm) as x(positions text[])
              where x.positions is null or cardinality(x.positions) = 0) then
    raise exception 'every slot needs at least one position it accepts'
      using errcode = '22023';
  end if;

  -- ONE KICKER SLOT AT MOST, which is `20260901050000`'s rule relaxed by
  -- exactly one notch rather than repealed. That migration banned kickers
  -- outside the free contest because 41 kicker cards exist against a league of
  -- thirty-card rosters, and a lobby row nobody can fill is a dead row. A
  -- friendly is a room whose creator knows who is in it, so one is allowed and
  -- two is not: two kicker slots is a format the pool genuinely cannot supply.
  if (select count(*) from jsonb_to_recordset(v_norm) as x(positions text[])
       where 'PK' = any (x.positions)) > 1 then
    raise exception
      'only one slot may take a kicker — there are 41 kicker cards in the whole game'
      using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------- format
  --
  -- DEDUPLICATED BY SHAPE. A hundred managers building three flex slots share
  -- one format row, and — because the seeded formats are in the same table with
  -- the same shape signature — a manager who rebuilds `flex3` by hand gets
  -- `flex3` itself, name and all.
  v_shape := public.format_shape_name(v_norm);

  select f.code into v_fmt
    from public.contest_formats f
   where f.slot_count = v_n
     and not exists (
       -- Same slots, same eligibility, same order: a full outer join with no
       -- unmatched row on either side.
       select 1
         from (select x.slot, x.positions, x.ord
                 from jsonb_to_recordset(v_norm) as x(slot text, positions text[], ord integer)) a
         full outer join (select s.slot, s.eligible_positions as positions,
                                 s.display_order as ord
                            from public.contest_format_slots s
                           where s.format_code = f.code) b
           on b.slot = a.slot
        where a.slot is null or b.slot is null
           or a.positions is distinct from b.positions
           or a.ord is distinct from b.ord
     )
   order by (f.created_by is null) desc, f.code
   limit 1;

  if v_fmt is null then
    v_fmt := 'custom_' || replace(gen_random_uuid()::text, '-', '');

    insert into public.contest_formats (code, name, slot_count, description, created_by)
    values (v_fmt, v_shape, v_n,
            format('A manager-built shape: %s.', v_shape), v_user);

    insert into public.contest_format_slots (format_code, slot, eligible_positions, display_order)
    select v_fmt, x.slot, x.positions, x.ord
      from jsonb_to_recordset(v_norm) as x(slot text, positions text[], ord integer);
  else
    -- A shape that matched a SEEDED format is that format, name and all. The
    -- contest should say "Flex Three", not the shape string that found it.
    select name into v_shape from public.contest_formats where code = v_fmt;
  end if;

  -- ----------------------------------------------------------------- terms
  --
  -- SAID IN SENTENCES HERE, ENFORCED BY CONSTRAINTS BELOW. Every rule in this
  -- block is also a CHECK or a line of `friendly_terms_are_playable`, so
  -- skipping this function does not skip the rule — but a constraint violation
  -- arrives as `contests_win_parameter_matches_condition`, which is not
  -- something to put in front of somebody who just built a contest.
  if p_entry_fee is null then
    raise exception 'a contest needs an entry fee — that is what pays its prize pool'
      using errcode = '22023';
  end if;
  if p_max_entrants is null or p_max_entrants < 2 or p_max_entrants > 64 then
    raise exception 'a contest holds between 2 and 64 managers' using errcode = '22023';
  end if;

  case p_win_condition
    when 'median' then
      if p_win_rank is not null or p_win_pct is not null or p_target_points is not null then
        raise exception 'beat-the-median takes no other setting' using errcode = '22023';
      end if;
    when 'top_n' then
      if p_win_rank is null or p_win_rank < 1 then
        raise exception 'top-N needs how many places pay' using errcode = '22023';
      end if;
      if p_win_pct is not null or p_target_points is not null then
        raise exception 'top-N takes places, not a percentage or a target'
          using errcode = '22023';
      end if;
    when 'top_pct' then
      if p_win_pct is null or p_win_pct < 1 or p_win_pct > 99 then
        raise exception 'the winning share is between 1 and 99 per cent'
          using errcode = '22023';
      end if;
      if p_win_rank is not null or p_target_points is not null then
        raise exception 'a share takes no places and no target' using errcode = '22023';
      end if;
    when 'target' then
      if p_target_points is null or p_target_points <= 0 then
        raise exception 'a target contest needs a score to beat' using errcode = '22023';
      end if;
      if p_win_rank is not null or p_win_pct is not null then
        raise exception 'a target takes no places and no share' using errcode = '22023';
      end if;
    else
      raise exception
        'a contest is decided by median, top_n, top_pct or target — not by %',
        p_win_condition
        using errcode = '22023';
  end case;

  -- --------------------------------------------------------------- contest
  --
  -- Everything the caller chose that is not already normalised goes in raw and
  -- is caught by a constraint or by `friendly_terms_are_playable`. The casts
  -- are the validation for the two enums: an unknown word is a 22P02 naming
  -- the type, which is a better message than any list this function could
  -- write out.
  v_code := 'friendly:' || replace(v_id::text, '-', '');
  v_join := public.new_join_code();

  insert into public.contests
    (id, code, kind, format_code, season, season_type, week, name,
     entry_fee_coins, max_entrants,
     win_condition, win_rank, win_pct, target_points,
     payout_curve, hearts_at_risk, hearts_on_win, prize_pool_bps,
     created_by, join_code)
  values
    (v_id, v_code, 'friendly', v_fmt,
     v_slate.season, v_slate.season_type, v_slate.week, v_name,
     p_entry_fee, p_max_entrants,
     p_win_condition::public.contest_win_condition, p_win_rank, p_win_pct::smallint,
     p_target_points,
     p_payout_curve::public.contest_payout_curve, 0, 0,
     -- The lobby's share, not a knob. See the header: the tenth that stays
     -- behind is what pays for the score coins the entries mint, and a
     -- creator who could set it to 10000 would have removed the sink.
     9000,
     v_user, v_join);

  -- The creator's seat at their own table. An invite, not an entry.
  insert into public.contest_invites (contest_id, user_id, invited_by)
  values (v_id, v_user, v_user);

  -- ---------------------------------------------------------------- guests
  v_invited := public.invite_to_friendly(v_code, p_invite);

  return jsonb_build_object(
    'code',        v_code,
    'join_code',   v_join,
    'name',        v_name,
    'format_code', v_fmt,
    'format_name', v_shape,
    'slots',       v_n,
    'invited',     v_invited,
    'season',      v_slate.season,
    'season_type', v_slate.season_type,
    'week',        v_slate.week);
end;
$$;

-- --------------------------------------------------------------------------
-- invite_to_friendly
-- --------------------------------------------------------------------------
--
-- FRIENDS ONLY, and that is the whole reason this waited for
-- `20260903113500`. An invite by raw user id from a stranger is a message
-- surface: a name typed into a contest, delivered to anybody whose id you can
-- discover. Requiring an ACCEPTED friendship means the recipient has already
-- agreed to hear from this person.
--
-- The join code is the other door, and it is not a message — it travels through
-- whatever the group already uses to talk to each other.
--
-- Silent about ids that are not friends rather than raising on them: the caller
-- built this list from their own friends panel, so a miss is a race (a
-- friendship removed while the sheet was open) and not a mistake worth failing
-- the whole invitation for. The count comes back so the client can say what
-- actually happened.
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

  -- The room's size is a ceiling on the guest list, not just on the entries.
  -- Inviting thirty people to a room that holds four is an invitation twenty-six
  -- of them cannot accept.
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
    insert into public.contest_invites (contest_id, user_id, invited_by)
    select v_c.id, f.id, v_user from friends f
    -- A DECLINE IS FINAL FOR THIS CONTEST, which is `friendships`' own rule
    -- applied here: `do nothing` leaves the declined row exactly as it is, so
    -- re-inviting somebody who said no does nothing at all.
    on conflict (contest_id, user_id) do nothing
    returning 1
  )
  select count(*)::integer into v_n from posted;

  return v_n;
end;
$$;

-- --------------------------------------------------------------------------
-- join_friendly
-- --------------------------------------------------------------------------
--
-- The code admits you to the ROOM, not to the contest: it writes the invite
-- that makes the contest visible, and entering is still `set_lineup` with its
-- fee. So a code that leaks costs its holder a look at a lobby row, and nothing
-- else happens until somebody pays.
create or replace function public.join_friendly(p_join_code text)
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

  select id, code, name, kind, max_entrants, season, season_type, week, created_by
    into v_c
    from public.contests
   where join_code = upper(btrim(coalesce(p_join_code, '')));

  if v_c.id is null then
    raise exception 'no contest has that code' using errcode = '22023';
  end if;
  if public.week_has_started(v_c.season, v_c.season_type, v_c.week) then
    raise exception '% has already kicked off', v_c.name using errcode = '55006';
  end if;

  -- Already in the room. Idempotent rather than an error — a second tap on a
  -- shared link is the commonest way this is called, and it should land you in
  -- the contest, not on a failure. A previous decline is CLEARED here, because
  -- letting yourself back in is your own decision to reverse.
  if exists (select 1 from public.contest_invites
              where contest_id = v_c.id and user_id = v_user) then
    update public.contest_invites set declined_at = null
     where contest_id = v_c.id and user_id = v_user;
    return jsonb_build_object('code', v_c.code, 'name', v_c.name, 'joined', false);
  end if;

  select count(*) into v_in
    from public.contest_invites where contest_id = v_c.id and declined_at is null;
  if v_in >= v_c.max_entrants then
    raise exception '% is full (% of %)', v_c.name, v_in, v_c.max_entrants
      using errcode = '55006';
  end if;

  insert into public.contest_invites (contest_id, user_id, invited_by)
  values (v_c.id, v_user, null);

  return jsonb_build_object('code', v_c.code, 'name', v_c.name, 'joined', true);
end;
$$;

-- --------------------------------------------------------------------------
-- decline_friendly
-- --------------------------------------------------------------------------
create or replace function public.decline_friendly(p_contest_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_c    record;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id, name, created_by into v_c
    from public.contests where code = p_contest_code and kind = 'friendly';
  if v_c.id is null then
    raise exception 'no such contest: %', p_contest_code using errcode = '22023';
  end if;
  if v_c.created_by = v_user then
    raise exception 'you built % — cancel it instead', v_c.name using errcode = '22023';
  end if;

  -- Declining while entered would hide a contest you have money in. Leaving is
  -- the operation that undoes an entry, and it has its own kickoff rules and
  -- its own refund; this one must not quietly do half of it.
  if exists (select 1 from public.lineups
              where contest_id = v_c.id and user_id = v_user) then
    raise exception 'you are already in % — leave it first', v_c.name
      using errcode = '55006';
  end if;

  update public.contest_invites
     set declined_at = now()
   where contest_id = v_c.id and user_id = v_user and declined_at is null;

  return jsonb_build_object('contest', v_c.name);
end;
$$;

-- --------------------------------------------------------------------------
-- cancel_friendly
-- --------------------------------------------------------------------------
--
-- The creator calls off a contest before it starts and everybody is refunded
-- what they actually paid. It is `leave_contest`'s body applied to every entry
-- at once, and it reads the LEDGER for each refund for that function's reason:
-- the contest's current fee is not necessarily what any given entrant was
-- charged.
--
-- Refused once any of its cards has kicked off, which is the same line
-- `leave_contest` draws. After that the contest has results coming and calling
-- it off would delete a week somebody has played.
create or replace function public.cancel_friendly(p_contest_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_c      record;
  v_refund integer := 0;
  v_people integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id, name, kind, created_by, season, season_type, week into v_c
    from public.contests where code = p_contest_code;
  if v_c.id is null then
    raise exception 'no such contest: %', p_contest_code using errcode = '22023';
  end if;
  if v_c.kind <> 'friendly' or v_c.created_by is distinct from v_user then
    raise exception 'only the manager who built % can call it off', v_c.name
      using errcode = '42501';
  end if;
  if public.week_has_started(v_c.season, v_c.season_type, v_c.week) then
    raise exception '% has already kicked off', v_c.name using errcode = '55006';
  end if;

  with entries as (
    select l.id, l.user_id,
           coalesce((select -sum(g.amount)::integer
                       from public.coins_ledger g
                      where g.reason = 'contest_entry' and g.reference_id = l.id), 0) as fee
      from public.lineups l where l.contest_id = v_c.id
  ),
  owed as (select * from entries where fee > 0),
  booked as (
    insert into public.coins_ledger (user_id, amount, reason, idempotency_key)
    select o.user_id, o.fee, 'contest_refund', format('contest_refund:%s', o.id)
      from owed o
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning user_id, amount
  ),
  -- One wallet move per person, for `award_contest_prizes`' reason: two
  -- entries by one player in a single statement would otherwise be two
  -- conflicting updates of one row.
  totals as (select user_id, sum(amount)::integer as amount from booked group by user_id),
  moved as (
    insert into public.coin_balances (user_id, balance, updated_at)
    select user_id, amount, now() from totals
    on conflict (user_id) do update
      set balance = coin_balances.balance + excluded.balance, updated_at = now()
    returning user_id
  )
  select coalesce((select sum(amount)::integer from booked), 0),
         (select count(*)::integer from moved)
    into v_refund, v_people;

  -- IN THIS ORDER. `contest_invites` cascades off the contest but `lineups`
  -- does NOT — `lineups_contest_id_fkey` has no ON DELETE clause, deliberately,
  -- because a contest disappearing under a scored lineup is exactly the thing
  -- that reference is there to prevent. So the entries go first and explicitly.
  -- `lineup_slots` cascades off `lineups`, and the lineup row IS the entry, so
  -- nothing is left behind.
  delete from public.lineups  where contest_id = v_c.id;
  delete from public.contests where id = v_c.id;

  return jsonb_build_object(
    'contest', v_c.name, 'refunded', v_refund, 'managers', v_people);
end;
$$;

-- --------------------------------------------------------------------------
-- my_friendly_invites
-- --------------------------------------------------------------------------
--
-- The to-do list: friendlies on the current slate that you have been asked to
-- and have neither entered nor declined. Everything else about a friendly you
-- can see arrives through `contest_lobby` like any other contest.
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
     -- Not your own, and not one you have already answered by entering.
     and c.created_by is distinct from auth.uid()
     and i.invited_by is not null
     and not exists (select 1 from public.lineups l
                      where l.contest_id = c.id and l.user_id = auth.uid())
   order by i.created_at desc;
$$;

-- --------------------------------------------------------------------------
-- friendly_members
-- --------------------------------------------------------------------------
--
-- Who is in the room and who has actually filed, for the contest's own page.
-- Distinct from `contest_field`, which is the SCOREBOARD and only knows about
-- entries — this is the guest list, which is the thing a creator manages.
create or replace function public.friendly_members(p_contest_code text)
returns table(
  user_id  uuid,
  name     text,
  invited  boolean,
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

-- ========================================================================
-- THE LOBBY LEARNS ABOUT THE ROOM
-- ========================================================================

-- Three new columns and one new predicate. `contest_lobby` is SECURITY DEFINER
-- and therefore bypasses the RLS policy added above, so the visibility rule has
-- to be stated here as well — this is the case `can_see_contest` exists for.
--
-- DROP and CREATE rather than replace, because the return type changes. The
-- grants are re-stated below for `20260830020000`'s reason: a dropped function
-- loses its ACL and comes back with PUBLIC's default EXECUTE, which on this
-- project means `anon`.
drop function if exists public.contest_lobby();

create function public.contest_lobby()
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
     -- THE ROOM. A friendly reaches this list only for somebody who is in it,
     -- and a DECLINED invite drops it again — which is what declining is for.
     -- The creator is always in, via the invite row `create_friendly_contest`
     -- writes them.
     where c.kind <> 'friendly'
        or exists (select 1 from public.contest_invites i
                    where i.contest_id = c.id
                      and i.user_id = auth.uid()
                      and i.declined_at is null)
    union all
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
         -- WHO BUILT IT, on the row, because "Flex Three" and "Nick's Sunday
         -- Six" are different kinds of offer and the second one is only worth
         -- anything if you can see whose it is.
         case when c.kind = 'friendly'
              then coalesce((select display_name from public.profiles pr where pr.id = c.created_by),
                            'A manager')
         end,
         -- THE CODE IS THE CREATOR'S ALONE. It is how the room is filled, and
         -- handing it to every guest would make any one of them able to fill
         -- it with people the creator did not ask for.
         case when c.created_by = auth.uid() then c.join_code end,
         -- How many seats are spoken for, which is not the same as entrants: a
         -- room of six with two lineups in it still has four seats gone.
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

-- ========================================================================
-- THE READERS THAT TAKE A CONTEST ID LEARN TO SAY NO
-- ========================================================================

-- `contest_field` and `contest_lineup` are SECURITY DEFINER and keyed on a
-- uuid, so before this they would answer about ANY contest to anybody holding
-- its id — the scoreboard and every entrant's full lineup. That was harmless
-- while every contest in the database was one the whole game could enter.
--
-- Both bodies below are `pg_get_functiondef` output from the LIVE database with
-- one clause added and nothing else touched. That is the practice
-- `20260825010000` settled on after `set_lineup` was rebuilt from a stale
-- migration file twice.

-- ONE CLAUSE, IN THE `c` CTE. Everything downstream joins to it, so a contest
-- the reader is not in produces no `c` row, no entries, and an empty field —
-- which is the right answer rather than an error. There is no version of this
-- where "does that contest exist" is a question worth answering precisely.
create or replace function public.contest_field(p_contest uuid)
returns table(user_id uuid, display_name text, avatar_key text, lineup_id uuid,
              filled integer, points numeric, rnk bigint, result text,
              prize integer, is_me boolean, locked boolean)
language sql
stable security definer
set search_path = public, pg_temp
as $function$
  with c as (
    select id, season, season_type, week from public.contests
     where id = p_contest
       and public.can_see_contest(p_contest)
  ),
  entries as (
    select l.id, l.user_id, l.total_points as pts,
           (select count(*)::integer from public.lineup_slots s where s.lineup_id = l.id) as filled
      from public.lineups l
      join c on c.id = l.contest_id
     where exists (select 1 from public.lineup_slots s where s.lineup_id = l.id)
  ),
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
         cp.coins,
         coalesce(e.user_id = auth.uid(), false),
         lk.locked
    from entries e
    join public.profiles pr on pr.id = e.user_id
    join lock lk on lk.id = e.id
    left join lateral (
      select r.result from public.contest_results(p_contest) r where r.lineup_id = e.id
    ) cr on true
    left join lateral (
      select p.coins from public.contest_payouts(p_contest) p where p.lineup_id = e.id
    ) cp on true
   order by e.pts desc, pr.display_name;
$function$;

-- HERE THE REFUSAL IS EXPLICIT, because this function already refuses — it
-- raises when the named player is not in the contest, and a silent empty result
-- would read to the caller as "they filed nothing" rather than "not yours".
-- Checked BEFORE the membership test so the message never confirms who is in a
-- contest you cannot see.
create or replace function public.contest_lineup(p_contest uuid, p_user uuid)
returns table(slot text, player_id uuid, player_name text, pos text, team text,
              tier public.card_tier, points numeric, started boolean,
              career_fp numeric, tier_floor_fp numeric, next_tier_at numeric,
              next_tier_label public.card_tier, coins integer, bonus_coins integer,
              awarded boolean, opponent text, home boolean,
              starts_at timestamp with time zone, status_state text,
              status_text text, team_score integer, opp_score integer)
language plpgsql
stable security definer
set search_path = public, pg_temp
as $function$
declare v_exists boolean;
begin
  if not public.can_see_contest(p_contest) then
    raise exception 'that contest is not open to you' using errcode = '42501';
  end if;

  select true into v_exists from public.lineups l
   where l.contest_id = p_contest and l.user_id = p_user limit 1;
  if v_exists is null then
    raise exception 'that player is not in this contest' using errcode = '22023';
  end if;
  return query
    select ls.slot, p.id, p.full_name,
           coalesce(p.position_abbreviation, p.position), t.abbreviation,
           ci.tier, ls.points,
           coalesce(public.game_has_started(g.status_state, g.starts_at), false),
           ci.career_fp, cur.min_career_fp, nxt.min_career_fp, nxt.tier,
           ls.coins_awarded, ls.bonus_coins, ls.coins_awarded is not null,
           case
             when p.team_id = g.home_team_id    then vt.abbreviation
             when p.team_id = g.visitor_team_id then ht.abbreviation
           end,
           case when p.team_id is null then null else p.team_id = g.home_team_id end,
           g.starts_at, g.status_state, g.status,
           case
             when p.team_id = g.home_team_id    then g.home_score
             when p.team_id = g.visitor_team_id then g.visitor_score
           end,
           case
             when p.team_id = g.home_team_id    then g.visitor_score
             when p.team_id = g.visitor_team_id then g.home_score
           end
      from public.lineups l
      join public.contests ct on ct.id = l.contest_id
      join public.lineup_slots ls on ls.lineup_id = l.id
      join public.card_instances ci on ci.id = ls.card_instance_id
      join public.cards cd on cd.id = ci.card_id
      join public.players p on p.id = cd.player_id
      left join public.teams t on t.id = p.team_id
      join public.tier_thresholds cur on cur.tier = ci.tier
      left join public.tier_thresholds nxt on nxt.sort_order = cur.sort_order + 1
      left join public.contest_format_slots fs
             on fs.format_code = ct.format_code and fs.slot = ls.slot
      left join public.games g
             on g.season = l.season and g.season_type = l.season_type and g.week = l.week
            and (g.home_team_id = p.team_id or g.visitor_team_id = p.team_id)
      left join public.teams ht on ht.id = g.home_team_id
      left join public.teams vt on vt.id = g.visitor_team_id
     where l.contest_id = p_contest and l.user_id = p_user
     order by fs.display_order nulls last, ls.slot;
end;
$function$;

-- ========================================================================
-- GRANTS
-- ========================================================================

-- `20260830020000`: these are stated rather than assumed, and `anon` is
-- revoked explicitly rather than left to a default that has been wrong before.
revoke execute on function public.contest_lobby() from public, anon;
grant  execute on function public.contest_lobby() to authenticated;

revoke execute on function public.format_shape_name(jsonb) from public, anon;
grant  execute on function public.format_shape_name(jsonb) to authenticated;

revoke execute on function public.create_friendly_contest(
  text, jsonb, integer, integer, text, integer, integer, numeric, text, uuid[]) from public, anon;
grant execute on function public.create_friendly_contest(
  text, jsonb, integer, integer, text, integer, integer, numeric, text, uuid[]) to authenticated;

revoke execute on function public.invite_to_friendly(text, uuid[]) from public, anon;
grant  execute on function public.invite_to_friendly(text, uuid[]) to authenticated;

revoke execute on function public.join_friendly(text) from public, anon;
grant  execute on function public.join_friendly(text) to authenticated;

revoke execute on function public.decline_friendly(text) from public, anon;
grant  execute on function public.decline_friendly(text) to authenticated;

revoke execute on function public.cancel_friendly(text) from public, anon;
grant  execute on function public.cancel_friendly(text) to authenticated;

revoke execute on function public.my_friendly_invites() from public, anon;
grant  execute on function public.my_friendly_invites() to authenticated;

revoke execute on function public.friendly_members(text) from public, anon;
grant  execute on function public.friendly_members(text) to authenticated;

grant select on public.contest_invites to authenticated;
