/**
 * A real `player_profile` payload, captured from the live RPC.
 *
 * Captured rather than invented because the awkward cases are the point: 2021
 * has no reported stats at all (base_fp null, rank null, but seven games
 * played), usage is null because he has taken no preseason snaps, and the rank
 * pool swings from 126 in 2025 to 7 in 2017. A hand-written fixture would have
 * been tidy and would have proved nothing.
 */
import type { Json } from '@/lib/database.types';

export const MCCAFFREY_PROFILE: Json = {
  player: {
    id: 'f6d6132d-2900-4a30-8cb9-8d9030a5a562',
    age: 30,
    name: 'Christian McCaffrey',
    height: '5\' 11"',
    weight: '210 lbs',
    college: 'Stanford',
    division: 'WEST',
    position: 'Running Back',
    team_name: 'San Francisco 49ers',
    conference: 'NFC',
    experience: '10th Season',
    injury_status: 'Questionable',
    jersey_number: '23',
    injury_comment:
      "McCaffrey (undisclosed) isn't participating in Tuesday's joint practice with the Titans, Cam Inman of The San Jose Mercury News reports.",
    injury_updated_at: '2026-08-11T17:39:00+00:00',
    team_abbreviation: 'SF',
    position_abbreviation: 'RB',
  },
  current: { fp: 0, games: 0, season: 2026, fp_per_game: null, season_type: 1 },
  usage: null,
  standings: {
    ties: 0,
    wins: 12,
    losses: 5,
    season: 2025,
    points_for: 437,
    win_streak: -1,
    playoff_seed: 6,
    overall_record: '12-5',
    points_against: 371,
    division_record: '4-2',
    conference_record: '9-3',
    point_differential: 66,
  },
  career: [
    { season: 2025, games_played: 17, base_fp: 416.6, base_fp_per_game: 24.51, pos_rank: 1, rank_pool: 126,
      exact_fp: 428.6, exact_games: 17, exact_fp_per_game: 25.21,
      stats: { rushing_attempts: 311, rushing_yards: 1202, rushing_touchdowns: 10, receptions: 102, receiving_yards: 924 } },
    { season: 2024, games_played: 4, base_fp: 49.8, base_fp_per_game: 12.45, pos_rank: 55, rank_pool: 94,
      exact_fp: 47.8, exact_games: 4, exact_fp_per_game: 11.95,
      stats: { rushing_attempts: 50, rushing_yards: 202, rushing_touchdowns: null, receptions: 15, receiving_yards: 146 } },
    { season: 2023, games_played: 16, base_fp: 395.3, base_fp_per_game: 24.71, pos_rank: 1, rank_pool: 73,
      stats: { rushing_attempts: 272, rushing_yards: 1459, rushing_touchdowns: 14, receptions: 67, receiving_yards: 564 } },
    { season: 2022, games_played: 17, base_fp: 356.36, base_fp_per_game: 20.96, pos_rank: 1, rank_pool: 59,
      stats: { rushing_attempts: 244, rushing_yards: 1139, rushing_touchdowns: 8, receptions: 85, receiving_yards: 741 } },
    // The provider has nothing for 2021 despite seven games played.
    { season: 2021, games_played: 7, base_fp: null, base_fp_per_game: null, pos_rank: null, rank_pool: 33,
      stats: { rushing_attempts: null, rushing_yards: null, rushing_touchdowns: null, receptions: null, receiving_yards: null } },
    { season: 2020, games_played: 3, base_fp: 90.4, base_fp_per_game: 30.13, pos_rank: 12, rank_pool: 28,
      stats: { rushing_attempts: 59, rushing_yards: 225, rushing_touchdowns: 5, receptions: 17, receiving_yards: 149 } },
    { season: 2019, games_played: 16, base_fp: 469.2, base_fp_per_game: 29.33, pos_rank: 1, rank_pool: 17,
      stats: { rushing_attempts: 287, rushing_yards: 1387, rushing_touchdowns: 15, receptions: 116, receiving_yards: 1005 } },
    { season: 2018, games_played: 16, base_fp: 387.5, base_fp_per_game: 24.22, pos_rank: 1, rank_pool: 10,
      stats: { rushing_attempts: 219, rushing_yards: 1098, rushing_touchdowns: 7, receptions: 107, receiving_yards: 867 } },
    { season: 2017, games_played: 16, base_fp: 230.6, base_fp_per_game: 14.41, pos_rank: 2, rank_pool: 7,
      stats: { rushing_attempts: 117, rushing_yards: 435, rushing_touchdowns: 2, receptions: 80, receiving_yards: 651 } },
  ],
};

/** A second player with usage data, so the populated panel is exercised too. */
export const USAGE_SAMPLE = {
  season: 2026,
  targets: 41,
  carries: 6,
  target_share: 0.2764,
  carry_share: 0.0312,
  rank_on_team: 1,
  position_group_size: 6,
};

