-- Yap Fantasy — Schema v1 (build plan task 9)
-- Design contracts enforced here:
--   * card       = player template (one per player per season). Rarity floats weekly.
--   * card_instance = the copy a user owns. Rarity is FROZEN at mint. Never merge these two.
--   * Raw stats (stat_lines) are stored apart from points (fantasy_points), keyed by
--     rules_version, so a scoring change is a recompute — never a re-ingest.
--   * No set/museum tables: sets ship Week 3 as a purely additive migration.

-- ---------------------------------------------------------------- enums

create type rarity as enum ('common', 'uncommon', 'rare', 'epic', 'legendary');

create type gem_reason as enum (
  'signup_bonus',
  'weekly_grant',
  'weekly_score_reward',
  'pack_purchase',
  'admin_adjust'
);

create type acquisition_source as enum ('pack', 'grant', 'admin');

-- ---------------------------------------------------------------- identity

create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  avatar_key  text not null default 'default',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- reference data (balldontlie mirror)

create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  external_id  integer not null unique,          -- balldontlie team id
  abbreviation text not null,                    -- rendered as 3-letter text on cards
  location     text,
  name         text,
  full_name    text,
  conference   text,
  division     text,
  updated_at   timestamptz not null default now()
);

create table public.players (
  id            uuid primary key default gen_random_uuid(),
  external_id   integer not null unique,         -- balldontlie player id
  team_id       uuid references public.teams on delete set null,
  first_name    text not null,
  last_name     text not null,
  full_name     text generated always as (first_name || ' ' || last_name) stored,
  position      text,                            -- text, not enum: API positions drift
  jersey_number text,
  height        text,
  weight        text,
  college       text,
  experience    text,
  age           integer,
  is_active     boolean not null default true,
  injury_status text,
  injury_comment text,
  injury_updated_at timestamptz,
  updated_at    timestamptz not null default now()
);

create index players_team_idx on public.players (team_id);
create index players_position_idx on public.players (position);
create index players_active_idx on public.players (is_active) where is_active;

-- /stats has no week param, so game is the join key between a week and its stat lines.
create table public.games (
  id               uuid primary key default gen_random_uuid(),
  external_id      integer not null unique,
  season           integer not null,
  week             integer,
  season_type      smallint not null default 2,  -- 1 preseason, 2 regular, 3 postseason
  home_team_id     uuid references public.teams on delete set null,
  visitor_team_id  uuid references public.teams on delete set null,
  starts_at        timestamptz,
  status           text,
  status_state     text,                          -- pre / in / post
  home_score       integer,
  visitor_score    integer,
  updated_at       timestamptz not null default now()
);

create index games_season_week_idx on public.games (season, season_type, week);
create index games_starts_at_idx on public.games (starts_at);

-- ---------------------------------------------------------------- stats + scoring

create table public.stat_lines (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players on delete cascade,
  game_id     uuid not null references public.games on delete cascade,
  team_id     uuid references public.teams on delete set null,
  -- denormalized so weekly queries never join games
  season      integer not null,
  week        integer,
  season_type smallint not null default 2,
  -- full API payload: the defense against undocumented shape drift
  raw         jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  unique (player_id, game_id)
);

create index stat_lines_player_idx on public.stat_lines (player_id);
create index stat_lines_week_idx on public.stat_lines (season, season_type, week);
create index stat_lines_game_idx on public.stat_lines (game_id);

create table public.scoring_rules (
  version     integer primary key,
  name        text not null,
  rules       jsonb not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Only one active ruleset at a time.
create unique index scoring_rules_single_active_idx
  on public.scoring_rules (is_active) where is_active;

create table public.fantasy_points (
  stat_line_id  uuid not null references public.stat_lines on delete cascade,
  rules_version integer not null references public.scoring_rules on delete cascade,
  points        numeric(8,2) not null default 0,
  computed_at   timestamptz not null default now(),
  primary key (stat_line_id, rules_version)
);

create index fantasy_points_version_idx on public.fantasy_points (rules_version);

-- ---------------------------------------------------------------- rarity source

-- Persist EVERY slate: DFS slates disappear from the API once they go stale.
create table public.dfs_salary_snapshots (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players on delete cascade,
  season       integer not null,
  week         integer,
  season_type  smallint not null default 2,
  slate_id     bigint,
  provider     text not null default 'draftkings',
  salary       integer not null,
  position     text,
  captured_at  timestamptz not null default now(),
  unique (player_id, slate_id)
);

create index dfs_salary_week_idx on public.dfs_salary_snapshots (season, season_type, week);
create index dfs_salary_player_idx on public.dfs_salary_snapshots (player_id);

-- ---------------------------------------------------------------- cards

-- Template. One per player per season. Rarity is recomputed weekly from salary bands.
create table public.cards (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players on delete cascade,
  season      integer not null,
  rarity      rarity not null default 'common',
  rarity_source text not null default 'fallback',  -- 'dfs_salary' | 'season_stats' | 'fallback'
  rarity_updated_at timestamptz not null default now(),
  is_mintable boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (player_id, season)
);

create index cards_rarity_idx on public.cards (season, rarity) where is_mintable;

-- The owned copy. Rarity frozen at mint so a user's collection never mutates
-- underneath them when the weekly salary snapshot moves a template's band.
create table public.card_instances (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  card_id         uuid not null references public.cards on delete restrict,
  rarity_at_mint  rarity not null,
  source          acquisition_source not null default 'pack',
  pack_opening_id uuid,                            -- FK added after pack_openings exists
  acquired_at     timestamptz not null default now()
);

create index card_instances_user_idx on public.card_instances (user_id);
create index card_instances_card_idx on public.card_instances (card_id);

-- ---------------------------------------------------------------- packs + economy

create table public.packs (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  gem_cost    integer not null check (gem_cost >= 0),
  card_count  smallint not null check (card_count between 1 and 10),
  -- weights per rarity, e.g. {"common": 70, "uncommon": 20, "rare": 7, "epic": 2.5, "legendary": 0.5}
  odds        jsonb not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.pack_openings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  pack_id     uuid not null references public.packs on delete restrict,
  gems_spent  integer not null check (gems_spent >= 0),
  opened_at   timestamptz not null default now()
);

create index pack_openings_user_idx on public.pack_openings (user_id, opened_at desc);

alter table public.card_instances
  add constraint card_instances_pack_opening_fkey
  foreign key (pack_opening_id) references public.pack_openings on delete set null;

-- Append-only ledger: the audit trail.
create table public.gems_ledger (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  amount       integer not null check (amount <> 0),   -- signed
  reason       gem_reason not null,
  reference_id uuid,
  created_at   timestamptz not null default now()
);

create index gems_ledger_user_idx on public.gems_ledger (user_id, created_at desc);

-- Denormalized balance, written in the same transaction as the ledger row.
-- The check constraint is what makes "you cannot spend gems you do not have"
-- a database guarantee rather than an application promise.
create table public.gem_balances (
  user_id    uuid primary key references auth.users on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
