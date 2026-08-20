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
 *  - Related columns can carry a GROUP band above them (`groups`). Once a
 *    table has fourteen numeric columns, `YD` and `TD` appear three times each
 *    and the header row stops disambiguating anything; a RUSHING / RECEIVING /
 *    PASSING band above it is what makes those columns readable. The band is
 *    optional and costs one 16pt row, so tables with one obvious subject
 *    should not use it.
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
import { horizontalStrip } from '@/components/ui/scroll-strip';

export const DASH = '—';

/**
 * A band spanning `span` consecutive columns. Spans are positional: the groups
 * are laid over `columns` in order, so the first group covers columns 0..span-1
 * and so on. Columns left over after the last group get an unlabelled band,
 * which is why a short `groups` array degrades rather than misaligns.
 */
export type ColumnGroup = { label: string; span: number };

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
  groups,
}: {
  rows: Row[];
  columns: Column<Row>[];
  keyOf: (row: Row, i: number) => string;
  leading: (row: Row) => ReactNode;
  leadingLabel: string;
  leadingWidth?: number;
  emptyLabel?: string;
  /** Optional bands over the numeric columns. See ColumnGroup. */
  groups?: ColumnGroup[];
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (rows.length === 0) {
    return (
      <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>{emptyLabel}</Text>
    );
  }

  /* A band's width has to be derived from the columns it covers rather than
     guessed, or it drifts a few pixels per column and by the fourth group the
     label is sitting over the wrong numbers. The row lays its children out with
     `gap`, so a band of n columns is their widths plus (n-1) gaps. */
  const bands = groups ? layOutBands(groups, columns) : null;

  return (
    <View style={styles.wrap}>
      {/* Identity column, fixed. */}
      <View style={{ width: leadingWidth }}>
        {/* Blank spacer matching the band row, so the two halves of the header
            stay the same height and the rows below them line up. */}
        {bands ? <View style={styles.bandRow} /> : null}
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
      <ScrollView horizontal {...horizontalStrip} showsHorizontalScrollIndicator={false}>
        <View>
          {bands ? (
            <View style={styles.bandRow}>
              {bands.map((b, i) => (
                <View key={`${b.label}-${i}`} style={{ width: b.width }}>
                  {b.label ? (
                    <Text
                      numberOfLines={1}
                      style={[Type.micro, styles.band, { color: c.textTertiary, borderColor: c.border }]}>
                      {b.label}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
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

const DEFAULT_COL_WIDTH = 52;

/**
 * Widths for each band, plus a trailing unlabelled band for any columns the
 * caller's groups did not cover. Exported for the gallery, which is the only
 * place the arithmetic is visible enough to check.
 */
export function layOutBands<Row>(
  groups: ColumnGroup[],
  columns: Column<Row>[],
): { label: string; width: number }[] {
  const out: { label: string; width: number }[] = [];
  let i = 0;
  const widthOf = (from: number, count: number) => {
    let w = 0;
    for (let k = from; k < from + count && k < columns.length; k += 1) {
      w += columns[k].width ?? DEFAULT_COL_WIDTH;
    }
    // Interior gaps belong to the band; the gap AFTER it separates bands.
    return w + Spacing.two * Math.max(0, Math.min(count, columns.length - from) - 1);
  };

  for (const g of groups) {
    if (i >= columns.length) break;
    out.push({ label: g.label, width: widthOf(i, g.span) });
    i += g.span;
  }
  if (i < columns.length) out.push({ label: '', width: widthOf(i, columns.length - i) });
  return out;
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
  bandRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    height: 16,
    paddingHorizontal: Spacing.two,
  },
  /* The rule under the label is what ties the word to its columns. Without it
     the band reads as floating above the whole table rather than over four of
     its columns. */
  band: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 2 },
  right: { textAlign: 'right' },
  empty: { padding: Spacing.three },
});
