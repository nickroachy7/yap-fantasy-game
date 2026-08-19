import { StyleSheet, View } from 'react-native';

import type { CardTier } from '@/constants/theme';

import { useTierTheme } from './use-tier-theme';

/**
 * A card's tier, at the leading edge of a dense row.
 *
 * WHY A RAIL AND NOT A BADGE
 *
 * `TierBadge` is the full statement — wordmark plus pips — and it is right on a
 * card and in a filter chip, where there is room to read it. A lineup row has
 * no such room: it already carries a slot badge, a name, a position, a club, a
 * designation, a fixture and a figure, and adding a seventh labelled thing to
 * that line would cost the row the density it was built for.
 *
 * So the tier moves OUT of the content and into the margin. The rail sits in
 * the row's leading gutter, where nothing else wants to be, and takes no width
 * from the name. Read down a board it becomes a column you can scan without
 * reading: mostly quiet, with the good cards marking themselves.
 *
 * TIER IS NEVER COLOUR ALONE — and that rule is why this is pips, not a stripe.
 *
 * `TierBadge` sets the standard: tier is encoded by name, by pip COUNT and by
 * pip SHAPE, so it survives greyscale and every form of colour blindness. A
 * solid bar in the tier accent would have broken that the moment it shipped —
 * bronze and gold are a brown and a yellow, which is exactly the pair that goes
 * first. The rail therefore draws `rank` pips (bronze 1 → diamond 4). Count
 * carries the meaning; colour only accelerates it.
 *
 * It also means the two encodings agree: four pips here and four pips on the
 * card are the same fact, said the same way.
 */
export function TierRail({ tier, height = 8 }: { tier: CardTier; height?: number }) {
  const t = useTierTheme(tier);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${t.label} tier`}
      style={styles.rail}>
      {Array.from({ length: t.rank }, (_, i) => (
        <View
          key={i}
          style={[styles.pip, { height, backgroundColor: t.colors.accent }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Absolutely placed, so a row's existing layout is untouched by this — the
   * name column does not lose a single point to it, which is the whole reason
   * the margin was the right place to put it.
   */
  rail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 2,
  },
  pip: { width: 3, borderRadius: 1.5 },
});
