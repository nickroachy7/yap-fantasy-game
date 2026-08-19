/**
 * Card profile: ONE copy you own.
 *
 * WHY THIS IS A SEPARATE ROUTE FROM /player/[id]
 *
 * They answer different questions and the answers do not fit on one screen
 * without one of them becoming a footnote.
 *
 *   /player/<player_id>  — who is this man, what has he produced, how is he
 *                          used, what is coming up. Identical for every user.
 *                          Ownership appears only as community aggregate.
 *   /card/<instance_id>  — what is THIS copy worth to me. Its earned total, its
 *                          tier, the weeks it actually started, and where it
 *                          ranks against every other copy of him and against
 *                          every card in the game.
 *
 * The route param is therefore the CARD INSTANCE id, never the player id — the
 * opposite of its sibling, and the reason both are named in every comment that
 * touches navigation. A player is one row; the copies of him are many, and two
 * of yours can be worth very different things.
 *
 * The player's own numbers are deliberately NOT duplicated here beyond a single
 * line of context. Everything about the footballer is one tap away and stays in
 * exactly one place, so the two screens can never disagree about him.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { InjuryChip } from '@/components/cards/InjuryChip';
import { CardStanding } from '@/components/players/CardStanding';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { StartLog } from '@/components/players/StartLog';
import { parseCardProfile, type CardProfile } from '@/components/players/card-profile';
import { sellErrorMessage } from '@/components/players/sell';
import { Gem } from '@/components/shell/AppHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

/** "4 Aug 2026". Short and unambiguous — no locale-dependent 8/4 vs 4/8. */
function dateLabel(iso: string | null): string {
  if (!iso) return 'date unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date unknown';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { refresh: refreshWallet } = usePlayer();

  const [profile, setProfile] = useState<CardProfile | null>(null);
  const [selling, setSelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);

  const load = useCallback<Load>(
    async (live) => {
      if (!id) return;
      const { data, error } = await supabase.rpc('card_profile', { p_card_instance_id: id });
      if (!live()) return;
      if (error) return error.message;
      // The RPC returns null for a card that is not the caller's, which is the
      // same answer as "does not exist" — deliberately, so it cannot be used to
      // probe whether an id is real.
      setProfile(data ? parseCardProfile(data) : null);
    },
    [id],
  );

  const { loading, error } = useLoader(load);

  /* `back()` is a DISMISSAL — the tabs are still mounted underneath. The
     fallback matters for a cold deep link, which has nothing beneath it. */
  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/collection');
  }, [router]);

  /**
   * Sell this copy.
   *
   * On success the wallet is re-read from the server rather than patched here:
   * the balance in the header is the number the user will check, and it must
   * come from the same place the sale did. Then the sheet closes — the card is
   * gone, and leaving its profile open would be showing a thing that no longer
   * exists.
   */
  const confirmSell = useCallback(async () => {
    if (!profile) return;
    setBusy(true);
    setSellError(null);
    try {
      const { error: err } = await supabase.rpc('sell_card', {
        p_card_instance_id: profile.card.id,
      });
      if (err) throw new Error(sellErrorMessage(err.message));
      await refreshWallet();
      setSelling(false);
      dismiss();
    } catch (e) {
      // Kept open on failure. Closing would leave the card still there with no
      // explanation, which reads as the button having done nothing.
      setSellError(e instanceof Error ? e.message : 'The sale could not be completed.');
    } finally {
      setBusy(false);
    }
  }, [profile, refreshWallet, dismiss]);

  const body = () => {
    if (loading || !id) {
      return (
        <View style={styles.centre}>
          <ActivityIndicator />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centre}>
          <Text style={[Type.section, styles.centreText, { color: c.text }]}>
            Could not load this card
          </Text>
          <Text style={[Type.bodyRelaxed, styles.centreText, { color: c.textSecondary }]}>
            {error}
          </Text>
        </View>
      );
    }
    if (!profile) {
      return (
        <View style={styles.centre}>
          <Text style={[Type.section, styles.centreText, { color: c.text }]}>Card not found</Text>
          <Text style={[Type.bodyRelaxed, styles.centreText, { color: c.textSecondary }]}>
            This card is not one of yours, or it no longer exists.
          </Text>
        </View>
      );
    }

    const { card, rank, starts } = profile;

    return (
      <>
        {card.injuryStatus ? (
          <View style={styles.injuryRow}>
            <InjuryChip status={card.injuryStatus} size="detail" />
          </View>
        ) : null}

        {/* A sold copy still resolves — history has to keep working — so say so
            plainly rather than 404ing someone who followed an old link. */}
        {card.soldAt ? (
          <View style={[styles.note, { backgroundColor: c.backgroundElement }]}>
            <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
              {`You sold this copy on ${dateLabel(card.soldAt)}${card.soldFor === null ? '' : ` for ${card.soldFor} gems`}. It still counts in the lineups it started, but you no longer hold it.`}
            </Text>
          </View>
        ) : null}

        <Text style={[Type.fine, { color: c.textTertiary }]}>
          {`Acquired ${dateLabel(card.acquiredAt)}${card.source ? ` from a ${card.source}` : ''}`}
        </Text>

        <CardStanding card={card} rank={rank} />

        <StartLog starts={starts} playerName={card.playerName} />

        {/* The bridge to the other profile. Named as what it is rather than
            "view player", because the distinction between the man and the copy
            is the thing these two screens exist to keep straight. */}
        <Pressable
          onPress={() =>
            router.push({ pathname: '/player/[id]', params: { id: card.playerId } })
          }
          accessibilityRole="button"
          accessibilityLabel={`Open the full player profile for ${card.playerName}`}
          style={({ pressed }) => [
            styles.link,
            { borderColor: c.border, backgroundColor: c.surface },
            pressed && styles.pressed,
          ]}>
          <View style={styles.linkText}>
            <Text style={[Type.strong, { color: c.text }]}>
              {`${card.playerName}’s full profile`}
            </Text>
            <Text style={[Type.fine, { color: c.textSecondary }]}>
              Career, game log, usage and how the community holds him
            </Text>
          </View>
          <Text style={[Type.section, { color: c.textTertiary }]}>›</Text>
        </Pressable>

        {/* Selling lives on this screen and not on the player profile, because
            selling is per-copy and irreversible: this is the only surface that
            shows WHICH copy — its tier, its starts, what it earned. */}
        {card.soldAt ? null : (
          <Pressable
            onPress={() => {
              setSellError(null);
              setSelling(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Sell this ${card.tier} card for ${card.sellValue} gems`}
            style={({ pressed }) => [
              styles.sell,
              { borderColor: c.border, backgroundColor: c.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <Text style={[Type.strong, { color: c.textSecondary }]}>SELL THIS COPY</Text>
            <Gem color={TierColors[scheme].gold.accent} size={10} />
            <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{card.sellValue}</Text>
          </Pressable>
        )}

        <ConfirmDialog
          visible={selling}
          title={`Sell this ${card.tier} card?`}
          body={`${card.playerName} · ${card.season ?? '—'} card. You will receive ${card.sellValue} gems. The copy and everything it has earned — ${card.careerFp.toFixed(0)} FP over ${card.lineupStarts} start${card.lineupStarts === 1 ? '' : 's'} — are gone for good, and pulling him again starts a new card at bronze.`}
          confirmLabel={`Sell for ${card.sellValue}`}
          destructive
          busy={busy}
          error={sellError}
          onConfirm={() => void confirmSell()}
          onCancel={() => {
            if (busy) return;
            setSelling(false);
            setSellError(null);
          }}
        />
      </>
    );
  };

  return (
    <PlayerSheetFrame
      title={profile?.card.playerName}
      /* The card's identity, not the player's: which season's card, which
         rarity, which tier. The player's team and position ride along because
         without them the title is a name with no context. */
      subtitle={
        profile
          ? [
              profile.card.teamAbbreviation?.toUpperCase(),
              profile.card.positionAbbreviation,
              profile.card.season ? `${profile.card.season} CARD` : null,
              profile.card.rarity?.toUpperCase(),
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      closeLabel="Close card"
      onClose={dismiss}>
      {body()}
    </PlayerSheetFrame>
  );
}

const styles = StyleSheet.create({
  centre: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  centreText: { textAlign: 'center' },
  injuryRow: { flexDirection: 'row' },
  note: { borderRadius: Radius.panel, padding: Spacing.two + 4 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.panel,
    padding: Spacing.two + 4,
  },
  linkText: { flex: 1, minWidth: 0, gap: 2 },
  sell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two + 2,
  },
  pressed: { opacity: 0.65 },
});
