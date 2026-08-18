import { StyleSheet, Text, View } from 'react-native';

import {
  CardSizes,
  Fonts,
  Spacing,
  type CardSize,
  type CardTier,
  type PipShape,
} from '@/constants/theme';
import { useTierTheme } from './use-tier-theme';

export type TierBadgeProps = {
  tier: CardTier;
  size?: CardSize;
};

/**
 * The tier wordmark plus its rank pips.
 *
 * Accessibility: tier is never communicated by colour alone. The badge always
 * carries the tier NAME as text, and the pips encode the tier twice more - by
 * COUNT (bronze 1 -> diamond 4) and by SHAPE (square / pill / circle /
 * diamond). In greyscale, or with any form of colour blindness, all four tiers
 * remain trivially separable.
 */
export function TierBadge({ tier, size = 'grid' }: TierBadgeProps) {
  const t = useTierTheme(tier);
  const dims = CardSizes[size];

  return (
    <View
      // The badge already restates the tier in text; expose it as one label.
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${t.label} tier, rank ${t.rank} of 4`}
      style={[
        styles.badge,
        {
          backgroundColor: t.colors.accent,
          borderRadius: size === 'detail' ? 6 : 4,
          paddingHorizontal: size === 'detail' ? Spacing.two : Spacing.one + 1,
          paddingVertical: size === 'detail' ? Spacing.one : 2,
          gap: size === 'detail' ? Spacing.one + 1 : 3,
        },
      ]}>
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          {
            color: t.colors.onAccent,
            fontSize: dims.labelSize,
            letterSpacing: t.letterSpacing,
          },
        ]}>
        {t.label}
      </Text>
      <View style={[styles.pips, { gap: size === 'detail' ? 3 : 2 }]}>
        {Array.from({ length: t.rank }, (_, i) => (
          <Pip key={i} shape={t.pip} size={dims.pip} color={t.colors.onAccent} />
        ))}
      </View>
    </View>
  );
}

/** A single rank pip. Its geometry is the colour-independent tier signal. */
function Pip({
  shape,
  size,
  color,
}: {
  shape: PipShape;
  size: number;
  color: string;
}) {
  const base = { width: size, height: size, backgroundColor: color };

  if (shape === 'circle') {
    return <View style={[base, { borderRadius: size / 2 }]} />;
  }
  if (shape === 'pill') {
    return <View style={[base, { width: size * 1.9, borderRadius: size / 2 }]} />;
  }
  if (shape === 'diamond') {
    // A square rotated 45deg reads as a diamond on both RN and RN-web.
    return <View style={[base, { transform: [{ rotate: '45deg' }] }]} />;
  }
  return <View style={base} />;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
  },
  label: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
  },
  pips: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