/**
 * A real `player_game_log` payload, trimmed to the interesting parts: three
 * 2026 fixtures that have NOT been played, the 2025 postseason, and the start
 * of the 2025 regular season. Captured rather than invented so the "upcoming"
 * rows carry genuine kickoff times and the played rows genuine results.
 */
export const MCCAFFREY_GAME_LOG: Json = [
  { week: 1, played: false, points: null, season: 2026, game_id: 'aa4a651a', is_home: false,
    opponent: 'LAR', opp_score: null, starts_at: '2026-09-11T00:35:00+00:00', team_score: null,
    season_type: 2, status_state: 'scheduled', stats: {} },
  { week: 2, played: false, points: null, season: 2026, game_id: '9d28e3f0', is_home: true,
    opponent: 'MIA', opp_score: null, starts_at: '2026-09-20T20:25:00+00:00', team_score: null,
    season_type: 2, status_state: 'scheduled', stats: {} },
  { week: 3, played: false, points: null, season: 2026, game_id: 'a6ad208b', is_home: true,
    opponent: 'ARI', opp_score: null, starts_at: '2026-09-27T20:05:00+00:00', team_score: null,
    season_type: 2, status_state: 'scheduled', stats: {} },
  { week: 1, played: true, points: 29.4, season: 2025, game_id: 'a43468c5', is_home: false,
    opponent: 'PHI', opp_score: 19, starts_at: '2026-01-11T21:30:00+00:00', team_score: 23,
    season_type: 3, status_state: 'final',
    stats: { rushing_attempts: 15, rushing_yards: 48, rushing_touchdowns: 0, receptions: 6, receiving_yards: 66 } },
  { week: 2, played: true, points: 12.4, season: 2025, game_id: '9632f4b3', is_home: false,
    opponent: 'SEA', opp_score: 41, starts_at: '2026-01-18T01:00:00+00:00', team_score: 6,
    season_type: 3, status_state: 'final',
    stats: { rushing_attempts: 11, rushing_yards: 35, rushing_touchdowns: 0, receptions: 5, receiving_yards: 39 } },
  { week: 1, played: true, points: 23.2, season: 2025, game_id: '61eeec3a', is_home: false,
    opponent: 'SEA', opp_score: 13, starts_at: '2025-09-07T20:05:00+00:00', team_score: 17,
    season_type: 2, status_state: 'final',
    stats: { rushing_attempts: 22, rushing_yards: 69, rushing_touchdowns: 0, receptions: 9, receiving_yards: 73 } },
  { week: 2, played: true, points: 22.7, season: 2025, game_id: 'adc9920d', is_home: false,
    opponent: 'NO', opp_score: 21, starts_at: '2025-09-14T17:00:00+00:00', team_score: 26,
    season_type: 2, status_state: 'final',
    stats: { rushing_attempts: 13, rushing_yards: 55, rushing_touchdowns: 0, receptions: 6, receiving_yards: 52 } },
  { week: 3, played: true, points: 24.0, season: 2025, game_id: '55d75f94', is_home: true,
    opponent: 'ARI', opp_score: 15, starts_at: '2025-09-21T20:25:00+00:00', team_score: 16,
    season_type: 2, status_state: 'final',
    stats: { rushing_attempts: 17, rushing_yards: 52, rushing_touchdowns: 0, receptions: 10, receiving_yards: 88 } },
  { week: 4, played: true, points: 26.1, season: 2025, game_id: '853aa237', is_home: true,
    opponent: 'JAX', opp_score: 26, starts_at: '2025-09-28T20:05:00+00:00', team_score: 21,
    season_type: 2, status_state: 'final',
    stats: { rushing_attempts: 17, rushing_yards: 49, rushing_touchdowns: 0, receptions: 6, receiving_yards: 92 } },
];

/* -------------------------------------------------------------------------- *
 * Community ownership + the card profile.
 *
 * Shaped by hand rather than captured, for the one reason that beats capture:
 * these describe a user base that does not exist yet. What matters is that the
 * gallery shows the cases that will actually be common in the beta, and the
 * common case early on is "hardly anybody has one, and nobody has played it".
 * A fixture full of diamonds would make the panel look finished and hide the
 * two states every real player will be in for the first month.
 * -------------------------------------------------------------------------- */

