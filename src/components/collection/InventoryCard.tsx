/**
 * One grid cell: a <PlayerCard> sized to the column.
 *
 * The card is reused as-is — this wrapper adds only the two things the card
 * cannot know about: how wide its column is, and what this club is doing on
 * Sunday.
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
 * THE FIXTURE IS BACK, AND IT LEARNED THAT LESSON. It is drawn on the card's
 * own footer line — one fixed-height row that every cell has, sharing it with
 * the progress phrase — so a cell with no known fixture is exactly as tall as
 * one with a fixture, and the ragged edge cannot come back.
 */
import { View } from 'react-native';

import { PlayerCard } from '@/components/cards';
import { toCardModel, type CollectionCard } from './types';

export function InventoryCard({
  card,
  width,
  matchup,
  onPress,
}: {
  card: CollectionCard;
  /** Exact column width, so rows align and the last row does not stretch. */
  width: number;
  /**
   * OPTIONAL. This club's next game, already formatted — "vs BUF", "@ ARI",
   * "BYE".
   *
   * Handed down from the SCREEN rather than read here, because the schedule is
   * one session-cached map for the whole grid and a hook in this component
   * would be a subscription per cell — 34 of them on a phone, up to a few
   * hundred on a wide window.
   */
  matchup?: string | null;
  onPress?: () => void;
}) {
  return (
    <View style={{ width }}>
      <PlayerCard
        model={{ ...toCardModel(card), matchup }}
        size="compact"
        fixedWidth={false}
        onPress={onPress}
      />
    </View>
  );
}
