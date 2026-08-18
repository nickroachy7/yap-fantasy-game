/**
 * The standings table.
 *
 * Not `DataTable`, and the reason is worth stating: a leaderboard needs three
 * things that component deliberately does not expose — a tinted row for the
 * signed-in user, a pressable row, and a per-row expansion. Rather than widen a
 * shared primitive for one screen, this reimplements its RULES (9pt uppercase
 * headers, right-aligned tabular numerics, em dash for missing, hairline row
 * separators) so the table still lines up with every other table in the app.
 * `DataTable` is used inside the expansion, where it fits exactly.
 *
 * Header and body take the same `columns` array, because the classic failure of
 * a hand-built table is a header that drifts one column out of step.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Pressable, Text, View } from 'react-native';

import { DASH } from '@/components/ui/DataTable';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { weekShortLabel, type Scope, type Standing } from './board';

export type BoardColumn = {
  key: string;
  /** Uppercase, 9pt. Two to four characters. */
  label: string;
  width: number;
  value: (s: Standing) => string;
  /** The one number the table exists to show. */
  strong?: boolean;
};

const RANK_WIDTH = 50;
const GUTTER = Spacing.two;
const GAP = 6;

const oneDp = (n: number) => n.toFixed(1);

/**
 * Which columns fit.
 *
 * A phone cannot hold the full set without squeezing the name below about
 * twelve characters, which costs more than the columns are worth. So narrow
 * carries the three that answer "how good are they" — average, best week,
 * total — and the rest live in the row expansion and in the "you" panel, where
 * nothing is competing for the width.
 */
export function boardColumns(scope: Scope, wide: boolean, seasonType: number, latestWeek: number | null): BoardColumn[] {
  const avg: BoardColumn = {
    key: 'avg',
    label: 'AVG',
    width: 42,
    value: (s) => (s.avg === null ? DASH : oneDp(s.avg)),
  };
  const best: BoardColumn = {
    key: 'best',
    label: 'BEST',
    width: 44,
    value: (s) => (s.best === null ? DASH : oneDp(s.best.points)),
  };
  const weeks: BoardColumn = {
    key: 'weeks',
    label: 'WKS',
    width: 32,
    value: (s) => String(s.weeksPlayed),
  };

  if (scope === 'season') {
    const latest: BoardColumn | null =
      latestWeek === null
        ? null
        : {
            key: 'latest',
            label: weekShortLabel(seasonType, latestWeek),
            width: 46,
            // Missing means "did not score that week", which is exactly what an
            // em dash says and exactly what a 0 would not.
            value: (s) => {
              const line = s.weekly.find((w) => w.week === latestWeek);
              return line ? oneDp(line.points) : DASH;
            },
          };
    return [
      ...(wide ? [weeks] : []),
      avg,
      best,
      ...(wide && latest ? [latest] : []),
      { key: 'pts', label: 'PTS', width: 58, strong: true, value: (s) => oneDp(s.points) },
    ];
  }

  return [
    ...(wide ? [weeks, best] : []),
    avg,
    // Where they sit overall, so a week row never loses the season context.
    { key: 'szn', label: 'SZN', width: 40, value: (s) => (s.seasonRank === null ? DASH : String(s.seasonRank)) },
    { key: 'pts', label: 'PTS', width: 58, strong: true, value: (s) => oneDp(s.points) },
  ];
}

/**
 * Movement is colour-coded AND glyph-coded AND signed, because colour alone
 * fails for a red/green colour-blind reader and this is a two-character cell
 * with no room for a word.
 */
export function MovementMark({
  movement,
  known,
  style,
}: {
  movement: number | null;
  /** False while the week boards are still loading — unknown, not "new". */
  known: boolean;
  style?: object;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (!known) return <Text style={[Type.micro, { color: c.textTertiary }, style]}>{DASH}</Text>;
  if (movement === null) return <Text style={[Type.micro, { color: c.textTertiary }, style]}>NEW</Text>;
  if (movement === 0) return <Text style={[Type.micro, { color: c.textTertiary }, style]}>–</Text>;

  const up = movement > 0;
  return (
    <Text style={[Type.micro, NUMERIC, { color: up ? c.positive : c.negative }, style]}>
      {up ? '▲' : '▼'}
      {Math.abs(movement)}
    </Text>
  );
}

export function movementLabel(movement: number | null, known: boolean): string {
  if (!known) return '';
  if (movement === null) return ', new to the board';
  if (movement === 0) return ', held position';
  return movement > 0 ? `, up ${movement}` : `, down ${Math.abs(movement)}`;
}

export function StandingsHeader({ columns }: { columns: BoardColumn[] }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.head, { borderColor: c.borderStrong }]}>
      <Text style={[Type.micro, styles.rankCell, { color: c.textTertiary }]}>RANK</Text>
      <Text style={[Type.micro, styles.name, { color: c.textTertiary }]}>PLAYER</Text>
      {columns.map((col) => (
        <Text
          key={col.key}
          numberOfLines={1}
          style={[Type.micro, styles.right, { width: col.width, color: c.textTertiary }]}>
          {col.label}
        </Text>
      ))}
    </View>
  );
}

export function StandingsRow({
  standing,
  columns,
  isMe,
  detailKnown,
  expanded,
  onToggle,
  children,
}: {
  standing: Standing;
  columns: BoardColumn[];
  isMe: boolean;
  detailKnown: boolean;
  expanded: boolean;
  onToggle: () => void;
  /** The week-by-week breakdown, rendered only while expanded. */
  children?: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const summary =
    `${standing.name}, rank ${standing.rank}, ${oneDp(standing.points)} points` +
    movementLabel(standing.movement, detailKnown);

  return (
    <View style={{ backgroundColor: isMe ? c.backgroundSelected : 'transparent' }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={summary}
        accessibilityHint="Shows this player's week by week scores"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.row, { borderColor: c.border }, pressed && styles.pressed]}>
        <View style={styles.rankCell}>
          <Text style={[Type.strong, NUMERIC, styles.rankNumber, { color: c.text }]}>
            {standing.rank}
          </Text>
          <MovementMark movement={standing.movement} known={detailKnown} style={styles.movement} />
        </View>

        <Text numberOfLines={1} style={[Type.strong, styles.name, { color: c.text }]}>
          {standing.name}
        </Text>
        {/* A word as well as a tint: the tint alone is a colour-only cue. */}
        {isMe ? <Text style={[Type.micro, { color: c.textSecondary }]}>YOU</Text> : null}

        {columns.map((col) => (
          <Text
            key={col.key}
            numberOfLines={1}
            style={[
              col.strong ? Type.strong : Type.body,
              NUMERIC,
              styles.right,
              { width: col.width, color: col.strong ? c.text : c.textSecondary },
            ]}>
            {col.value(standing)}
          </Text>
        ))}
      </Pressable>
      {expanded ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    height: 22,
    paddingHorizontal: GUTTER,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    minHeight: 32,
    paddingVertical: Spacing.two - 2,
    paddingHorizontal: GUTTER,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Rank and movement share one cell: they answer the same question, and a
  // separate movement column would cost the name another 34pt it cannot spare.
  rankCell: { width: RANK_WIDTH, flexDirection: 'row', alignItems: 'center', gap: 3 },
  rankNumber: { width: 20, textAlign: 'right' },
  movement: { flex: 1 },
  name: { flexShrink: 1, flexGrow: 1, minWidth: 0 },
  right: { textAlign: 'right' },
  pressed: { opacity: 0.6 },
});
