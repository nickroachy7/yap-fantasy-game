/**
 * The position / lineup-slot badge.
 *
 * Two shapes, one component, because they are the same object at different
 * specificities:
 *
 *   solid  — one position. `QB`, `RB1`, `TE`. Filled with that position's
 *            accent, abbreviation drawn on top.
 *   split  — a slot that accepts several positions. `FLEX` becomes three
 *            vertical cells, one per eligible position, each in its own
 *            accent and carrying that position's initial.
 *
 * The split form is worth the extra code because FLEX is the slot people
 * actually get wrong. A grey chip reading "FLEX" tells you nothing about what
 * may go in it; three coloured cells reading R W T answer the question the slot
 * exists to ask, at 24pt, without a legend.
 *
 * The abbreviation is always drawn. See `constants/positions.ts` — colour here
 * is a scanning accelerator layered on text, never a substitute for it.
 */
import { StyleSheet, Text, View } from 'react-native';

import {
  POSITION_NAMES,
  SLOT_POSITIONS,
  positionColors,
  positionKey,
  type Position,
} from '@/constants/positions';
import { Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type PositionBadgeProps = {
  /**
   * What to write on the badge — a position (`WR`) or a slot code (`WR2`).
   * The colour is resolved from `positions` when given, otherwise from this.
   */
  label: string | null;
  /**
   * Eligible positions, when this is a lineup slot. Omit for a plain player
   * position. More than one produces the split form.
   */
  positions?: Position[];
  /** Box height in px. Width follows: square when solid, wider when split. */
  size?: number;
};

/** Resolves a slot code to its eligible positions, falling back to the label. */
export function positionsForSlot(slot: string): Position[] | undefined {
  return SLOT_POSITIONS[slot.toUpperCase()];
}

export function PositionBadge({ label, positions, size = 24 }: PositionBadgeProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const text = (label ?? '--').toUpperCase();
  const split = positions && positions.length > 1;

  if (split) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${text} slot: ${positions.map((p) => POSITION_NAMES[p]).join(', ')}`}
        style={[styles.split, { height: size, borderRadius: size * 0.22 }]}>
        {positions.map((p) => {
          const c = positionColors(p, scheme);
          return (
            <View key={p} style={[styles.cell, { backgroundColor: c.accent, width: size * 0.58 }]}>
              <Text
                style={[styles.text, { color: c.onAccent, fontSize: Math.max(8, size * 0.42) }]}>
                {/* The initial, not the pair: three two-letter codes in a 42pt
                    box is unreadable, and R/W/T is unambiguous inside a set of
                    five positions. */}
                {p[0]}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  const c = positionColors(positions?.[0] ?? label, scheme);
  const key = positionKey(positions?.[0] ?? label);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={key === 'other' ? text : POSITION_NAMES[key]}
      style={[
        styles.solid,
        {
          height: size,
          // Slot codes carry a digit (`RB1`), so the box has to grow with the
          // string rather than stay square, or the 1 gets clipped.
          minWidth: text.length > 2 ? size * 1.25 : size,
          borderRadius: size * 0.22,
          backgroundColor: c.accent,
        },
      ]}>
      <Text
        numberOfLines={1}
        style={[styles.text, { color: c.onAccent, fontSize: Math.max(8, size * 0.4) }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  solid: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  split: { flexDirection: 'row', overflow: 'hidden' },
  cell: { alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  text: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
