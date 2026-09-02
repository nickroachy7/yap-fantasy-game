/**
 * How far one owned copy is from its next tier.
 *
 * WHAT IT NO LONGER DRAWS. The headline — tier badge, career FP, starts — has
 * gone up into `PlayerHero`'s figure strip, along with the distance to the next
 * tier. It was the top third of a panel on a tab you had to already be on, and
 * it is the answer the whole page exists to give.
 *
 * THE RANK IS NOT HERE ANY MORE, AND THAT IS THE POINT
 *
 * This drew two rank tiles: `#1 of 1 Saquon cards` and `#12 of 155 among every
 * card`. The first is now the hint on the community section's earnings scale,
 * which shows the same position against the spread it sits in — a rank throws
 * the spread away, and the spread is what decides whether twelfth of fifteen is
 * a disaster or nothing at all. The second is gone outright: it compares a
 * running back's copy to a kicker's under a scoring system where their
 * baselines differ by twice, so it looks impressive and decides nothing.
 *
 * What is left is the bar, which is the one thing on this page about the copy
 * that no other section draws.
 *
 * THE PROGRESS BAR MEASURES FROM THE TIER FLOOR, NOT FROM ZERO
 *
 * Measuring from zero makes every silver card look nearly empty and every
 * diamond look full — true about career totals, useless for "how close am I".
 * The bar fills across the tier the card is currently in. At diamond there is
 * no next threshold, so there is no bar: a full one would imply a level above
 * that does not exist.
 */
import { StyleSheet, Text, View } from 'react-native';

import { useTierTheme } from '@/components/cards/use-tier-theme';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { tierProgress, type CardIdentity } from './card-profile';

export function CardStanding({ card }: { card: CardIdentity }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const t = useTierTheme(card.tier);

  const progress = tierProgress(card);
  const toNext = card.nextTierAt === null ? null : Math.max(0, card.nextTierAt - card.careerFp);

  return (
    <>
      {progress === null || toNext === null || card.nextTierLabel === null ? (
        <Text style={[Type.body, { color: c.textSecondary }]}>
          This copy is at the top tier. There is nothing above diamond.
        </Text>
      ) : (
        <>
          <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
            <View
              style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: t.colors.accent }]}
            />
          </View>
          <View style={styles.ends}>
            <Text style={[Type.micro, { color: c.textTertiary }]}>{card.tier.toUpperCase()}</Text>
            <Text style={[Type.micro, { color: c.textTertiary }]}>
              {`${card.nextTierLabel.toUpperCase()} · ${startsToGo(toNext, card)}`}
            </Text>
          </View>
        </>
      )}
    </>
  );
}

/**
 * The distance to the next tier, in the unit the owner actually controls:
 * starts, not points.
 *
 * Returns a WHOLE clause rather than a fragment to interpolate after "about",
 * because the two branches do not take the same connective — "about 4 more
 * starts" reads, "about start it to find out" does not. A card with no starts
 * has no rate to project from, and dividing by zero starts is not "infinite
 * starts", it is "no answer yet".
 */
function startsToGo(toNext: number, card: CardIdentity): string {
  if (card.fpPerStart === null || card.fpPerStart <= 0) {
    return 'START IT TO BEGIN EARNING';
  }
  const starts = Math.ceil(toNext / card.fpPerStart);
  return `ABOUT ${starts} MORE START${starts === 1 ? '' : 'S'}`;
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  ends: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
});
