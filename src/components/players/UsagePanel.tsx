/**
 * Usage share — the honest stand-in for a depth chart.
 *
 * balldontlie serves no depth chart and no projections (checked: /depth_charts,
 * /rosters, /projections all 404). Rather than invent either, this shows what
 * the snaps we HAVE actually say: how much of the team's passing and running
 * work went to this player, and where he sits among his own position group by
 * points scored.
 *
 * That is a measurement, not a forecast, and the panel says so in as many
 * words. A number a reader mistakes for an official depth chart is worse than
 * no number.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { UsageShare } from './profile';

const pct = (v: number | null) => (v === null ? null : `${(v * 100).toFixed(1)}%`);

export function UsagePanel({
  usage,
  position,
  teamAbbreviation,
}: {
  usage: UsageShare | null;
  position: string | null;
  teamAbbreviation: string | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  // No snaps yet is the normal state through preseason, when starters sit.
  // Say that, rather than rendering a panel full of zeroes that reads as
  // "this player is not being used".
  if (!usage || (usage.targets === 0 && usage.carries === 0)) {
    return (
      <View style={[styles.card, { backgroundColor: c.backgroundElement }]}>
        <Text style={[styles.title, { color: c.text }]}>Usage share</Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          No touches recorded yet this season. Through preseason most starters
          sit, so this fills in once the games count.
        </Text>
      </View>
    );
  }

  const rows: { label: string; value: string }[] = [];
  const t = pct(usage.targetShare);
  const car = pct(usage.carryShare);
  if (t) rows.push({ label: 'TARGET SHARE', value: t });
  if (car) rows.push({ label: 'CARRY SHARE', value: car });
  rows.push({ label: 'TARGETS', value: String(usage.targets) });
  rows.push({ label: 'CARRIES', value: String(usage.carries) });

  return (
    <View style={[styles.card, { backgroundColor: c.backgroundElement }]}>
      <Text style={[styles.title, { color: c.text }]}>Usage share</Text>

      {usage.rankOnTeam !== null && usage.positionGroupSize !== null ? (
        <Text style={[styles.headline, { color: c.text }]}>
          {position ?? 'Player'} {usage.rankOnTeam} of {usage.positionGroupSize}
          {teamAbbreviation ? ` on ${teamAbbreviation}` : ''} by points
        </Text>
      ) : null}

      <View style={styles.grid}>
        {rows.map((r) => (
          <View key={r.label} style={styles.cell}>
            <Text style={[styles.cellLabel, { color: c.textSecondary }]}>{r.label}</Text>
            <Text style={[styles.cellValue, NUMERIC, { color: c.text }]}>{r.value}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.caveat, { color: c.textSecondary }]}>
        Measured from games we have scored — not an official depth chart, and
        not a projection. Our provider publishes neither.
      </Text>
    </View>
  );
}

const NUMERIC = { fontVariant: ['tabular-nums' as const] };

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  title: { fontSize: 15, fontWeight: '700' },
  headline: { fontSize: 13, fontWeight: '600' },
  body: { fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  cell: { minWidth: 84, gap: 1 },
  cellLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  cellValue: { fontSize: 16, fontWeight: '700' },
  caveat: { fontSize: 11, lineHeight: 15 },
});
