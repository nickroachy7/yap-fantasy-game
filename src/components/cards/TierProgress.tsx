import { StyleSheet, Text, View } from 'react-native';

import { CardSizes, Fonts, Spacing, type CardSize, type TierTheme } from '@/constants/theme';

export type TierProgressProps = {
  theme: TierTheme;
  size: CardSize;
  careerFp: number;
  /** Career FP needed for the next tier. Null once the card is diamond. */
  nextTierAt: number | null;
  /** Career FP at which the CURRENT tier started. Defaults to 0. */
  floorFp?: number;
  /** Label for the tier being progressed toward, e.g. 'SILVER'. */
  nextLabel?: string;
};

const fmt = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Number of ticks in the segmented track - position is a non-colour cue. */
const SEGMENTS = 10;

/**
 * The core progression feedback of the game: how close this card is to its
 * next tier.
 *
 * Progress is never encoded by colour alone - the exact numbers are always
 * printed beneath the bar, and the track is segmented so the fill boundary is
 * readable by position even in greyscale.
 */
export function TierProgress({
  theme,
  size,
  careerFp,
  nextTierAt,
  floorFp = 0,
  nextLabel,
}: TierProgressProps) {
  const dims = CardSizes[size];
  const maxed = nextTierAt === null;

  // Guard against a bad/inverted threshold rather than dividing by zero.
  const span = maxed ? 0 : Math.max(1, nextTierAt - floorFp);
  const gained = maxed ? 0 : Math.max(0, careerFp - floorFp);
  const ratio = maxed ? 1 : Math.min(1, gained / span);
  const remaining = maxed ? 0 : Math.max(0, nextTierAt - careerFp);

  const caption = maxed
    ? 'Top tier reached'
    : `${fmt(remaining)} FP to ${nextLabel ?? 'next tier'}`;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={
        maxed
          ? 'Maximum tier reached'
          : `${Math.round(ratio * 100)} percent to next tier, ${fmt(remaining)} fantasy points remaining`
      }
      accessibilityValue={maxed ? undefined : { min: 0, max: 100, now: Math.round(ratio * 100) }}
      style={styles.wrap}>
      <View style={styles.headRow}>
        <Text
          numberOfLines={1}
          style={[styles.head, { color: theme.colors.textMuted, fontSize: dims.labelSize }]}>
          {maxed ? 'MAX TIER' : 'NEXT TIER'}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.headValue, { color: theme.colors.text, fontSize: dims.labelSize }]}>
          {maxed ? '◆◆◆◆' : `${fmt(careerFp)} / ${fmt(nextTierAt)}`}
        </Text>
      </View>

      <View
        style={[
          styles.track,
          {
            backgroundColor: theme.colors.accentSoft,
            borderColor: theme.colors.frame,
            height: size === 'detail' ? 10 : 7,
          },
        ]}>
        <View
          style={[
            styles.fillBar,
            { backgroundColor: theme.colors.accent, width: `${ratio * 100}%` },
          ]}
        />
        {/* Segment dividers: give the fill edge a readable position, not just a hue change. */}
        <View style={styles.segments}>
          {Array.from({ length: SEGMENTS - 1 }, (_, i) => (
            <View key={i} style={[styles.segmentLine, { backgroundColor: theme.colors.surface }]} />
          ))}
        </View>
      </View>

      <Text
        numberOfLines={1}
        style={[styles.caption, { color: theme.colors.textMuted, fontSize: dims.labelSize }]}>
        {caption}
      </Text>
    </View>
  );
}

/** RN 0.86 no longer types `StyleSheet.absoluteFillObject`; spell it out. */
const ABSOLUTE_FILL = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
} as const;

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
    width: '100%',
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  head: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: 1,
    flexShrink: 0,
  },
  headValue: {
    fontFamily: Fonts.mono,
    fontWeight: '700',
    flexShrink: 1,
  },
  track: {
    width: '100%',
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fillBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
  },
  segments: {
    ...ABSOLUTE_FILL,
    pointerEvents: 'none',
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-evenly',
  },
  segmentLine: {
    width: 1,
    opacity: 0.55,
  },
  caption: {
    fontFamily: Fonts.sans,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
