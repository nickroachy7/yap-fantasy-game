/**
 * The top three, in one row.
 *
 * A vertical podium would cost three rows of the table to say what the table
 * already says. Three columns cost about 66pt once, and buy the thing a plain
 * ranked list is bad at: seeing the gap at the top at a glance.
 *
 * ONE FRAME, NOT THREE BOXES. Each cell used to carry its own border and its
 * own rounded corners, so the row read as three cards that happened to be
 * adjacent — and on a phone, three ~110pt boxes with a truncated name in each
 * looked sparse rather than considered. It is now the treatment `SummaryStrip`
 * documents and every other headline row in the app already uses: a single
 * 1.5pt `borderStrong` frame with hairline `border` dividers inside it, and no
 * fill. Roughly four times the weight outside as in, which is what makes it one
 * object rather than N things side by side.
 *
 * It is not literally `SummaryStrip`, and the reason is one line: that
 * component is a label over a figure, and a podium cell is an ordinal over a
 * NAME over a figure. Widening a strip used by two other screens to grow a
 * third line for this one caller is the trade the wrong way round; borrowing
 * the frame is not.
 *
 * Monochrome on purpose. Gold/silver/bronze is the obvious treatment and is
 * wrong here — those are CARD TIER names in this app, earned by points, and
 * borrowing them for finishing position would make a bronze-tier player in
 * first place read as a contradiction.
 *
 * ON EVERY BOARD, not just points. It took `Standing` and so could only be
 * drawn by the one board that had them; every other board's top three were
 * three ordinary rows. It now takes the row model all six boards already
 * build, so the leading card, the biggest collection and the best week get the
 * same treatment as the points leader — and the six pages have one shape
 * instead of two.
 *
 * The figure and its unit come from the row, so the cell reads `2,086 GEMS` on
 * one board and `148.2 PTS` on another without knowing which it is on.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MovementMark } from './Movement';
import type { BoardRowModel } from './community';

const ORDINALS = ['1ST', '2ND', '3RD'];

export function Podium({
  rows,
  meId,
}: {
  rows: BoardRowModel[];
  meId: string | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  // Below three there is no podium, only the first rows of the table repeated.
  if (rows.length < 3) return null;

  return (
    <View style={[styles.row, { borderColor: c.borderStrong }]}>
      {rows.slice(0, 3).map((s, i) => {
        const isMe = s.userId === meId;
        return (
          <View
            /* The row's key, not the user's: the cards board can seat one
               manager twice, and two cells keyed alike is a dropped cell. */
            key={s.key}
            accessible
            accessibilityLabel={`${ORDINALS[i]}, ${s.name}, ${s.figure} ${s.figureLabel}`}
            style={[
              styles.cell,
              /* The divider is a LEFT border, so the leading cell must not draw
                 one — otherwise it doubles with the frame. */
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.border },
              isMe && { backgroundColor: c.backgroundMine },
            ]}>
            <View style={styles.top}>
              <Text style={[Type.micro, { color: i === 0 ? c.text : c.textTertiary }]}>
                {ORDINALS[i]}
              </Text>
              {/* Only the points board has movement; the rest leave the slot
                  empty rather than drawing a dash for a thing they never had. */}
              {s.movement ? (
                <MovementMark movement={s.movement.places} known={s.movement.known} />
              ) : null}
            </View>
            <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
              {s.name}
            </Text>
            <View style={styles.figures}>
              <Text style={[Type.figure, NUMERIC, { color: c.text }]}>{s.figure}</Text>
              <Text style={[Type.micro, { color: c.textTertiary }]}>{s.figureLabel}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  /* `overflow: hidden` so a tinted "you" cell is clipped by the frame's radius
     instead of squaring off its corner. */
  row: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderRadius: Radius.panel,
    overflow: 'hidden',
  },
  cell: { flex: 1, minWidth: 0, gap: 1, padding: Spacing.two },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one },
  figures: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one },
});
