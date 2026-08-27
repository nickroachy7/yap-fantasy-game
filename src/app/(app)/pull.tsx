/**
 * Opening a pack, on a page of its own.
 *
 * WHY THIS IS NOT A SHEET ANY MORE
 *
 * The pull used to be the second state of `/packs`: you pressed Open and the
 * shelf was replaced, in place, by a deck of cards inside a bottom sheet. It
 * worked, and it was the wrong container for what it holds.
 *
 *   A SHEET IS SOMETHING YOU GLANCE AT AND PUT DOWN. That is the rule the rest
 *   of this app follows — a profile, a set checklist, a contest. Opening a pack
 *   is neither glanceable nor quick: it is five to fifty cards, a decision on
 *   each, and the single most-repeated moment in the game. It is the thing you
 *   are doing, not something over the thing you are doing.
 *
 *   THE SHEET SPENT ITS BEST PIXELS ON CHROME. A title, a hero repeating the
 *   title, a row of position chips, a paragraph about bronze — all above the
 *   fold, all of it description of a result the player is looking straight at.
 *   The card itself was capped at 264pt because that chrome had to fit around
 *   it. Here the card is the page and takes whichever of the two axes runs out
 *   first; on a phone that is roughly a third more card.
 *
 *   AND THE CONTROLS WERE NOWHERE NEAR A THUMB. Reveal-all was a 10pt chip in a
 *   counter row at the TOP; "open another" was at the bottom of a scrolling
 *   sheet, below the fold on every phone. Both are in one fixed bar now. See
 *   `PullBar`.
 *
 * THE THREE THINGS THIS PAGE IS
 *
 *   1. THE CEREMONY, while the packs are actually being bought. The navigation
 *      happens BEFORE the first `open_pack`, not after the last, so a bulk buy
 *      of ten shows a pack counting itself in rather than a button that has
 *      gone quiet. The spending stays on the shelf — see `pull-session` for why
 *      that is not negotiable in a browser.
 *   2. THE DECK. `PullDeck`, which is the reveal and nothing else.
 *   3. THE BAR. `PullBar`, which is always the next thing to do.
 *
 * IT IS PUSHED OVER `/packs`, WHICH IS THE WHOLE NAVIGATION MODEL. The shelf
 * stays mounted underneath, so its loop goes on publishing while the ceremony
 * plays, and closing this page — by the ✕, or by "Open another" — lands you
 * back on the shelf with the button you just pressed under your thumb. There is
 * no route from anywhere else: a reload finds no session and says so.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardBack, PullDeck } from '@/components/cards/PullDeck';
import { PullBar } from '@/components/cards/PullBar';
import { EMPTY_SWEEP, planSweep } from '@/components/cards/pull-plan';
import { usePullSession } from '@/components/cards/pull-session';
import { useReveal } from '@/components/cards/use-reveal';
import { usePullActions } from '@/components/cards/use-pull-actions';
import type { Pulled } from '@/components/cards/PackShelf';
import { Colors, ContentMeasure, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** A stable empty deck, so the hooks below do not see a new array every render. */
const NO_CARDS: Pulled[] = [];

/**
 * What the card's own panel needs under it, reserved out of the height budget.
 *
 * The deck's panel has a floor of 104 (see `PullDeck`) plus the gap above it.
 * Taking it off here is what keeps the buttons under the card ON the screen
 * rather than under the bar — the card is square, so every point of height the
 * card is allowed is also a point of width it takes.
 */
const PANEL_RESERVE = 128;

/** Beyond this many cards, a row of pips is a row of noise. See the rail. */
const PIP_LIMIT = 10;

