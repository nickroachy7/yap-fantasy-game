/**
 * The four numbers you need before you look at a single row: how long you have,
 * how much of the lineup exists, what it has been worth per week, and how many
 * starters need a second look.
 *
 * Deliberately no projection. Everything here is either a clock or something
 * that already happened, which is the whole contract of this screen.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { countdownLabel } from './model';

function Tile({
  label,
  value,
  tone,
  first,
}: {
  label: string;
  value: string;
  tone?: string;
  first?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    // The divider lives on the tile rather than between tiles so the row can be
    // built from a map without interleaving separator elements.
    <View style={[styles.tile, !first && { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}>
      <Text style={[Type.micro, { color: c.textTertiary }]}>{label}</Text>
      <Text numberOfLines={1} style={[Type.figure, NUMERIC, { color: tone ?? c.text }]}>
        {value}
      </Text>
    </View>
  );
}

export function LineupSummary({
  lockAt,
  locked,
  now,
  filled,
  slotCount,
  fpPerGame,
  alerts,
}: {
  lockAt: string | null;
  locked: boolean;
  now: number;
  filled: number;
  slotCount: number;
  /** Sum of the starters' season FP per game. Blank until anyone has played. */
  fpPerGame: number | null;
  alerts: number;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const clock = !lockAt
    ? '—'
    : locked
      ? 'LOCKED'
      : countdownLabel(new Date(lockAt).getTime() - now);

  return (
    <View style={[styles.wrap, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Tile
        first
        label={locked ? 'STATUS' : 'LOCKS IN'}
        value={clock}
        tone={locked ? c.textSecondary : undefined}
      />
      <Tile
        label="FILLED"
        value={`${filled}/${slotCount}`}
        tone={filled < slotCount ? c.warning : c.positive}
      />
      <Tile
        label="LINEUP FP/G"
        value={fpPerGame === null ? '—' : fpPerGame.toFixed(1)}
      />
      <Tile
        label="NEEDS A LOOK"
        value={String(alerts)}
        tone={alerts > 0 ? c.negative : c.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tile: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    gap: 1,
  },
});
