/**
 * Turning the stored scoring ruleset into something a person can read.
 *
 * `scoring_rules.rules` is the same object the edge function scores against —
 * a flat `perStat` map keyed by the PROVIDER's stat names plus a list of
 * threshold bonuses. That shape is right for a scoring engine and wrong for a
 * human: `passing_yards: 0.04` is the correct rule and a terrible sentence.
 *
 * This module does the translation and nothing else. It deliberately reads the
 * LIVE ruleset rather than restating the constants in
 * `supabase/functions/_shared/scoring.ts`, because a scoring page that is a
 * second hardcoded copy of the rules is a page that will eventually lie. If the
 * table changes and this file has no label for a new stat, the stat still
 * renders — under a humanised version of its own key — rather than vanishing.
 */
import type { Json } from '@/lib/database.types';

export type ScoringItem = {
  stat: string;
  label: string;
  points: number;
  /**
   * The rate restated as a whole number, e.g. "25 yards = 1 point". Only set
   * for fractional rules, where the raw multiplier is unreadable.
   */
  note?: string;
};

export type ScoringBonus = {
  stat: string;
  label: string;
  atLeast: number;
  points: number;
};

export type ScoringGroup = { title: string; items: ScoringItem[] };

export type ScoringSheet = {
  version: number;
  name: string;
  groups: ScoringGroup[];
  bonuses: ScoringBonus[];
  /**
   * Stats present in the ruleset that this file has no group for. Surfaced in
   * a catch-all group rather than dropped — a scoring rule the app scores by
   * but does not show is exactly the kind of quiet divergence that makes people
   * distrust the whole page.
   */
  unmapped: string[];
};

/** Provider stat name -> the words a person uses for it. */
const LABELS: Record<string, string> = {
  passing_yards: 'Passing yards',
  passing_touchdowns: 'Passing touchdown',
  passing_interceptions: 'Interception thrown',
  rushing_yards: 'Rushing yards',
  rushing_touchdowns: 'Rushing touchdown',
  receptions: 'Reception',
  receiving_yards: 'Receiving yards',
  receiving_touchdowns: 'Receiving touchdown',
  field_goals_made: 'Field goal made',
  extra_points_made: 'Extra point made',
  fumbles_lost: 'Fumble lost',
  fumbles_touchdowns: 'Fumble recovery touchdown',
  kick_return_touchdowns: 'Kick return touchdown',
  punt_return_touchdowns: 'Punt return touchdown',
  interception_touchdowns: 'Interception returned for touchdown',
};

/**
 * Group membership, in the order the groups should be read. Ordering by hand
 * rather than alphabetically because a scoring sheet is read top-down by
 * position — a quarterback stops after Passing, a receiver after Receiving.
 */
const GROUPS: { title: string; stats: string[] }[] = [
  { title: 'Passing', stats: ['passing_yards', 'passing_touchdowns', 'passing_interceptions'] },
  { title: 'Rushing', stats: ['rushing_yards', 'rushing_touchdowns'] },
  { title: 'Receiving', stats: ['receptions', 'receiving_yards', 'receiving_touchdowns'] },
  { title: 'Kicking', stats: ['field_goals_made', 'extra_points_made'] },
  {
    title: 'Returns and defence',
    stats: ['kick_return_touchdowns', 'punt_return_touchdowns', 'interception_touchdowns', 'fumbles_touchdowns'],
  },
  { title: 'Turnovers', stats: ['fumbles_lost'] },
];

/** `passing_yards` -> `Passing yards`, for a stat we have no label for. */
function humanise(stat: string): string {
  const words = stat.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * "25 yards = 1 point" for a 0.04 rule.
 *
 * Only for rates below 1, and only when the reciprocal is close enough to a
 * whole number to state as one — 0.04 and 0.1 both are. A rate like 0.07 would
 * produce "14.3 yards = 1 point", which is worse than saying nothing, so it
 * gets no note.
 */
function rateNote(points: number): string | undefined {
  if (points <= 0 || points >= 1) return undefined;
  const per = 1 / points;
  const rounded = Math.round(per);
  if (Math.abs(per - rounded) > 0.001) return undefined;
  return `${rounded} yards = 1 point`;
}

type Obj = { [k: string]: Json | undefined };

const obj = (v: Json | undefined): Obj | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;

const num = (v: Json | undefined): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export function parseScoringSheet(
  rules: Json,
  version: number,
  name: string,
): ScoringSheet | null {
  const root = obj(rules);
  const perStat = obj(root?.perStat);
  if (!root || !perStat) return null;

  const rates = new Map<string, number>();
  for (const [stat, value] of Object.entries(perStat)) {
    const n = num(value);
    if (n !== null) rates.set(stat, n);
  }

  const claimed = new Set<string>();
  const groups: ScoringGroup[] = [];
  for (const g of GROUPS) {
    const items: ScoringItem[] = [];
    for (const stat of g.stats) {
      const points = rates.get(stat);
      // A stat this file knows about but the live ruleset does not score is
      // simply absent — it is not worth a row saying "0".
      if (points === undefined) continue;
      claimed.add(stat);
      items.push({ stat, label: LABELS[stat] ?? humanise(stat), points, note: rateNote(points) });
    }
    if (items.length > 0) groups.push({ title: g.title, items });
  }

  const unmapped = [...rates.keys()].filter((s) => !claimed.has(s)).sort();
  if (unmapped.length > 0) {
    groups.push({
      title: 'Other',
      items: unmapped.map((stat) => ({
        stat,
        label: LABELS[stat] ?? humanise(stat),
        points: rates.get(stat) ?? 0,
        note: rateNote(rates.get(stat) ?? 0),
      })),
    });
  }

  const bonusRaw = Array.isArray(root.bonuses) ? root.bonuses : [];
  const bonuses: ScoringBonus[] = bonusRaw
    .map((entry) => {
      const e = obj(entry);
      const stat = typeof e?.stat === 'string' ? e.stat : null;
      const atLeast = num(e?.atLeast);
      const points = num(e?.points);
      if (!stat || atLeast === null || points === null) return null;
      return { stat, label: LABELS[stat] ?? humanise(stat), atLeast, points };
    })
    .filter((b): b is ScoringBonus => b !== null);

  return { version, name, groups, bonuses, unmapped };
}

/** "+4", "-2", "+0.04". Sign always shown: it is the whole content of the cell. */
export function pointsText(points: number): string {
  const rounded = Math.round(points * 100) / 100;
  const body = Number.isInteger(rounded) ? String(Math.abs(rounded)) : String(Math.abs(rounded));
  return `${rounded < 0 ? '−' : '+'}${body}`;
}
