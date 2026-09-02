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
import { Text, View } from 'react-native';

import { TierMark } from '@/components/cards/TierMark';
import { CopyRow } from './CopyRow';
import { Row } from './Section';
import { Colors, NUMERIC, Type, type CardTier } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

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

/** "4 Aug 2026". Short and unambiguous — no locale-dependent 8/4 vs 4/8. */
function acquiredLabel(iso: string | null): string {
  if (!iso) return 'Date unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date unknown';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function CardHistory({
  cards,
  loading,
  playerName,
  position,
  team,
  onOpen,
}: {
  cards: OwnedCard[];
  loading: boolean;
  playerName: string;
  /** For the row's identity block, which draws the club and position colour. */
  position: string | null;
  team: string | null;
  /** Opens the card profile for one copy. */
  onOpen?: (card: OwnedCard) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  // Silent while loading rather than flashing "you own none of this player" at
  // someone who owns three. A wrong answer is worse than a late one here.
  if (loading) return null;

  if (cards.length === 0) {
    return (
      <Row
        label="Copies"
        value={`None — cards arrive from packs, and nothing here changes that`}
        muted
      />
    );
  }

  return (
    <View>
      {cards.map((card) => (
        <CopyRow
          key={card.id}
          card={{
            name: playerName,
            position,
            team,
            tier: card.tier,
            careerFp: card.careerFp,
            nextTierAt: card.nextTierAt,
            nextTierLabel: card.nextTierLabel,
          }}
          badge={<TierMark tier={card.tier} size={18} />}
          right={
            <Text style={[Type.figure, NUMERIC, { color: c.text }]}>
              {card.careerFp.toFixed(1)}
            </Text>
          }
          /* THE HISTORY, ON ONE LINE UNDER THE ROW. It was three stacked lines
             inside a bespoke row — season, acquired, "N FP earned over M
             starts" — which is the row saying in prose what the identity block
             above it now says in its own vocabulary. What is left is the two
             facts the row cannot carry: when it arrived, and how many weeks it
             has actually been played. */
          meta={`${card.season ?? '—'} card · acquired ${acquiredLabel(card.acquiredAt)} · ${card.lineupStarts} start${card.lineupStarts === 1 ? '' : 's'}`}
          onPress={onOpen ? () => onOpen(card) : undefined}
          accessibilityLabel={
            `${playerName}, ${card.season ?? 'unknown season'} card, ${card.tier} tier, ` +
            `${card.careerFp.toFixed(0)} points over ${card.lineupStarts} starts` +
            (onOpen ? '. Opens this card.' : '')
          }
        />
      ))}
    </View>
  );
}

