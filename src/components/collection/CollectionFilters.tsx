/**
 * Faceted controls for the inventory grid.
 *
 * The tier row is BOTH the summary strip and the tier filter — the counts a
 * player wants to read ("how many golds do I have?") and the control they want
 * to press are the same object, so splitting them would just duplicate the
 * numbers on screen.
 *
 * Tier is never signalled by colour alone: each chip carries a <TierBadge>,
 * which restates the tier as a word AND as rank pips that differ in count and
 * shape. Selection is likewise not colour-only — the selected chip gains a
 * heavier border.
 *
 * Everything here is drawn at the small end of the type scale on purpose. Four
 * control rows above a grid is a lot of vertical budget on a phone; at 10pt
 * with a 4pt tap-target-preserving hitSlop the whole facet block costs about
 * what two rows used to, and the cards start higher up the screen.
 */
import { StyleSheet, Text, View } from 'react-native';

import { TierBadge } from '@/components/cards';
import { Colors, NUMERIC, Spacing, TierOrder, Type, getTierTheme, type CardTier } from '@/constants/theme';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  PositionOrder,
  type AvailabilityFilter,
  type Position,
  type PositionFilter,
  type TierFilter,
} from './types';

function useScheme(): 'light' | 'dark' {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function TierFilterRow({
  value,
  onChange,
  total,
  counts,
}: {
  value: TierFilter;
  onChange: (next: TierFilter) => void;
  total: number;
  counts: Record<CardTier, number>;
}) {
  const scheme = useScheme();

  return (
    <ChipRow>
      <Chip
        selected={value === 'ALL'}
        label="ALL TIERS"
        count={total}
        onPress={() => onChange('ALL')}
        accessibilityLabel={`All tiers, ${total} cards`}
      />
      {TierOrder.map((tier) => {
        const selected = value === tier;
        const t = getTierTheme(tier, scheme);

        return (
          <Chip
            key={tier}
            selected={selected}
            count={counts[tier]}
            onPress={() => onChange(selected ? 'ALL' : tier)}
            accessibilityLabel={`${t.label} tier, ${counts[tier]} cards`}>
            {/* Decorative here: the chip's own label already says the tier. */}
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <TierBadge tier={tier} size="grid" />
            </View>
          </Chip>
        );
      })}
    </ChipRow>
  );
}

export function PositionFilterRow({
  value,
  onChange,
  total,
  counts,
}: {
  value: PositionFilter;
  onChange: (next: PositionFilter) => void;
  total: number;
  counts: Record<Position, number>;
}) {
  return (
    <ChipRow>
      <Chip
        selected={value === 'ALL'}
        label="ALL POS"
        count={total}
        onPress={() => onChange('ALL')}
        accessibilityLabel={`All positions, ${total} cards`}
      />
      {PositionOrder.map((pos) => {
        const selected = value === pos;

        return (
          <Chip
            key={pos}
            selected={selected}
            label={pos}
            count={counts[pos]}
            onPress={() => onChange(selected ? 'ALL' : pos)}
            accessibilityLabel={`${pos}, ${counts[pos]} cards`}
          />
        );
      })}
    </ChipRow>
  );
}

/**
 * The count under the facets.
 *
 * It used to carry the availability toggle as a chip on its right. The action
 * bar owns that filter now, and two controls for one filter is how a screen
 * ends up disagreeing with itself — press one, and the other still reads as
 * off. What is left says what the filter DID, which the bar cannot: "12 of 40
 * cards", and the count of what is being hidden.
 */
export function ResultLine({
  shown,
  total,
  unavailable,
  availability,
}: {
  shown: number;
  total: number;
  unavailable: number;
  availability: AvailabilityFilter;
}) {
  const c = Colors[useScheme()];
  const hiding = availability === 'AVAILABLE';

  return (
    <View style={styles.resultLine}>
      <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: c.textSecondary }]}>
        {shown === total ? `${total} cards` : `${shown} of ${total} cards`}
      </Text>
      {hiding && unavailable > 0 ? (
        <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
          {`${unavailable} in lineups hidden`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* Same metrics as ChipRow's own content row — this one is a ScrollView the
     sort strip owns, because it has a label and a direction chip pinned either
     side of the scrolling part. */
  resultLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  pressed: { opacity: 0.7 },
});
