-- Tunables that are DATA, not code — the same choice `packs.odds` and
-- `card_set_milestones.reward_gems` already made, for the same reason. A number
-- that wants to move during a beta should move with an UPDATE and not a deploy.
--
-- Typed as integers because everything that has wanted to live here so far is a
-- count or a gem figure. A config table that accepted jsonb would immediately
-- start carrying structures, and then it is a second schema with no
-- constraints on it.

create table if not exists public.game_config (
  key         text primary key,
  value       integer not null,
  description text not null,
  updated_at  timestamptz not null default now()
);

alter table public.game_config enable row level security;

-- Readable by everyone: the client has to draw "34 / 30" somewhere, and a cap
-- the player cannot see is a cap that reads as a bug. Writable by nobody
-- through the API — there is no INSERT/UPDATE policy, so it moves only from a
-- migration or the SQL editor.
drop policy if exists "game config is readable" on public.game_config;
create policy "game config is readable"
  on public.game_config for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- ROSTER CAP: 30, AND THE ARITHMETIC BEHIND IT
-- ---------------------------------------------------------------------------
--
-- ONLY EIGHT CARDS CAN EARN ANYTHING IN A GIVEN WEEK. A bench card gains no
-- fantasy points, so no career_fp, so no tier, so no gems. It is completely
-- inert. That single fact is what sizes this number, and it is why the first
-- figure considered — 150 — was wrong by a factor of five: it would have left
-- 142 of 150 cards doing nothing at all.
--
-- What a player genuinely needs:
--
--   8   starters
--   ~2  bye-week cover (from week 5 on, one or two starters are always out)
--   ~5  injury and matchup cover across five position groups
--   ~8  upside stashes — the whole point of pulling packs
--   ---
--   ~23 in real use, call it 30 with slack
--
-- 30 is chosen so that opening two packs puts a settled roster over the line.
-- That is the design goal stated plainly: the decision about which cards to
-- keep should happen AT PACK OPEN, while the cards are in front of you, not
-- someday on a tab nobody visits.
--
-- THE FLOOR IS ABOUT 20. Below that, byes start dictating lineups instead of
-- judgement, and the cap stops being a decision and becomes an errand.
--
-- COMMITTED CARDS DO NOT COUNT. That is the entire release valve and the reason
-- the cap makes sets matter rather than making them irrelevant: a set is the
-- only way to keep a card without spending a roster slot. See
-- 20260824200700_roster_cap_gate.sql for where this is enforced.
insert into public.game_config (key, value, description) values
  ('roster_cap', 30,
   'Held cards a player may own before lineup editing is blocked. Committed and sold copies do not count.'),
  ('roster_cap_warn_at', 24,
   'Held cards at which the client starts warning that the cap is close. Purely presentational.')
on conflict (key) do update
  set value       = excluded.value,
      description = excluded.description,
      updated_at  = now();

-- Read helper so callers never inline a magic number. STABLE, not IMMUTABLE:
-- the row can change under a running session.
create or replace function public.game_config_value(p_key text, p_default integer default null)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select value from public.game_config where key = p_key), p_default);
$$;

grant execute on function public.game_config_value(text, integer) to authenticated;

comment on table public.game_config is
  'Integer tunables that move with an UPDATE rather than a deploy. Readable by every authenticated user; writable only from a migration.';
