-- ---------------------------------------------------------------------------
-- Two more things the provider now answers that we were answering ourselves,
-- or not at all: where a player ranks, and where he stands on his club's chart.
--
-- Both arrive from `/fantasy/rankings` and `/teams/{id}/roster`. Neither is
-- derived here — this file only makes somewhere for them to land, and the
-- one thing it does decide is which of the ranking's three numbers is load
-- bearing. See `player_rankings.overall_rank`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- player_rankings
--
-- WHY `overall_rank` IS NOT NULLABLE AND THE OTHER TWO ARE, measured on the
-- 2026 board (1,033 ranked players):
--
--     overall_rank    1033 / 1033     complete
--     auction_value   1033 non-null, but 877 of them are ZERO — the field is
--                     a draft budget and only the top ~150 command one
--     position_rank    226 / 1033     mostly absent, and a NUMERIC where it
--                     is present (1.25, not 1)
--
-- So anything that must work for every player reads `overall_rank`. The other
-- two are kept because they are free and genuinely interesting at the top of
-- the board, and refused a NOT NULL because three quarters of the league has
-- no answer for them. A price built on `auction_value` would put 877 players
-- on the floor and call it a market.
--
-- ONE ROW PER (player, season, FORMAT). The provider ranks four ways —
-- `ppr`, `standard`, `superflex`, `elimination` — and they disagree by design:
-- a superflex board is a different game. We read `ppr`, because that is what
-- our scoring is (`scoring_rules` v3), but storing all four costs nothing and
-- means a future format change is a read change rather than a re-ingest.
-- ---------------------------------------------------------------------------
create table if not exists public.player_rankings (
  player_id     uuid    not null references public.players on delete cascade,
  season        integer not null,
  format        text    not null,
  overall_rank  integer not null,
  -- Numeric, not integer: the provider emits 1.25. It is a consensus of
  -- several boards averaged, and rounding it here would throw away the only
  -- thing that separates two players the market cannot separate either.
  position_rank numeric(6,2),
  auction_value integer,
  updated_at    timestamptz not null default now(),
  primary key (player_id, season, format)
);

comment on table public.player_rankings is
  'The market''s view of a player, from /fantasy/rankings. One row per player, season and scoring format. Written only by sync-fantasy.';
comment on column public.player_rankings.overall_rank is
  'The only field with complete coverage, and therefore the only one anything may depend on. 1 is the best player on the board.';
comment on column public.player_rankings.auction_value is
  'Draft dollars. Non-null for everyone but ZERO for ~85% of the board — usable as decoration at the top, never as a price axis.';

create index if not exists player_rankings_board_idx
  on public.player_rankings (season, format, overall_rank);

alter table public.player_rankings enable row level security;

drop policy if exists "rankings are readable" on public.player_rankings;
create policy "rankings are readable" on public.player_rankings
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- team_depth
--
-- The depth chart, which does NOT come from a depth-chart endpoint — there
-- isn't one, and looking for `/depth_charts` returns 404 in every spelling.
-- It is the `depth` field on `/teams/{id}/roster`, which nothing was reading.
--
-- THE FEED REPEATS PLAYERS, and the primary key is what absorbs it. A single
-- club's roster returns 121 rows for 100 distinct (slot, player) pairs: Myles
-- Montgomery is listed at RB4 AND RB5, Greg Van Roten at C2 and C3. The
-- duplicates are always consecutive depths for one man, so the load takes the
-- MINIMUM — his best claim on the slot — and the key makes a second row for
-- the same pair an update rather than a duplicate.
--
-- SLOT, NOT POSITION, and they are different vocabularies. This column holds
-- the provider's chart slot — `LT`, `RCB`, `SLB`, `WR-2` — which is finer than
-- `players.position_abbreviation` and is the whole point of a depth chart. It
-- is deliberately NOT constrained to our five fantasy positions: a full chart
-- is what was asked for, and an offensive line nobody can start is still the
-- thing that tells you whether your running back has a hole to run through.
--
-- Kickers appear under BOTH `PK` and `K` in this feed. Both rows are kept —
-- they are honestly two slots as far as the provider is concerned, and
-- collapsing them here would be this table deciding something the screen can
-- decide better with a display rule.
-- ---------------------------------------------------------------------------
create table if not exists public.team_depth (
  team_id       uuid    not null references public.teams on delete cascade,
  season        integer not null,
  slot          text    not null,
  depth         integer not null check (depth >= 1),
  player_id     uuid    not null references public.players on delete cascade,
  -- Snapshotted with the chart rather than joined from `players`, because a
  -- chart is a statement about a moment: it is the reason a backup is second,
  -- and it must not silently change under a stored ordering.
  injury_status text,
  updated_at    timestamptz not null default now(),
  primary key (team_id, season, slot, player_id)
);

comment on table public.team_depth is
  'Each club''s depth chart, from the `depth` field on /teams/{id}/roster. One row per team, season, slot and player; the load takes the minimum depth where the feed repeats a man. Written only by sync-fantasy.';
comment on column public.team_depth.slot is
  'The provider''s chart slot (LT, RCB, WR-2, PK), which is finer than players.position_abbreviation and is not restricted to fantasy positions.';

create index if not exists team_depth_chart_idx
  on public.team_depth (team_id, season, slot, depth);
create index if not exists team_depth_player_idx
  on public.team_depth (player_id, season);

alter table public.team_depth enable row level security;

drop policy if exists "depth charts are readable" on public.team_depth;
create policy "depth charts are readable" on public.team_depth
  for select to authenticated using (true);
