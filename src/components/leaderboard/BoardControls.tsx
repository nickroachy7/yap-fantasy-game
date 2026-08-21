/**
 * The one row of controls above every board: which board, and which slice of it.
 *
 * WHY BOTH CHIPS LIVE HERE RATHER THAN ONE PER OWNER
 *
 * They were split, and it was a structural accident rather than a decision. The
 * board picker belonged to the screen, so it was pinned above the lists; the
 * week picker belonged to the points board, so it scrolled inside that board's
 * header. Between them sat a heading and a two-line blurb — so the page opened
 * with a chip, a paragraph, and then another chip, and the two controls never
 * read as the pair they are.
 *
 * The fix is for the SCREEN to own the board state (it always did) and for the
 * BOARD to draw the row (it is the only one that knows what its own second
 * control is). This component is that seam: the board chip is drawn here from
 * props, and whatever the board passes as `children` sits beside it.
 *
 * IT STAYS PINNED. Both chips are outside the FlatList, which is the property
 * that matters and the reason the row could not simply move into the list
 * header: "which board am I reading" has to be answerable and changeable from
 * row two hundred, and the boards cap at five hundred rows.
 *
 * WHAT IS NOT HERE. The board's NAME as a heading. The bar already says it, and
 * the heading that used to sit under this row said it a second time in a larger
 * font — see the note in `CommunityBoard`'s header on why it went.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { MenuBar, MenuItem } from '@/components/ui/MenuButton';
import { Spacing } from '@/constants/theme';
import { BOARD_IDS, BOARD_META, type BoardId } from './community';

export function BoardControls({
  board,
  onBoardChange,
  /** The board's own scope control — a week picker, a position filter. */
  children,
}: {
  board: BoardId;
  onBoardChange: (next: BoardId) => void;
  children?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      {/* Takes the width. The board is what the whole page is a list OF, and a
          chip sized to its own word gave it the same weight as the filter
          beside it. */}
      <View style={styles.bar}>
        <MenuBar value={BOARD_META[board].label} label="Board">
          {(close) =>
            BOARD_IDS.map((id) => (
              <MenuItem
                key={id}
                label={BOARD_META[id].label}
                selected={id === board}
                onPress={() => {
                  onBoardChange(id);
                  close();
                }}
              />
            ))
          }
        </MenuBar>
      </View>
      {/* The board's own filter, at the end of the row and round — the app's
          shorthand for a control that opens a choice rather than one that holds
          a position. See `MenuButton`. */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    /* Matches the lists' own gutter so the chips line up with the headings
       under them rather than floating in from the edge. */
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  bar: { flex: 1, minWidth: 0 },
});
