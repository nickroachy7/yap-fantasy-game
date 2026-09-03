/**
 * Your own row, held above the list on every board, under its own heading.
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
 * THERE WAS A PODIUM HERE AND IT IS DELETED. Three cells across the top, one
 * per medal position, drawn on every board. The argument for it was seeing the
 * gap at the top at a glance; the argument against it is that the list directly
 * underneath opens with those same three managers, in the same order, carrying
 * the same figures and MORE of them. It cost about 70pt to say less than the
 * thing four points below it. Do not restore it: if the top of the board ever
 * needs emphasis, it belongs to the rows themselves.
 *
 * A HEADING SEPARATES IT, NOT A BOX. It was a bordered frame — 1.5pt, rounded,
 * accented — and the border was doing two jobs badly. It said "this is a
 * different kind of thing" when the whole argument above is that it is the SAME
 * kind of thing, drawn identically, in a different place. And a box at the page
 * gutter cannot start its content on the same x as a row that bleeds to that
 * gutter, so its figure column stood about 17pt inside the column header's —
 * two right-aligned numbers a finger's width apart, which reads as a mistake
 * because it is one. Halving the box's padding halved the offset and kept the
 * bug.
 *
 * A heading has neither problem. The row bleeds exactly as every row below it
 * does, so all four columns line up down the whole screen; and `YOUR TEAM` over
 * this row with `RANKINGS` over the list says in words what the border was only
 * implying — to everybody, including a reader who cannot separate the accent
 * from the ground it was drawn on. `BoardColumns` draws the second heading, for
 * the same reason and in the same treatment.
 *
 * THERE IS NO CAPTION UNDER IT ANY MORE. `12th of 48 ranked · top 25% · 380 to
 * 11th` sat here, under a row whose rank column already read 12 and beneath a
 * context line that already read `48 ranked` — three lines of chrome around one
 * row, most of it said twice. What survived is `380 to 11th`, which is the only
 * part a reader can act on, and it moved INTO the row's own detail line. See
 * `standingNote`.
 *
 * THE ROW IS STILL MARKED AS YOURS. `BoardRow` tints any row it is told is
 * yours and prints the `YOU` tag after the name, so losing the border cost the
 * block none of its identity — only its walls.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BoardRow, GUTTER } from './BoardRow';
import type { BoardRowModel } from './community';

/**
 * Whether `BoardTop` will draw anything at all.
 *
 * Exported because the boards wrap it in a view that supplies the block's
 * vertical space, and a board the reader is not on — the normal state right
 * through preseason — would otherwise get that view's padding as a stray gap
 * above its empty state. The component asks the same question of itself below,
 * so the two cannot disagree.
 *
 * IT IS NOT "IS THE READER SIGNED IN". A signed-in reader with no scored lineup
 * still gets the block, because the sentence saying WHY they are not on the
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
  /**
   * The heading. "Your team" on five boards; on the board of CARDS the row is
   * your best COPY rather than you, and calling that your team would be naming
   * the wrong object.
   */
  label,
}: {
  mine: BoardRowModel | null;
  meId: string | null;
  unit: string;
  absent: string;
  onJumpToMine?: () => void;
  label: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (!hasBoardTop(meId)) return null;

  return (
    <View>
      <Text style={[Type.micro, styles.label, { color: c.textTertiary }]}>
        {label.toUpperCase()}
      </Text>
      {mine ? (
        <BoardRow
          row={mine}
          isMe
          unit={unit}
          onPress={onJumpToMine}
          pressHint="Scrolls the board to your place in it"
          /* The last row in its section, with a caption under it rather than
             another row — a divider here would rule off a heading. */
          rule={false}
        />
      ) : (
        /* Keeps the tint the row would have carried, so a reader who is not on
           the board still gets a band under the heading rather than a
           paragraph loose on the page. */
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
  /* The row it heads bleeds to the page edges, so the heading takes the gutter
     back for itself — the same split the lists make between their rows and
     everything that is not a row. */
  label: { letterSpacing: 0.4, paddingHorizontal: GUTTER, paddingBottom: Spacing.one + 1 },
  absent: { paddingVertical: Spacing.two + 2, paddingHorizontal: GUTTER },
});
