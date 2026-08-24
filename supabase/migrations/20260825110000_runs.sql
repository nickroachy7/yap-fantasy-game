-- Runs: the roguelike layer. A life the player can actually lose.
--
-- ---------------------------------------------------------------------------
-- WHY A RUN IS NOT THE ACCOUNT
-- ---------------------------------------------------------------------------
--
-- Every subtraction this game already has is permanent and small: commit burns
-- a card at half sell value, a card plays one contest a week, the roster caps
-- at thirty. None of them can END anything, so nothing in the game has ever
-- been at stake — entering a contest has been strictly correct, every week,
-- for everybody, because entering could not cost you a position you cared
-- about. A decision with no downside is not a decision.
--
-- The run is the thing that can end. It holds HEARTS, it counts WINS, and when
-- the hearts are gone the collection and the wallet go with it. What survives
-- is set progress (`set_completions`, which this migration does not touch) and
-- whatever the run's wins bought the player the right to carry — see
-- `run_carry_ladder` below.
--
-- ---------------------------------------------------------------------------
-- WHY THE RUN IS A TABLE AND NOT COLUMNS ON `profiles`
-- ---------------------------------------------------------------------------
--
-- A run ENDS, and the ended ones have to stay. "You died on week six with four
-- wins" is the only record the game will have of a player's history once the
-- cards are gone, and it is the thing a career screen is eventually built from.
-- Hearts as a column on `profiles` would be overwritten by the next run and
-- there would be nothing to look back at.
--
-- One active run per user is enforced by a partial unique index rather than by
-- the functions that write it, because "how many live runs does this player
-- have" is exactly the invariant that a retry or a double-tap breaks.
--
-- ---------------------------------------------------------------------------
-- THE CARRY LADDER, AND WHY IT IS DENOMINATED IN CARDS
-- ---------------------------------------------------------------------------
--
-- The obvious carry-over is a percentage of what the collection was worth. It
-- cannot work, and the reason is `sell_card`: it already pays 100% of
-- `sell_value`. A death that refunds some fraction of collection value is
-- therefore strictly worse than selling the collection yourself first, so no
-- informed player would ever take it — the wipe would be a formality that the
-- players it was aimed at route around, landing only on the ones who did not
-- think of it.
--
-- Slots fix that, because a slot cannot be liquidated. Three cards carried is
-- three cards carried whether the roster held four or thirty, so it cannot be
-- inflated by hoarding — which matters here more than it would in most games,
-- because the hoard is the exact behaviour `20260825010000_contest_spine` was
-- built to argue against, and a value-scaled carry would have paid for it.
--
-- The numbers: a win is roughly a week, and the beta season is eighteen. Three
-- wins is a month of not dying and buys one card. Ten is most of a season and
-- buys three. Deliberately steep at the bottom — a player who dies at two wins
-- keeps nothing, and needs to, or the first death teaches nothing.

create table public.runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  started_at    timestamptz not null default now(),

  -- Null while the run is live. Set once, never cleared.
  ended_at      timestamptz,
  -- 'out_of_hearts' is death. 'retired' is a player banking a run on purpose,
  -- which nothing calls yet but which the column exists for so that ending a
  -- run does not have to mean dying.
  ended_reason  text check (ended_reason in ('out_of_hearts', 'retired')),

  hearts        smallint not null check (hearts >= 0),
  -- Carried on the row rather than read from config, so a run started under
  -- one setting is not silently re-scaled when the config moves mid-beta.
  max_hearts    smallint not null check (max_hearts > 0),

  -- Contests won and lost while this run was live. `wins` is what the carry
  -- ladder is read with; `losses` is kept because a run that went 9-1 and one
  -- that went 9-8 are not the same run and the difference is worth holding.
  wins          integer not null default 0 check (wins >= 0),
  losses        integer not null default 0 check (losses >= 0),

  -- Set when the player has taken their carry and the wipe has run. A dead run
  -- with this null is a run whose death screen has not been answered yet, and
  -- it is what blocks a new run from starting — see `current_run`.
  settled_at    timestamptz,

  constraint runs_hearts_within_max check (hearts <= max_hearts),
  constraint runs_ended_has_reason  check ((ended_at is null) = (ended_reason is null)),
  -- A live run cannot have been settled, and settling a run it did not end is
  -- how a wipe would run on somebody still playing.
  constraint runs_settled_after_end check (settled_at is null or ended_at is not null)
);

