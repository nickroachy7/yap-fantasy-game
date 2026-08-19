/**
 * The collection in one wrapping line of label/value pairs.
 *
 * This replaced a six-cell stat grid. The grid cost ~60pt of a phone's screen
 * to carry five numbers, above four rows of facets and a search field — the
 * first card was below the fold before a single card had been drawn. At
 * micro/strong the same five numbers cost one line, and they read better in a
 * row than stacked in boxes because the eye compares them left to right.
 *
 * The numbers are over the WHOLE collection, never the current filter. The
 * facet chips and the result line below already answer "how many match"; this
 * line answers "what do I own", and a summary that moved every time a chip was
 * pressed would answer neither.
 *
 * Every pair here is a fact derived from the rows we already hold. Pairs that
 * would always read zero for most players (duplicates, injuries) are dropped
 * rather than printed as 0 — a zero still costs the space of a number.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Gem } from '@/components/shell/AppHeader';
import { Colors, NUMERIC, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CollectionStats } from './types';

function Pair({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${value} ${label.toLowerCase()}`}
      style={styles.pair}>
      <Text style={[Type.micro, { color: c.textTertiary }]}>{label}</Text>
      <Text style={[Type.strong, NUMERIC, { color: tone ?? c.text }]}>
        {value.toLocaleString()}
      </Text>
    </View>
  );
}

export function CollectionSummary({ stats }: { stats: CollectionStats }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.row}>
      <Pair label="CARDS" value={stats.cards} />
      <Pair label="PLAYERS" value={stats.players} />
      {stats.duplicates > 0 ? <Pair label="DUPES" value={stats.duplicates} /> : null}
      <Pair label="TEAMS" value={stats.teams} />
      {stats.unavailable > 0 ? (
        <Pair label="UNAVAILABLE" value={stats.unavailable} tone={c.negative} />
      ) : null}
      {stats.uncertain > 0 ? (
        <Pair label="UNCERTAIN" value={stats.uncertain} tone={c.warning} />
      ) : null}
      {/* What the whole collection is worth if sold. It earns its place twice:
          it is the only figure here denominated in gems rather than cards, and
          it is how anyone finds out selling exists at all — the action itself
          lives on the player page, where there is room to show what a copy has
          earned before you give it up. */}
      {stats.sellValue > 0 ? <SellValuePair value={stats.sellValue} /> : null}
    </View>
  );
}

/** Same shape as `Pair`, but the value carries the gem mark. */
function SellValuePair({ value }: { value: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Worth ${value} gems if every card were sold`}
      style={styles.pair}>
      <Text style={[Type.micro, { color: c.textTertiary }]}>SELLS FOR</Text>
      <Gem color={accent} size={8} />
      <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{value.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Pairs are separated by a full step and their two halves by a hair, so the
  // row parses as five pairs rather than ten words.
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: Spacing.three },
  pair: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one + 1 },
});
