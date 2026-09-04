/**
 * Your contests for the week, one card each, swiped horizontally.
 *
 * WHY A CAROUSEL AND NOT A LIST. The card is not a row: it is the top of the
 * table the lineup below it belongs to, and it carries a distribution that
 * needs its full width to read as an axis rather than a bar chart. Stacking
 * two of them would push the lineup off the screen on a phone, and shrinking
 * them would cost the one thing the card is for.
 *
 * SWIPING CHANGES THE BOARD BENEATH IT. That is the whole point — the card and
 * the slots under it are one object, so a carousel that only moved the card
 * would be showing you a contest's standing above a different contest's
 * lineup, which is exactly the bug this component was built to fix (see
 * `20260825070000`).
 *
 * THE FREE CONTEST IS ALWAYS FIRST and the carousel opens on it. It is the one
 * nobody chose to be in, the only one with a season riding on it, and the only
 * one that is there before you have done anything.
 *
 * ONE CARD DRAWS NO CHROME, and there is none left to draw. The page dots went
 * first: they stated position and nothing else, in a row of small marks sitting
 * directly above the run's rack — two indicators of the same size arguing about
 * which one the reader should be counting. A pair of edge chevrons replaced
 * them and have now gone the same way, for a version of the same reason. They
 * were a second thing saying "there is more of this", drawn at the two points
 * on the screen where the card is closest to the edge, and the rail beneath the
 * card was already saying it in a form you can also count and also press.
 *
 * So position is the rack's alone: the lit pip names the page, and tapping one
 * goes there. One indicator, at the centre of the row, doing both jobs.
 *
 * THE RACK IS ALSO THE NAVIGATOR. Tapping a heart goes to the page it belongs
 * to — its contest, or the lobby tile for a heart still free. See `pipPage`.
 *
 * THE PAGES ARE WIDER THAN THE CARD, and the difference is what you see during
 * a swipe: two cards with air between them, the one leaving dimming as it
 * goes. Before this a page was exactly the card, so mid-drag the two
 * borders met and the pair read as one torn sheet rather than as two objects.
 * The card did not shrink to pay for it — the stage spread into the screen's
 * padding instead. See `PAGE_GUTTER` and `Page`.
 *
 * ---------------------------------------------------------------------------
 * `onMomentumScrollEnd` DOES NOT EXIST ON WEB
 * ---------------------------------------------------------------------------
 *
 * It was the only thing calling `onIndexChange`, so on web the card moved and
 * the board underneath did not — the exact mismatch this component was built to
 * fix, reintroduced by the one platform nobody swipes on during development.
 *
 * react-native-web's `ScrollViewBase` emits `onScroll` and nothing else. It
 * synthesises a scroll-END by debouncing that same handler 100ms, but it calls
 * `onScroll` with it rather than `onMomentumScrollEnd`, so the momentum prop is
 * silently inert — it is accepted, forwarded to the scroll responder, and never
 * fired. Checked in `node_modules`, not inferred from the symptom.
 *
 * So web listens on `onScroll` as well. The handler is idempotent — it compares
 * against the current index and returns — so the extra ticks during a drag cost
 * nothing but a page change as you pass the halfway point, which is what a
 * snapping carousel should do anyway.
 *
 * Both platforms are now on that same `onScroll`, because the pages dim as they
 * leave and the fade needs the offset on every frame rather than once per
 * settle. It is a worklet, so native pays nothing across the bridge for it,
 * and the settle inside it is still gated to web — see `onScroll` below.
 *
 * The snapping itself is fine on web: `pagingEnabled` compiles to CSS
 * scroll-snap there, so the offset always settles on a real page and the
 * rounding below cannot land between two. A `snapToInterval` peek was tried in
 * its place and reverted — see the note on `step`.
 *
 * `goTo` exists because none of that fires for a PROGRAMMATIC scroll: a tap on a
 * heart has to move the list and the state itself.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { ContestCard } from "@/components/contests/ContestCard";
import { settlementOf } from "@/components/contests/contest-model";
import {
  termsOfEntry,
  type MyContest,
} from "@/components/contests/use-my-contests";
import {
  ContestHearts,
  type HeartResult,
  type HeartSpan,
} from "@/components/runs/Hearts";
import { Spacing } from "@/constants/theme";
import type { PlayerState } from "@/context/PlayerContext";

/**
 * The air between one card and the next.
 *
 * ---------------------------------------------------------------------------
 * THE PAGES USED TO BE THE COLUMN, SO THE CARDS TOUCHED
 * ---------------------------------------------------------------------------
 *
 * A page was exactly as wide as the card on it. That is invisible at rest — one
 * card, centred, nothing beside it — and it is the whole problem the moment a
 * thumb is on the screen: mid-drag the outgoing card's right border sat flush
 * against the incoming card's left one, two bordered slabs sharing an edge and
 * both bleeding off the screen. It did not read as two cards moving past each
 * other. It read as one torn sheet.
 *
 * THE FIX IS NOT TO SHRINK THE CARD. The card is the densest thing on this
 * screen and taking 32pt out of it to make room for a gap would be paying for
 * the fix with the thing being fixed.
 *
 * So the PAGE grows instead. The stage cancels `Screen`'s padding the way the
 * boards below it already do (`LineupEditor.bleed`), which makes each page 32pt
 * wider than the column while the card inside keeps every point it had. At rest
 * the card lands exactly where it landed before — the padding is back, as
 * padding — and during a drag there are 32 points of page background between
 * the two cards.
 *
 * Deliberately NOT a peek. The neighbour is still exactly one page away, so it
 * is off-screen when the scroll settles; the header's note on `step` explains
 * why a permanent sliver of the next card was tried and reverted, and nothing
 * here disturbs that. This is air during the gesture only.
 */
