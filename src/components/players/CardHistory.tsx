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
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TierBadge } from '@/components/cards/TierBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Colors, NUMERIC, Spacing, Type, type CardTier } from '@/constants/theme';
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
  /** Gems this copy sells for, priced by the server from its tier. */
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
  onOpen,
}: {
  cards: OwnedCard[];
  loading: boolean;
  playerName: string;
  /** Opens the card profile for one copy. */
  onOpen?: (card: OwnedCard) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  // Silent while loading rather than flashing "you own none of this player" at
  // someone who owns three. A wrong answer is worse than a late one here.
  if (loading) return null;

  return (
    <Panel
      title="Your cards"
      hint={cards.length > 1 ? `${cards.length} copies · open one to see where it ranks` : undefined}>
      {cards.length === 0 ? (
        <EmptyState
          title="You don’t hold this player"
          body="Cards arrive from packs. Nothing on this page changes that — it is here so you can decide whether you want to."
        />
      ) : (
        cards.map((card) => {
          const toNext =
            card.nextTierAt !== null ? Math.max(0, card.nextTierAt - card.careerFp) : null;

          return (
            <Pressable
              key={card.id}
              onPress={onOpen ? () => onOpen(card) : undefined}
              disabled={!onOpen}
              accessibilityRole={onOpen ? 'button' : 'text'}
              accessibilityLabel={
                `${playerName}, ${card.season ?? 'unknown season'} card, ${card.tier} tier, ` +
                `${card.careerFp.toFixed(0)} points over ${card.lineupStarts} starts` +
                (onOpen ? '. Opens this card.' : '')
              }
              style={({ pressed }) => [
                styles.row,
                { borderColor: c.border },
                pressed && styles.pressed,
              ]}>
              <TierBadge tier={card.tier} size="compact" />
              <View style={styles.body}>
                <Text style={[Type.strong, { color: c.text }]}>
                  {`${card.season ?? '—'} card`}
                </Text>
                <Text style={[Type.fine, { color: c.textTertiary }]}>
                  {`Acquired ${acquiredLabel(card.acquiredAt)}`}
                </Text>
                {/* The distinction the whole panel exists for, spelled out
                    rather than left to be inferred from two numbers. */}
                <Text style={[Type.fine, NUMERIC, { color: c.textSecondary }]}>
                  {`${card.careerFp.toFixed(1)} FP earned over ${card.lineupStarts} start${card.lineupStarts === 1 ? '' : 's'}`}
                </Text>
              </View>
              <View style={styles.next}>
                {toNext === null || card.nextTierLabel === null ? (
                  <Text style={[Type.micro, { color: c.textTertiary }]}>MAX TIER</Text>
                ) : (
                  <>
                    <Text style={[Type.strong, NUMERIC, { color: c.text }]}>
                      {toNext.toFixed(0)}
                    </Text>
                    <Text style={[Type.micro, styles.right, { color: c.textTertiary }]}>
                      {`FP TO ${card.nextTierLabel.toUpperCase()}`}
                    </Text>
                  </>
                )}
              </View>
              {onOpen ? (
                <Text style={[Type.section, { color: c.textTertiary }]}>›</Text>
              ) : null}
            </Pressable>
          );
        })
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, minWidth: 0, gap: 1 },
  next: { alignItems: 'flex-end', gap: 3 },
  right: { textAlign: 'right' },
  pressed: { opacity: 0.6 },
});
