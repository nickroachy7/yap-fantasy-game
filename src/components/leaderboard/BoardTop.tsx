/**
 * Your own row, held above the list on every board.
 *
 * THE ANSWER TO THE ONLY QUESTION ANYBODY ARRIVES WITH. A leaderboard is read
 * top-down for about four rows and then scrolled for one thing: where am I. On
 * a board of fifty that is a scroll; on a board of five hundred it is a hunt,
 * and the RPCs cap at five hundred. Holding the row here means the answer is on
 * screen before the reader does anything.
 *
 * IT IS PINNED, and that is the whole point. This was a panel headed "Where you
 * stand" that lived in `ListHeaderComponent` — so the one thing on the screen
 * that existed to stay visible scrolled away at about row six, exactly when a
 * reader starts needing it. Outside the FlatList it cannot.
 *
 * IT IS THE ROW, NOT A SUMMARY OF IT. This was a strip of label/value pairs —
 * RANK, POINTS, AVG/WK, BEST, WEEKS — which said the same things in a different
 * shape, so the reader had to learn two presentations of one fact and could not
 * compare the block to the list without translating between them. Drawing the
 * actual `BoardRow` means the thing at the top and the thing in the list are
 * the same object: the same three lines, the same figure, the same tier mark,
 * and the same RANK, which is the number this exists to deliver.
 *
 * AND IT JUMPS. The row is pressable and scrolls the list to where you actually
 * are. Once your standing is pinned, "where am I" is answered and "show me the
 * people around me" is the question left — which was a hunt through up to five
 * hundred rows, and is now a tap.
 *
 * THERE WAS A PODIUM HERE AND IT IS DELETED. Three cells across the top of the
 * frame, one per medal position, drawn on every board. The argument for it was
 * seeing the gap at the top at a glance; the argument against it is that the
 * list directly underneath opens with those same three managers, in the same
 * order, carrying the same figures and MORE of them — the podium cell had room
 * for a name and a total where the row has a name, an occasion, a detail line
 * and a gap note. It cost about 70pt to say less than the thing four points
 * below it. Do not restore it: if the top of the board ever needs emphasis, it
 * belongs to the rows themselves, not to a second rendering of them.
 *
 * WHAT IS NOT HERE. The field size. "3rd of 48" was the old panel's hint, and
 * the 48 now sits on the context line above with the season and the scope — see
 * `BoardControls`. It belongs there: every board wants it, and it is a fact
 * about the board rather than about you.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BoardRow } from './BoardRow';
import type { BoardRowModel } from './community';

/**
 * Whether `BoardTop` will draw anything at all.
 *
 * Exported because the boards wrap it in a view that supplies the page gutter,
 * and a board the reader is not on — the normal state right through preseason —
 * would otherwise get that view's padding as a stray gap above its empty state.
 * The component asks the same question of itself below, so the two cannot
 * disagree.
 *
 * IT IS NOT "IS THE READER SIGNED IN". A signed-in reader with no scored lineup
 * still gets the frame, because the sentence saying WHY they are not on the
 * board is the thing they need most and "you are not here" with no explanation
 * reads as a bug.
 */
export const hasBoardTop = (meId: string | null): boolean => meId !== null;

export function BoardTop({
  /** The reader's own row, or null when they are not on this board. */
  mine,
  meId,
  unit,
  /** What to say when the reader has no row here. Each board has its own. */
  absent,
  /** Scrolls the list to the reader's real row. Omitted where it cannot. */
  onJumpToMine,
}: {
  mine: BoardRowModel | null;
  meId: string | null;
  unit: string;
  absent: string;
  onJumpToMine?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (!hasBoardTop(meId)) return null;

  return (
    <View style={[styles.frame, { borderColor: c.borderStrong }]}>
      {mine ? (
        <BoardRow
          row={mine}
          isMe
          unit={unit}
          onPress={onJumpToMine}
          pressHint="Scrolls the board to your place in it"
          /* The only thing inside the frame — its own divider would sit a
             hairline above the frame's bottom border. */
          rule={false}
        />
      ) : (
        <Text
          style={[
            Type.bodyRelaxed,
            styles.absent,
            { color: c.textSecondary, backgroundColor: c.backgroundMine },
          ]}>
          {absent}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /* `overflow: hidden` so the row's "you" tint is clipped by the frame's radius
     instead of squaring off its corners.

     1.5pt, which is the app's shorthand for a headline block — the weight
     `SummaryStrip` documents. It is what separates this row from the hairline
     ruled rows below it, which are otherwise the same object drawn the same
     way. Without it the pinned row reads as the first row of the list. */
  frame: {
    borderWidth: 1.5,
    borderRadius: Radius.panel,
    overflow: 'hidden',
  },
  /* Its own padding, since there is no row inside to bring any. It keeps the
     tint the row would have carried, so an absent reader still gets a band
     rather than a paragraph loose in a frame. */
  absent: { padding: Spacing.two + 2 },
});