const PAGE_GUTTER = Spacing.three;

/**
 * How far a page fades as it leaves. See `Page`.
 *
 * ---------------------------------------------------------------------------
 * IT IS A FADE AND NOT A SCALE, AND THAT WAS LEARNED THE HARD WAY
 * ---------------------------------------------------------------------------
 *
 * The leaving page used to give up 6% of its size as well as half its opacity,
 * which is the standard carousel move and reads well in the abstract. On this
 * card it produced two separate defects on a real phone, and they have one
 * cause: the card is a ROUNDED CLIP WITH A BORDER, and scaling one of those
 * resamples both.
 *
 *   THE BORDER FLICKERED. At the hairline it was, a 0.33pt line scaled to 0.94
 *   lands at 0.31 — under a physical pixel, so it winked in and out along the
 *   edge as the card moved. `ContestCard.styles.card` covers that half: the
 *   outline is a whole point now, which survives the arithmetic.
 *
 *   THE CORNERS BROKE UP. That half cannot be fixed by making the line thicker.
 *   A corner is an antialiased mask, and rescaling an antialiased curve every
 *   frame gives you a different approximation of it every frame — the curve
 *   crawls. It is at its worst on exactly the geometry this card has: a tight
 *   radius, a bright line on it, and a dark page behind.
 *
 * So the scale is gone and the fade does the work alone. Nothing was really
 * lost: the 32pt gutter is what separates the two cards mid-drag, and the fade
 * is what ranks them. The scale was ranking them a second time, in the one
 * currency this card cannot pay in.
 */
const PAGE_FADE = 0.5;

/**
 * How far off a page has to be before it starts to dim at all.
 *
 * ---------------------------------------------------------------------------
 * A PAGE AT REST MUST BE AT EXACTLY 1, NOT AT 0.997
 * ---------------------------------------------------------------------------
 *
 * A paged scroll does not always come to rest on a whole number of pages: it
 * settles a fraction of a point off, and it stays there. Without a deadzone
 * that fraction goes straight into the fade, so the card in front of you sits
 * at an opacity a hair under 1 — invisible as brightness, and NOT invisible as
 * geometry, because a view at opacity 1 is composited in place while a view at
 * 0.997 is rendered offscreen and blended. The offscreen pass resamples the
 * card's edges, so its one-point border and its rounded corners come back very
 * slightly softer, and the card reads as fractionally smaller than the one you
 * just came from. That was reported as "an extremely subtle difference in size
 * between the cards", and the cards are the same size to the point.
 *
 * A twentieth of a page is far more than any settle residual and far less than
 * any real drag, so the page you are on is exactly 1 and the fade still starts
 * the instant a swipe is under way.
 */
const PAGE_HOME = 0.05;

/** Captured once, because a worklet cannot read a getter off a module. */
const WEB = Platform.OS === "web";

/**
 * One pip on the rail's pager.
 *
 * 16, and it has come down twice from 24. At 24 in a filled tray the rack was
 * the heaviest object on the row and read as the row's subject — which was true
 * when it drew the run's own hearts and stopped being true when the masthead
 * took that over. A page indicator outranks nothing; it reports where you are.
 *
 * The second cut is what the rest of the row bought. With the tray gone, the
 * edge chevrons gone and the left-hand door down to bare words, 20 was again
 * the loudest thing in a row of quiet ones.
 *
 * IT DOES NOT GO BELOW THIS. A pip is a drawn heart with a blade through it or
 * a tear down it, and those are shapes rather than dots — `Hearts` faceted the
 * silhouette precisely so its edges would hold at small sizes, and 16 is where
 * that argument was being made. The floor is legibility, not taste.
 */
const PIP_SIZE = 16;

