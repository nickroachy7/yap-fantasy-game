/**
 * Card profile — ONE copy you own.
 *
 * ONE OF TWO PROFILES, AND THEY SHARE MORE THAN THEY DIFFER.
 *
 * Same hero and the same three tabs as `/player/<player_id>`, because the
 * football is the same football: a copy's Overview and Game log describe the
 * footballer, and there is no version of "how many targets did he see" that is
 * different because you happen to hold him. Both come from `usePlayerPage`, so
 * the two screens cannot drift.
 *
 * ONLY THE CARD TAB DIFFERS, and it differs by ADDITION rather than by
 * replacement: your copy's standing and its week-by-week earnings sit on top,
 * and the same community view the directory page shows sits underneath. That
 * ordering is the whole point of the split — here you came to look at a
 * specific object, and the community is the context you judge it against.
 *
 * The route param is the CARD INSTANCE id, never the player id — the opposite
 * of its sibling. A player is one row; the copies of him are many, and two of
 * yours can be worth very different things.
 *
 * WHAT DRIVES career_fp, RESTATED BECAUSE THIS IS THE SCREEN THAT SHOWS IT: a
 * copy earns only in weeks it was STARTED. `StartLog` is the receipt — every
 * row in it is a week this copy was in the lineup, and there is no other way
 * for the total to have moved.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PlayerAvatar } from '@/components/cards/PlayerAvatar';
import { invalidateCollection } from '@/components/collection/use-collection';
import { invalidateSets } from '@/components/collection/use-sets';
import { CardStanding } from '@/components/players/CardStanding';
import { CommunityPanel } from '@/components/players/CommunityPanel';
import { GameLogTab } from '@/components/players/GameLogTab';
import { OverviewTab } from '@/components/players/OverviewTab';
import { HERO_PORTRAIT, PlayerHero } from '@/components/players/PlayerHero';
import { PlayerSheetFrame, SheetToneBand } from '@/components/players/PlayerSheetFrame';
import { StartLog } from '@/components/players/StartLog';
import { startKey } from '@/components/players/GameLog';
import { parseCardProfile, type CardProfile } from '@/components/players/card-profile';
import { sellErrorMessage } from '@/components/players/sell';
import { usePlayerPage } from '@/components/players/use-player-page';
import { Gem } from '@/components/shell/AppHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

type ProfileTab = 'overview' | 'card' | 'log';

/**
 * The same three, in the same order and position, as the player profile.
 * SINGULAR here — this tab is about one copy. The player page says "Cards",
 * because its equivalent is about every copy of him. See the note there.
 */
