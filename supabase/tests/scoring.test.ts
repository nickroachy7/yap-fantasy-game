import { assertEquals } from 'jsr:@std/assert@1';
import {
  scoreStatLine,
  SCORING_RULES_V1,
  SCORING_RULES_V2,
  type ScoringRules,
} from '../functions/_shared/scoring.ts';

Deno.test('empty stat line scores zero', () => {
  assertEquals(scoreStatLine({}), 0);
});

Deno.test('nulls are treated as zero, not NaN', () => {
  const line = {
    passing_yards: null,
    rushing_yards: null,
    receptions: null,
    receiving_yards: undefined,
  };
  assertEquals(scoreStatLine(line), 0);
});

Deno.test('a non-numeric value cannot poison the total', () => {
  // The feed has handed us strings before; one bad field must not zero a week.
  const line = { passing_yards: '267' as unknown, rushing_yards: 40 };
  assertEquals(scoreStatLine(line), 4);
});

Deno.test('passing line: yards, TDs and interceptions', () => {
  // 267 * 0.04 = 10.68, + 2 TD (8), - 1 INT (2) => 16.68
  const line = { passing_yards: 267, passing_touchdowns: 2, passing_interceptions: 1 };
  assertEquals(scoreStatLine(line), 16.68);
});

Deno.test('300-yard passing bonus applies at the threshold, not below', () => {
  assertEquals(scoreStatLine({ passing_yards: 299 }), 11.96);
  // 300 * 0.04 = 12, + 3 bonus => 15
  assertEquals(scoreStatLine({ passing_yards: 300 }), 15);
});

Deno.test('full PPR: each reception is a point', () => {
  // 6 rec (6) + 84 yds (8.4) + 1 TD (6) = 20.4
  const line = { receptions: 6, receiving_yards: 84, receiving_touchdowns: 1 };
  assertEquals(scoreStatLine(line), 20.4);
});

Deno.test('100-yard receiving bonus stacks with the base line', () => {
  // 8 rec (8) + 112 yds (11.2) + bonus (3) = 22.2
  assertEquals(scoreStatLine({ receptions: 8, receiving_yards: 112 }), 22.2);
});

Deno.test('lost fumbles subtract', () => {
  // 100 rush yds (10) + bonus (3) - 1 fumble (2) = 11
  assertEquals(scoreStatLine({ rushing_yards: 100, fumbles_lost: 1 }), 11);
});

Deno.test('a net-negative line can go below zero', () => {
  // -2 INT * 3 = -6, 1 fumble = -2 => -8
  assertEquals(scoreStatLine({ passing_interceptions: 3, fumbles_lost: 1 }), -8);
});

Deno.test('kicking is scored', () => {
  // 3 FG (9) + 2 XP (2) = 11
  assertEquals(scoreStatLine({ field_goals_made: 3, extra_points_made: 2 }), 11);
});

Deno.test('rounds to two decimals rather than leaking float drift', () => {
  // 0.04 * 267 in IEEE754 is 10.680000000000001
  assertEquals(scoreStatLine({ passing_yards: 267 }), 10.68);
});

Deno.test('rules are data: a different ruleset gives a different answer', () => {
  const halfPpr: ScoringRules = {
    ...SCORING_RULES_V1,
    perStat: { ...SCORING_RULES_V1.perStat, receptions: 0.5 },
  };
  const line = { receptions: 6, receiving_yards: 84 };
  assertEquals(scoreStatLine(line), 14.4); // full PPR
  assertEquals(scoreStatLine(line, halfPpr), 11.4); // half PPR
});

Deno.test('scoring is deterministic across repeated calls', () => {
  const line = { passing_yards: 312, passing_touchdowns: 3, rushing_yards: 22 };
  const first = scoreStatLine(line);
  assertEquals(scoreStatLine(line), first);
  assertEquals(first, 29.68); // 12.48 + 12 + 3 bonus + 2.2
});

