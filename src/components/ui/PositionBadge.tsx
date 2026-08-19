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
import { Colors, Fonts } from '@/constants/theme';
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
  /**
   * `position` (default) fills the badge with the position's accent.
   *
   * `neutral` draws it as a grey outline instead, and is what the LINEUP uses.
   * That screen is about CARDS, not players: a card's tier is the colour that
   * has to carry there, and a position accent on every badge is a second colour
   * system competing with it down the same column. The player directory keeps
   * the accent — it is a list of players, tier does not enter into it.
   *
   * Nothing is lost by dropping the colour. The abbreviation is always drawn
   * (see `constants/positions.ts`); the accent is a scanning accelerator
   * layered on text, never a substitute for it — which is exactly what makes it
   * safe to take away when something else needs the attention more.
   */
  tone?: 'position' | 'neutral';
};

/** Resolves a slot code to its eligible positions, falling back to the label. */
export function positionsForSlot(slot: string): Position[] | undefined {
  return SLOT_POSITIONS[slot.toUpperCase()];
}

export function PositionBadge({
  label,
  positions,
  size = 24,
  tone = 'position',
}: PositionBadgeProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  const text = (label ?? '--').toUpperCase();
  const split = positions && positions.length > 1;
  const neutral = tone === 'neutral';

  if (split) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${text} slot: ${positions.map((p) => POSITION_NAMES[p]).join(', ')}`}
        style={[
          styles.split,
          { height: size, borderRadius: size * 0.22 },
          neutral && { borderWidth: 1, borderColor: theme.borderStrong },
        ]}>
        {positions.map((p, i) => {
          const c = positionColors(p, scheme);
          return (
            <View
              key={p}
              style={[
                styles.cell,
                { backgroundColor: neutral ? 'transparent' : c.accent, width: size * 0.58 },
                /* Without fills the cells need a seam, or R W T reads as one
                   three-letter word rather than three eligible positions. */
                neutral && i > 0 && { borderLeftWidth: 1, borderLeftColor: theme.borderStrong },
              ]}>
              <Text
                style={[
                  styles.text,
                  {
                    color: neutral ? theme.text : c.onAccent,
                    fontSize: Math.max(8, size * 0.42),
                  },
                ]}>
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
          backgroundColor: neutral ? 'transparent' : c.accent,
        },
        neutral && { borderWidth: 1, borderColor: theme.borderStrong },
      ]}>
      <Text
        numberOfLines={1}
        style={[
          styles.text,
          { color: neutral ? theme.text : c.onAccent, fontSize: Math.max(8, size * 0.4) },
        ]}>
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
