/**
 * Who actually scored, grouped by position.
 *
 * This is the spec's Game Day Leaders panel with one change that matters for
 * this app: Sleeper marks each row with the manager who rosters the player,
 * because in a league the interesting fact is whose bench he is rotting on.
 * Here there are no leaguemates, and the interesting fact is whether the card
 * is YOURS — so an owned player carries a mark and everyone else does not.
 *
 * That single mark is what stops the scoreboard being a read-only NFL feed
 * bolted onto a card game and makes it a reason to open a pack.
 */
import { StyleSheet, Pressable, Text, View } from 'react-native';

import { PositionBadge } from '@/components/ui/PositionBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { POSITION_NAMES, positionColors } from '@/constants/positions';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { leadersByPosition, type Leader } from './scoreboard';
import type { PositionKey } from '@/constants/positions';

export function LeadersPanel({
  leaders,
  order,
  limit,
  onOpenPlayer,
  emptyTitle,
  emptyBody,
}: {
  leaders: Leader[];
  order: PositionKey[];
  /** Rows per position. Small on purpose — this is a leaderboard, not a table. */
  limit: number;
  onOpenPlayer: (playerId: string) => void;
  emptyTitle: string;
  emptyBody: string;
}) {
  const groups = leadersByPosition(leaders, order, limit);

  if (groups.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }

  return (
    <View style={styles.wrap}>
      {groups.map((group) => (
        <PositionGroup key={group.position} position={group.position} leaders={group.leaders} onOpenPlayer={onOpenPlayer} />
      ))}
    </View>
  );
}

function PositionGroup({
  position,
  leaders,
  onOpenPlayer,
}: {
  position: PositionKey;
  leaders: Leader[];
  onOpenPlayer: (playerId: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = positionColors(position, scheme).accent;

  return (
    <View style={styles.group}>
      {/* The heading is the only place the position colour appears without an
          abbreviation beside it — and the full word is right there, so the
          colour is still carrying nothing on its own. */}
      <Text style={[Type.micro, styles.heading, { color: accent }]}>
        {POSITION_NAMES[position].toUpperCase()}
      </Text>
      {leaders.map((l, i) => (
        <LeaderRow key={`${l.playerId}-${l.gameId}`} leader={l} rank={i + 1} onPress={onOpenPlayer} />
      ))}
      <View style={[styles.rule, { backgroundColor: c.border }]} />
    </View>
  );
}

function LeaderRow({
  leader,
  rank,
  onPress,
}: {
  leader: Leader;
  rank: number;
  onPress: (playerId: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <Pressable
      onPress={() => onPress(leader.playerId)}
      accessibilityRole="button"
      accessibilityLabel={`${leader.name}, ${leader.positionLabel ?? 'unknown position'}, ${leader.points.toFixed(1)} points${leader.owned ? ', in your collection' : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Text style={[Type.fine, NUMERIC, styles.rank, { color: c.textTertiary }]}>{rank}</Text>
      <PositionBadge label={leader.positionLabel} size={20} />
      <View style={styles.name}>
        <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
          {leader.name}
        </Text>
        <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
          {leader.teamAbbreviation ?? '—'}
        </Text>
      </View>
      {/* A dot, not a word: at this row height the label would be the widest
          thing in the row, and the a11y label already says it in full. */}
      {leader.owned ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[styles.owned, { backgroundColor: c.positive }]}
        />
      ) : (
        <View style={styles.owned} />
      )}
      <Text style={[Type.strong, NUMERIC, styles.points, { color: c.text }]}>
        {leader.points.toFixed(1)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* The panel this sits in draws its own border, so the content needs its own
     gutter — without it the first letter of a section heading is painted right
     on the panel edge. */
  wrap: { gap: Spacing.three, paddingVertical: Spacing.two },
  group: { gap: 2 },
  heading: { paddingBottom: Spacing.one, paddingHorizontal: Spacing.two + 2 },
  rule: { height: StyleSheet.hairlineWidth, marginTop: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
  },
  rank: { width: 16, textAlign: 'right' },
  name: { flex: 1, minWidth: 0 },
  owned: { width: 6, height: 6, borderRadius: 3 },
  points: { width: 46, textAlign: 'right' },
  pressed: { opacity: 0.6 },
});
