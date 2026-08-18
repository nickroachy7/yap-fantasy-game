/**
 * A row of headline numbers, drawn as a hairline grid.
 *
 * The gridlines are a 1pt gap over a border-coloured backdrop rather than a
 * border on each tile. The strip wraps — six tiles on a 940pt web measure are
 * two rows of three on a phone — and per-tile borders double up at the wrap
 * and leave a stray edge on the last tile of a short row. A gap draws exactly
 * one line wherever two tiles meet, at any width, with no first/last casing.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type StatTone = 'default' | 'positive' | 'negative' | 'muted';

export type StatItem = {
  /** Rendered uppercase at 9pt. Two words at most or it wraps into the value. */
  label: string;
  /**
   * Pre-formatted. The tile cannot know whether this metric wants one decimal
   * or none, so rounding stays with the caller that knows what the number is.
   */
  value: string;
  /** Quiet third line: a pool size, a unit, "of 118". */
  hint?: string;
  tone?: StatTone;
  /** Drawn before the value — the gem glyph on a balance. */
  glyph?: ReactNode;
};

export function StatStrip({ items }: { items: StatItem[] }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const toneColor: Record<StatTone, string> = {
    default: c.text,
    positive: c.positive,
    negative: c.negative,
    muted: c.textTertiary,
  };

  return (
    <View style={[styles.grid, { backgroundColor: c.border }]}>
      {items.map((item) => (
        <View
          key={item.label}
          // One label per tile for the screen reader, so it announces
          // "Best week, 92.4" rather than two orphaned fragments.
          accessible
          accessibilityLabel={`${item.label}: ${item.value}${item.hint ? `, ${item.hint}` : ''}`}
          style={[styles.tile, { backgroundColor: c.surface }]}>
          <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
            {item.label.toUpperCase()}
          </Text>
          <View style={styles.valueRow}>
            {item.glyph}
            <Text
              numberOfLines={1}
              style={[Type.figure, NUMERIC, { color: toneColor[item.tone ?? 'default'] }]}>
              {item.value}
            </Text>
          </View>
          {item.hint ? (
            <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
              {item.hint}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  /**
   * flexBasis is the real control: 96 fits three across a 375pt phone and six
   * across the table measure, so the same strip is dense at both ends without
   * a breakpoint.
   */
  tile: {
    flexGrow: 1,
    flexBasis: 96,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two + 1,
    gap: 2,
  },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two - 2 },
});
