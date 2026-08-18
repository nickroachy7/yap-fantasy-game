/**
 * Scoring engine (build plan task 15).
 *
 * A pure function: (raw stat line, rules) -> points. No I/O, no clock, no
 * randomness — so it is trivially testable and always reproducible.
 *
 * Rules are DATA, versioned in the scoring_rules table, never hardcoded here.
 * That is what makes a scoring change a recompute (re-run against stored
 * stat_lines.raw under a new version) rather than a re-ingest.
 */

/** Multiplier applied per unit of a stat, keyed by the provider's stat name. */
export type ScoringRules = {
  perStat: Record<string, number>;
  /** Flat bonuses awarded when a stat reaches a threshold. */
  bonuses?: Array<{ stat: string; atLeast: number; points: number }>;
};

export const SCORING_RULES_V1: ScoringRules = {
  perStat: {
    // passing
    passing_yards: 0.04, // 1 per 25
    passing_touchdowns: 4,
    passing_interceptions: -2,
    // rushing
    rushing_yards: 0.1, // 1 per 10
    rushing_touchdowns: 6,
    // receiving (full PPR)
    receptions: 1,
    receiving_yards: 0.1,
    receiving_touchdowns: 6,
    // turnovers
    fumbles_lost: -2,
    // kicking
    field_goals_made: 3,
    extra_points_made: 1,
    // return + defensive scores
    kick_return_touchdowns: 6,
    punt_return_touchdowns: 6,
    fumbles_touchdowns: 6,
    interception_touchdowns: 6,
  },
  bonuses: [
    { stat: 'passing_yards', atLeast: 300, points: 3 },
    { stat: 'rushing_yards', atLeast: 100, points: 3 },
    { stat: 'receiving_yards', atLeast: 100, points: 3 },
  ],
};

/**
 * Nulls are the norm in this feed: a running back has null passing stats, not 0.
 * Anything non-numeric contributes nothing rather than poisoning the total
 * with NaN — a single NaN would otherwise silently zero out a whole week.
 */
function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function scoreStatLine(
  raw: Record<string, unknown>,
  rules: ScoringRules = SCORING_RULES_V1,
): number {
  let total = 0;

  for (const [stat, multiplier] of Object.entries(rules.perStat)) {
    total += numeric(raw[stat]) * multiplier;
  }

  for (const bonus of rules.bonuses ?? []) {
    if (numeric(raw[bonus.stat]) >= bonus.atLeast) {
      total += bonus.points;
    }
  }

  // Two decimals: fantasy points are conventionally displayed to 0.1, and
  // float drift (0.04 * 267 = 10.680000000000001) must not reach the database.
  return Math.round(total * 100) / 100;
}