export function ContestCarousel({
  contests,
  index,
  onIndexChange,
  onOpen,
  lockAt,
  locked,
  now,
  run,
  width,
}: {
  contests: MyContest[];
  index: number;
  onIndexChange: (i: number) => void;
  /**
   * Opening a card's contest — its format, its price, how full it is, and the
   * way out of it.
   *
   * THE CARD IS THE HANDLE FOR THE CONTEST, which it was not before: it drew a
   * standing and could not be pressed, so the only route to a contest's terms
   * was the lobby — and the lobby deliberately lists only what you are NOT in.
   * A contest you had entered had no page at all once you were in it.
   */
  onOpen?: (contest: MyContest) => void;
  lockAt: string | null;
  locked: boolean;
  now: number;
  /**
   * The run, for the rack under the card. Null while it loads, and drawn only
   * while the run has hearts to draw — a dead one awaiting its carry shows
   * nothing here, exactly as the masthead used to decide. See the foot.
   */
  run: PlayerState["run"];
  /**
   * The measured width of the column this sits in.
   *
   * MEASURED BY THE PARENT, not derived from the window. `Screen` caps its
   * content at a `ContentMeasure` and the rail eats 236 more on wide web, so
   * a page width computed from `useWindowDimensions` is wrong by hundreds of
   * points on a desktop — the same arithmetic the inventory grid's header
   * warns against restating.
   */
  width: number;
}) {
  const listRef = useRef<FlatList<MyContest>>(null);
  const { width: windowWidth } = useWindowDimensions();
  /* Before the parent has measured, fall back to the window rather than to
     zero: a zero-width page makes `getItemLayout` divide by nothing and the
     list snaps to index NaN. The window is the screen, so the COLUMN it stands
     in for is the window less the two gutters `Screen` pads it by.

     A PEEK WAS TRIED HERE — a sliver of the next card at the right edge, in
     place of the page dots. It is the standard carousel affordance and it was
     wrong for this card: at any width big enough to read as another card, the
     bordered slab at the edge looks like a layout fault rather than a hint, and
     at any width small enough not to, it reads as a rendering seam. Full-width
     pages, and the swipe is advertised some other way. */
  const column = width > 0 ? width : Math.max(0, windowWidth - PAGE_GUTTER * 2);

  /**
   * The stride: one page, which is the card plus a gutter either side.
   *
   * EVERYTHING PAGES ON THIS and nothing pages on the card's width any more —
   * `getItemLayout`, the settle's rounding, `goTo`'s offset and the stage's own
   * frame. `pagingEnabled` snaps by the SCROLLER's width rather than by the
   * item's, so the stage bleeding into `Screen`'s padding is not cosmetic: it
   * is what keeps the frame and the item the same size and the snap on a real
   * page. See `PAGE_GUTTER`.
   */
  const step = column + PAGE_GUTTER * 2;

  /* A dead run draws no rack, which is the masthead's old rule and its reason
     holds here too: an empty rack is the death screen's line to deliver, and
     three hollow pips inside a contest card would be a worse way to say it. */
  const rack = run && !run.awaitingCarry ? run : null;

  /**
   * WHICH PAGE, which is not the same question as which CONTEST.
   *
   * The last page is the lobby tile, and landing on it must not change the
   * board underneath — a reader looking at "enter a new contest" still has the
   * last contest's lineup below them, and swapping it for nothing would empty
   * the screen behind an invitation. So the page is tracked here and
   * `onIndexChange` fires only for the pages that are contests.
   *
   * ---------------------------------------------------------------------------
   * IT IS NOT THE SAME THING AS THE INDEX THE BOARD LOADS
   * ---------------------------------------------------------------------------
   *
   * `page` is what the RAIL points at; `index` is what the LINEUP is for. They
   * used to move together at the moment the scroll settled, so on a phone the
   * rail sat pointing at the card you had just left for the whole length of a
   * flick — the one moment the reader is actively asking "which one am I going
   * to".
   *
   * The two now change at different times on purpose, because the two costs are
   * not the same. Swapping the lit pip is a repaint. Swapping the board is a
   * query, eight rows of cards, and a scroll position — doing that at the
   * halfway point of a drag would fire it for every card you flick past on your
   * way to the fourth one, and undo them all if you let go early.
   *
   * So the pip crosses when the scroll crosses (see `crossTo`) and the board
   * follows when it lands (see `settleTo`). The rail leads the board by about
   * a third of a second, which is exactly the interval in which the reader has
   * decided and the app has not caught up.
   *
   * Adjusted DURING RENDER when the parent moves the index — arriving from the
   * contest sheet on a particular card — which is React's own pattern for
   * "state derived from a prop that can also change on its own". Same
   * construction, and same reasoning, as `lastPage` in `Screen`.
   */
  const [page, setPage] = useState(index);
  const [lastIndex, setLastIndex] = useState(index);
  if (index !== lastIndex) {
    setLastIndex(index);
    setPage(index);
  }

  /**
   * WHERE THE LIST ITSELF IS, which is not always where `index` says.
   *
   * `page` cannot answer this: the render-time adjustment above sets it from
   * the `index` prop, so by the time an effect could compare them they already
   * agree. This is written only by the two things that actually move the
   * scroller — a settle and a `goTo` — so a change of `index` that neither of
   * them caused is exactly a change driven from OUTSIDE the carousel, and that
   * is the one case the list has to be told about.
   *
   * The case that made it necessary: "Play this week" on the recap board, which
   * is under the carousel and sets the parent's index. Without this the board
   * changed to the live week and the card above it stayed on the finished one —
   * a card over somebody else's lineup, which is the single bug this component
   * exists to prevent.
   */
  const settledAt = useRef(index);

  /**
   * WHERE THE SCROLLER IS, live and fractional — the input the pages fade on.
   *
   * A shared value rather than state because it changes every frame of a drag,
   * and nothing in React should hear about that. What React hears is the same
   * fact ROUNDED — `page`, once per crossing — which is a handful of updates a
   * swipe rather than one a frame.
   *
   * IN PAGES, NOT IN POINTS, and that is not a convenience. `step` is measured,
   * so it is wrong on the first render and right on the second; an offset in
   * points would therefore need re-scaling the moment the column was measured,
   * and the only writer is a scroll handler that does not run until something
   * moves. In pages the seed is just `index` — true at any width, including a
   * width nobody has measured yet.
   *
   * WRITTEN IN EXACTLY ONE PLACE, the handler below. A programmatic jump does
   * not need a second writer: `scrollToOffset` emits a scroll event on both
   * platforms this ships to, so the handler hears about a heart tap the same
   * way it hears about a thumb.
   */
  const offset = useSharedValue(index);

  /**
   * WHICH PAGE JS HAS BEEN TOLD ABOUT, so it is told once per crossing.
   *
   * The handler runs every frame; `crossTo` is a `setState`. Without this the
   * worklet would hop the bridge sixty times a second to hand React the same
   * number it already has. Kept on the UI thread beside the offset it is
   * derived from, so the comparison happens where the value is.
   */
  const shown = useSharedValue(index);

  /**
   * "The scroll has crossed onto page N." The rail's half, and only the rail's.
   *
   * It fires the moment the scroll passes the halfway mark, which is the point
   * at which the snap is already decided — so the lit pip names the card you
   * are going to land on rather than the one you are leaving.
   *
   * NOTHING BELOW THE CARD HEARS THIS. It does not touch `settledAt` and it
   * does not call `onIndexChange`; a page you flick through on the way to
   * another one should light its pip in passing and never load its lineup.
   */
  const crossTo = useCallback(
    (next: number) => {
      /* EVERY PAGE IS A CONTEST NOW. The list used to carry one more — the
         lobby tile as a footer — and every bound here was `contests.length`
         rather than the last index because of it. */
      if (next < 0 || next > contests.length - 1) return;
      setPage(next);
    },
    [contests.length],
  );

  /* "The scroll has settled on page N." Native is told by momentum end, web by
     the scroll stream. Idempotent — it compares against the current index and
     returns — which is what lets web hand it every tick of a drag. */
  const settleTo = useCallback(
    (next: number) => {
      if (next < 0 || next > contests.length - 1) return;
      settledAt.current = next;
      setPage(next);
      if (next !== index) onIndexChange(next);
    },
    [contests.length, index, onIndexChange],
  );

  const onSettle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      settleTo(Math.round(e.nativeEvent.contentOffset.x / step));
    },
    [settleTo, step],
  );

  /**
   * THE SCROLL ITSELF, ON THE UI THREAD.
   *
   * This is the only listener the list has on `onScroll`, and it does two jobs
   * that used to want different platforms:
   *
   *   THE FADE is every platform's, and it is why the handler is a worklet at
   *   all. A JS-thread `onScroll` driving it would be a frame behind the thumb
   *   by construction, and a carousel whose cards lag the gesture is the thing
   *   this component was being accused of. On the UI thread the shared value
   *   and the finger are the same clock.
   *
   *   THE CROSSING is every platform's too, and it is the reason the rail can
   *   keep up with a thumb the board cannot. Guarded on `shown`, so it reaches
   *   JS once per page rather than once per frame.
   *
   *   THE SETTLE is web's alone, and for the reason the header sets out:
   *   `onMomentumScrollEnd` is inert under react-native-web, so web has to read
   *   a page change out of the scroll stream. Native must NOT — a settle mid-
   *   drag would swap the board underneath a card still moving, which is a
   *   behaviour change to the platform that already works.
   *
   * `WEB` is captured, not read inside the worklet: `Platform.OS` is a getter
   * on a module object and worklets get a frozen copy of what they close over.
   */
  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (e) => {
        const at = e.contentOffset.x / step;
        offset.value = at;

        const next = Math.round(at);
        if (next !== shown.value) {
          shown.value = next;
          runOnJS(crossTo)(next);
        }

        if (WEB) runOnJS(settleTo)(next);
      },
    },
    [step, crossTo, settleTo],
  );

  /**
   * Drive the carousel from somewhere other than a swipe — today, a tap on a
   * heart. Moves the list AND the state, because a programmatic scroll fires no
   * settle event on web.
   */
  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next > contests.length - 1) return;
      /**
       * NOT ANIMATED, and that is a correctness fix rather than a taste one.
       *
       * On web this component listens on `onScroll` directly (see the header —
       * `onMomentumScrollEnd` never fires there), so an animated programmatic
       * scroll emits a stream of intermediate offsets and the FIRST of them,
       * still reading ~0, ran `onSettle` and put the page straight back where it
       * started. The tap moved the list a couple of points and snapped home.
       *
       * A jump lands on the target before any scroll event is dispatched, so the
       * settle that follows agrees with the state instead of fighting it. It also
       * happens to be the better interaction: a tap is a direct instruction and
       * should not make the reader watch it being carried out.
       */
      listRef.current?.scrollToOffset({ offset: step * next, animated: false });
      settledAt.current = next;
      setPage(next);
      if (next !== index) onIndexChange(next);
    },
    [step, contests.length, index, onIndexChange],
  );

  /**
   * FOLLOW AN INDEX THAT CAME FROM OUTSIDE. A jump rather than an animation,
   * for the same reason `goTo` jumps — on web an animated programmatic scroll
   * emits intermediate offsets that `onSettle` reads as a swipe back.
   *
   * The COLUMN is measured, so it is 0 for the first frame; scrolling on that
   * would land everything at offset 0 and record it as the truth. `step` cannot
   * be tested for it — a page is the column plus two gutters, so it is 32 even
   * when nothing has been measured at all.
   */
  useEffect(() => {
    if (column <= 0 || settledAt.current === index) return;
    settledAt.current = index;
    listRef.current?.scrollToOffset({ offset: step * index, animated: false });
  }, [index, step, column]);

  /**
   * WHICH PIPS EACH CONTEST IS HOLDING — one span per card, computed once for
   * the whole carousel.
   *
   * IT USED TO BE COMPUTED FOR THE PAGE YOU WERE ON, because there was one rack
   * on the screen and it belonged to the carousel rather than to a card. Now
   * each card carries its own foot, so each needs its own span and the answer is
   * a list rather than a lookup — which is the honester shape anyway: the
   * mapping was always per contest, and reading it out of the current page was
   * how the rack came to live outside the object it described.
   *
   * Nothing in the schema maps a heart to a contest — `run.wagered` is a count —
   * so the mapping is made here and made consistently: `Hearts` draws wagered
   * pips FIRST, so stakes fill from pip 0 rightward and contests take them in
   * carousel order. The count is the database's; only the order is ours, and it
   * is stable because the carousel's order is.
   *
   * The cursor walks every contest, including free ones, so a contest's span
   * never depends on how many free contests precede it.
   *
   * ONLY A CONTEST YOU ARE ACTUALLY IN HOLDS A HEART, and getting that wrong is
   * what made the rail stop pointing at anything.
   *
   * The walk used to run over EVERY card and bound itself by `run.wagered`. That
   * held while the carousel only ever drew contests you had entered. It stopped
   * holding the moment the free contest became unconditional (`20260830030000`):
   * an unentered free contest sat at position 0, consumed the run's one stake,
   * and every contest after it fell past the bound and got `null` — so on the
   * Flex Three card the reader had actually entered, the rail highlighted
   * nothing and the line read "3 hearts" instead of "1 of 3 staked".
   *
   * So the test is `lineupId`, which is the entry itself, and `recap` is
   * excluded because a finished week's heart is already settled — spent or
   * returned — and pointing at a pip for it would be pointing at a stake that
   * no longer exists.
   *
   * Null on a contest that risks nothing, and null past the hearts held: a
   * stake with no pip behind it gets no highlight rather than a borrowed one.
   */
  /**
   * ONE PIP PER CARD, IN THE CAROUSEL'S ORDER — the whole rail, in one walk.
   *
   * This was three separate derivations that had to agree: a `receipts` list, a
   * `spans` list mapping contests to rack indices, and a `pipPage` list mapping
   * rack indices back to contests. They agreed by being written carefully,
   * which is the same as not agreeing — the free contest becoming unconditional
   * put a card on the board that consumed no heart, and the two lists quietly
   * fell out of step: four cards, three pips, and a card that lit nothing when
   * you swiped to it.
   *
   * One walk cannot fall out of step with itself. `pips[i].contest` IS the
   * mapping in both directions, and `spanFor` reads it back.
   */
  const pips = contests.flatMap((ct, contest) =>
    Array.from({ length: Math.max(0, ct.heartsAtRisk) }, () => ({
      contest,
      /* A settled contest shows how it went; a live one shows whether you are
         in it. `lineupId` is the entry itself — the fee lands on the first
         submission, so it is null right up until you file. */
      result: ct.recap ? ct.field.result : null,
      entered: ct.lineupId !== null,
    })),
  );

  const spanFor = (contest: number): HeartSpan | null => {
    const start = pips.findIndex((p) => p.contest === contest);
    if (start < 0) return null;
    return { start, count: pips.filter((p) => p.contest === contest).length };
  };


  /**
   * NO CARDS IS STILL A RAIL, and the rail is the way out.
   *
   * This returned null, which took the lobby down with the cards — a player
   * whose week had rolled over got eight empty slots and no way to enter
   * anything. It then returned the lobby TILE, then the rail's labelled door,
   * each for the same reason.
   * THAT WHOLE CLASS OF BUG IS NOW SOMEBODY ELSE'S. The way into contests is
   * the Compete strip, one row above this component and outside it, so no
   * state this file can reach — an empty week included — can take it away. The
   * rail is kept here because the RACK is still worth drawing with no cards;
   * it is no longer load-bearing as an exit.
   *
   * `my_contest_cards` always returns the free contest, so this should be
   * unreachable — it is kept because the next thing to empty the list will not
   * announce itself either.
   */
  if (contests.length === 0) {
    return rack ? (
      <RunRail
        pips={[]}
        focus={null}
        onGo={goTo}
      />
    ) : null;
  }

  return (
    <View>
      {/* THE STAGE: the pages, spread into the screen's own padding so they
          have a gutter between them. See `PAGE_GUTTER`. */}
      <View style={styles.stage}>
        <AnimatedList
          ref={listRef}
          data={contests}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onSettle}
          /* Every platform, now that the handler is a worklet: the fade needs
             the offset on every frame, and the settle inside it is still web's
             alone. See `onScroll`. */
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyExtractor={(item: MyContest) => item.id}
          getItemLayout={(_: unknown, i: number) => ({
            length: step,
            offset: step * i,
            index: i,
          })}
          /* OPENS ON THE LINKED CARD, not on the first one. Arriving from the
             contest sheet means the reader has just chosen a contest, and a
             carousel that marked it active while showing the free contest's card
             would be the same mismatch this component exists to fix — one rank
             down. Safe with `getItemLayout` supplied; without it the list cannot
             measure ahead and silently ignores this. */
          initialScrollIndex={index}
          renderItem={({
            item,
            index: i,
          }: {
            item: MyContest;
            index: number;
          }) => (
            <Page i={i} step={step} offset={offset}>
              <Card
                contest={item}
                onOpen={onOpen}
                {...{ lockAt, locked, now }}
              />
            </Page>
          )}
        />
      </View>
      {rack ? (
        <RunRail
          pips={pips}
          focus={spanFor(page)}
          onGo={goTo}
        />
      ) : null}
    </View>
  );
}

