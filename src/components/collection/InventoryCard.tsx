/**
 * One grid cell: a <PlayerCard> sized to the column.
 *
 * The card is reused as-is — this wrapper adds only the thing the card cannot
 * know about, which is how wide its column is.
 *
 * IT USED TO ADD A SECOND THING, and losing it is the point of this file now
 * being four lines long. An injury flag hung UNDERNEATH the card: a bordered
 * strip, solid red for Out and dashed amber for Questionable, sitting outside
 * the cell on the page background. It was there because the card had nowhere to
 * put a designation, so the grid grew a band no other screen had — and because
 * it lived outside the card, a row of nine cells had a ragged bottom edge
 * wherever two of them were flagged.
 *
 * `PlayerCard` draws the designation ON the fixture line now, which is where
 * the lineup row has always drawn it and for the reason that row gives: a
 * designation is a doubt about Sunday, not a fact about the man, so it belongs
 * on the line about Sunday. Same weights, same two colours, same one-or-two
 * character code from `injuryCode` — the collection and the lineup cannot
 * disagree about what "PUP-R" means because neither decides it.
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