export default function PullScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const session = usePullSession();

  /* The deck only exists once the volley has stopped. Handing the reveal a
     growing array would restart its first-card timer on every pack that landed,
     and hand `usePullActions` a new key — a fresh `card_actions` read per pack,
     nine of which are thrown away. */
  const ready = session?.status === 'ready';
  const cards = ready && session ? session.cards : NO_CARDS;

  const reveal = useReveal(cards);
  const pull = usePullActions(cards.length > 0 ? cards : null);

  /** How tall the middle of the page is, so the card can take most of it. */
  const [stage, setStage] = useState(0);
  /**
   * The volley's refusal, once it has been read and dismissed.
   *
   * HELD HERE RATHER THAN CLEARED AT THE SOURCE. `session.refusal` is the
   * shelf's record of what happened to a purchase and has to stay true for as
   * long as the session does — a notice that erased it would be rewriting the
   * receipt to close the message. This page just stops showing it.
   */
  const [refusalRead, setRefusalRead] = useState(false);
  const cardHeightCap = Math.max(180, (stage || windowHeight * 0.62) - PANEL_RESERVE);

  /**
   * What "do this to all of them" would actually do, recomputed whenever the
   * offers or the dispositions move.
   *
   * Held here rather than in the bar because the bar is not the only thing that
   * would need it if a second surface ever asked, and because a plan is a fact
   * about the pull rather than about the strip at the bottom of the screen.
   */
  const plan = useMemo(
    () => (cards.length === 0 ? EMPTY_SWEEP : planSweep(cards, pull.actions, pull.disposed)),
    [cards, pull.actions, pull.disposed],
  );

  /** What this pack has paid out so far. */
  const earned = useMemo(() => {
    let total = 0;
    for (const d of pull.disposed.values()) total += d.gems;
    return total;
  }, [pull.disposed]);

  /**
   * `back()` is a DISMISSAL — the shelf is still mounted underneath, so this
   * puts the pull down and leaves you on the pack you just bought.
   *
   * THE FALLBACK IS NOT THEORETICAL. `back()` on an empty stack does nothing at
   * all, silently, which would strand a player on a page whose only exit had
   * stopped working. `dismissTo` pops back to the href when it is already in
   * the stack and REPLACES THE CURRENT SCREEN when it is not, which is exactly
   * the two cases a presented route has. Same guard as `/packs` and the two
   * profiles; see the note there.
   */
  /**
   * Back to the shelf.
   *
   * `back()` is a DISMISSAL — the shelf is still mounted underneath, so this
   * puts the pull down and leaves you on the pack you just bought, which is
   * what "open another" means.
   *
   * THE SESSION IS NOT ENDED HERE, deliberately. Clearing it re-renders this
   * page — which is still mounted for the length of the dismissal — into its
   * "no pack open" state, so leaving a pack flashed an empty screen on the way
   * out. Nothing needs it cleared: the only route to this page is a press that
   * calls `beginPull`, and that replaces whatever is held. `endPull` is for the
   * one case where there is genuinely nothing to show, which the shelf handles.
   *
   * The fallback is for arriving cold — a reloaded browser tab on /pull, or a
   * link straight to it. `back()` on an empty stack does nothing at all,
   * silently, which would strand a player on a page whose only exit had stopped
   * working. Same guard as `/packs` and the two profiles; see the note there.
   */
  const toShelf = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/packs');
  }, [router]);

  /**
   * Keep these cards, and go and look at them.
   *
   * ONE `dismissTo`, ALL THE WAY DOWN, AND IT HAS TO BE. This was `back()` then
   * `push('/fantasy/collect')`, which is wrong by exactly one screen: `back()`
   * pops THIS page and lands on `/packs`, which is itself presented over the
   * app — so the push then stacked the inventory ON TOP of the packs sheet.
   * You got the inventory as a third layer over a sheet you thought you had
   * left, and the way out of it was a back gesture nobody has a reason to
   * expect.
   *
   * `dismissTo` is the primitive for this and there is no counting involved: it
   * pops until the named href is reached, and `/fantasy/collect` lives inside
   * `(tabs)` — the stack's anchor, so it is always at the bottom. Both the pull
   * and the shelf go, the tabs are already there, and the inventory is a PAGE
   * again rather than a layer. It is also what makes the cold path work
   * unchanged: with nothing to pop it replaces this screen outright.
   */
  const seeInventory = useCallback(() => {
    router.dismissTo('/fantasy/collect');
  }, [router]);

  /* NO SESSION IS NOT AN ERROR. It is a reloaded browser tab, or a link
     straight to /pull, or a volley that was refused before it dealt anything —
     all of which are "there is no pack open", and none of which is a failure
     worth a red notice. The cards, if there were any, are in the inventory. */
  if (!session) {
    return (
      <View style={[styles.fill, styles.empty, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <Text style={[Type.section, { color: c.text }]}>No pack open</Text>
        <Text style={[Type.bodyRelaxed, styles.measure, { color: c.textSecondary }]}>
          Nothing is being opened right now. Anything you have already pulled is in your
          inventory.
        </Text>
        <View style={styles.row}>
          <Pressable
            onPress={() => router.dismissTo('/packs')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.plainButton,
              { backgroundColor: c.text },
              pressed && styles.pressed,
            ]}>
            <Text style={[Type.strong, { color: c.background }]}>Open a pack</Text>
          </Pressable>
          <Pressable
            onPress={() => router.dismissTo('/fantasy/collect')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.plainButton,
              { backgroundColor: c.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <Text style={[Type.strong, { color: c.text }]}>See inventory</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const turned = cards.length - reveal.hidden;
  /* The volley's refusal outranks a sweep's, because it is about the purchase
     itself — a bulk buy that only opened three of ten is the more important
     piece of news than a set that turned one card away. */
  const notice = (refusalRead ? null : session.refusal) ?? pull.error;

  return (
    /* The surface is painted here, opaque, because a full-screen presentation
       that does not paint shows the page it covered through its own gaps. */
    <View style={[styles.fill, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {/* ---- the rail: out, and how far through you are ------------------ */}
      <View style={styles.rail}>
        <Pressable
          onPress={toShelf}
          accessibilityRole="button"
          accessibilityLabel="Close, and go back to the packs"
          hitSlop={Spacing.two}
          style={({ pressed }) => [
            styles.close,
            { backgroundColor: c.backgroundElement, borderColor: c.border },
            pressed && styles.pressed,
          ]}>
          {/* Drawn as a character rather than as two crossed bars: this is the
              one glyph in the app that everyone already reads. */}
          <Text style={[Type.section, styles.x, { color: c.textSecondary }]}>×</Text>
        </Pressable>

        {ready && cards.length > 0 ? (
          <>
            {cards.length <= PIP_LIMIT ? (
              /* One tappable pip per card: a filled one has been turned over,
                 an outline one has not, so the row doubles as "how much is
                 left" and as the way to jump to a card without swiping to it —
                 which is also the accessibility answer, since reaching a card
                 by swipe is not a thing every player can do. */
              <View style={styles.pips}>
                {cards.map((p, i) => (
                  <Pressable
                    key={p.card_instance_id}
                    onPress={() => reveal.goTo(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`Card ${i + 1} of ${cards.length}`}
                    accessibilityState={{ selected: i === reveal.focus }}
                    hitSlop={6}
                    style={styles.pipTap}>
                    <View
                      style={[
                        styles.pip,
                        {
                          backgroundColor: i === reveal.focus ? gold : c.borderStrong,
                          opacity:
                            reveal.revealed.has(p.card_instance_id) || i === reveal.focus ? 1 : 0.4,
                        },
                      ]}
                    />
                  </Pressable>
                ))}
              </View>
            ) : (
              /* Fifty pips is fifty 18pt bars in a 375pt rail, which is a
                 texture rather than a control. A bar says the same thing and
                 keeps saying it however big the buy was. */
              <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
                <View
                  style={[
                    styles.trackFill,
                    { backgroundColor: gold, flexGrow: turned / cards.length },
                  ]}
                />
                <View style={{ flexGrow: 1 - turned / cards.length }} />
              </View>
            )}

            <Text style={[Type.fine, NUMERIC, styles.tally, { color: c.textTertiary }]}>
              {`${reveal.focus + 1}/${cards.length}`}
            </Text>
          </>
        ) : (
          <View style={styles.railSpace} />
        )}
      </View>

      {/* ---- the stage --------------------------------------------------- */}
      <View style={styles.stage} onLayout={(e: LayoutChangeEvent) => setStage(e.nativeEvent.layout.height)}>
        {ready && cards.length > 0 ? (
          /* A vertical scroller around a horizontal one. On a tall phone the
             content is centred and nothing scrolls; on a short one — or with a
             set picker open under a card, which is the tallest this page ever
             gets — it scrolls rather than clipping the buttons. */
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.stageContent}
            showsVerticalScrollIndicator={false}>
            <PullDeck
              /* A NEW PACK IS A NEW DECK. The scroll position, which cards have
                 been turned over and which one is in front of you all belong to
                 one opening, and remounting drops the lot in one go rather than
                 resetting five pieces of state in an effect. */
              key={session.nonce}
              pulled={cards}
              silverAt={session.silverAt}
              reveal={reveal}
              actions={pull.actions}
              loadingActions={pull.loading}
              disposed={pull.disposed}
              busy={pull.busy}
              frozen={pull.sweep !== null}
              error={pull.error}
              onDismissError={pull.clearError}
              onSell={pull.sell}
              onCommit={pull.commit}
              cardHeightCap={cardHeightCap}
            />
          </ScrollView>
        ) : (
          <Ceremony
            packName={session.packName}
            opened={session.opened}
            requested={session.requested}
            tone={gold}
          />
        )}
      </View>

      {/* WHAT WENT WRONG, ABOVE THE BAR RATHER THAN IN IT. A volley that opened
          three of ten is three real cards AND a refusal, and the bar is for
          what to do next — a notice that pushed the buttons around would make
          the news arrive by moving the thing the thumb was reaching for. */}
      {notice ? (
        <Pressable
          onPress={() => {
            setRefusalRead(true);
            pull.clearError();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss: ${notice}`}
          style={[styles.notice, { borderColor: c.negative, backgroundColor: c.surface }]}>
          <Text style={[Type.fine, { color: c.text }]}>{notice}</Text>
        </Pressable>
      ) : null}

      {ready && cards.length > 0 ? (
        <View style={styles.barWrap}>
        <PullBar
          total={cards.length}
          hidden={reveal.hidden}
          cascading={reveal.cascading}
          plan={plan}
          planning={pull.loading}
          sweep={pull.sweep}
          busy={pull.busy !== null}
          earned={earned}
          onRevealNext={reveal.revealNext}
          onRevealAll={reveal.revealAll}
          onCommitAll={() => pull.commitAll(plan.commits)}
          onSellAll={() => pull.sellAll(plan.sells)}
          onAgain={toShelf}
          onInventory={seeInventory}
        />
        </View>
      ) : null}

      {/* The home indicator, and nothing else: there is no tab bar under this
          page to leave room for. */}
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

/* ---- the ceremony ------------------------------------------------------ */

/**
 * The wait, while the packs are actually being bought.
 *
 * IT IS THE CARD BACK, BREATHING. Not a spinner: a spinner says "the app is
 * busy", and what is happening is a pack being opened — the same object the
 * deck is about to be made of. Reusing the back is also what makes the cut to
 * the deck read as one motion rather than as a screen change.
 *
 * IT COUNTS A BULK BUY IN. Ten packs is ten sequential round trips, and the
 * one thing a player wants to know during them is that it is working. A single
 * open finishes long before anyone reads a number, so it gets no counter.
 */
function Ceremony({
  packName,
  opened,
  requested,
  tone,
}: {
  packName: string;
  opened: number;
  requested: number;
  tone: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.04 }, { translateY: pulse.value * -6 }],
  }));

  return (
    <View style={styles.ceremony}>
      <Animated.View style={[styles.pack, style]}>
        <CardBack tone={tone} />
      </Animated.View>
      <Text style={[Type.section, { color: c.text }]}>{packName}</Text>
      <Text style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
        {requested > 1 ? `Opening ${opened + 1} of ${requested}…` : 'Opening…'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },

  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    /* The rail and the bar are held to a measure on a wide browser; the deck
       deliberately is not, because a card carousel that stops short of the
       window edges stops reading as a deck. */
    alignSelf: 'center',
    width: '100%',
    maxWidth: ContentMeasure.form,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  x: { lineHeight: 22 },
  railSpace: { flex: 1 },
  pips: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pipTap: { paddingVertical: Spacing.one, paddingHorizontal: 3 },
  pip: { width: 18, height: 3, borderRadius: 2 },
  track: { flex: 1, height: 3, borderRadius: 2, flexDirection: 'row', overflow: 'hidden' },
  trackFill: { borderRadius: 2 },
  tally: { minWidth: 34, textAlign: 'right' },

  /* The bar is held to the same measure as the rail on a wide browser: a pair
     of buttons stretched across a 1400pt window is a phone layout wearing a
     desktop's clothes. */
  barWrap: { alignSelf: 'center', width: '100%', maxWidth: ContentMeasure.form },

  stage: { flex: 1 },
  stageContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: Spacing.two },

  ceremony: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  /* Square, because the card back fills its box and the box is what says how
     big the pack is. */
  pack: { width: 200, height: 200, marginBottom: Spacing.three },

  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    alignSelf: 'center',
    width: '100%',
    maxWidth: ContentMeasure.form,
  },

  empty: { alignItems: 'flex-start', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  row: { flexDirection: 'row', gap: Spacing.two, paddingTop: Spacing.two },
  plainButton: {
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  measure: { maxWidth: 560 },
  pressed: { opacity: 0.8 },
});