create unique index runs_one_live_per_user
  on public.runs (user_id) where ended_at is null;

create index runs_user_idx on public.runs (user_id, started_at desc);

-- --------------------------------------------------------------- the ladder

create table public.run_carry_ladder (
  min_wins    integer primary key check (min_wins >= 0),
  card_slots  smallint not null check (card_slots >= 0)
);

insert into public.run_carry_ladder (min_wins, card_slots) values
  (0,  0),
  (3,  1),
  (6,  2),
  (10, 3);

-- The rung a win count falls on. Written as a function because every caller
-- wants the same "highest rung at or below" read and getting it slightly wrong
-- in one of them is the kind of bug that only shows up on a death screen.
create or replace function public.run_carry_slots(p_wins integer)
returns smallint
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select card_slots from public.run_carry_ladder
      where min_wins <= greatest(p_wins, 0)
      order by min_wins desc limit 1), 0::smallint);
$$;

grant execute on function public.run_carry_slots(integer) to authenticated;

-- --------------------------------------------------------------- config

insert into public.game_config (key, value, description) values
  ('run_starting_hearts', 3,
   'Hearts a new run begins with. Three is two mistakes and a lesson; the whole risk curve is set here.'),
  ('run_max_hearts', 5,
   'Ceiling a run can be healed to. Without it a long win streak banks enough hearts to make the run unkillable.')
on conflict (key) do update
  set value       = excluded.value,
      description = excluded.description,
      updated_at  = now();

-- --------------------------------------------------------------- RLS

alter table public.runs             enable row level security;
alter table public.run_carry_ladder enable row level security;

-- Your own runs, live and dead. No policy for insert or update: runs are
-- written only by the security-definer functions below and by settlement, so
-- a client cannot mint itself hearts by writing the row directly.
create policy "own runs are readable" on public.runs
  for select to authenticated using (user_id = auth.uid());

create policy "the carry ladder is readable" on public.run_carry_ladder
  for select to authenticated using (true);

-- --------------------------------------------------------------- current_run

-- The live run, created on first ask.
--
-- Ensure-style for the same reason `ensure_free_contest` is: there is exactly
-- one right answer for a player with no run, and making the client ask for one
-- explicitly means every screen that reads a run has to handle a null it can
-- do nothing useful with.
--
-- It will NOT create one over an unanswered death. A dead run with no
-- `settled_at` is a player who still has a carry to choose, and handing them a
-- fresh run would quietly forfeit it.
create or replace function public.current_run()
returns public.runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_run  public.runs;
  v_h    integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_run from public.runs
   where user_id = v_user and ended_at is null;
  if found then
    return v_run;
  end if;

  -- Dead and unanswered. Returned as-is; the client shows the death screen and
  -- calls `claim_carry`, which is what starts the next one.
  select * into v_run from public.runs
   where user_id = v_user and ended_at is not null and settled_at is null
   order by ended_at desc limit 1;
  if found then
    return v_run;
  end if;

  v_h := public.game_config_value('run_starting_hearts', 3);

  insert into public.runs (user_id, hearts, max_hearts)
  values (v_user, v_h, greatest(v_h, public.game_config_value('run_max_hearts', 5)))
  returning * into v_run;

  return v_run;
end;
$$;

revoke execute on function public.current_run() from public, anon;
grant  execute on function public.current_run() to authenticated;

comment on table public.runs is
  'One roguelike run: the hearts a player is playing with, the contests they won with them, and how it ended. Set progress outlives it; the collection and the wallet do not.';
comment on table public.run_carry_ladder is
  'Wins to card-carry slots. Denominated in slots rather than value because value can be liquidated before a death and slots cannot.';
