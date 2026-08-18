import { StyleSheet, View } from 'react-native';

import type { TierMotif as MotifKind } from '@/constants/theme';

export type TierMotifProps = {
  motif: MotifKind;
  color: string;
};

/**
 * Purely geometric pattern drawn inside the art slot.
 *
 * This exists for two reasons:
 *  1. Legal - we hold no licence for player photography, team logos or
 *     jerseys, so the card's "art" is abstract geometry only.
 *  2. Accessibility - the motif differs in FORM per tier (bars / diagonal
 *     stripes / concentric squares / diamond lattice), giving tier a fourth
 *     non-colour signal.
 *
 * Built from plain Views so it renders identically on iOS and web with no
 * SVG or image dependency. Decorative: hidden from the accessibility tree by
 * the parent art slot.
 */
export function TierMotif({ motif, color }: TierMotifProps) {
  if (motif === 'bars') {
    return (
      <View style={styles.fill}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { backgroundColor: color, top: `${28 + i * 18}%`, height: i === 1 ? 6 : 3 },
            ]}
          />
        ))}
      </View>
    );
  }

  if (motif === 'stripes') {
    return (
      <View style={styles.fill}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.stripe,
              { backgroundColor: color, left: `${i * 22 - 10}%`, transform: [{ rotate: '20deg' }] },
            ]}
          />
        ))}
      </View>
    );
  }

  if (motif === 'concentric') {
    return (
      <View style={[styles.fill, styles.center]}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.ring,
              {
                borderColor: color,
                width: 44 + i * 34,
                height: 44 + i * 34,
                borderRadius: 4,
              },
            ]}
          />
        ))}
      </View>
    );
  }

  // lattice - diamond grid, reserved for the top tier.
  return (
    <View style={[styles.fill, styles.center]}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.ring,
            {
              borderColor: color,
              width: 30 + i * 26,
              height: 30 + i * 26,
              transform: [{ rotate: '45deg' }],
            },
          ]}
        />
      ))}
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
  fill: {
    ...ABSOLUTE_FILL,
    overflow: 'hidden',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
    left: '10%',
    right: '10%',
  },
  stripe: {
    position: 'absolute',
    top: '-30%',
    bottom: '-30%',
    width: 6,
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
});