/**
 * The scroller, animated — the same `FlatList`, with a UI-thread `onScroll`.
 *
 * Declared at module scope because `createAnimatedComponent` builds a NEW
 * component type every time it runs, and a new type inside a render is a
 * different element on every pass: React unmounts the list and remounts it,
 * which on a pager means the scroll position goes back to zero mid-swipe.
 */
const AnimatedList = Animated.FlatList;

/**
 * One page: the card, its two gutters, and how far it has faded.
 *
 * ---------------------------------------------------------------------------
 * THE PAGE MOVES; THE CARD DOES NOT KNOW
 * ---------------------------------------------------------------------------
 *
 * The animated style is on the PAGE rather than on the card, so the card itself
 * stays a card: no animated props, no shared values, no knowledge that it is on
 * a carousel at all. `ContestCard` is drawn in three other places and none of
 * them should have to carry this.
 *
 * `away` is how many pages from home this one is, clamped to one. It is 0 for
 * the page in front of you and 1 for anything fully off the screen, so at rest
 * exactly one page is at full opacity and every other page is parked at the far
 * end of the interpolation, motionless.
 *
 * The clamp is what keeps a five-card week cheap: pages beyond the neighbour do
 * not carry on dimming, they simply sit at the floor. `PAGE_HOME` is the same
 * idea at the other end, and it is not cosmetic — see the constant.
 */
