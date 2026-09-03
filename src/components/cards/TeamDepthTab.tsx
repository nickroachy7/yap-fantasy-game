/**
 * The Team tab: where this player stands on his club's chart, and who is
 * around him.
 *
 * ONE SECTION PER SLOT, NOT ONE LIST. A depth chart is a set of small ordered
 * races and printing it flat loses the only thing it says — that these three
 * men are competing for one job. The heading is the slot, the number in front
 * of each name is his depth, and the two together are the whole content.
 *
 * THE PLAYER YOU CAME FROM IS MARKED, and that is what makes this a tab on HIS
 * page rather than a team page you reached sideways. Marked, not filtered to:
 * "second on the chart" means nothing without the man in front of him.
 *
 * THE FULL CHART, INCLUDING THE LINEMEN. It would be easy to cut this to the
 * five positions the game scores, and it would be the wrong cut — the reason to
 * open a running back's team tab is often the offensive line in front of him,
 * which no fantasy-position filter would show. `SLOT_ORDER` in `use-team-depth`
 * puts the scoring positions first so the scroll is optional rather than
 * mandatory.
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryCode, injuryWeight } from '@/lib/injury';
import { useTeamDepth } from './use-team-depth';

export function TeamDepthTab({
  team,
  season,
  playerId,
}: {
  team: string | null;
  season: number | null;
  /** Marked in the chart. See the file header for why it is not filtered to. */
  playerId: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { slots, loading, error } = useTeamDepth(team, season);

  if (loading && !slots) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Could not load the depth chart"
        body="The chart is read from the club's roster and that read failed. Try again in a moment."
      />
    );
  }

  if (!team) {
    return (
      <EmptyState
        title="No club"
        body="A depth chart belongs to a club, and this player is not on one — a free agent has no chart to stand on."
      />
    );
  }

  if (!slots || slots.length === 0) {
    return (
      <EmptyState
        title="No depth chart"
        body={`Nothing has been published for ${team.toUpperCase()} this season. The charts refresh weekly.`}
      />
    );
  }

  return (
    <View style={styles.chart}>
      {slots.map((group) => (
        <View key={group.slot} style={styles.group}>
          <Text style={[Type.label, { color: c.textTertiary }]}>{group.slot.toUpperCase()}</Text>

          {group.players.map((entry) => {
            const isSelf = entry.playerId === playerId;
            const weight = injuryWeight(entry.injuryStatus);
            return (
              <View
                key={`${group.slot}:${entry.playerId}`}
                style={[
                  styles.line,
                  /* The mark is a FILL, not a colour on the name. A tinted name
                     in a list of names reads as a link; a filled row reads as
                     "you are here", which is what it means. */
                  isSelf && { backgroundColor: c.backgroundSelected },
                ]}>
                {/* The depth, in its own fixed box so every name down the chart
                    starts at one x — the same rule the lineup badge column is
                    set by. */}
                <Text style={[styles.depth, NUMERIC, { color: c.textTertiary }]}>
                  {entry.depth}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.name,
                    { color: isSelf ? c.text : c.textSecondary },
                    isSelf && styles.self,
                  ]}>
                  {entry.name}
                </Text>
                {/* Same two colours as everywhere else — `Out` and
                    `Questionable` are not the same warning, and a chart is
                    exactly where the difference decides something. */}
                {weight && entry.injuryStatus ? (
                  <Text
                    style={[
                      Type.micro,
                      styles.designation,
                      { color: weight === 'blocking' ? c.negative : c.warning },
                    ]}>
                    {injuryCode(entry.injuryStatus)}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: Spacing.four, paddingBottom: Spacing.six },
  group: { gap: 2 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
    borderRadius: 4,
    minHeight: 26,
  },
  /* 16 holds a single digit comfortably; the provider's deepest chart is 8. */
  depth: { width: 16, textAlign: 'right', fontSize: 12, fontWeight: '700' },
  name: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '500' },
  self: { fontWeight: '800' },
  designation: { flexShrink: 0 },
  centred: { paddingVertical: Spacing.six, alignItems: 'center' },
});
