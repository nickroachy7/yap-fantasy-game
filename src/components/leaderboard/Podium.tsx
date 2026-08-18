/**
 * The top three, in one row.
 *
 * A vertical podium would cost three rows of the table to say what the table
 * already says. Three columns cost about 66pt once, and buy the thing a plain
 * ranked list is bad at: seeing the gap at the top at a glance.
 *
 * Monochrome on purpose. Gold/silver/bronze is the obvious treatment and is
 * wrong here — those are CARD TIER names in this app, earned by points, and
 * borrowing them for finishing position would make a bronze-tier player in
 * first place read as a contradiction.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MovementMark } from './StandingsRow';
import type { Standing } from './board';

const ORDINALS = ['1ST', '2ND', '3RD'];

export function Podium({
  rows,
  meId,
  detailKnown,
}: {
  rows: Standing[];
  meId: string | null;
  detailKnown: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  // Below three there is no podium, only the first rows of the table repeated.
  if (rows.length < 3) return null;

  return (
    <View style={styles.row}>
      {rows.slice(0, 3).map((s, i) => {
        const isMe = s.userId === meId;
        return (
          <View
            key={s.userId}
            accessible
            accessibilityLabel={`${ORDINALS[i]}, ${s.name}, ${s.points.toFixed(1)} points`}
            style={[
              styles.cell,
              {
                backgroundColor: isMe ? c.backgroundSelected : c.surface,
                borderColor: i === 0 ? c.borderStrong : c.border,
              },
            ]}>
            <View style={styles.top}>
              <Text style={[Type.micro, { color: i === 0 ? c.text : c.textTertiary }]}>
                {ORDINALS[i]}
              </Text>
              <MovementMark movement={s.movement} known={detailKnown} />
            </View>
            <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
              {s.name}
            </Text>
            <View style={styles.figures}>
              <Text style={[Type.figure, NUMERIC, { color: c.text }]}>{s.points.toFixed(1)}</Text>
              <Text style={[Type.micro, { color: c.textTertiary }]}>PTS</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two },
  cell: {
    flex: 1,
    minWidth: 0,
    gap: 1,
    padding: Spacing.two,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one },
  figures: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one },
});