function Page({
  i,
  step,
  offset,
  children,
}: {
  i: number;
  step: number;
  offset: SharedValue<number>;
  children: ReactNode;
}) {
  const fade = useAnimatedStyle(() => {
    const away = Math.abs(offset.value - i);
    if (away < PAGE_HOME) return { opacity: 1 };
    return { opacity: 1 - PAGE_FADE * Math.min(1, away) };
  });

  return (
    <Animated.View style={[styles.page, { width: step }, fade]}>
      {children}
    </Animated.View>
  );
}

/**
 * The run, under the whole carousel: what you hold, what is riding, and which
 * heart belongs to the card above.
 *
 * ---------------------------------------------------------------------------
 * IT IS UNDER THE CAROUSEL BECAUSE A RUN DOES NOT SWIPE
 * ---------------------------------------------------------------------------
 *
 * This has now lived in three places, and the first two were both wrong for the
 * same reason at different scales.
 *
 * In the MASTHEAD it stated your hearts on Collection and Players — screens
 * where a heart cannot be won or lost — beside a coin balance, with nothing
 * linking it to the contest actually risking one.
 *
 * As a BAND OF THE CARD it was adjacent to the right thing and still lied about
 * ownership: the rack was rendered once per page, so the identical three hearts
 * slid off the screen and three more slid on every time you swiped. A run does
 * not change when you change which contest you are looking at. Drawing it
 * inside the thing that moves said that it did.
 *
 * Here the rack is FIXED and only the highlight travels. The motion now tells
 * the truth — the run stays, the stake moves — which is the whole reason the
 * mapping is worth drawing at all.
 *
 * (The intermediate objection is still real and is why this is not a panel: a
 * bordered, filled, rounded box under a bordered, filled, rounded card is a
 * second card, and two cards argue about which one matters. This is a hairline
 * and a row. No border, no fill, no radius.)
 *
 * ---------------------------------------------------------------------------
 * ONE ROW, AND WHAT WAS CUT TO GET IT
 * ---------------------------------------------------------------------------
 *
 * The band version was three rows — a `YOUR RUN` label, the rack, and a caption
 * — and two of them were not carrying anything.
 *
 * The LABEL went because the count is the fact. "Wagering 2 of 3 hearts" needs
 * no heading; `YOUR RUN` was a title for a thing that is self-evidently your
 * run.
 *
 * The CONTEST NAME under the lit heart went because the card directly above the
 * rail already says it. Naming it twice, eight points apart, to explain a
 * highlight whose subject is the only card on screen.
 *
 * What is left is the rack on the left and two lines of text on the right, and
 * those two lines have different sources on purpose:
 *
 *   LEAD  is the RUN's state — how much of what you hold is committed. True
 *         wherever you are in the carousel; it does not change as you swipe.
 *   SUB   is the PAGE's meaning — what the contest in view does to you. This
 *         is the half that changes under your thumb.
 *
 * So the row answers "where do I stand" and "what does this one cost" without
 * either question borrowing the other's words.
 *
 * ---------------------------------------------------------------------------
 * EVERY PAGE LIGHTS SOMETHING
 * ---------------------------------------------------------------------------
 *
 * A contest that stakes a heart lights that heart. The free contest lights
 * nothing and says so. And the lobby tile — the last page, the app's main call
 * to action — lights every heart you have NOT spent, dashed, in the same
 * language as the tile's own dashed border.
 *
 * That last case is why free hearts needed a state of their own. "Enter a new
 * contest" is an invitation to spend something, and before this the thing being
 * spent was drawn nowhere near it.
 */
