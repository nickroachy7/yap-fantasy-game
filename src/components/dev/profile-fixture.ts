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
      stats: { rushing_attempts: 311, rushing_yards: 1202, rushing_touchdowns: 10, receptions: 102, receiving_yards: 924 } },
    { season: 2024, games_played: 4, base_fp: 49.8, base_fp_per_game: 12.45, pos_rank: 55, rank_pool: 94,
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
