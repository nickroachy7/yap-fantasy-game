/**
 * One player's week-by-week line, revealed by tapping their row.
 *
 * This is where `DataTable` fits exactly: a short, dense, purely numeric table
 * with a fixed identity column. It also keeps the collapsed row honest — the
 * columns dropped from a phone-width row (weeks played, which week the best
 * score came from) are all recoverable here rather than simply absent.
 *
 * FIELD is printed beside RANK on purpose. "4th" means something very
 * different in a field of six than in a field of two hundred, and through the
 * beta the field is small enough that omitting it would flatter everyone.
 */
import { StyleSheet, Text, View } from 'react-native';

import { DataTable } from '@/components/ui/DataTable';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { weekTabLabel, type WeekLine } from './board';

export function WeekBreakdown({
  weekly,
  seasonType,
  fieldByWeek,
}: {
  weekly: WeekLine[];
  seasonType: number;
  /** How many players were ranked in each week. */
  fieldByWeek: Map<number, number>;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.wrap, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
      <DataTable
        rows={weekly}
        keyOf={(w) => String(w.week)}
        leadingLabel="WEEK"
        leadingWidth={68}
        leading={(w) => (
          <Text style={[Type.body, { color: c.textSecondary }]}>
            {weekTabLabel(seasonType, w.week)}
          </Text>
        )}
        columns={[
          // Strings, not numbers: formatCell drops the decimal on a whole
          // number, and a column reading 137.4 / 92 / 110.5 does not scan.
          { key: 'pts', label: 'PTS', width: 58, strong: true, value: (w) => w.points.toFixed(1) },
          { key: 'rank', label: 'RANK', width: 46, value: (w) => w.rank },
          { key: 'field', label: 'FIELD', width: 46, value: (w) => fieldByWeek.get(w.week) ?? null },
        ]}
        emptyLabel="No scored week for this player yet."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
