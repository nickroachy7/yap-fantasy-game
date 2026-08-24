/**
 * The pinned head of every board: which board, which slice of it, and what the
 * numbers below are numbers OF.
 *
 * WHY BOTH CONTROLS LIVE HERE RATHER THAN ONE PER OWNER
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
 * control is). This component is that seam.
 *
 * WHY A BAR AND NOT A ROW OF PEERS. It has been both kinds of row and neither
 * survived at 375pt. Underlined tabs were the mistake `FantasyTopNav`
 * documents: a word with a rule under it is the treatment drawn one row above
 * this, so the page grew two identical strips and the reader had to tell them
 * apart by trying them. A scrolling strip of six FILTER PILLS fixed the
 * collision and lost on measurement — six labels need about 520pt in a 343pt
 * row, so the strip opened cut off at both ends with a sliver of a word at each
 * edge, which reads as a broken layout rather than as an invitation to scroll.
 * `DropdownChip`'s own note had already called it: a row of peers "become a
 * horizontally scrolling strip where the option you want is usually
 * off-screen".
 *
 * A bar has neither problem. It is one control the width of the page, it says
 * which board you are on in full, nothing is ever clipped, and the menu it
 * opens lists all six at once — so the premise of the screen is one tap away
 * instead of on screen at the cost of legibility.
 *
 * THE CONTEXT LINE, and the bug it fixes. `Screen`'s `context` prop is wide
 * only — see the prop — so `Preseason 2026 · Week 3` rendered on web and
 * NOWHERE on a phone. On the points board that line is the scope of every
 * number on the screen, and the phone build simply did not say it. It is here
 * now, with the field size the old "Where you stand" panel used to carry as its
 * hint, because both are facts about the board rather than about you.
 *
 * IT ALL STAYS PINNED. Nothing in here is inside the FlatList, which is the
 * property that matters: "which board am I reading" has to be answerable and
 * changeable from row two hundred, and the boards cap at five hundred rows.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MenuBar, MenuItem } from '@/components/ui/MenuButton';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BOARD_IDS, BOARD_META, type BoardId } from './community';

export function BoardControls({
  board,
  onBoardChange,
  /** "Preseason 2026 · Week 3 · 48 ranked". What the board below is of. */
  context,
  /** The board's own scope control — a week picker, a position filter. */
  children,
}: {
  board: BoardId;
  onBoardChange: (next: BoardId) => void;
  context?: string;
  children?: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {/* Takes the width. The board is what the whole page is a list OF, and
            a control sized to its own word gave it the same weight as the
            filter beside it. */}
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
            shorthand for a control that opens a choice rather than one that
            holds a position. See `MenuButton`. */}
        {children}
      </View>
      {context ? (
        <Text numberOfLines={1} style={[Type.fine, styles.context, { color: c.textTertiary }]}>
          {context}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one + 2,
    /* Matches the lists' own gutter so the bar lines up with the frame under
       it rather than floating in from the edge. */
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bar: { flex: 1, minWidth: 0 },
  /* On the bar's own left edge, not bled back out through the wrap's gutter:
     it is a caption on the control above it. */
  context: { letterSpacing: 0.2 },
});