function RunRail({
  pips,
  focus,
  onGo,
}: {
  /** One per card on the board, in the carousel's order — see `ContestHearts`. */
  pips: { contest: number; result: HeartResult | null; entered: boolean }[];
  focus: HeartSpan | null;
  onGo: (page: number) => void;
}) {
  /* WHAT IS LEFT OF THIS ROW IS A READOUT.
     It used to end in the lobby door and open with a `+` shortcut to the same
     place, and most of the argument that lived here was about how to rank those
     two against each other — which of them took the accent, how big the chip
     could be before it out-shouted the card above it. All of that went with the
     doors: contests are the Compete strip's second tab now, so the row has no
     call to action left to balance and no gold to spend. It says how many
     hearts are riding and which contest each one belongs to. */
  return (
    <View style={styles.rail}>
      {/**
       * THE RACK, CENTRED, AND IT IS THE ONLY THING ON THIS ROW.
       *
       * ---------------------------------------------------------------------
       * CENTRING IS BACK BECAUSE THE ROW IS BALANCED AGAIN
       * ---------------------------------------------------------------------
       *
       * This has moved three times and each move was answering the row it was
       * in, not the rack itself. It sat in a filled pill at the left to enclose
       * a hundred points of dead space; the pill read as a panel of status, so
       * it went and the rack took the column's true centre between two doors.
       * Then both doors moved to one end, and a centred pager would have
       * floated in the middle of nothing — so it went left to join them.
       *
       * The doors are gone entirely now (they are the Compete strip's second
       * tab), which removes the thing it was aligning ITSELF AGAINST. Left with
       * one object on the row, left-alignment is not a choice any more, it is
       * the residue of a layout that no longer exists — the pips sat where a
       * door used to be beside them. Centred, the rack reads as what it is: a
       * caption under the card, on the card's own axis.
       *
       * THE COUNT IS NOT HERE and does not come back. It lives in `AppHeader`,
       * because a heart is stakeable from screens this rail is not on and a
       * count that exists on one board is a count you have to go and look up.
       * The rack stayed because none of what it carries — a pip per card,
       * free/wagered/killed, each a link to its contest — survives at masthead
       * size. Held travels; riding stays.
       *
       * THE RACK IS STILL THE HALF THAT GIVES. `minWidth: 0` and the clip on
       * `pager`: a week with eight cards squeezes the pips, and with nothing
       * else on the row there is nothing else it could squeeze. Once they fill
       * the width, centring is a no-op and the clip takes over — the two
       * behaviours hand off without a breakpoint.
       */}
      <View style={styles.pager}>
        <ContestHearts
          entries={pips}
          focus={focus}
          size={PIP_SIZE}
          onPress={(i) => onGo(pips[i].contest)}
        />
      </View>
    </View>
  );
}