/** The mature case: copies spread across tiers, one standout, some sold back. */
export const MARKET_SAMPLE: Json = {
  player_id: 'f6d6132d-2900-4a30-8cb9-8d9030a5a562',
  totals: {
    minted: 31,
    held: 27,
    sold: 4,
    owners: 19,
    started: 21,
    total_fp: 14204.5,
    avg_fp: 526.1,
  },
  tiers: [
    { tier: 'bronze', copies: 9, owners: 9, best_fp: 148.2 },
    { tier: 'silver', copies: 11, owners: 10, best_fp: 702.0 },
    { tier: 'gold', copies: 6, owners: 6, best_fp: 2311.4 },
    { tier: 'diamond', copies: 1, owners: 1, best_fp: 3180.9 },
  ],
  top: {
    display_name: 'wideleft',
    is_you: false,
    tier: 'diamond',
    career_fp: 3180.9,
    lineup_starts: 41,
    season: 2025,
    acquired_at: '2025-09-04T18:22:10.114Z',
  },
  yours: { copies: 2, best_fp: 702.0, best_tier: 'silver', best_rank: 8 },
  seasons: [
    { season: 2026, held: 18, minted: 21 },
    { season: 2025, held: 9, minted: 10 },
  ],
};

/**
 * The one that will be far more common at launch, and the one worth looking at
 * hardest: copies exist, every one is bronze, and `top` is null because nobody
 * has started one. The panel must say that rather than crown an arbitrary row.
 */
export const MARKET_UNPLAYED: Json = {
  player_id: 'f6d6132d-2900-4a30-8cb9-8d9030a5a562',
  totals: {
    minted: 3,
    held: 3,
    sold: 0,
    owners: 3,
    started: 0,
    total_fp: 0,
    avg_fp: 0,
  },
  tiers: [
    { tier: 'bronze', copies: 3, owners: 3, best_fp: 0 },
    { tier: 'silver', copies: 0, owners: 0, best_fp: null },
    { tier: 'gold', copies: 0, owners: 0, best_fp: null },
    { tier: 'diamond', copies: 0, owners: 0, best_fp: null },
  ],
  top: null,
  yours: null,
  seasons: [{ season: 2026, held: 3, minted: 3 }],
};

/** A copy partway up silver, with a mixed start log including an unswept week. */
export const CARD_PROFILE_SAMPLE: Json = {
  card: {
    id: '7c0a6f2e-1111-4d55-9a10-2f8b4c3e0a91',
    card_id: '2b1e5d90-2222-4a77-b3c1-6e9f0d4a1c22',
    player_id: 'f6d6132d-2900-4a30-8cb9-8d9030a5a562',
    player_name: 'Christian McCaffrey',
    position_abbreviation: 'RB',
    team_abbreviation: 'SF',
    injury_status: null,
    season: 2026,
    rarity: 'legendary',
    tier: 'silver',
    career_fp: 702.0,
    lineup_starts: 33,
    fp_per_start: 21.3,
    acquired_at: '2026-08-04T14:02:55.001Z',
    source: 'pack',
    sold_at: null,
    sold_for: null,
    sell_value: 40,
    tier_floor_fp: 200,
    next_tier_at: 750,
    next_tier_label: 'gold',
  },
  rank: { among_player: 8, player_pool: 27, overall: 214, overall_pool: 9418 },
  starts: [
    { season: 2026, season_type: 2, week: 3, slot: 'RB1', points: null, scored: false, lineup_total: 0 },
    { season: 2026, season_type: 2, week: 2, slot: 'RB1', points: 27.4, scored: true, lineup_total: 141.2 },
    { season: 2026, season_type: 2, week: 1, slot: 'FLEX', points: 8.1, scored: true, lineup_total: 96.7 },
    { season: 2025, season_type: 2, week: 18, slot: 'RB1', points: 31.9, scored: true, lineup_total: 152.0 },
  ],
};

/**
 * The bench case, and the whole reason the card profile exists: a copy that has
 * never been started has earned nothing, sits at bronze, and ranks last of
 * everything. The screen must make it obvious that this is a consequence of not
 * playing it, not a bug.
 */
export const CARD_PROFILE_NEVER_STARTED: Json = {
  card: {
    id: '9e4b1a70-3333-4c11-8f22-7a5c9d2e6b04',
    card_id: '2b1e5d90-2222-4a77-b3c1-6e9f0d4a1c22',
    player_id: 'f6d6132d-2900-4a30-8cb9-8d9030a5a562',
    player_name: 'Christian McCaffrey',
    position_abbreviation: 'RB',
    team_abbreviation: 'SF',
    injury_status: 'Questionable',
    season: 2026,
    rarity: 'legendary',
    tier: 'bronze',
    career_fp: 0,
    lineup_starts: 0,
    fp_per_start: null,
    acquired_at: '2026-08-18T09:41:12.500Z',
    source: 'pack',
    sold_at: null,
    sold_for: null,
    sell_value: 8,
    tier_floor_fp: 0,
    next_tier_at: 200,
    next_tier_label: 'silver',
  },
  rank: { among_player: 20, player_pool: 27, overall: 7733, overall_pool: 9418 },
  starts: [],
};
