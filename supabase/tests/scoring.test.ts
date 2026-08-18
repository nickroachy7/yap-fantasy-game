import { assertEquals } from 'jsr:@std/assert@1';
import { scoreStatLine, SCORING_RULES_V1, type ScoringRules } from '../functions/_shared/scoring.ts';

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
