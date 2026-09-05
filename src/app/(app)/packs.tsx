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
 * ONE STATE NOW: THE SHELF. What you pulled used to be the second half of this
 * sheet — the same route, swapped in place for a deck of cards. It is its own
 * page (`/pull`), for the reasons set out at the top of that file: a pack
 * opening is the thing you are doing, not something you glance at over the
 * thing you are doing, and in a sheet the card had to be capped at 264pt to
 * leave room for a title, a hero and a paragraph describing it.
 *
 * THE SPENDING STAYED HERE, AND THAT IS DELIBERATE. `/pull` draws the ceremony
 * and the deck; this screen still runs the `open_pack` loop and publishes each
 * pack as it lands — see `pull-session`. A page that opened packs on mount is a
 * page that opens packs when a browser tab is reloaded, and the button that
 * spends coins has to be the thing that spends them.
 *
 * A BULK BUY IS STILL ONE PULL. Opening ten packs runs ten `open_pack` calls
 * and publishes everything they dealt as a single deck, so the pull page means
 * "what this press produced" rather than "what one pack produced". See `open`
 * for the loop and what it does when the fourth of ten is refused.
 *
 * THE TONE IS GOLD, which is the app's own: the coin, the rail's active marker,
 * the Open button. The frame's note asks that every sheet carry a colour rather
 * than reinstating the hairline it replaced, and for this one the answer is
 * easy — the sheet is about the thing you spend.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PackShelf, type Pack, type Pulled } from '@/components/cards/PackShelf';
