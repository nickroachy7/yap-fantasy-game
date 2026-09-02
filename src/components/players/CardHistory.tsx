/**
 * Your copies of this player, on the DIRECTORY profile.
 *
 * WHAT THIS PANEL IS FOR, AND WHAT IT STOPPED BEING
 *
 * The spec's player modal ends with TRANSACTION HISTORY — added, traded,
 * drafted, with dates. None of those events exist in this game: there is no
 * waiver wire, no trade and no draft. What DOES exist is "what is my
 * relationship to this player" — which copies do I hold, when did each arrive,
 * and what has each one earned since.
 *
 * It used to also be where a copy was SOLD. That moved to `/card/<id>`, and the
 * move is the point of the split: selling is per-copy and irreversible, and the
 * card profile is the only surface that shows the copy in full — its rank among
 * every other copy of the player, its rank in the game, and the week-by-week
 * log of what it actually earned. Selling from a three-line row was a smaller
 * version of the same mistake as selling from a grid cell.
 *
 * So this is now a WAY IN rather than a place to act. Each row is a link, and
 * the numbers on it are the two that decide which copy you wanted: what it has
 * earned, and how far it is from the next tier.
 *
 * The reason this belongs on the player page at all: a card's tier is driven by
 * `career_fp`, which accrues ONLY in weeks the card was actually started — so
 * the gap between a player's production and your copy's earnings is a fact you
 * can see only with his stats next to it.
 */
import { StyleSheet, View } from 'react-native';

import { PlayerRow } from '@/components/cards/PlayerRow';
import type { DirectoryPlayer } from '@/components/cards/player-directory';
import { CardStrip } from './CardStrip';
import { Row } from './Section';
import { Spacing, type CardTier } from '@/constants/theme';

export type OwnedCard = {
  id: string;
  tier: CardTier;
  careerFp: number;
  lineupStarts: number;
  season: number | null;
  acquiredAt: string | null;
  tierFloorFp: number | null;
  nextTierAt: number | null;
  nextTierLabel: string | null;
  /** Coins this copy sells for, priced by the server from its tier. */
  sellValue: number;
};

/** "4 Aug". The tray has room for a day and a month, not a year. */
function acquiredLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function CardHistory({
  cards,
  loading,
  player,
  onOpen,
}: {
  cards: OwnedCard[];
  loading: boolean;
  /**
   * The player every row is about.
   *
   * The rows ARE the directory's rows, so they take the directory's player.
   * Every one of them draws the same identity — same name, same fixture, same
   * ranks — because that is true: these are copies of one man. What differs is
   * the tray, which each row fills with its own copy. See `CardStrip`.
   */
  player: DirectoryPlayer;
  fixture?: string | null;
  /** Opens the card profile for one copy. */
  onOpen?: (card: OwnedCard) => void;
}) {
  // Silent while loading rather than flashing "you own none of this player" at
  // someone who owns three. A wrong answer is worse than a late one here.
  if (loading) return null;

  if (cards.length === 0) {
    return (
      <Row
        label="Copies"
        value="None — cards arrive from packs, and nothing here changes that"
        muted
      />
    );
  }

  return (
    <View style={styles.list}>
      {cards.map((card) => (
        <PlayerRow
          key={card.id}
          player={player}
          onPress={() => onOpen?.(card)}
          figure={{ value: card.careerFp.toFixed(1), label: 'FP' }}
          strip={
            <CardStrip
              tier={card.tier}
              starts={card.lineupStarts}
              rarity={null}
              setNote={null}
              acquired={acquiredLabel(card.acquiredAt)}
            />
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /* The rows draw their own gutter, so the list cancels the section's — a
     directory row inset twice is a card, and these are list items. */
  list: { marginHorizontal: -Spacing.three },
});
