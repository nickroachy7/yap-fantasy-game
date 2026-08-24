/**
 * One grid cell: a <PlayerCard> sized to the column.
 *
 * The card is reused as-is — this wrapper adds the one thing the card cannot
 * know about, which is how wide its column is.
 *
 * IT USED TO ADD SOMETHING ELSE, and losing it is why this file spent a while
 * being four lines long. An injury flag hung UNDERNEATH the card: a bordered
 * strip, solid red for Out and dashed amber for Questionable, sitting outside
 * the cell on the page background. It was there because the card had nowhere to
 * put a designation, so the grid grew a band no other screen had — and because
 * it lived outside the card, a row of nine cells had a ragged bottom edge
 * wherever two of them were flagged.
 *
 * `PlayerCard` draws the designation on the nameplate now, beside the position,
 * with the same weights and the same two colours from the same `injuryCode`.
 * The collection and the lineup cannot disagree about what "PUP-R" means
 * because neither decides it.
 *
 * THE FIXTURE IS GONE FROM THE GRID ENTIRELY, and that is what emptied this
 * file back out. It came back once on a footer line, then moved onto the card,
 * then went — the collection is a place you look at what you OWN, and who a
 * club plays on Sunday is a question the directory and Leaders exist to answer.
 * Nothing here reads the schedule now, so nothing here can be a line behind it.
 *
 * A cell is a square and its width. There is no longer anything under the frame
 * for a ragged edge to happen to.
 */
import { StyleSheet, Text, View } from 'react-native';

import { PlayerCard } from '@/components/cards';
import { Colors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { toCardModel, type CollectionCard } from './types';

export function InventoryCard({
  card,
  width,
  selecting,
  selected,
  onPress,
}: {
  card: CollectionCard;
  /** Exact column width, so rows align and the last row does not stretch. */
  width: number;
  /**
   * The grid is in multi-select. The cell does not change what PRESSING it
   * does — the screen owns that — it changes what the cell claims about
   * itself, which is the tick and the frame.
   */
  selecting?: boolean;
  selected?: boolean;
  onPress?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={{ width }}>
      <PlayerCard
        model={toCardModel(card)}
        size="compact"
        fixedWidth={false}
        onPress={onPress}
        /**
         * THE FRAME CARRIES THE SELECTION, not a border drawn around the cell.
         * The card's frame is its tier — see `PlayerCard` — and overriding it
         * is exactly what `frameColor` exists for: while you are picking cards
         * the question the edge answers is "is this one going", and tier is
         * still readable from the letter on the plate, which is the channel
         * that note says must never be colour alone anyway.
         *
         * Only while SELECTING. Outside the mode the frame goes back to being
         * tier, and an unselected cell in the mode keeps its tier too — one
         * mark for "in", nothing for "out", rather than two competing edges.
         */
        frameColor={selecting && selected ? c.positive : undefined}
        overlay={
          selecting ? (
            <View
              style={[
                styles.tick,
                selected
                  ? { backgroundColor: c.positive, borderColor: c.positive }
                  : { backgroundColor: c.surfaceSunken + 'CC', borderColor: c.borderStrong },
              ]}>
              {/* A tick, drawn as type rather than as an icon: it has to hold
                  at ~14pt on a 100pt cell, and the glyph is legible where a
                  hand-built check of two Views is a smudge. */}
              {selected ? (
                <Text style={[Type.label, styles.mark, { color: c.background }]}>✓</Text>
              ) : null}
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /* Sits in the card's own overlay slot, which lands low in the picture and
     clear of the nameplate — see `PlayerCard.overlay` for why the centre of
     the square is the one place it cannot go. */
  tick: {
    alignSelf: 'center',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { lineHeight: 14 },
});
