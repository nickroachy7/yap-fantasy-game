/**
 * Your cards for this player.
 *
 * The spec's player modal ends with TRANSACTION HISTORY — added, traded,
 * drafted, with dates. None of those events exist in this game: there is no
 * waiver wire, no trade and no draft. What DOES exist, and is the same question
 * asked of a different economy, is "what is my relationship to this player" —
 * which card instances do I hold, when did each arrive, and what has each one
 * earned since.
 *
 * That last part is the reason this panel belongs on the player page rather
 * than only in the collection. A card's tier is driven by `career_fp`, which
 * accrues ONLY in weeks the card was actually started — so two people holding
 * the same player can hold very different cards, and the gap between a player's
 * production and your card's earnings is a fact you can only see side by side
 * with his stats.
 */
import { StyleSheet, Text, View } from 'react-native';

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
};

/** "4 Aug 2026". Short and unambiguous — no locale-dependent 8/4 vs 4/8. */
function acquiredLabel(iso: string | null): string {
  if (!iso) return 'Date unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date unknown';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function CardHistory({ cards, loading }: { cards: OwnedCard[]; loading: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  // Silent while loading rather than flashing "you own none of this player" at
  // someone who owns three. A wrong answer is worse than a late one here.
  if (loading) return null;

  return (
    <Panel
      title="Your cards"
      hint={cards.length > 1 ? `${cards.length} copies` : undefined}>
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
            <View key={card.id} style={[styles.row, { borderColor: c.border }]}>
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
            </View>
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
  next: { alignItems: 'flex-end', gap: 1 },
  right: { textAlign: 'right' },
});
