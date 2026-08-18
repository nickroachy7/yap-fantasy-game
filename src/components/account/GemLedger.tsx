/**
 * The gem ledger: date, what happened, how much.
 *
 * Deliberately not `DataTable`, which is otherwise the right component and is
 * used for the weekly results on the same screen. A ledger's whole content is
 * the sign of each amount, and DataTable colours a column uniformly — earned
 * and spent would render identically and the reader would be parsing a leading
 * "+" at 12pt to tell a grant from a purchase. So: same metrics as DataTable
 * (22pt head, 30pt rows, hairline rules, tabular figures) so the two tables on
 * this screen line up, with a per-row colour it cannot express.
 *
 * The rows are domain-free on purpose — the caller maps the `gem_reason` enum
 * to a label, so this component never has to know the enum exists.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type LedgerEntry = {
  id: string;
  /** Short date, pre-formatted by the caller's locale. */
  date: string;
  label: string;
  amount: number;
};

export function GemLedger({
  entries,
  emptyLabel = 'No gem activity yet.',
}: {
  entries: LedgerEntry[];
  emptyLabel?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (entries.length === 0) {
    return <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>{emptyLabel}</Text>;
  }

  return (
    <View>
      <View style={[styles.headRow, { borderColor: c.border }]}>
        <Text style={[Type.micro, styles.date, { color: c.textTertiary }]}>DATE</Text>
        <Text style={[Type.micro, styles.label, { color: c.textTertiary }]}>ACTIVITY</Text>
        <Text style={[Type.micro, styles.amount, { color: c.textTertiary }]}>GEMS</Text>
      </View>
      {entries.map((entry) => (
        <View key={entry.id} style={[styles.row, { borderColor: c.border }]}>
          <Text numberOfLines={1} style={[Type.body, NUMERIC, styles.date, { color: c.textTertiary }]}>
            {entry.date}
          </Text>
          <Text numberOfLines={1} style={[Type.body, styles.label, { color: c.text }]}>
            {entry.label}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              Type.strong,
              NUMERIC,
              styles.amount,
              { color: entry.amount < 0 ? c.negative : c.positive },
            ]}>
            {/* ASCII hyphen, not a typographic minus: the minus is not part of
                the tabular-figures set and knocks the column out of alignment. */}
            {entry.amount < 0 ? '-' : '+'}
            {Math.abs(entry.amount).toLocaleString()}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
    height: 30,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
  },
  date: { width: 58 },
  label: { flex: 1 },
  amount: { width: 76, textAlign: 'right' },
  empty: { padding: Spacing.three },
});
