/**
 * How much of his team's work this player actually gets.
 *
 * THE PROVIDER SELLS NO DEPTH CHART AND NO PROJECTION, which is the hole this
 * fills. Rather than invent either, it reports a measurement — share of the
 * team's targets and carries in the games we have scored — and says so.
 *
 * BARS, NOT A GRID OF PERCENTAGES
 *
 * This was four cells reading `TARGET SHARE 61.8%` / `CARRY SHARE 14.2%` and so
 * on. A share is the one figure on either profile that is inherently a
 * proportion of something, and a proportion set as a numeral makes the reader
 * do the comparison in their head — 61.8 against 14.2 is arithmetic, two bars
 * is a glance. The numeral stays on the right of its own bar, because the bar
 * is the comparison and the number is the fact.
 *
 * The counts (how many targets, how many carries) ride under their share as the
 * bar's caption. They are what the share is computed FROM, so they belong with
 * it rather than in two more cells of their own.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { UsageShare } from './profile';

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

  if (!usage || (usage.targets === 0 && usage.carries === 0)) {
    return (
      <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
        No touches recorded yet this season. Through preseason most starters sit, so this fills in
        once the games count.
      </Text>
    );
  }

  const bars: { label: string; share: number | null; count: number; unit: string }[] = [
    { label: 'Targets', share: usage.targetShare, count: usage.targets, unit: 'target' },
    { label: 'Carries', share: usage.carryShare, count: usage.carries, unit: 'carry' },
  ];

  return (
    <View style={styles.wrap}>
      {usage.rankOnTeam !== null && usage.positionGroupSize !== null ? (
        <Text style={[Type.strong, { color: c.text }]}>
          {`${position ?? 'Player'} ${usage.rankOnTeam} of ${usage.positionGroupSize}`}
          {teamAbbreviation ? ` on ${teamAbbreviation}` : ''} by points
        </Text>
      ) : null}

      {bars.map((b) => (
        <View key={b.label} style={styles.bar}>
          <Text numberOfLines={1} style={[Type.body, styles.barLabel, { color: c.textSecondary }]}>
            {b.label}
          </Text>
          <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
            {b.share === null ? null : (
              /* Clamped, because a share above 1 is a data fault rather than a
                 player who took more carries than his team did — and a bar
                 wider than its track paints over the figure beside it. */
              <View
                style={[
                  styles.fill,
                  { width: `${Math.min(1, Math.max(0, b.share)) * 100}%`, backgroundColor: c.text },
                ]}
              />
            )}
          </View>
          <Text numberOfLines={1} style={[Type.body, NUMERIC, styles.barValue, { color: c.text }]}>
            {b.share === null ? '—' : `${(b.share * 100).toFixed(0)}%`}
          </Text>
        </View>
      ))}

      <Text style={[Type.fine, { color: c.textTertiary }]}>
        {`${usage.targets} target${usage.targets === 1 ? '' : 's'} and ${usage.carries} carr${usage.carries === 1 ? 'y' : 'ies'} in the games we have scored.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 1 },
  /* Fixed, so the two tracks start on the same line. Sized to `Carries`, which
     is the longer of the two, with room for a third label if one is ever
     added. */
  barLabel: { width: 62 },
  track: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  barValue: { width: 34, textAlign: 'right' },
});
