/**
 * The top of the contests page.
 *
 * It was a five-fact header built for a sheet that arrived with no context —
 * title, record, rack, heart pill, sentence. The page it is now sits under a
 * strip that supplies four of those, so what is left is the rack. The reasoning
 * is on `LobbyHero` itself.
 */
import { StyleSheet, View } from 'react-native';

import { ContestHearts, type HeartResult } from '@/components/runs/Hearts';

/**
 * THE TOP OF THE CONTESTS PAGE IS THE RACK, AND NOTHING ELSE.
 *
 * ---------------------------------------------------------------------------
 * WHAT WENT, AND WHY EACH PIECE COULD GO
 * ---------------------------------------------------------------------------
 *
 * This was a title, a record, the rack, a heart pill and a sentence — five
 * facts stacked above the first contest. Every one of them had a good argument
 * when the lobby was a SHEET presented over the board, because a sheet arrives
 * with no context: it had to say what it was, whose run this was, and what was
 * at stake, or it said nothing at all.
 *
 * It is a page under a strip now, and the strip supplies most of that for free:
 *
 *   the TITLE       the strip's second tab is lit and reads CONTESTS
 *   the RECORD      what the run has done, which is not what this page is for
 *   the HEART PILL  the masthead carries the held count on every screen
 *   the SENTENCE    the arithmetic of the wipe, restated on every visit
 *
 * What is left is the only fact the strip and the masthead cannot draw: WHICH
 * hearts are riding, and on what. A pip per card, each carrying free, wagered
 * or killed, each a link to its contest.
 *
 * IT IS THE SAME OBJECT AS THE LINEUP RAIL'S, CENTRED THE SAME WAY, at the same
 * 16pt. That is the point of the change rather than a side effect of it: the
 * two pages of the Compete strip now open with the identical mark, so switching
 * between them moves the content underneath and leaves the reader's anchor
 * where it was.
 */
export function LobbyHero({
  staked,
}: {
  /** One per card on the board, in the board's order — see `ContestHearts`. */
  staked: { result: HeartResult | null; entered: boolean }[];
}) {
  if (staked.length === 0) return null;
  return (
    <View style={styles.band}>
      <ContestHearts entries={staked} size={16} gap={5} />
    </View>
  );
}

const styles = StyleSheet.create({
  /* No plane of its own: `SheetToneBand` paints it and owns the geometry that
     makes it reach. A background or a negative margin here would double the
     escape and hang the fill 16pt off each edge of the screen.

     AND NO PADDING OF ITS OWN EITHER, which is the part that had gone stale.
     It carried `Spacing.two` top and bottom, which was right for a header of
     five stacked rows — a block that needed to be a block. One 16pt mark is not
     a block, and that padding was landing ON TOP of the scroller's own rhythm:
     `PlayerSheetFrame.content` already sets `paddingTop: Spacing.three` above
     the first child and a `gap: Spacing.three` between every child after it. So
     the rack was sitting in ~24pt above and ~26pt below — fifty points of air
     around sixteen points of heart.
     Taking this to nothing leaves the scroller's 16/16, which is the same
     rhythm every other shelf on the page is set to. The rack is a row in that
     list now rather than a header above it, and it should be spaced like one.

     `alignItems` is the centring, and it is the row's rather than the rack's —
     `ContestHearts` draws its pips at their natural width, so the band is what
     has the space to give. Same arrangement the lineup rail arrived at. */
  band: { alignItems: 'center' },
});
