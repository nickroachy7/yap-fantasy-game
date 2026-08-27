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
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { toCardModel, type CollectionCard } from './types';

export function InventoryCard({
  card,
  width,
  selecting,
  selected,
  onPress,
  onLongPress,
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
  /**
   * A HOLD on the cell. Passed straight through to the card, like `onPress`:
   * what a hold means is the screen's to decide, and on the grid it is how the
   * mode is opened without going to find the button for it.
   */
  onLongPress?: () => void;
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
        onLongPress={onLongPress}
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
        /**
         * ONE SLOT, TWO MARKS, so they are laid out as a row rather than
         * fighting for the same point on the square. `PlayerCard` gives a
         * single `overlay` and puts it low in the picture, clear of the
         * nameplate — see its note for why the centre is the one place a mark
         * cannot go — so both live in here or neither does.
         *
         * They answer different questions and a selection needs both at once:
         * the circle is "is this one going", the pill is "this man is already
         * in a set", which is precisely the thing you want to know while
         * picking spares to push into one.
         *
         * BOTH ARE GATED ON THE MODE, INCLUDING THE PILL. It was drawn on the
         * resting grid at first, which is a badge on a third of a collection
         * answering a question nobody asked — you come to this screen to look
         * at what you own, and every cell shouting about set membership is
         * chrome over the thing you came for. It is only news while you are
         * choosing cards to put INTO a set, so it appears with the ticks.
         */
        overlay={
          selecting ? (
            <View style={styles.marks}>
              {selecting ? (
                <View
                  style={[
                    styles.tick,
                    selected
                      ? { backgroundColor: c.positive, borderColor: c.positive }
                      : { backgroundColor: c.surfaceSunken + 'CC', borderColor: c.borderStrong },
                  ]}>
                  {/* A tick drawn as type rather than as an icon: it has to
                      hold at ~14pt on a 100pt cell, where a hand-built check of
                      two Views is a smudge. */}
                  {selected ? (
                    <Text style={[Type.label, styles.mark, { color: c.background }]}>✓</Text>
                  ) : null}
                </View>
              ) : null}

              {/* IN SET, NOT "UNAVAILABLE", and the wording is the whole point.
                  This copy is still yours and still sellable; what is gone is
                  the slot. Drawn in the positive tone because it is something
                  the player ACHIEVED and has forgotten, not a refusal. */}
              {card.inSet ? (
                <Text
                  style={[
                    Type.micro,
                    styles.pill,
                    { backgroundColor: c.positive, color: c.background },
                  ]}>
                  IN SET
                </Text>
              ) : null}
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /* The overlay slot lands low in the picture and clear of the nameplate — see
     `PlayerCard.overlay` for why the centre of the square is the one place a
     mark cannot go. Centred, so one mark alone is not off to a side. */
  marks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { lineHeight: 14 },
  /* `overflow: hidden` so the radius actually clips on web, which a Text with a
     background otherwise ignores. */
  pill: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
});
