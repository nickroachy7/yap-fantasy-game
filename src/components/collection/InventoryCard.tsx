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
import { View } from 'react-native';

import { PlayerCard } from '@/components/cards';
import { toCardModel, type CollectionCard } from './types';

export function InventoryCard({
  card,
  width,
  onPress,
}: {
  card: CollectionCard;
  /** Exact column width, so rows align and the last row does not stretch. */
  width: number;
  onPress?: () => void;
}) {
  return (
    <View style={{ width }}>
      <PlayerCard
        model={toCardModel(card)}
        size="compact"
        fixedWidth={false}
        onPress={onPress}
      />
    </View>
  );
}
