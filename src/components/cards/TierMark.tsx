import { StyleSheet, Text } from 'react-native';

import { Fonts, type CardTier } from '@/constants/theme';

import { useTierTheme } from './use-tier-theme';

/**
 * A card's tier, as one letter in that tier's colour.
 *
 * WHAT THIS HAS BEEN, IN ORDER, AND WHY IT KEPT LOSING WEIGHT
 *
 * It began as a rail of pips in the lineup row's leading gutter — cheap, out of
 * the way, and too quiet to do the job. A 3pt column at the edge of the screen
 * is something you find once you know it is there.
 *
 * So it became a chip: the initial on a soft tinted fill with a hairline
 * around it, sitting immediately before the player's name. That was right while
 * it was the first thing in the row, because a name needs something with a bit
 * of body in front of it or the row has no left edge.
 *
 * It is neither of those now. The row's third line carries what the CARD has
 * earned — tier, total points, distance to the next tier — and this sits at the
 * head of that line among small grey type. A filled, bordered box there was the
 * heaviest object on the line by some way, and it was announcing the least
 * consequential thing on it: a reader who wants the tier is reading the phrase
 * two tokens along, which names the next one outright.
 *
 * So: no fill, no border, no box. The letter, in the accent. It reads as the
 * first word of the line it begins, which is what it is.
 *
 * TIER IS STILL NEVER COLOUR ALONE, AND THIS IS WHY THE CHIP COULD GO.
 *
 * `theme.ts` sets the rule and `TierBadge` keeps it: the INITIAL is drawn,
 * always. Bronze and gold are a brown and a yellow — the first pair to collapse
 * in greyscale or under a red-green deficiency — so B / S / G / D is what
 * actually carries the meaning and the accent only makes it faster. The fill
 * and the border never carried any of it, which is exactly what made them safe
 * to drop. The full tier name still goes to the screen reader.
 *
 * FIXED WIDTH, DELIBERATELY. `B` and `D` are not the same width, and the total
 * that follows this on every row is a figure in a column that has to line up.
 * A letter free to set its own width would step that column left and right down
 * the page for no reason anyone could name.
 */
export function TierMark({ tier }: { tier: CardTier }) {
  const t = useTierTheme(tier);

  return (
    <Text
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${t.label} tier`}
      style={[styles.letter, { color: t.colors.accent }]}>
      {t.label[0]}
    </Text>
  );
}

const styles = StyleSheet.create({
  letter: {
    width: 10,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
