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
 *
 * It is also where a copy is SOLD, for the same reason: selling is per-copy and
 * irreversible, and this is the only surface that shows what the copy is —
 * which tier it reached, how many weeks it started, how far it is from the next
 * tier. Selling from a 106pt grid cell would be selling a name.
 */
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TierBadge } from '@/components/cards/TierBadge';
import { Gem } from '@/components/shell/AppHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Colors, NUMERIC, Spacing, TierColors, Type, type CardTier } from '@/constants/theme';
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
  onSell,
}: {
  cards: OwnedCard[];
  loading: boolean;
  playerName: string;
  /** Resolves on success, rejects with the server's message on refusal. */
  onSell?: (card: OwnedCard) => Promise<void>;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const [pending, setPending] = useState<OwnedCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback((card: OwnedCard) => {
    setError(null);
    setPending(card);
  }, []);

  const cancel = useCallback(() => {
    if (busy) return;
    setPending(null);
    setError(null);
  }, [busy]);

  const confirm = useCallback(async () => {
    if (!pending || !onSell) return;
    setBusy(true);
    setError(null);
    try {
      await onSell(pending);
      setPending(null);
    } catch (e) {
      // Kept open on failure. Closing would leave the card still there with no
      // explanation, which reads as the button having done nothing.
      setError(e instanceof Error ? e.message : 'The sale could not be completed.');
    } finally {
      setBusy(false);
    }
  }, [pending, onSell]);

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
                {onSell ? <SellButton card={card} onPress={ask} /> : null}
              </View>
            </View>
          );
        })
      )}

      <ConfirmDialog
        visible={pending !== null}
        title={`Sell this ${pending?.tier ?? ''} card?`}
        body={
          pending
            ? `${playerName} · ${pending.season ?? '—'} card. You will receive ${pending.sellValue} gems. The copy and everything it has earned — ${pending.careerFp.toFixed(0)} FP over ${pending.lineupStarts} start${pending.lineupStarts === 1 ? '' : 's'} — are gone for good, and buying the player again starts a new card at bronze.`
            : undefined
        }
        confirmLabel={pending ? `Sell for ${pending.sellValue}` : 'Sell'}
        destructive
        busy={busy}
        error={error}
        onConfirm={() => void confirm()}
        onCancel={cancel}
      />
    </Panel>
  );
}

/**
 * The price is on the button rather than beside it, so the number you are
 * agreeing to and the thing you press are the same object. The gem mark comes
 * from the header's own `Gem` so the currency reads identically wherever it
 * appears.
 */
function SellButton({
  card,
  onPress,
}: {
  card: OwnedCard;
  onPress: (card: OwnedCard) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;

  return (
    <Pressable
      onPress={() => onPress(card)}
      accessibilityRole="button"
      accessibilityLabel={`Sell this ${card.tier} card for ${card.sellValue} gems`}
      hitSlop={6}
      style={({ pressed }) => [
        styles.sell,
        { borderColor: c.border, backgroundColor: c.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <Text style={[Type.micro, { color: c.textSecondary }]}>SELL</Text>
      <Gem color={accent} size={8} />
      <Text style={[Type.micro, NUMERIC, { color: c.text }]}>{card.sellValue}</Text>
    </Pressable>
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
  sell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  pressed: { opacity: 0.6 },
});
