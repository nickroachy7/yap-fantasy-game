-- The week can be forecast
--
-- ---------------------------------------------------------------------------
-- THE SLOT HAS BEEN RESERVED SINCE THE LINEUP BOARD WAS DRAWN
-- ---------------------------------------------------------------------------
--
-- Every lineup row carries `PROJ —`, and the note beside it says the dash must
-- stay a dash until a real projection exists, because balldontlie sells none and
-- nothing in this codebase fabricates one. That was recorded as a verified fact
-- with 404s to back it.
--
-- It was wrong, and wrong in a specific way worth writing down: the census
-- probed `/projections`, which does 404, and never probed `/fantasy/projections`
-- — which answers `400 season must be a positive integer`, and by that same
-- census's own rule a 400 means the route exists and wants parameters. Two weeks
-- of "we have no projections" rested on an untried URL.
--
-- So the dash becomes a number. This table is where it comes from.
--
-- ---------------------------------------------------------------------------
-- A PROJECTION IS A STAT LINE IN THE FUTURE TENSE
-- ---------------------------------------------------------------------------
--
-- Deliberately shaped like `stat_lines`: one row per player per week, the
-- vendor's payload kept verbatim in `raw`, and the points stored beside it. The
-- resemblance is the point. A projection and a result are the same claim about
-- the same player in the same week, separated by whether the game has been
-- played, and the moment their shapes diverge is the moment a screen can print
-- one where it means the other.
--
-- WHY THE POINTS ARE STORED AND NOT DERIVED. `fantasy_points` keeps a computed
-- number beside every stat line rather than scoring on read, and this follows
-- it for the same reasons: a board renders eight of these per contest per user,
-- and a figure that is recomputed on every read is a figure that can be
-- recomputed differently.
--
-- ---------------------------------------------------------------------------
-- THE PROVIDER SCORES IT, WHICH IS THE WHOLE REASON THIS IS SAFE
-- ---------------------------------------------------------------------------
--
-- `projected_points` is the provider's own `ppr` total, not ours. The result it
-- will be compared against comes from `/fantasy/weekly_stats` under the same
-- format, so the two are the same currency by construction rather than by two
-- implementations happening to agree.
--
-- That mattered enough to change our scoring for. Measured on 2025 week 1, our
-- engine and their PPR agreed on 269 of 302 lines; the 17 skill-position gaps
-- were all exactly 3.00 (our yardage bonuses, which they do not have) and the
-- other 16 were kickers, where a flat 3 per field goal against their 3/4/5/6 by
-- distance was underpaying every kicker in the game by 1.2 a week. See
-- `20260903020000`, which switches the results over.
--
-- `raw` still holds the 44 projected stat fields. Nothing reads them yet. They
-- are here because the interesting question about a projection is never the
-- number, it is why the number was wrong, and that cannot be reconstructed from
-- a total.
--
-- ---------------------------------------------------------------------------
-- NO DST, AND KICKERS ARE `K` HERE AND `PK` EVERYWHERE ELSE
-- ---------------------------------------------------------------------------
--
-- The endpoint returns ~491 rows a week including 32 team defences, which this
-- game has no slot for; the ingester drops any row without a player id, which is
-- exactly the DST rows. And `/fantasy/*` calls a kicker `K` where `/players`
-- calls the same man `PK` — so `player_id` is the join and the provider's own
-- position is kept only so a mismatch is visible in the row instead of silently
-- dropping every kicker.

create table if not exists public.projections (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  -- Nullable for the same reason `stat_lines.game_id` is: a bye has no fixture,
  -- and the provider will still emit a row for the player.
  game_id uuid references public.games (id) on delete set null,
  season smallint not null,
  week smallint not null,
  -- 1 pre, 2 regular, 3 post — `SeasonType`, same encoding as `stat_lines`.
  -- Projections are only published for the regular season today; the column
  -- exists so a preseason row could never silently collide with week 1.
  season_type smallint not null default 2,
  -- The provider's PPR total. Nullable because the provider does occasionally
  -- return a row with no scored format at all, and a missing projection is a
  -- real state the board already knows how to draw — see `PROJ —`.
  projected_points numeric(7, 2),
  -- Every format the provider returned, its keys intact. Reconciliation needs
  -- to see what it is reconciling against.
  points_by_format jsonb not null default '{}'::jsonb,
  -- The 44 projected stat fields, vendor keys intact.
  raw jsonb not null default '{}'::jsonb,
  -- The provider's own position string, `K` and all. Never joined on.
  provider_position text,
  -- When the PROVIDER computed it, not when we stored it. A projection is a
  -- perishable claim and this is its date stamp; two rows for one week differ by
  -- this and nothing else.
  collected_at timestamptz,
  ingested_at timestamptz not null default now(),
  -- One projection per player per week. A re-run of the ingester UPDATES rather
  -- than accumulating a history of forecasts — the board wants the current one,
  -- and `collected_at` says how fresh it is.
  unique (player_id, season, week, season_type)
);

-- The board's access pattern, exactly: "this week, these players". The player
-- column trails the week because every read here is already narrowed to one
-- week before it cares which player.
create index if not exists projections_week_player_idx
  on public.projections (season, season_type, week, player_id);

alter table public.projections enable row level security;

-- Readable by any signed-in account and writable by none: this is reference
-- data, and the only writer is a service-role edge function. Same posture as
-- `stat_lines` and `fantasy_points`.
drop policy if exists "projections are readable" on public.projections;
create policy "projections are readable"
  on public.projections for select to authenticated using (true);

comment on table public.projections is
  'Provider fantasy projections, one row per player per week. Points are balldontlie''s own PPR total, the same format the settled result is taken under, so a projection and a score are directly comparable.';
