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
 * Version 2 — traditional scoring, which mostly means REMOVING two lines.
 *
 * ---------------------------------------------------------------------------
 * WHY v1 WAS WRONG
 * ---------------------------------------------------------------------------
 *
 * `fumbles_touchdowns` is not what its name says. It is the provider's catch-all
 * counter for a non-offensive touchdown, and it fires alongside the specific
 * field as well as instead of it. Measured across three seasons of stored lines:
 *
 *   - 58 of 58 interception-return touchdowns ALSO carry `fumbles_touchdowns`.
 *     Not most. All of them.
 *   - 5 of 12 kick-return and 7 of 22 punt-return touchdowns carry it too.
 *   - 35 rows carry it alone, which are the genuine fumble recoveries.
 *
 * v1 scored `fumbles_touchdowns` AND `interception_touchdowns` at 6 apiece, so
 * every pick-six paid 12. Two linebackers came out as the fourth and fifth
 * highest scorers of 2026 preseason week 3, on 12.00 each, above every skill
 * player in both games. That is what surfaced it.
 *
 * ---------------------------------------------------------------------------
 * WHY TRADITIONAL SETTLES IT RATHER THAN A DEDUPLICATION RULE
 * ---------------------------------------------------------------------------
 *
 * The obvious repair is to teach the engine that those four fields describe one
 * touchdown and score it once. Traditional fantasy scoring makes that
 * unnecessary, because it does not score individual defensive players at all —
 * a pick-six belongs to a DST unit, not to the cornerback who caught it. So both
 * defensive fields simply leave the ruleset, the double-count leaves with them,
 * and no new rule shape is needed.
 *
 * It also costs almost nothing that anyone can roster. Only QB/RB/WR/TE/PK can
 * fill a slot, and across every stored line exactly two rosterable players — one
 * RB and one WR — ever scored on `fumbles_touchdowns` alone. Return touchdowns,
 * which returners genuinely earn, keep their 6 through the two specific fields.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY UNCHANGED
 * ---------------------------------------------------------------------------
 *
 * KICKING STAYS FLAT AT 3, and not because flat is preferred. Traditional
 * kicker scoring is distance-tiered — 3 under 40, 4 from 40, 5 from 50 — and
 * this feed cannot support it. It publishes `field_goals_made` and
 * `long_field_goal_made` and nothing between: a kicker with four made and a long
 * of 48 has three field goals of unknowable distance. Tiering on the long alone
 * would pay 4 for all four of them. A number we can stand behind beats a
 * better-sounding one we would be inventing.
 *
 * THE YARDAGE BONUSES STAY, and they are the one real deviation from
 * traditional. They are a deliberate design choice rather than part of this bug
 * — 20260818150000 reconciles a season against them to the exact point — so
 * removing them is a game decision, not a correction, and it is one more row in
 * this table whenever it is wanted.
 */
export const SCORING_RULES_V2: ScoringRules = {
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
    // return scores, which a returner earns and traditional scoring credits
    kick_return_touchdowns: 6,
    punt_return_touchdowns: 6,
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

/**
 * The default is the CURRENT ruleset, and it is only ever a fallback: every
 * caller passes the active row from `scoring_rules`, because the rules are data
 * and the table is the authority. `SCORING_RULES_V1` stays exported unchanged
 * beside it as the honest record of what version 1 was — `fantasy_points` still
 * holds rows keyed to it, and a constant that quietly became v2 would make those
 * rows unexplainable.
 */
export function scoreStatLine(
  raw: Record<string, unknown>,
  rules: ScoringRules = SCORING_RULES_V2,
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
