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
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { ContestCard } from '@/components/contests/ContestCard';
import { settlementOf } from '@/components/contests/contest-model';
import { termsOfEntry, type MyContest } from '@/components/contests/use-my-contests';
import { ContestHearts, Heart, type HeartResult, type HeartSpan } from '@/components/runs/Hearts';
import { useIsWide } from '@/components/shell/useResponsive';
import { DoorChip, Plus } from '@/components/ui/DoorChip';
import { Colors, NUMERIC, Spacing, selectionAccent } from '@/constants/theme';
import type { PlayerState } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
const WEB = Platform.OS === 'web';

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
  onEnter,
  onPacks,
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
  run: PlayerState['run'];
  /**
   * Open the contests screen, on one of its shelves.
   *
   * IT STILL TAKES A SHELF even though the rail only ever asks for `open`. The
   * archive was the left-hand door on this row and it is gone — a shortcut to a
   * view one tap inside the room the other door opens — but `contests.tsx` is
   * three views behind one route and a recap link elsewhere still arrives at
   * the same screen by the same param. Narrowing this to a bare callback would
   * hide that the destination has shelves at all.
   */
  onEnter: (view: 'open' | 'history') => void;
  /**
   * The pack shop, over this board — the same `/packs` sheet `PacksButton`
   * pushes from the collection.
   *
   * A CALLBACK RATHER THAN A ROUTER, like `onEnter` and `onOpen` beside it:
   * this file draws a rail and knows nothing about where the app keeps its
   * sheets, and the one page that mounts the carousel already owns every other
   * push on the screen.
   */
  onPacks: () => void;
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
   * Hearts riding on a live entry, which is what the free count is measured
   * against. Settled contests do not hold one — theirs came back or did not —
   * and a contest you have not entered has not taken one yet.
   */
  const committed = contests.reduce(
    (n, ct) => n + (!ct.recap && ct.lineupId !== null ? Math.max(0, ct.heartsAtRisk) : 0),
    0,
  );

  /**
   * NO CARDS IS STILL A RAIL, and the rail is the way out.
   *
   * This returned null, which took the lobby down with the cards — a player
   * whose week had rolled over got eight empty slots and no way to enter
   * anything. It then returned the lobby TILE for the same reason. The tile is
   * gone (see the note on `onEnter`) and the argument is unchanged: whatever
   * empties this list must not also remove the door. The rail carries it now.
   *
   * `my_contest_cards` always returns the free contest, so this should be
   * unreachable — it is kept because the next thing to empty the list will not
   * announce itself either.
   */
  if (contests.length === 0) {
    return rack ? (
      <RunRail
        run={rack}
        committed={committed}
        pips={[]}
        focus={null}
        onGo={goTo}
        onEnter={onEnter}
        onPacks={onPacks}
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
          getItemLayout={(_: unknown, i: number) => ({ length: step, offset: step * i, index: i })}
          /* OPENS ON THE LINKED CARD, not on the first one. Arriving from the
             contest sheet means the reader has just chosen a contest, and a
             carousel that marked it active while showing the free contest's card
             would be the same mismatch this component exists to fix — one rank
             down. Safe with `getItemLayout` supplied; without it the list cannot
             measure ahead and silently ignores this. */
          initialScrollIndex={index}
          renderItem={({ item, index: i }: { item: MyContest; index: number }) => (
            <Page i={i} step={step} offset={offset}>
              <Card contest={item} onOpen={onOpen} {...{ lockAt, locked, now }} />
            </Page>
          )}
        />
      </View>
      {rack ? (
        <RunRail
          run={rack}
          committed={committed}
          pips={pips}
          focus={spanFor(page)}
          onGo={goTo}
          onEnter={onEnter}
          onPacks={onPacks}
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

  return <Animated.View style={[styles.page, { width: step }, fade]}>{children}</Animated.View>;
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
  run,
  committed,
  pips,
  focus,
  onGo,
  onEnter,
  onPacks,
}: {
  run: NonNullable<PlayerState['run']>;
  /**
   * Hearts held by a live entry, counted off the same walk that placed the
   * highlights — NOT `run.wagered`.
   *
   * `run.wagered` is the server's count and it is right; it just cannot say
   * WHICH card each heart belongs to, and the carousel now draws cards you have
   * not entered. Deriving both from one walk is what stops the rail lighting
   * one heart while the sentence under it counts a different set.
   */
  committed: number;
  /** One per card on the board, in the carousel's order — see `ContestHearts`. */
  pips: { contest: number; result: HeartResult | null; entered: boolean }[];
  focus: HeartSpan | null;
  onGo: (page: number) => void;
  /** The contests screen. See the carousel's prop. */
  onEnter: (view: 'open' | 'history') => void;
  /** The pack shop. See the carousel's prop. */
  onPacks: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);
  /* The rail draws Packs as a row of its own on wide. See the doors. */
  const wide = useIsWide();

  const held = Math.max(0, run.hearts);
  const staked = Math.min(Math.max(0, committed), held);
  const free = held - staked;

  /**
   * A TRAY AND A BUTTON, and the tray is the one that stretches.
   *
   * ---------------------------------------------------------------------------
   * WHAT THIS REPLACED
   * ---------------------------------------------------------------------------
   *
   * First a 22pt `+` in a circle with `1 free · Contests` set beside it. Two
   * objects for one idea: the words carried the meaning and could not be
   * pressed, the circle took the press and said nothing a `+` does not say
   * everywhere. Worse, the text sat hard against the button and read as its
   * label — the one part of the row that looked tappable was the part that was
   * not.
   *
   * Then one gold pill, which fixed the labelling and broke two other things.
   *
   * ---------------------------------------------------------------------------
   * GOLD IS FILLED, BECAUSE IT ONLY MEANS ONE THING NOW
   * ---------------------------------------------------------------------------
   *
   * This spent a while as an outline, and the reason was real: `selectionAccent`
   * was spoken TWICE on this row. The focused heart wore gold corner ticks —
   * this app's mark for "this is the one you are looking at" — so a gold button
   * put "you are here" and "press me" in one hue forty points apart, and the eye
   * could not rank them. Draining the button to a line resolved that without
   * touching the rack.
   *
   * The rack gave up its ticks instead (see `ContestHearts`), and THAT is what
   * earns the fill back. Gold now appears exactly once on this row and means
   * exactly one thing.
   *
   * The other objection to a fill — that a gold slab out-shouts the card it
   * serves — turned out to be an argument about SIZE wearing a colour's clothes.
   * At 32pt with a 13/600 two-word label it did. At 28 with 12/500 and one word
   * it is a chip, and a call to action is allowed to be the brightest chip in a
   * row that is otherwise a status readout.
   *
   * ---------------------------------------------------------------------------
   * THE GLYPH IS THE VERB, SO THE WORD CAN BE THE ROOM
   * ---------------------------------------------------------------------------
   *
   * The label has been "Contests", then "Enter contest", and is now "Contests"
   * again — which is not a circle, because what changed underneath it is the
   * `+`.
   *
   * "Contests" was wrong beside a BARE `+`: two objects, neither of which said
   * what pressing would do. A verb fixed that by making the button a sentence.
   * But a verb over-claims here. `contests.tsx` is not a lobby — it is three
   * views (open contests, `Recent contests`, and a recap reader), so "enter"
   * names one of the things you go there for and hides the other, on a row whose
   * own hearts are already half settled receipts.
   *
   * With a `+` in front the labour divides properly: the GLYPH carries the act,
   * the WORD carries the room. "+ Contests" reads as "a new one" to anyone
   * glancing and as "the contests screen" to anyone reading, which is the only
   * version of this button that has been true of both.
   *
   * ---------------------------------------------------------------------------
   * THE DEAD AIR IS INSIDE SOMETHING NOW
   * ---------------------------------------------------------------------------
   *
   * `space-between` is not composition: it pushed a rack of flat glyphs to one
   * edge and a slab to the other with a hundred points of nothing between, and
   * the row read as two leftovers rather than one thing.
   *
   * The rack now sits in a tray that STRETCHES to just short of the button, so
   * the slack is enclosed rather than spanned. It also solves the growth
   * problem for free: the tray is the flexible box, so a week with eight cards
   * squeezes the hearts and never the door.
   *
   * ---------------------------------------------------------------------------
   * THE FREE COUNT GOES IN THE TRAY, NOT IN THE BUTTON
   * ---------------------------------------------------------------------------
   *
   * The tray is the RUN — what you hold and what is left of it — and the button
   * is the ACT. The count is a fact about the run, so it is the tray's right-hand
   * occupant and the last thing read before the button, which is the position it
   * wants without being mistaken for the label again. The tray's own edge is
   * what keeps that distinction now; before, nothing did.
   *
   * It is not the rack restated. `pips` is one heart per CARD ON THE BOARD —
   * staked, settled, or waiting on a contest you have not entered — so a heart
   * you hold and have promised to nothing appears nowhere in the rack. This
   * count is the only place it exists on the screen, and it is the fact that
   * decides whether the button is worth pressing.
   *
   * NO GLYPH ON IT. A fifth heart drawn inside a rack of pips reads as a fifth
   * pip. The words carry it.
   *
   * When nothing is free the count goes and the button drops to the quiet fill
   * — still there, still pressable, because the screen behind it is worth
   * reading either way, but no longer pointing at a spend the run cannot make.
   */
  /* Whether there is a heart left to spend, which is the only thing the row's
     right-hand end changes with. See the note on the chip. */
  const live = free > 0;

  return (
    <View style={styles.rail}>
      {/**
       * THE RUN, AT THE HEAD OF THE ROW: what you hold, then what is riding.
       *
       * ---------------------------------------------------------------------
       * THE COUNT CAME DOWN FROM THE MASTHEAD
       * ---------------------------------------------------------------------
       *
       * `AppHeader` carried it as a pill beside the coins, and the argument was
       * that a balance belongs to the chrome. It holds for coins, which are
       * spent from every screen in the app. It never held for hearts: a heart
       * is risked by exactly ONE object, that object is the card above this
       * row, and up in the masthead the figure sat on Collection and Players —
       * screens where a heart cannot move — with nothing linking it to anything.
       *
       * Here it is one glance from the pips, and that pairing is the reason to
       * draw it at all: the pill is what you HOLD, the rack is which of them
       * this week has already committed. Neither number says the other.
       *
       * IT IS THE MASTHEAD'S PILL, not a new object — same fill, same glyph,
       * same shape — because a reader who has been looking at it up there for
       * weeks should recognise it, not learn it again. The type steps down to
       * this row's 13/700: a 14/800 figure among 12pt labels and 16pt pips
       * would make the balance the loudest thing on a band whose subject is the
       * card above it.
       *
       * NOT A RACK. `Hearts` would draw five pips here, next to a rack of pips
       * that means something else entirely, and the two would read as one run
       * of ten. A glyph and a number cannot be confused with a page indicator.
       *
       * IT IS A READOUT AND NOT A DOOR. Nothing on the run's own state is
       * pressable — pressing a balance implies somewhere to go, and the place
       * hearts come from is a contest, which is what the far end of this row is
       * for.
       */}
      <View style={styles.run}>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={held === 1 ? '1 heart' : `${held} hearts`}
          style={[styles.held, { backgroundColor: c.surface }]}>
          <Heart size={12} state="free" />
          <Text style={[styles.heldFigure, NUMERIC, { color: c.text }]}>{String(held)}</Text>
        </View>

        {/**
         * THE PAGER, BESIDE THE COUNT RATHER THAN ON THE COLUMN'S CENTRE.
         *
         * ---------------------------------------------------------------------
         * IT WAS IN A TRAY, THEN ON THE MIDDLE, AND BOTH WERE ANSWERING THE
         * ROW IT USED TO BE IN
         * ---------------------------------------------------------------------
         *
         * The rack sat in a filled pill at the left of the row to enclose a
         * hundred points of dead space; the pill read as a panel of status, so
         * it went and the rack took the column's true centre between two doors.
         * Centring was right for a row with a door at each end. This row has
         * both doors at one end, so a centred pager would float in the middle of
         * nothing with the run's own count stranded away from it.
         *
         * SO IT JOINS THE COUNT. Held and riding are two halves of one fact and
         * they now read left to right in that order, which is also the order a
         * player asks them in: how many do I have, how many are already out.
         *
         * THE RACK IS STILL THE HALF THAT GIVES. `minWidth: 0` and a clip here,
         * nothing shrinkable on the pill or the doors: a week with eight cards
         * squeezes the pips and never anything else. That was the tray's one
         * good idea and it has survived both moves.
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

      {/**
       * THE TWO DOORS, TOGETHER AT THE END OF THE ROW.
       *
       * They were at opposite ends — Contests here, previous weeks facing it —
       * and the week door is gone: the contests screen lists its own archive,
       * so the rail was carrying a shortcut to a shelf one tap inside the room
       * it already opens. What is left is a pair of things you GO to, and a pair
       * belongs side by side rather than either side of a readout.
       *
       * PACKS IS HERE BECAUSE THE HEARTS ARE. This band is now the whole answer
       * to "what can I spend, and where" — a heart and the contest that takes
       * it, coins and the shop that takes them — on the screen where a player is
       * already deciding. The collection board has carried `PacksButton` for as
       * long as packs have existed; this is the same door, not a second one,
       * which is why it is the same route and the same word.
       *
       * ORDER IS BY STAKE. Contests risks a heart and is the app's main call to
       * action, so it is read first; packs are the shop, and a shop is what you
       * visit after you know what you need. Swapping them would put a purchase
       * ahead of the play.
       *
       * NOTHING ON WIDE FOR PACKS. The rail carries Packs as a row of its own
       * there, and a second door two inches from the first is the duplication
       * `PacksButton` already refuses to make. Contests has no such row, so it
       * is drawn at every width.
       */}
      <View style={styles.doors}>
        {/**
         * THE WAY INTO ANOTHER CONTEST.
         *
         * The lobby was reachable only by swiping past every card to a tile at
         * the end of the carousel — fine when you are in one contest, a chore
         * when you are in four, and it is the app's main call to action either
         * way. A button at a fixed position under the thumb costs one tap from
         * any page.
         *
         * IT NEVER SHRINKS AND IT NEVER MOVES. The pager beside it is the half
         * that gives. Whatever happens to the left of it, the door stays the
         * same size in the same corner.
         *
         * THE FREE COUNT IS NOT SPELLED OUT, and it no longer has to be. `1
         * free` was a tray's occupant and could not be moved next to this
         * button without reading as its label — but the pill at the head of the
         * row now states what is held, the pips state what is committed, and
         * the difference between them is the answer that phrase was for.
         *
         * ---------------------------------------------------------------------
         * THE GOLD IS ON THE MARK, NOT ON THE SLAB
         * ---------------------------------------------------------------------
         *
         * This has been an outline, then a filled gold pill, and the swing was
         * never really about the button. It was about what else the row was
         * doing. The row has been emptied since — the tray went, the edge
         * chevrons went, the pager came down to 16pt — so the same gold slab
         * that was one strong object among several would now be the only loud
         * thing on a quiet band, sitting directly under the card that is the
         * screen's actual subject.
         *
         * So the pill stays and the fill goes quiet. It has to stay a pill:
         * this is the app's main call to action and the one door to the
         * contests screen. What carries the state is the `+` — struck in the
         * accent when a heart is free, absent when none is. Gold appears once
         * on this screen, at nine points, on the one mark whose whole job is to
         * say the act is voluntary. The packs door beside it takes coins, which
         * are gold everywhere else in the app, so its own `+` is deliberately
         * NOT the accent: two gold marks four points apart would make the row
         * choose between them.
         */}
        <DoorChip
          label="Contests"
          accessibilityLabel={
            live ? `Contests. ${free === 1 ? '1 heart' : `${free} hearts`} free` : 'Contests'
          }
          onPress={() => onEnter('open')}
          fill={c.backgroundElement}
          ink={c.text}
          /**
           * THE `+` LEADS THE WORD, and that is not the `+` that was once
           * removed from this row.
           *
           * What was wrong before was a `+` ALONE: a bare glyph in a row of
           * hearts could add a heart, a card or a slot, and the words that said
           * which sat outside the button where they could not be pressed.
           *
           * Leading a label it has the opposite problem to solve and solves it
           * well — the glyph is what the eye finds at a glance and the noun is
           * what settles the ambiguity, so "a new contest, by choice" arrives
           * in one look instead of a read.
           *
           * DRAWN, NOT TYPED. A `+` glyph sits high in its own line box, so
           * centring it needs a hand-tuned baseline nudge that drifts the first
           * time the type size changes — an earlier circle carried exactly that
           * hack. Two bars cannot drift.
           *
           * IT GOES WHEN NOTHING IS FREE, because by then it is a promise the
           * run cannot keep. Leaving it on would be the one part of the button
           * still offering a new contest to somebody with nothing to stake.
           * What is left is the room's name, which is the half that stays true
           * — there are still recaps in there to read.
           */
          lead={live ? <Plus color={accent} /> : null}
        />
        {wide ? null : (
          <DoorChip
            label="Packs"
            accessibilityLabel="Packs"
            onPress={onPacks}
            fill={c.backgroundElement}
            ink={c.text}
            /* ALWAYS DRAWN, unlike the contests mark. Packs are bought with
               coins and there is always something on the shelf to look at, so
               there is no state in which this door offers something the player
               cannot reach — the shop's own rows say what is affordable. In the
               quiet ink, because the accent is spoken by the button beside it;
               see the note on the doors. */
            lead={<Plus color={c.textSecondary} />}
          />
        )}
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
        /* NO PROJECTIONS EXIST. The slot is real and the value is null — see
           `Entry.projected`. When a pregame number is available this is the one
           line that changes. */
        projected: null,
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.two + 2,
    gap: Spacing.three,
  },
  /**
   * THE RUN: held, then riding.
   *
   * `flexGrow` takes the slack so the doors sit on the right edge, and
   * `flexShrink` with the clip on the pager inside means a crowded week is paid
   * for by the pips alone. The pill does not shrink; a truncated balance is not
   * a balance.
   */
  run: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  /**
   * The masthead's pill, one step quieter. See the note where it is drawn.
   *
   * The geometry is `AppHeader.pill` unchanged — same gap, same padding, same
   * radius — because it IS that object, moved. Only the figure steps down.
   */
  held: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  /* 13/700 against the masthead's 14/800: this row's loudest thing is the card
     above it, and a balance is not allowed to outweigh a page indicator by
     much. Tabular, so a run that drops from 10 to 9 does not shift the pips. */
  heldFigure: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },
  /* The doors, and neither of them ever gives. See the note where they are
     drawn, and `DoorChip` for the chip itself — the collection's toolbar draws
     the same pair, which is why the geometry no longer lives in this file. The
     gap is the chip's own internal one, so the two read as one cluster rather
     than as two buttons that happen to be near each other. */
  doors: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two - 2, flexShrink: 0 },
  /* The rack. `overflow: hidden` is the interim answer to a week with more
     cards than the row can hold — a clipped pager is recoverable by swiping,
     and the alternative is pushing a door off the screen. The real answer is to
     let it scroll, which is worth doing the week a board can hold eight. */
  pager: { flexShrink: 1, minWidth: 0, overflow: 'hidden' },
  /**
   * THE PAGER, SPREAD BACK OVER `Screen`'s PADDING.
   *
   * The negative margin is the same one `LineupEditor.bleed` uses on the boards
   * below, and for a related reason: this is the only way the pages get a gap
   * between them without the card paying for it. The card is unmoved — the 16
   * points come back immediately as each page's own padding. See `PAGE_GUTTER`.
   */
  stage: { position: 'relative', marginHorizontal: -PAGE_GUTTER },
  /* One page. The card sits in the middle of it with a gutter either side, and
     the gutters are what you see between two cards mid-drag. */
  page: { paddingHorizontal: PAGE_GUTTER },
  pressed: { opacity: 0.6 },
});
