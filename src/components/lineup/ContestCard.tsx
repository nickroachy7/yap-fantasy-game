/**
 * The week, stated once, at the top of the screen.
 *
 * Modelled on the team card the reference puts above a roster: who you are,
 * which week this is, and what it is worth. Ours carries the same three things
 * with the two substitutions this game forces.
 *
 * NO PROJECTION, AND NO RECORD. The reference shows a projected total and a
 * win-loss record; we have neither. There is no head-to-head here, so there is
 * no record to keep, and the provider sells no projections. What replaces them
 * is the honest pair: once a week has been swept, the ACTUAL total the server
 * scored; before that, the pace these eight starters have averaged, labelled as
 * an average rather than dressed up as a forecast. The two never appear at the
 * same time, so the big number on this card is never ambiguous.
 */
import { StyleSheet, Text, View } from 'react-native';

import { initialsOf } from '@/components/shell/AppHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { Colors, NUMERIC, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { countdownLabel } from './model';

function Tile({ label, value, tone, first }: {
  label: string;
  value: string;
  tone?: string;
  first?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* A word does not get the figure size. Four tiles across a phone leave ~70pt
     each, and "LOCKED" at 18pt rendered as "LOCK…" — truncating the only part
     that carried the meaning. Numbers keep the big treatment because they are
     what the card exists to show; a status word is a label wearing a value's
     slot and reads fine one step down. */
  const numeric = /\d/.test(value);

  return (
    // The divider lives on the tile rather than between tiles so the row can be
    // built from a map without interleaving separator elements.
    <View
      style={[
        styles.tile,
        !first && { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: c.border },
      ]}>
      {/* Labels must not wrap: a two-line label pushes its own value down and
          the four tiles stop sharing a baseline. */}
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[numeric ? Type.figure : Type.strong, NUMERIC, { color: tone ?? c.text }]}>
        {value}
      </Text>
    </View>
  );
}

export function ContestCard({
  displayName,
  weekLabel,
  lockAt,
  locked,
  now,
  filled,
  slotCount,
  fpPerGame,
  totalPoints,
  scored,
  alerts,
}: {
  displayName: string;
  /** "Preseason · Week 3". */
  weekLabel: string;
  lockAt: string | null;
  locked: boolean;
  now: number;
  filled: number;
  slotCount: number;
  /** Sum of the starters' season FP per game. Null until anyone has played. */
  fpPerGame: number | null;
  /** The server's scored total for this week. Null until the sweep runs. */
  totalPoints: number | null;
  scored: boolean;
  alerts: number;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;

  const clock = !lockAt
    ? '—'
    : locked
      ? 'LOCKED'
      : countdownLabel(new Date(lockAt).getTime() - now);

  /* Scored weeks show what happened; unscored weeks show what these starters
     have averaged. Same slot, different question, so the label changes with
     the number rather than staying put and quietly meaning something else. */
  const headline = scored
    ? (totalPoints ?? 0).toFixed(1)
    : fpPerGame === null
      ? '—'
      : fpPerGame.toFixed(1);

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.identity}>
        <View style={[styles.avatar, { borderColor: accent }]}>
          <Text style={[Type.label, { color: c.text }]}>{initialsOf(displayName)}</Text>
        </View>
        <View style={styles.who}>
          <Text numberOfLines={1} style={[styles.name, { color: c.text }]}>
            {displayName}
          </Text>
          <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
            {weekLabel}
          </Text>
        </View>
        {scored ? (
          <StatusChip label="Final" tone="positive" />
        ) : locked ? (
          <StatusChip label="Locked" />
        ) : null}
      </View>

      <View style={[styles.tiles, { borderColor: c.border }]}>
        <Tile
          first
          label={scored ? 'TOTAL' : 'AVG PACE'}
          value={headline}
          tone={scored ? c.positive : undefined}
        />
        <Tile
          label="FILLED"
          value={`${filled}/${slotCount}`}
          tone={filled < slotCount ? c.warning : c.positive}
        />
        <Tile
          label={locked ? 'STATUS' : 'LOCKS IN'}
          value={clock}
          tone={locked ? c.textSecondary : undefined}
        />
        {/* "ALERTS", not "NEEDS A LOOK" — the longer phrase wrapped onto two
            lines at phone width and knocked this tile's value out of line with
            the other three. */}
        <Tile
          label="ALERTS"
          value={String(alerts)}
          tone={alerts > 0 ? c.negative : c.textSecondary}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 4,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  who: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  tiles: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tile: { flex: 1, minWidth: 0, paddingVertical: Spacing.two, paddingHorizontal: Spacing.two, gap: 1 },
});