/**
 * One card — the shared `ContestCard`, handed this contest's facts.
 *
 * THIS FUNCTION COMPOSES NOTHING NOW. It used to assemble a `Figure` for the
 * head's right column and a `Standing` for the middle, which meant the board
 * held two thirds of the card's layout and the lobby held its own copy of the
 * other third. The card owns all three bands — its height is a contract, and a
 * caller passing nodes is a caller who can break it — so what is left here is a
 * mapping from `MyContest` to `Entry` and nothing else.
 */
function Card({
  contest,
  lockAt,
  locked,
  now,
  onOpen,
}: {
  contest: MyContest;
  lockAt: string | null;
  locked: boolean;
  now: number;
  onOpen?: (contest: MyContest) => void;
}) {
  const terms = termsOfEntry(contest);

  /**
   * THE WEEK IS OVER, SO THE TRADE BAND CHANGES TENSE. See `stakedTokens`.
   *
   * KEYED ON THE WEEK BEING FINAL, NOT ON `recap`. `recap` means the board has
   * moved on to a new slate, which happens days after the last whistle — so
   * gating on it would leave a card offering a heart it had already resolved
   * for the whole of Monday and Tuesday, which is exactly when a player is
   * looking at it. The test is the same one `LockTag` draws FINAL from, and for
   * the same reason: a stored nought is not a played week, so the field's best
   * score is what proves anybody turned up.
   *
   * The two figures inside it are settlement's own and are never derived here —
   * `result` from `contest_results`, `myCoins` from the slots the payout stamped.
   * Both are legitimately null for a while after the whistle, and the model
   * words that state rather than guessing at it.
   */
  const settled = settlementOf(contest);

  return (
    <ContestCard
      /* THE CONTEST'S OWN NAME, on every card. The free one is called
         "Preseason Week 4", so the week label this used to draw was the same
         string arriving by a different route — and on a lobby card it was a
         week the screen above already states. */
      name={contest.name}
      terms={terms}
      /**
       * A RECAP CARD SAYS WHICH WEEK IT IS, in the corner the live cards spend
       * on a countdown.
       *
       * A lobby contest is named after its FORMAT, so once last week's entries
       * stayed on the board the carousel could hold two cards both titled "Flex
       * Three" — one to enter, one to read — and swiping between them was
       * genuinely confusing. The countdown that corner usually carries is
       * meaningless on a finished week, so the slot was free.
       *
       * It replaces the FINAL tag rather than joining it: the head reserves one
       * row there, and the scoring band under it already draws a settled score
       * and a W or an L. "Which week" is the fact that was missing.
       */
      period={contest.recap ? contest.weekLabel : undefined}
      lock={{ at: lockAt, locked, now }}
      entry={{
        myPoints: contest.field.myPoints,
        /* WHERE THE WEEK IS HEADING, both halves of it. Before kickoff the card
           compares these two instead of drawing a nought against a dash — see
           the tense note on `ContestCard`. Both are null on a week the provider
           does not forecast, and the band goes back to what it always drew. */
        projected: contest.myProjected,
        forecast: contest.projField,
        field: contest.field,
        cut: contest.cut,
      }}
      prize={contest.myPrize}
      settled={settled}
      onPress={onOpen ? () => onOpen(contest) : undefined}
    />
  );
}

