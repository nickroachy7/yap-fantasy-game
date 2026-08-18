/**
 * Where the signed-in user stands, always visible.
 *
 * This is the "pin my row" behaviour. Rather than injecting a floating copy of
 * the row when the user scrolls past it — which needs viewport tracking and
 * still leaves them hunting on first paint — the panel sits above the table and
 * is simply always there. It also has room the 32pt row does not, so the
 * columns a phone drops (weeks played, which week the best score came from)
 * are readable without expanding anything.
 *
 * When the user has no scored lineup the panel says why and what to do, because
 * "you are not on the leaderboard" with no explanation reads as a bug.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Panel } from '@/components/ui/Panel';
import { DASH } from '@/components/ui/DataTable';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MovementMark } from './StandingsRow';
import { weekTabLabel, type Standing } from './board';

function Stat({
  label,
  value,
  note,
  strong,
}: {
  label: string;
  value: string;
  /** A quiet qualifier under the value — which week, out of how many. */
  note?: string;
  strong?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.stat}>
      <Text style={[Type.micro, { color: c.textTertiary }]}>{label}</Text>
      <Text style={[strong ? Type.figure : Type.strong, NUMERIC, { color: c.text }]}>{value}</Text>
      {/* A space, not null: the note line holds its height either way, so the
          values stay on one baseline whether or not a cell has a qualifier. */}
      <Text style={[Type.micro, { color: c.textTertiary }]}>{note ?? ' '}</Text>
    </View>
  );
}

export function YourStanding({
  standing,
  field,
  scopeLabel,
  seasonType,
  slateLabelText,
  weekLabelText,
  detailKnown,
}: {
  standing: Standing | null;
  /** How many players are ranked in the active scope. */
  field: number;
  scopeLabel: string;
  seasonType: number;
  slateLabelText: string;
  /** e.g. "Week 3" — what they should be setting a lineup for. */
  weekLabelText: string | null;
  detailKnown: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (!standing) {
    return (
      <Panel title="Your standing" hint={scopeLabel}>
        <Text style={[Type.bodyRelaxed, styles.prose, { color: c.textSecondary }]}>
          You have no scored lineup for the {slateLabelText.toLowerCase()} yet. A lineup counts
          once its week has been played and scored
          {weekLabelText ? `, so set one before ${weekLabelText} kicks off` : ''} and you will
          appear here.
        </Text>
      </Panel>
    );
  }

  return (
    <Panel title="Your standing" hint={`${standing.name} · ${scopeLabel}`}>
      <View style={styles.row}>
        <View style={styles.rankBlock}>
          <Text style={[Type.micro, { color: c.textTertiary }]}>RANK</Text>
          <View style={styles.rankLine}>
            <Text style={[Type.figure, NUMERIC, { color: c.text }]}>{standing.rank}</Text>
            <MovementMark movement={standing.movement} known={detailKnown} />
          </View>
          <Text style={[Type.micro, { color: c.textTertiary }]}>OF {field}</Text>
        </View>

        <Stat label="POINTS" value={standing.points.toFixed(1)} strong />
        <Stat
          label="AVG/WK"
          value={standing.avg === null ? DASH : standing.avg.toFixed(1)}
        />
        <Stat
          label="BEST"
          value={standing.best === null ? DASH : standing.best.points.toFixed(1)}
          note={standing.best === null ? undefined : weekTabLabel(seasonType, standing.best.week)}
        />
        <Stat label="WEEKS" value={String(standing.weeksPlayed)} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  // Wraps rather than scrolls: five short stats on a narrow phone become two
  // tidy lines, where a horizontal scroller would hide half of them.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    columnGap: Spacing.four,
    rowGap: Spacing.two,
    padding: Spacing.two + 2,
  },
  rankBlock: { gap: 1 },
  rankLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  stat: { gap: 1 },
  prose: { padding: Spacing.two + 2, maxWidth: 520 },
});