const TABS: Tab<ProfileTab>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'card', label: 'Card' },
  { value: 'log', label: 'Game log' },
];

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

  const [card, setCard] = useState<CardProfile | null>(null);
  const [tab, setTab] = useState<ProfileTab>('card');
  const [selling, setSelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);

  const loadCard = useCallback<Load>(
    async (live) => {
      if (!id) return;
      const { data, error: err } = await supabase.rpc('card_profile', { p_card_instance_id: id });
      if (!live()) return;
      if (err) return err.message;
      // Null for a card that is not the caller's, which is the same answer as
      // "does not exist" — deliberately, so this cannot be used to probe
      // whether an id is real.
      setCard(data ? parseCardProfile(data) : null);
    },
    [id],
  );

  const { loading, error } = useLoader(loadCard);

  /* The football, keyed by the PLAYER this copy is of. Null until the card
     resolves, which is what makes this a two-phase load rather than one. */
  const page = usePlayerPage(card?.card.playerId ?? null);

  /* Which weeks THIS copy was in the lineup, so the game log can mark them.
     The player's log and the copy's earnings are otherwise two lists you have
     to reconcile by eye — and the gap between them IS the bench rule. */
  const startedWeeks = useMemo(
    () =>
      new Set((card?.starts ?? []).map((s) => startKey(s.season, s.seasonType, s.week))),
    [card],
  );

  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/fantasy/collection');
  }, [router]);

  /**
   * Sell this copy.
   *
   * The wallet is re-read from the server rather than patched here: the balance
   * in the header is the number the user will check, and it must come from the
   * same place the sale did. Then the sheet closes — the card is gone, and
   * leaving its profile open would be showing a thing that no longer exists.
   */
  const confirmSell = useCallback(async () => {
    if (!card) return;
    setBusy(true);
    setSellError(null);
    try {
      const { error: err } = await supabase.rpc('sell_card', {
        p_card_instance_id: card.card.id,
      });
      if (err) throw new Error(sellErrorMessage(err.message));
      // This copy is gone from the collection, which the inventory holds for
      // the session — drop it or the grid still shows the card you just sold.
      invalidateCollection();
      // And it may have been the card holding a set over its bar, which the
      // Sets page holds for the session too. See `invalidateSets`.
      invalidateSets();
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
  }, [card, refreshWallet, dismiss]);

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
    if (!card) {
      return (
        <View style={styles.centre}>
          <Text style={[Type.section, styles.centreText, { color: c.text }]}>Card not found</Text>
          <Text style={[Type.bodyRelaxed, styles.centreText, { color: c.textSecondary }]}>
            This card is not one of yours, or it no longer exists.
          </Text>
        </View>
      );
    }

    const k = card.card;

    return (
      <>
        <SheetToneBand tone={TierColors.dark[k.tier].accent}>
          <PlayerHero
            name={k.playerName}
            bio={page.profile?.player ?? null}
            team={k.teamAbbreviation}
            position={k.positionAbbreviation}
            injuryStatus={k.injuryStatus}
            /* The plain slot, wearing this copy's TIER as its edge — the same
               edge the card in the grid has, so the header's portrait is
               recognisably the object you tapped. It is the only structural
               difference between this header and the directory's; everything
               else that separates the two pages is the wash behind them. */
            figure={
              <PlayerAvatar size={HERO_PORTRAIT} frameColor={TierColors.dark[k.tier].frame} />
            }
          />


          <View style={[styles.tabBar, { borderColor: c.backgroundElement }]}>
            <Tabs
              tabs={TABS.map((t) =>
                t.value === 'log' && page.sections.length > 0
                  ? { ...t, hint: String(page.sections.length) }
                  : t,
              )}
              value={tab}
              onChange={setTab}
            />
          </View>
        </SheetToneBand>

        {/* Card is the DEFAULT tab here, unlike the player profile. You did not
            arrive at a specific copy to read a bio. */}
        {tab === 'card' ? (
          <>
            {/* A sold copy still resolves — history has to keep working — so
                say so plainly rather than 404ing an old link. */}
            {k.soldAt ? (
              <View style={[styles.note, { backgroundColor: c.backgroundElement }]}>
                <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
                  {`You sold this copy on ${dateLabel(k.soldAt)}${k.soldFor === null ? '' : ` for ${k.soldFor} gems`}. It still counts in the lineups it started, but you no longer hold it.`}
                </Text>
              </View>
            ) : k.committedAt ? (
              /* The other way a copy leaves, and it must not read as a sale.
                 This one went somewhere: the set is named, and it is still
                 there to look at. */
              <View style={[styles.note, { backgroundColor: c.backgroundElement }]}>
                <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
                  {`You added this copy to ${k.committedSetName ?? 'a set'} on ${dateLabel(k.committedAt)}${k.committedFor === null ? '' : ` for ${k.committedFor} gems`}. It is part of that set now — it still counts in the lineups it started, but it cannot be started or sold again.`}
                </Text>
                {k.committedSetCode ? (
                  <Pressable
                    onPress={() =>
                      router.replace({
                        pathname: '/set/[code]',
                        params: { code: k.committedSetCode as string },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${k.committedSetName ?? 'the set'}`}
                    style={({ pressed }) => [pressed && styles.pressed]}>
                    <Text style={[Type.strong, { color: c.textSecondary }]}>
                      {`See ${k.committedSetName ?? 'the set'} →`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <Text style={[Type.fine, { color: c.textTertiary }]}>
              {`${k.season ?? '—'} card · ${k.rarity ?? 'unknown'} · acquired ${dateLabel(k.acquiredAt)}${k.source ? ` from a ${k.source}` : ''}`}
            </Text>

            <CardStanding card={k} rank={card.rank} />
            <StartLog starts={card.starts} playerName={k.playerName} />

            {/* Neither exit leaves anything to sell. Both are checked, not
                just the sale: a committed copy with a live SELL button is a
                button whose only outcome is a Postgres error. */}
            {k.soldAt || k.committedAt ? null : (
              <Pressable
                onPress={() => {
                  setSellError(null);
                  setSelling(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Sell this ${k.tier} card for ${k.sellValue} gems`}
                style={({ pressed }) => [
                  styles.sell,
                  { borderColor: c.border, backgroundColor: c.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                <Text style={[Type.strong, { color: c.textSecondary }]}>SELL THIS COPY</Text>
                <Gem color={TierColors[scheme].gold.accent} size={10} />
                <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{k.sellValue}</Text>
              </Pressable>
            )}

            {/* The same community view the directory page shows, underneath the
                copy it gives context to. Rank means nothing without the pool. */}
            <CommunityPanel market={page.market} />
          </>
        ) : null}

        {tab === 'overview' ? (
          page.player ? (
            <OverviewTab
              player={page.player}
              profile={page.profile}
              market={page.market}
              sections={page.sections}
              /* Names the copy without duplicating card content into a player
                 tab — otherwise this tab is a dead end on a card page. */
              lead={
                <Text style={[Type.fine, { color: c.textTertiary }]}>
                  {`Viewing your ${k.season ?? ''} ${k.tier} card${
                    page.owned.length > 1 ? ` — one of ${page.owned.length} copies you hold` : ''
                  }. Everything below is about the player.`}
                </Text>
              }
            />
          ) : (
            <View style={styles.centre}>
              <ActivityIndicator />
            </View>
          )
        ) : null}

        {tab === 'log' ? (
          <GameLogTab
            profile={page.profile}
            sections={page.sections}
            startedWeeks={startedWeeks}
          />
        ) : null}

        <ConfirmDialog
          visible={selling}
          title={`Sell this ${k.tier} card?`}
          body={`${k.playerName} · ${k.season ?? '—'} card. You will receive ${k.sellValue} gems. The copy and everything it has earned — ${k.careerFp.toFixed(0)} FP over ${k.lineupStarts} start${k.lineupStarts === 1 ? '' : 's'} — are gone for good, and pulling him again starts a new card at bronze.`}
          confirmLabel={`Sell for ${k.sellValue}`}
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
      title={card?.card.playerName}
      /* The CARD's identity, not the player's: which season, which rarity,
         which tier. Team and position ride along because without them the
         title is a name with no context. */
      subtitle={
        card
          ? [
              card.card.teamAbbreviation?.toUpperCase(),
              card.card.positionAbbreviation,
              card.card.season ? `${card.card.season} CARD` : null,
              card.card.tier.toUpperCase(),
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      closeLabel="Close card"
      /* The TIER, which is the thing this page exists to report and the one
         fact about a copy that moves. A card climbing bronze to silver changes
         the colour of its own page, which is the progression made visible on
         the screen you go to check it. */
      tone={card ? TierColors.dark[card.card.tier].accent : null}
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
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 2 },
  /* `gap` for the committed banner's link, which sits under its sentence. The
     sold banner has no second child and is unaffected. */
  note: { borderRadius: Radius.panel, padding: Spacing.two + 4, gap: Spacing.two },
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
