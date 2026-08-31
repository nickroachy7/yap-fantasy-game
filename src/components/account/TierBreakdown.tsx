/**
 * What the collection is made of, by tier.
 *
 * The bar is hue-only, so it is never the sole carrier of the information: the
 * legend under it repeats every tier as a name, a count and a share. Tier is
 * deliberately coded on four axes elsewhere (see theme.ts) and a stacked bar
 * can only offer one, so it is treated as a shape-of-the-collection glance and
 * the legend is the actual read.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { tierBronze, tierDiamond, tierGold, tierSilver } from '@/components/icons/glyphs';
import type { Glyph } from '@/components/icons/system';

import {
  Colors,
  NUMERIC,
  Spacing,
  TierColors,
  TierOrder,
  TierTreatments,
  Type,
  type CardTier,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The rung marks, in `TierOrder`. Rank is COUNT — one chevron, two, three —
 * and then a gemstone for the top, which is categorically a different mark
 * rather than a fourth chevron nobody could count at this size.
 *
 * Tinted with the same accent the stacked bar above uses, so the legend row and
 * its slice of the bar are obviously the same thing. The shape is the addition:
 * `theme.ts` requires tier to keep a non-colour channel, and until now this
 * legend's was the WORD beside the swatch. A reader who cannot separate the
 * four accents now has the mark as well as the label.
 */
const TIER_GLYPHS: Record<CardTier, Glyph> = {
  bronze: tierBronze,
  silver: tierSilver,
  gold: tierGold,
  diamond: tierDiamond,
};

export function TierBreakdown({
  counts,
  emptyLabel = 'No cards yet.',
}: {
  counts: Record<CardTier, number>;
  emptyLabel?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const tiers = TierColors[scheme];
  const total = TierOrder.reduce((sum, tier) => sum + counts[tier], 0);

  if (total === 0) {
    return <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, { backgroundColor: c.surfaceSunken }]}>
        {TierOrder.map((tier) =>
          counts[tier] > 0 ? (
            <View
              key={tier}
              style={{ flexGrow: counts[tier], backgroundColor: tiers[tier].accent }}
            />
          ) : null,
        )}
      </View>

      <View style={styles.legend}>
        {TierOrder.map((tier) => {
          const n = counts[tier];
          return (
            <View
              key={tier}
              accessible
              accessibilityLabel={`${TierTreatments[tier].label}: ${n} cards, ${share(n, total)}`}
              style={styles.item}>
              <Icon
                glyph={TIER_GLYPHS[tier]}
                color={n > 0 ? tiers[tier].accent : c.textTertiary}
                size={16}
                focused
              />
              <Text
                numberOfLines={1}
                style={[Type.micro, styles.name, { color: n > 0 ? c.text : c.textTertiary }]}>
                {TierTreatments[tier].label}
              </Text>
              <Text style={[Type.strong, NUMERIC, { color: n > 0 ? c.text : c.textTertiary }]}>
                {n}
              </Text>
              <Text style={[Type.fine, NUMERIC, styles.share, { color: c.textTertiary }]}>
                {share(n, total)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Whole percents: a tenth of a percent of a card collection is noise. */
function share(n: number, total: number): string {
  return `${Math.round((n / total) * 100)}%`;
}

const styles = StyleSheet.create({
  wrap: { padding: Spacing.three, gap: Spacing.two + 2 },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.two, columnGap: Spacing.three },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two - 2, flexGrow: 1, flexBasis: 120 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  name: { flexShrink: 1 },
  /** Pushed right so the four shares line up as a column at any wrap. */
  share: { marginLeft: 'auto' },
  empty: { padding: Spacing.three },
});
