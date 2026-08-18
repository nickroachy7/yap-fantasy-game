/**
 * A dense table of numbers.
 *
 * Fantasy screens are mostly this: fixed-width right-aligned numeric columns
 * next to one flexible label column. Sharing it means every table on every
 * screen lines up, scrolls the same way, and treats a missing value the same
 * way — which is the difference between a stats app and a pile of lists.
 *
 * Rules encoded here so no screen has to remember them:
 *  - Numbers are right-aligned and tabular, so digits line up down a column.
 *  - Missing is an em dash, never 0 and never blank. They mean different
 *    things and a stat table is exactly where that matters.
 *  - The first column is sticky-ish by being outside the horizontal scroller,
 *    so scrolling a wide stat set never loses the row's identity.
 *
 * NOT FOR PRESSABLE ROWS. This shipped with an `onRowPress` prop that was
 * accepted and never wired to anything — a prop that silently does nothing is
 * worse than no prop, so it is gone. Making it real is not a one-line fix: the
 * row is split across two independently scrolling halves, so a press would
 * have to hit both and stay visually joined while they scroll apart. Screens
 * that need pressable or tinted rows (lineup, leaderboard) hand-roll the row
 * and re-apply the rules above instead, which is why those rows still line up
 * with these. If a third screen needs it, that is the signal to build a
 * PressableDataTable rather than widen this one.
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const DASH = '—';

export type Column<Row> = {
  key: string;
  /** Uppercase, short. This is a 9pt header. */
  label: string;
  width?: number;
  value: (row: Row) => string | number | null | undefined;
  /** Emphasise the primary metric of the table. */
  strong?: boolean;
  align?: 'left' | 'right';
};

export function formatCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return DASH;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return DASH;
    return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
  }
  return v === '' ? DASH : v;
}

export function DataTable<Row>({
  rows,
  columns,
  keyOf,
  /** The identity column, rendered outside the horizontal scroller. */
  leading,
  leadingLabel,
  leadingWidth = 84,
  emptyLabel = 'Nothing to show yet.',
}: {
  rows: Row[];
  columns: Column<Row>[];
  keyOf: (row: Row, i: number) => string;
  leading: (row: Row) => ReactNode;
  leadingLabel: string;
  leadingWidth?: number;
  emptyLabel?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (rows.length === 0) {
    return (
      <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>{emptyLabel}</Text>
    );
  }

  return (
    <View style={styles.wrap}>
      {/* Identity column, fixed. */}
      <View style={{ width: leadingWidth }}>
        <View style={[styles.headRow, { borderColor: c.border }]}>
          <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
            {leadingLabel}
          </Text>
        </View>
        {rows.map((row, i) => (
          <View key={keyOf(row, i)} style={[styles.row, { borderColor: c.border }]}>
            {leading(row)}
          </View>
        ))}
      </View>

      {/* Stats, scrollable. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.headRow, { borderColor: c.border }]}>
            {columns.map((col) => (
              <Text
                key={col.key}
                numberOfLines={1}
                style={[
                  Type.micro,
                  { width: col.width ?? 52, color: c.textTertiary },
                  col.align !== 'left' && styles.right,
                ]}>
                {col.label}
              </Text>
            ))}
          </View>
          {rows.map((row, i) => (
            <View key={keyOf(row, i)} style={[styles.row, { borderColor: c.border }]}>
              {columns.map((col) => (
                <Text
                  key={col.key}
                  numberOfLines={1}
                  style={[
                    col.strong ? Type.strong : Type.body,
                    NUMERIC,
                    { width: col.width ?? 52, color: col.strong ? c.text : c.textSecondary },
                    col.align !== 'left' && styles.right,
                  ]}>
                  {formatCell(col.value(row))}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const ROW_HEIGHT = 30;

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row' },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
  },
  right: { textAlign: 'right' },
  empty: { padding: Spacing.three },
});
