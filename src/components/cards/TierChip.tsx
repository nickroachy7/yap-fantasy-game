import { StyleSheet, Text, View } from 'react-native';

import { Fonts, type CardTier } from '@/constants/theme';

import { useTierTheme } from './use-tier-theme';

/**
 * A card's tier, in front of the player's name.
 *
 * WHAT THIS REPLACED, AND WHY
 *
 * It was a rail of pips in the row's leading gutter — cheap, out of the way,
 * and too quiet to do the job. A 3pt column at the edge of the screen is
 * something you find once you know it is there, and tier is meant to be the
 * thing that catches the eye on a board of cards you own.
 *
 * So it moved into the line, where the eye already is: immediately before the
 * name, which is the first thing read in every row.
 *
 * FIXED WIDTH, DELIBERATELY.
 *
 * The obvious inline form is `rank` pips — one for bronze, four for diamond —
 * and it is wrong here. Variable width in front of a name means every name in
 * the list starts at a different x, and the column of names is the thing a
 * lineup is actually scanned down. A single character in a fixed box keeps that
 * column straight and still says which tier without reading the colour.
 *
 * TIER IS NEVER COLOUR ALONE.
 *
 * `TierBadge` sets that rule and this keeps it: the INITIAL is drawn, always.
 * Bronze and gold are a brown and a yellow — the first pair to collapse in
 * greyscale or under a red-green deficiency — so B / S / G / D is what actually
 * carries the meaning, and the accent only makes it faster. The full tier name
 * goes to the screen reader.
 *
 * The fill is `accentSoft`, not the accent itself: this sits beside a name at
 * 15pt in a dense row, and a saturated block there would out-shout the name it
 * is describing. Bronze recedes and diamond glows, which is the ordering the
 * game already implies.
 */
export function TierChip({ tier }: { tier: CardTier }) {
  const t = useTierTheme(tier);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${t.label} tier`}
      style={[
        styles.chip,
        { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
      ]}>
      <Text style={[styles.letter, { color: t.colors.accent }]}>{t.label[0]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