/**
 * The non-offensive touchdown double-count, and the rule change that ended it.
 *
 * `fumbles_touchdowns` is the provider's catch-all counter for a touchdown that
 * was not scored by the offence, and it fires ALONGSIDE the specific field
 * rather than instead of it — all 58 interception-return TDs in three seasons of
 * stored data carry both, as do 5 of 12 kick-return and 7 of 22 punt-return TDs.
 * v1 scored the catch-all and the specific field at 6 apiece, so a pick-six paid
 * 12 and a kick return paid 12.
 *
 * These are the shapes that actually appeared in the data, not invented ones —
 * the first is Wade Woodaz's line from 2026 preseason week 3, which is what
 * surfaced the bug by putting a linebacker fourth on the weekly leaders board.
 */
const PICK_SIX = {
  solo_tackles: 1,
  total_tackles: 2,
  passes_defended: 1,
  defensive_interceptions: 1,
  interception_yards: 80,
  interception_touchdowns: 1,
  fumbles_touchdowns: 1,
};

/** A returner's line: one kick returned for a score, catch-all set as well. */
const KICK_RETURN_TD = {
  kick_returns: 3,
  kick_return_yards: 141,
  kick_return_touchdowns: 1,
  fumbles_touchdowns: 1,
};

Deno.test('v1 double-counted a pick-six, and the record of that stays honest', () => {
  // 6 for interception_touchdowns + 6 for the catch-all. fantasy_points still
  // holds rows keyed to version 1; if this ever stops being 12, those rows
  // become unexplainable.
  assertEquals(scoreStatLine(PICK_SIX, SCORING_RULES_V1), 12);
});

Deno.test('traditional scoring gives an individual defender nothing', () => {
  // Not 6, and not 12. A pick-six belongs to a DST unit in traditional scoring,
  // and no defensive position can fill a slot in lineup_slot_config anyway.
  assertEquals(scoreStatLine(PICK_SIX, SCORING_RULES_V2), 0);
  // And the default ruleset is v2, so the bare call agrees.
  assertEquals(scoreStatLine(PICK_SIX), 0);
});

Deno.test('a return touchdown is worth six, once', () => {
  // THE ONE THAT REACHES A LINEUP. Returners are wide receivers and running
  // backs, so this is the double-count that could actually be started — ten
  // stored lines carried it, every one of them a designated returner.
  assertEquals(scoreStatLine(KICK_RETURN_TD, SCORING_RULES_V1), 12);
  assertEquals(scoreStatLine(KICK_RETURN_TD, SCORING_RULES_V2), 6);
});

Deno.test('a returner keeps everything else he earned', () => {
  // The subtraction must take the duplicate and nothing else: this is a real
  // receiving line with a punt return score on top.
  const line = {
    receptions: 4,
    receiving_yards: 62,
    punt_returns: 2,
    punt_return_touchdowns: 1,
    fumbles_touchdowns: 1,
  };
  // 4 + 6.2 + 6 = 16.2 under v2; v1 added a seventh six on top.
  assertEquals(scoreStatLine(line, SCORING_RULES_V2), 16.2);
  assertEquals(scoreStatLine(line, SCORING_RULES_V1), 22.2);
});

Deno.test('v2 changes nothing for an ordinary offensive line', () => {
  // 105 of 32,812 stored lines moved when v2 was computed. This is the other
  // 32,707: if a rules change touches a line with no non-offensive touchdown in
  // it, something has been removed that should not have been.
  const lines = [
    { passing_yards: 312, passing_touchdowns: 3, rushing_yards: 22 },
    { receptions: 6, receiving_yards: 84 },
    { rushing_yards: 104, rushing_touchdowns: 1, fumbles_lost: 1 },
    { field_goals_made: 3, extra_points_made: 2 },
    {},
  ];
  for (const line of lines) {
    assertEquals(scoreStatLine(line, SCORING_RULES_V2), scoreStatLine(line, SCORING_RULES_V1));
  }
});

Deno.test('v2 subtracts and never adds', () => {
  // A ruleset built by deleting two multipliers cannot score higher than the one
  // it came from. Asserted over the shapes above rather than argued.
  for (const line of [PICK_SIX, KICK_RETURN_TD, { fumbles_touchdowns: 1 }]) {
    const before = scoreStatLine(line, SCORING_RULES_V1);
    const after = scoreStatLine(line, SCORING_RULES_V2);
    assertEquals(after <= before, true);
  }
});