import { advancePull, beginPull, endPull, finishPull } from '@/components/cards/pull-session';
import { invalidateCollection } from '@/components/collection/use-collection';
import { invalidateSets } from '@/components/collection/use-sets';
import { Coin } from '@/components/shell/AppHeader';
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
  const { coins, refresh, applyCardDelta } = usePlayer();

  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [dailyAvailable, setDailyAvailable] = useState<boolean | null>(null);
  /** pack_id -> how many times this player has opened it. */
  const [openings, setOpenings] = useState<Map<string, number>>(() => new Map());
  const [silverAt, setSilverAt] = useState<number>(50);
  const [openingCode, setOpeningCode] = useState<string | null>(null);
  /** How far through a bulk buy the open in flight is. Null for a single. */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* This one reports its own failures rather than handing them to useLoader:
     the shelf and the pack-opening share a single error line, and splitting
     them into two states would leave one of them stale on screen. */
  const load = useCallback<Load>(async (live) => {
    const [packRes, openedRes, dailyRes, tierRes] = await Promise.all([
      supabase
        // `pack_shelf`, NOT `packs`, and the difference is the odds.
        //
        // The published rates come out of the database that deals the cards —
        // `pack_odds` reads exactly the columns `open_pack` rolls over — folded
        // one row per pack by the view so a six-pack shelf is one round trip
        // rather than six. The client is deliberately not allowed to derive
        // them from `tier_odds`: a rate computed on this side is a rate that
        // goes wrong the first time either side is touched, and it goes wrong
        // SILENTLY, because the number still renders.
        //
        // The view already filters `is_active`, which `packs` did here for the
        // reason it still holds: `open_pack()` rejects an inactive pack
        // outright, so listing one offers a button whose only outcome is an
        // error.
        .from('pack_shelf')
        .select(
          'id, code, name, coin_cost, card_count, once_per_user, daily_limit, guaranteed_positions, guarantee, odds',
        )
        .order('coin_cost'),
      // RLS scopes this to the caller, so it is exactly "packs I have opened".
      supabase.from('pack_openings').select('pack_id'),
      // Whether today's free pack is still there. Asked of the server rather
      // than worked out from the openings above, because "today" has a
      // definition (the UTC day, matching the daily set) and the client does
      // not get to hold a second opinion about it.
      supabase.rpc('daily_pack_status'),
      // The silver floor is tunable in the database; reading it beats baking
      // 200 into the client and having the card lie after a balance change.
      supabase.from('tier_thresholds').select('min_career_fp').eq('tier', 'silver').maybeSingle(),
    ]);
    if (!live()) return;
    if (packRes.error) return void setError(packRes.error.message);
    if (openedRes.error) return void setError(openedRes.error.message);
    // A failure here is not worth blocking the shelf for: the button falls back
    // to disabled, and open_pack refuses a second claim anyway.
    setDailyAvailable(
      dailyRes.error ? false : (dailyRes.data as { available?: boolean } | null)?.available === true,
    );

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

  /**
   * Open `count` of one pack, and publish everything they deal to `/pull`.
   *
   * THE NAVIGATION HAPPENS FIRST, BEFORE A SINGLE RPC. A bulk buy of ten is ten
   * sequential round trips, and a player who has just pressed a button should
   * be watching a pack open during them rather than a button that has gone
   * quiet. The session is begun, the page is pushed, and the loop below fills
   * it in as it goes — see `pull-session`.
   *
   * ONE CALL PER PACK, SEQUENTIALLY. `open_pack` takes a code and mints exactly
   * one pack; there is no batch form of it, and adding one would be a migration
   * for something the client can do honestly. Sequential rather than parallel
   * because every open takes the SAME wallet row lock — fired together they
   * would queue on that lock anyway, and a failure in the middle of a pile of
   * concurrent writes is far harder to report truthfully than one in a loop.
   * This is `claimAll`'s shape in `SetsPanel`, for `claimAll`'s reasons.
   *
   * IT STOPS AT THE FIRST REFUSAL rather than pressing on. Unlike the set sweep
   * — where five independent sets can fail independently — every open here is
   * the same pack against the same balance, so whatever refused the fourth will
   * refuse the fifth. The overwhelmingly likely cause is that the coins ran out,
   * and firing six more doomed calls to prove it is six round trips of nothing.
   *
   * PARTIAL SUCCESS IS SHOWN AND SAID. What was dealt goes to the pull page;
   * the shortfall goes with it, naming how many of how many landed. A bulk buy
   * that opened three of ten and said only "opened" would be lying about seven,
   * and the balance would be the evidence.
   *
   * A VOLLEY THAT DEALT NOTHING COMES STRAIGHT BACK HERE. There is no ceremony
   * to hold and no cards to show, and the refusal belongs under the button that
   * caused it — beside the balance, which is the usual reason. `dismissTo`
   * rather than `back`, so it pops the pull page whether or not anything else
   * has been pushed since.
   *
   * THE CLIENT NEVER PRE-CHECKS THE BALANCE. The button is disabled below what
   * the total costs, which is a courtesy — the authority is `open_pack`, which
   * charges under a lock and refuses when it cannot. A client that decided for
   * itself would eventually disagree with it.
   */
  const open = useCallback(
    async (code: string, count: number) => {
      // The shelf offers 1, 5 or 10; anything else is a caller bug, and a
      // clamp is cheaper than trusting one.
      // NAMED `runs` rather than `packs`, which is the shelf's own state one
      // scope up and which this needs to read for the pack's name.
      const runs = Math.max(1, Math.min(10, Math.floor(count) || 1));

      setOpeningCode(code);
      setProgress(runs > 1 ? { done: 0, total: runs } : null);
      setError(null);

      /* The ceremony names what is being opened, so it reads as a pack rather
         than as a loading state. The shelf is the only thing that knows. */
      const name = packs?.find((entry) => entry.code === code)?.name ?? 'Pack';
      const nonce = beginPull(name, runs, silverAt);
      router.push('/pull');

      const cards: Pulled[] = [];
      /* Counted here rather than inferred from `cards.length` afterwards: a
         pack's card count is a column, packs of different sizes could share a
         code one day, and an open that legitimately deals nothing must still
         count as an open. */
      let opened = 0;
      let refusal: string | null = null;

      for (let i = 0; i < runs; i += 1) {
        // All RNG, coin math and minting happen inside this one call, server-side.
        const { data, error: err } = await supabase.rpc('open_pack', { p_pack_code: code });
        if (err) {
          refusal = err.message;
          break;
        }
        const dealt = (data ?? []) as Pulled[];
        cards.push(...dealt);
        opened += 1;
        if (runs > 1) setProgress({ done: opened, total: runs });
        // The ceremony counts this in the moment it lands, rather than at the
        // end of a volley it has been watching the whole way through.
        advancePull(nonce, dealt);
      }

      if (opened === 0) {
        // Back to the shelf, with the reason under the button. A pull page
        // holding nothing would read as the pack having been empty.
        endPull();
        setError(refusal);
        router.dismissTo('/packs');
      } else {
        /* Named as a count of PACKS, not of cards: the player pressed "open 10"
           and the honest answer is how many of the ten happened. */
        finishPull(nonce, refusal ? `${opened} of ${runs} packs opened — ${refusal}` : null);
        /* THE COUNT MOVES BEFORE THE READ DOES. Ten packs is fifty cards, and
           on a roster near the cap that is the difference between "24 of 30"
           and a warning — news a player wants while looking at what they pulled,
           not a round trip later. `refresh()` below is still the count of
           record. See `applyCardDelta`. */
        applyCardDelta(cards.length);
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
      setProgress(null);
    },
    [reloadShelf, refresh, applyCardDelta, router, silverAt, packs],
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
   * having the coins to buy anything: the two happen to co-occur, since a player
   * short on coins is the one who lingers here long enough to try to leave.
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
    else router.dismissTo('/fantasy/collect');
  }, [router]);

  return (
    <PlayerSheetFrame
      /* The hero below carries whichever of these is current at full size; the
         frame fades the small copy in once that has scrolled away. */
      title="Packs"
      subtitle={`${coins.toLocaleString()} coins`}
      tone={gold}
      onClose={close}
      closeLabel="Close packs">
      {/* THE BALANCE SITS WHERE THE LOBBY'S HEARTS SIT, and it is the same
          object: a title on the left, the currency the screen is priced in as a
          pill at the right end, one line of prose under both. `LobbyHero` has
          the account of why that shape won there — a header a reader takes in
          on the way past rather than a block they have to get through — and a
          player moving between the two sheets should find their two counters in
          the same place rather than learning a second layout.

          IT WAS A HERO: a 9pt YOUR BALANCE label, the figure at `Type.page`,
          and a two-line paragraph. Three stacked lines and 26pt of number to
          say what the masthead says on every other screen in 26pt of pill —
          which put the first pack most of the way down a phone. */}
      <SheetToneBand tone={gold}>
        <View style={styles.hero}>
          <View style={styles.titleRow}>
            <Text style={[Type.page, { color: c.text }]}>Packs</Text>
            <View style={styles.spacer} />
            {/* The masthead's own pill, at the masthead's own size — the same
                one the lobby draws its heart count in. */}
            <View style={[styles.pill, { backgroundColor: c.background }]}>
              <Coin size={12} color={gold} />
              <Text style={[Type.strong, NUMERIC, { color: c.text }]}>
                {coins.toLocaleString()}
              </Text>
            </View>
          </View>
          <Text style={[Type.body, styles.measure, { color: c.textTertiary }]}>
            Every card starts at bronze and climbs a tier by scoring fantasy points in your
            lineup.
          </Text>
        </View>
      </SheetToneBand>

      {error ? (
        <View style={[styles.notice, { borderColor: c.negative, backgroundColor: c.surface }]}>
          <View style={styles.noticeText}>
            <Text style={[Type.micro, { color: c.negative }]}>THAT DID NOT WORK</Text>
            <Text style={[Type.body, { color: c.text }]}>{error}</Text>
          </View>
          {/* Only when the shelf itself failed to load. Offering "try again"
              after "insufficient coins" invites the player to retry something
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

      <PackShelf
        packs={packs}
        dailyAvailable={dailyAvailable}
        coins={coins}
        openings={openings}
        openingCode={openingCode}
        progress={progress}
        onOpen={(code, count) => void open(code, count)}
      />
    </PlayerSheetFrame>
  );
}

const styles = StyleSheet.create({
  /* `LobbyHero`'s band: a title row, and the sentence under it separated by
     nothing but the two line boxes' own leading. */
  hero: { paddingTop: Spacing.two, paddingBottom: Spacing.two + 2, gap: Spacing.half },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  spacer: { flex: 1 },
  /* The masthead's pill, and the lobby's — see the note on the hero. */
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
    paddingHorizontal: Spacing.two,
    height: 26,
    borderRadius: 13,
  },
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
