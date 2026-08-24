/**
 * Packs, presented over the app.
 *
 * WHY IT IS A SHEET, AND WHY IT IS THE PROFILE'S SHEET
 *
 * This was `collection/shop` — a full sub-page holding a shelf of two rows,
 * one of which (`starter`, `once_per_user`) is permanently spent after a
 * player's first session. So it was a page with one live button on it, forever,
 * taking a third of the Collection strip to say so.
 *
 * Buying a pack is something you open, act on, and put down again — the same
 * kind of object as a player profile or a set checklist — so it takes the same
 * presentation rather than a fourth one invented for it. `sheetOptions` in the
 * layout above declares it once for all four routes; see the note there for
 * what "a sheet" means on a phone versus in a browser.
 *
 * IT IS REACHED THE WAY SEARCH IS. The Collection strip still carries the item
 * in the slot Shop had, but as a `takeover` child pointing at this root path —
 * so `SectionNav` PUSHES it over whatever you were reading instead of
 * navigating you off Inventory, and closing puts you back on that page. No new
 * machinery: `takeover` already existed for exactly this shape.
 *
 * TWO STATES, ONE SHEET. The shelf, and then what you pulled — and the second
 * REPLACES the first rather than appending to it. See `PackReveal`.
 *
 * THE TONE IS GOLD, which is the app's own: the gem, the rail's active marker,
 * the Open button. The frame's note asks that every sheet carry a colour rather
 * than reinstating the hairline it replaced, and for this one the answer is
 * easy — the sheet is about the thing you spend.
 */
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PackReveal } from '@/components/cards/PackReveal';
import {
  CoverageChip,
  PackShelf,
  countPositions,
  type Pack,
  type Pulled,
} from '@/components/cards/PackShelf';
import { usePullActions } from '@/components/cards/use-pull-actions';
import { invalidateCollection } from '@/components/collection/use-collection';
import { invalidateSets } from '@/components/collection/use-sets';
import { Gem } from '@/components/shell/AppHeader';
import { PlayerSheetFrame, SheetToneBand } from '@/components/players/PlayerSheetFrame';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

