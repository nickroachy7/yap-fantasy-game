/**
 * The list's heading and the column line under it: what the rows are, and what
 * the number on the right of each one is a number of.
 *
 * ONE LINE DOING BOTH JOBS. `RANKINGS` is the second half of the pair
 * `BoardTop` opens with `YOUR TEAM` — the separation between your row and
 * everybody else's is carried by those two words rather than by a border around
 * the first. `COINS` is the unit of the column it sits over, which is the
 * difference between a quantity and a bare number.
 *
 * THEY WERE TWO LINES, with `#` and `MANAGER` on the second, and the top of the
 * screen had grown to seven stacked things before its first ranked row. Those
 * two labels were the ones to lose: `#` over a column of ordinals and `MANAGER`
 * over a column of names label the self-evident, while the heading and the unit
 * both say something a reader cannot infer. One line, one label at each end.
 *
 * WHAT IT IS NOT is a table header. `BoardRow`'s note argues against a column
 * table and is still right — the name block is stacked lines and nothing in it
 * is a column. The figure on the right genuinely is one: every row draws it at
 * the same width in the same place. That is the only column here, and it is the
 * only one named.
 *
 * IT IS PINNED. A heading that scrolls away is a decoration on the first
 * screenful — it is needed most at row two hundred, which is the same argument
 * `BoardTop` makes about your own row.
 *
 * IT REPLACED THE BLURB. What used to sit here was a sentence per board
 * explaining what the board ranked, inside the list, scrolling away after four
 * rows. Two things were wrong with it: it was the only reason the list had a
 * header at all, and it answered a question the reader has stopped asking by
 * the time they can read it. That sentence now sits in the board PICKER,
 * against the board's name, at the moment of choosing — see `BOARD_META.ranks`.
 *
 * THE WIDTHS ARE IMPORTED, NEVER RESTATED. Every column is drawn from the same
 * constant the row draws itself from, because a header one point out of step
 * with its body is the classic failure of a hand-built table and it is
 * invisible until someone measures it.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { COL_GAP, GUTTER, RIGHT_WIDTH } from './BoardRow';

export function BoardColumns({
  /** The section heading over the list — "Rankings". */
  section,
  /** The unit of the figure column: COINS, PTS, PCT, FP, RUNGS. */
  figureLabel,
}: {
  section: string;
  figureLabel: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${section}, ranked by ${figureLabel.toLowerCase()}`}
      style={[styles.row, { borderBottomColor: c.border }]}>
      <Text style={[Type.micro, styles.section, { color: c.textTertiary }]}>
        {section.toUpperCase()}
      </Text>
      <Text numberOfLines={1} style={[Type.micro, styles.figure, { color: c.textTertiary }]}>
        {figureLabel.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: COL_GAP,
    paddingHorizontal: GUTTER,
    paddingBottom: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  section: { letterSpacing: 0.4, flexShrink: 1, minWidth: 0 },
  /* Sits over the figure column, at its width, so the word and the numbers
     under it share a right edge. */
  figure: { width: RIGHT_WIDTH, textAlign: 'right' },
});
