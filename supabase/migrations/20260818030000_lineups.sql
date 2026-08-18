-- Weekly lineups (build plan task 21).
--
-- Two rules this schema exists to make unbreakable:
--   1. Lock time is derived server-side from the week's first kickoff. A client
--      clock is never consulted.
--   2. career_fp is a SUM of slot points, never an increment. The live scoring
--      job runs every 5 minutes on gamedays; an incrementing design would
--      double-count on the second sweep. Recomputing from slots is idempotent
--      by construction.

create table public.lineups (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  season       integer not null,
  season_type  smallint not null default 2,
  week         integer not null,
  submitted_at timestamptz not null default now(),
  scored_at    timestamptz,
  total_points numeric(10,2) not null default 0,
  unique (user_id, season, season_type, week)
);

create index lineups_week_idx on public.lineups (season, season_type, week);

-- Which slots a lineup has, and which positions may fill each. Data, not code,
-- so the roster format can change without a deploy.
create table public.lineup_slot_config (
  slot                text primary key,
  eligible_positions  text[] not null,
  display_order       smallint not null unique
);

insert into public.lineup_slot_config (slot, eligible_positions, display_order) values
  ('QB',   array['QB'],             1),
  ('RB1',  array['RB'],             2),
  ('RB2',  array['RB'],             3),
  ('WR1',  array['WR'],             4),
  ('WR2',  array['WR'],             5),
  ('TE',   array['TE'],             6),
  ('FLEX', array['RB','WR','TE'],   7),
  ('K',    array['PK'],             8);

create table public.lineup_slots (
  id               uuid primary key default gen_random_uuid(),
  lineup_id        uuid not null references public.lineups on delete cascade,
  slot             text not null references public.lineup_slot_config(slot),
  card_instance_id uuid not null references public.card_instances on delete cascade,
  points           numeric(8,2) not null default 0,
  unique (lineup_id, slot),
  -- The same card cannot occupy two slots in one lineup.
  unique (lineup_id, card_instance_id)
);

create index lineup_slots_card_idx on public.lineup_slots (card_instance_id);

alter table public.lineups            enable row level security;
alter table public.lineup_slots       enable row level security;
alter table public.lineup_slot_config enable row level security;

create policy "slot config is readable"
  on public.lineup_slot_config for select to authenticated using (true);

-- Read your own lineup. No write policies: everything goes through set_lineup().
create policy "users read their own lineups"
  on public.lineups for select to authenticated
  using (auth.uid() = user_id);

create policy "users read their own lineup slots"
  on public.lineup_slots for select to authenticated
  using (exists (
    select 1 from public.lineups l
     where l.id = lineup_slots.lineup_id
       and l.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------- lock time

-- A week locks at its first kickoff. Computed from stored game times so the
-- answer is identical for every user and immune to a tampered device clock.
create or replace function public.week_lock_time(
  p_season integer,
  p_season_type smallint,
  p_week integer
)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select min(starts_at)
    from public.games
   where season = p_season
     and season_type = p_season_type
     and week = p_week;
$$;

grant execute on function public.week_lock_time(integer, smallint, integer) to authenticated;