export default function PacksScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const router = useRouter();
  const gold = TierColors[scheme].gold.accent;

  // Single source of truth for the balance: the header reads the same value, so
  // fetching it separately here is how the two drift apart.
  const { gems, refresh } = usePlayer();

  const [packs, setPacks] = useState<Pack[] | null>(null);
  /** pack_id -> how many times this player has opened it. */
  const [openings, setOpenings] = useState<Map<string, number>>(() => new Map());
  const [silverAt, setSilverAt] = useState<number>(50);
  const [openingCode, setOpeningCode] = useState<string | null>(null);
  const [pulled, setPulled] = useState<Pulled[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* This one reports its own failures rather than handing them to useLoader:
     the shelf and the pack-opening share a single error line, and splitting
     them into two states would leave one of them stale on screen. */
  const load = useCallback<Load>(async (live) => {
    const [packRes, openedRes, tierRes] = await Promise.all([
      supabase
        .from('packs')
        // is_active is filtered here rather than displayed: open_pack() rejects
        // an inactive pack outright, so listing one is offering a button whose
        // only possible outcome is an error.
        .select('id, code, name, gem_cost, card_count, once_per_user, guaranteed_positions')
        .eq('is_active', true)
        .order('gem_cost'),
      // RLS scopes this to the caller, so it is exactly "packs I have opened".
      supabase.from('pack_openings').select('pack_id'),
      // The silver floor is tunable in the database; reading it beats baking
      // 200 into the client and having the card lie after a balance change.
      supabase.from('tier_thresholds').select('min_career_fp').eq('tier', 'silver').maybeSingle(),
    ]);
    if (!live()) return;
    if (packRes.error) return void setError(packRes.error.message);
    if (openedRes.error) return void setError(openedRes.error.message);

    setError(null);
    setPacks(packRes.data as Pack[]);
    const counts = new Map<string, number>();
    for (const row of openedRes.data ?? []) {
      counts.set(row.pack_id, (counts.get(row.pack_id) ?? 0) + 1);
    }
    setOpenings(counts);
    if (!tierRes.error && tierRes.data) setSilverAt(Number(tierRes.data.min_career_fp));
  }, []);

  // Quiet by design: the shelf that is already drawn stays drawn while it is
  // re-read after a pack is opened.
  const { refresh: reloadShelf } = useLoader(load);

  /* WHAT YOU CAN DO WITH WHAT YOU PULLED, and every figure in it decided by the
     server. It keys off the pull itself, so opening another pack drops the last
     one's offers with it — see `usePullActions`. */
  const pull = usePullActions(pulled);

  const open = useCallback(
    async (code: string) => {
      setOpeningCode(code);
      setError(null);
      setPulled(null);
      // All RNG, gem math and minting happen inside this one call, server-side.
      const { data, error: err } = await supabase.rpc('open_pack', { p_pack_code: code });
      if (err) {
        // Left on the shelf, with the reason under it. Switching to the pull
        // view with nothing to show would read as the pack having been empty.
        setError(err.message);
      } else {
        setPulled((data ?? []) as Pulled[]);
        // The cards this just minted are in the collection now, and the
        // inventory holds it for the session — so the held copy is wrong until
        // it is dropped. See `invalidateCollection`.
        invalidateCollection();
        // Five new cards can move six sets, so the held progress is wrong too.
        invalidateSets();
        // Both matter: `load` re-reads the openings so a one-per-player pack
        // flips to Claimed, `refresh` re-reads the balance the header shows.
        await Promise.all([reloadShelf(), refresh()]);
      }
      setOpeningCode(null);
    },
    [reloadShelf, refresh],
  );

  /**
   * `back()` is a DISMISSAL — the tabs are still mounted underneath, so this
   * puts the sheet down and leaves you where you were.
   *
   * THE FALLBACK IS NOT THEORETICAL. `back()` on an empty stack does nothing at
   * all, silently, so arriving here with no history — a refreshed browser tab
   * on /packs, a link straight to it, or a cold deep link — left the close
   * button dead and the player with no way out of the sheet at all. It looked
   * like the shelf had jammed, which is why it got reported alongside not
   * having the gems to buy anything: the two happen to co-occur, since a player
   * short on gems is the one who lingers here long enough to try to leave.
   *
   * `dismissTo` rather than `replace`, and the difference is the whole fix.
   * `replace` swapped the route UNDERNEATH and left the sheet sitting on top of
   * it — the inventory appeared behind, the panel stayed up, and the URL was
   * still /packs. `dismissTo` pops back to the href when it is already in the
   * stack and REPLACES THE CURRENT SCREEN when it is not, which is exactly the
   * two cases a sheet has.
   *
   * `search`, `card/[id]` and `player/[id]` guard the same way, and carried the
   * same `replace` defect in their cold path until this went in.
   */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/fantasy/collection');
  }, [router]);

  /* Dismiss FIRST, then navigate. A push out of a modal that is still up leaves
     the sheet stacked over the page it sent you to, and the way out of that is
     a back gesture the player has no reason to expect.

     With no history there is nothing to dismiss, and pushing would stack a
     second entry on a stack whose first entry is this sheet — so dismissTo,
     which replaces the sheet outright rather than sliding a page under it. */
  const seeInventory = useCallback(() => {
    if (!router.canGoBack()) {
      router.dismissTo('/fantasy/collection');
      return;
    }
    router.back();
    router.push('/fantasy/collection');
  }, [router]);

  const pulledPositions = useMemo(() => (pulled ? countPositions(pulled) : []), [pulled]);
  const pulledTitle = pulled
    ? pulled.length === 1
      ? 'You pulled 1 card'
      : `You pulled ${pulled.length} cards`
    : undefined;

  return (
    <PlayerSheetFrame
      /* The hero below carries whichever of these is current at full size; the
         frame fades the small copy in once that has scrolled away. */
      title={pulledTitle ?? 'Packs'}
      subtitle={pulled ? undefined : `${gems.toLocaleString()} gems`}
      tone={gold}
      onClose={close}
      closeLabel="Close packs">
      <SheetToneBand tone={gold}>
        {pulled ? (
          <View style={styles.hero}>
            <Text style={[Type.micro, { color: gold }]}>PULLED</Text>
            <Text style={[Type.page, { color: c.text }]}>{pulledTitle}</Text>
            {/* What arrived, by position — the same shape the pack promised. */}
            <View style={styles.chipRow}>
              {pulledPositions.map((entry) => (
                <CoverageChip key={entry.position} entry={entry} />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.hero}>
            <Text style={[Type.micro, { color: c.textTertiary }]}>YOUR BALANCE</Text>
            <View style={styles.balance}>
              <Gem size={16} color={gold} />
              <Text style={[Type.page, NUMERIC, { color: c.text }]}>
                {gems.toLocaleString()}
              </Text>
            </View>
            <Text style={[Type.bodyRelaxed, styles.measure, { color: c.textSecondary }]}>
              Cards arrive from packs. Every one starts at bronze and climbs a tier by scoring
              fantasy points in your lineup.
            </Text>
          </View>
        )}
      </SheetToneBand>

      {error ? (
        <View style={[styles.notice, { borderColor: c.negative, backgroundColor: c.surface }]}>
          <View style={styles.noticeText}>
            <Text style={[Type.micro, { color: c.negative }]}>THAT DID NOT WORK</Text>
            <Text style={[Type.body, { color: c.text }]}>{error}</Text>
          </View>
          {/* Only when the shelf itself failed to load. Offering "try again"
              after "insufficient gems" invites the player to retry something
              that cannot succeed until the balance changes. */}
          {packs === null ? (
            <Pressable
              onPress={() => void reloadShelf()}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.retry,
                { backgroundColor: c.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <Text style={[Type.strong, { color: c.text }]}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {pulled ? (
        <PackReveal
          /* A NEW PACK IS A NEW COMPONENT. The reveal holds the scroll
             position, which cards have been turned over and which one is in
             front of you — all of it belongs to one opening, and remounting
             drops the lot in one go. See the note at the top of that file. */
          key={pulled.map((p) => p.card_instance_id).join(',')}
          pulled={pulled}
          silverAt={silverAt}
          actions={pull.actions}
          loadingActions={pull.loading}
          disposed={pull.disposed}
          busy={pull.busy}
          error={pull.error}
          onDismissError={pull.clearError}
          onSell={pull.sell}
          onCommit={pull.commit}
          onAgain={() => setPulled(null)}
          onSeeInventory={seeInventory}
        />
      ) : (
        <PackShelf
          packs={packs}
          gems={gems}
          openings={openings}
          openingCode={openingCode}
          onOpen={(code) => void open(code)}
        />
      )}
    </PlayerSheetFrame>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.two, paddingBottom: Spacing.three },
  balance: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one + 2 },
  measure: { maxWidth: 560 },
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    padding: Spacing.two + 2,
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  noticeText: { gap: Spacing.half },
  retry: {
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two - 2,
  },
  pressed: { opacity: 0.8 },
});