const styles = StyleSheet.create({
  /**
   * The run's row: a tray that stretches, and a button that does not.
   *
   * NO RULE ABOVE IT. It had a hairline, on the reasoning that a divider
   * separates the carousel's chrome from the run. There is no chrome left to
   * separate from — the dots are gone — so the line was drawing a boundary
   * between a card and the only other thing on the screen, which is exactly the
   * "second container" mistake that got the rack thrown out of a panel in the
   * first place. Space does the separating.
   */
  /**
   * THE RAIL: a door, a pager, a door.
   *
   * NO RULE ABOVE IT. It had a hairline, on the reasoning that a divider
   * separates the carousel's chrome from the run. There is no chrome left to
   * separate from, so the line was drawing a boundary between a card and the
   * only other thing on the screen — which is exactly the "second container"
   * mistake that got the rack thrown out of a panel in the first place, and
   * then out of a tray. Space does the separating.
   *
   * NO `gap`. The two flanks already own every point that is not the pager, so
   * a gap would be adding space to a row whose spare space is the layout.
   */
  /**
   * TWO GROUPS, and the gap between them is whatever is left.
   *
   * `gap` here is a FLOOR and not the spacing: the run grows into the slack, so
   * on any normal week the doors are hard against the right edge and the joint
   * is a hundred points wide. It only does anything on the week that fills the
   * row, where it is what stops the last pip touching the first `+`.
   */
  rail: {
    flexDirection: "row",
    alignItems: "center",
    /* The rack is the row's only object, so the row's centre is its centre —
       see the note at the render. */
    justifyContent: "center",
    paddingTop: Spacing.two + 2,
    gap: Spacing.three,
  },
  /* The rack. `overflow: hidden` is the interim answer to a week with more
     cards than the row can hold — a clipped pager is recoverable by swiping,
     and the alternative is pushing a door off the screen. The real answer is to
     let it scroll, which is worth doing the week a board can hold eight. */
  pager: { flexShrink: 1, minWidth: 0, overflow: "hidden" },
  /**
   * THE PAGER, SPREAD BACK OVER `Screen`'s PADDING.
   *
   * The negative margin is the same one `LineupEditor.bleed` uses on the boards
   * below, and for a related reason: this is the only way the pages get a gap
   * between them without the card paying for it. The card is unmoved — the 16
   * points come back immediately as each page's own padding. See `PAGE_GUTTER`.
   */
  stage: { position: "relative", marginHorizontal: -PAGE_GUTTER },
  /* One page. The card sits in the middle of it with a gutter either side, and
     the gutters are what you see between two cards mid-drag. */
  page: { paddingHorizontal: PAGE_GUTTER },
});
