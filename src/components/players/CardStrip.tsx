/**
 * What one COPY is, in the tray the directory row spends on the player.
 *
 * THE ROW IS THE DIRECTORY'S ROW, UNCHANGED. Name, position, club, fixture,
 * both ranks, and the season figure on the right — a card profile draws the
 * same row a player list does, because it is the same player and a reader has
 * already learned to read it. Only the grey band underneath differs, and it has
 * to: the directory's band is a histogram of how many copies exist at each
 * tier, which is a fact about the PLAYER. Repeat that down a list where every
 * row is the same player and it says the same thing four times while saying
 * nothing about what actually differs between the rows.
 *
 * So the band carries the copy. How many weeks it has been started, what a set
 * will do with it, what it was printed as, and when it arrived.
 *
 * ITS SHAPE IS THE DIRECTORY'S SHAPE: inline pairs on the left, one named thing
 * on the right that never gives way. The date is on the right because it is the
 * one part that is fixed-width and the one part nobody needs to read first; the
 * starts are leftmost because they are the only figure here the owner controls.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, TierColors, Type, type CardTier } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function CardStrip({
  tier,
  starts,
  rarity,
  setNote,
  acquired,
}: {
  tier: CardTier;
  /** Weeks this copy has been in a lineup, scored or not. */
  starts: number;
  rarity: string | null;
  /** What a set will do with it — "Proven three · needs silver". */
  setNote: string | null;
  /** Already formatted; the row does not know about dates. */
  acquired: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <>
      <View style={styles.facts}>
        {/* The tier as its own letter in its own colour, exactly as the
            directory's histogram prints it — so the same mark means the same
            thing on both screens. */}
        <View style={styles.pair}>
          <Text style={[styles.letter, { color: TierColors[scheme][tier].accent }]}>
            {tier[0].toUpperCase()}
          </Text>
          <Text numberOfLines={1} style={[Type.body, NUMERIC, { color: c.textSecondary }]}>
            {`${starts} start${starts === 1 ? '' : 's'}`}
          </Text>
        </View>

        {rarity ? (
          <Text numberOfLines={1} style={[Type.body, { color: c.textSecondary }]}>
            {rarity}
          </Text>
        ) : null}

        {/* THE ONE ACTIONABLE THING ON THE LINE, and the only part that gives
            way — a set name clipped by a character still names the set, where a
            clipped rarity or a clipped date is a fragment. */}
        {setNote ? (
          <Text numberOfLines={1} style={[Type.body, styles.set, { color: c.textTertiary }]}>
            {setNote}
          </Text>
        ) : null}
      </View>

      <View style={styles.acquired}>
        <Text numberOfLines={1} style={[Type.micro, styles.unit, { color: c.textTertiary }]}>
          GOT
        </Text>
        <Text numberOfLines={1} style={[Type.body, NUMERIC, { color: c.textSecondary }]}>
          {acquired}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  facts: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1, minWidth: 0 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1, flexShrink: 0 },
  letter: { fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 0.2 },
  set: { flexShrink: 1, minWidth: 0 },
  acquired: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1, flexShrink: 0 },
  unit: { flexShrink: 0, lineHeight: 16 },
});
