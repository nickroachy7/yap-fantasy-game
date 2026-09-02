/**
 * The position / lineup-slot badge.
 *
 * Two shapes, one component, because they are the same object at different
 * specificities:
 *
 *   solid  — one position. `QB`, `RB`, `TE`. Filled with that position's
 *            accent, abbreviation drawn on top. `tone` decides whether the
 *            accent is the fill, the ink, or absent — see it.
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
 *
 * WIDTH: SQUARE BY DEFAULT, FIXED WHEN A CALLER RUNS A COLUMN OF THEM
 *
 * Left alone, a badge is as wide as it needs to be — square for one position,
 * wider for a split. That is right for the places one badge sits beside one
 * name (the directory, the leaders panel), and wrong for a lineup, where nine
 * badges stack into what the eye reads as a column. There, a `QB` at 26pt over
 * a split `FLEX` at 45 makes every name start at a different x, and the page
 * looks like it is jittering as you scan down it.
 *
 * `width` fixes the box. The split divides that width between its cells and
 * SHRINKS ITS TEXT TO FIT rather than clipping — the split is what sets the
 * floor on how narrow the column can be, and it has to be able to say so.
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
   *
   * A slot code's digit is a caller's decision: see `slotBadgeLabel`.
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
   * Fixed box width, for a caller drawing a COLUMN of badges that must share
   * an edge. Omit and each badge is its natural width. See the note above.
   */
  width?: number;
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
   *
   * `outline` is the bench badge's box with the position's ink — no fill, a
   * grey border, and the abbreviation in its own accent. It exists for the
   * COLLECTION, which sits between the two cases the other tones were drawn
   * for: it is a list of cards, so a column of solid blocks out-shouts the tier
   * marks down the same page, but it is also a list you scan BY POSITION, so
   * dropping the accent entirely takes away the one channel that makes a column
   * of thirty sortable at a glance. Keeping the letters coloured keeps the
   * accelerator and gives the weight back.
   */
  tone?: 'position' | 'neutral' | 'outline';
};

/**
 * Resolves a slot code to its eligible positions, falling back to the label.
 *
 * ---------------------------------------------------------------------------
 * IT STRIPS THE ORDINAL, AND NOT DOING SO WAS A REAL BUG
 * ---------------------------------------------------------------------------
 *
 * The exact-match lookup silently failed on every slot whose code carries a
 * number the table does not list. `SLOT_POSITIONS` has `FLEX`; the `flex3`
 * contest format emits `FLEX1`, `FLEX2`, `FLEX3` (see `20260825010000`), so the
 * lookup returned undefined, the badge fell through to its SOLID form, and a
 * three-flex lineup drew three grey chips reading FLEX — the exact thing the
 * split badge exists to prevent, in the exact format that needs it most.
 * `WR3` was silently in the same boat; it only looked right because the LABEL
 * path independently resolves `WR`.
 *
 * The root cause is that `slotBadgeLabel` already strips the ordinal and this
 * did not, so the two halves of one badge disagreed about what slot they were
 * drawing. They strip the same way now.
 *
 * Exact match FIRST, because `RB1` and `RB2` are listed in their own right and
 * a future slot may legitimately want an ordinal-specific answer — stripping
 * unconditionally would take that away.
 */
export function positionsForSlot(slot: string): Position[] | undefined {
  const code = slot.toUpperCase();
  return SLOT_POSITIONS[code] ?? SLOT_POSITIONS[code.replace(/\d+$/, '')];
}

/**
 * What a SLOT badge says: the position, without the ordinal.
 *
 * `RB1` and `RB2` are two names for one thing — a slot that takes a running
 * back — and the digit distinguishes them for the code, not for the reader.
 * On screen it cost more than it said: it is the only reason a solid badge
 * ever had to be wider than square, so a lineup's badges came out at three
 * different widths and every name started at a different x. Nothing is lost
 * by dropping it, because the rows are already in slot order and two RB rows
 * sitting one above the other are self-evidently the first and the second.
 *
 * The full code is kept everywhere it still means something — the swap sheet's
 * headings, every accessibility label, and the lineup payload itself.
 */
export function slotBadgeLabel(slot: string): string {
  return slot.toUpperCase().replace(/\d+$/, '');
}

export function PositionBadge({
  label,
  positions,
  size = 24,
  width,
  tone = 'position',
}: PositionBadgeProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  const text = (label ?? '--').toUpperCase();
  const split = positions && positions.length > 1;
  /* Both unfilled tones share the box; they differ only in the ink. */
  const neutral = tone === 'neutral' || tone === 'outline';
  const inked = tone === 'outline';

  if (split) {
    /* Each cell holds ONE character, so the type may be sized to the cell
       rather than to the box: at a fixed width the three initials have to
       shrink to fit, and clipping them inside `overflow: hidden` would be the
       alternative. 0.62 is the largest ratio at which a bold `W` — the widest
       initial in the set — still clears its own cell. */
    const cellWidth = width ? width / positions.length : size * 0.58;
    const splitFont = Math.max(8, Math.min(size * 0.42, cellWidth * 0.62));
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${text} slot: ${positions.map((p) => POSITION_NAMES[p]).join(', ')}`}
        style={[
          styles.split,
          { height: size, borderRadius: size * 0.22 },
          width ? { width } : null,
          neutral && { borderWidth: 1, borderColor: theme.borderStrong },
        ]}>
        {positions.map((p, i) => {
          const c = positionColors(p, scheme);
          return (
            <View
              key={p}
              style={[
                styles.cell,
                { backgroundColor: neutral ? 'transparent' : c.accent, width: cellWidth },
                /* Without fills the cells need a seam, or R W T reads as one
                   three-letter word rather than three eligible positions. */
                neutral && i > 0 && { borderLeftWidth: 1, borderLeftColor: theme.borderStrong },
              ]}>
              <Text
                style={[
                  styles.text,
                  {
                    color: inked ? c.accent : neutral ? theme.text : c.onAccent,
                    fontSize: splitFont,
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
          /* Fixed when the caller is running a column; otherwise square, and
             growing only for a label too long to fit one — `slotBadgeLabel`
             means no LINEUP badge is, but this stays honest for anything else
             that hands over a three-character code. */
          width,
          minWidth: width ?? (text.length > 2 ? size * 1.25 : size),
          borderRadius: size * 0.22,
          backgroundColor: neutral ? 'transparent' : c.accent,
        },
        neutral && { borderWidth: 1, borderColor: theme.borderStrong },
      ]}>
      <Text
        numberOfLines={1}
        style={[
          styles.text,
          {
            color: inked ? c.accent : neutral ? theme.text : c.onAccent,
            fontSize: Math.max(8, size * 0.4),
          },
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
