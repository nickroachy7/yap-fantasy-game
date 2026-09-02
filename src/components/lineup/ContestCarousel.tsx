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
  Pressable,
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
import { ContestHearts, type HeartResult, type HeartSpan } from '@/components/runs/Hearts';
import { Colors, Spacing, selectionAccent } from '@/constants/theme';
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

/** The contests chip's height. See `styles.chip` for why it is not `ControlDiameter`. */
const ENTER_HEIGHT = 28;

/** The `+` ahead of the lobby button's label. See `Plus`. */
const PLUS_SIZE = 9;

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
  week,
  lockAt,
  locked,
  now,
  run,
  onEnter,
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
   * THE WEEK THE BOARD IS ON, for the left of the rail. Null draws no link.
   *
   * It is a prop rather than `contests[0].weekLabel` because the rail outlives
   * the cards: the empty-board branch still has to draw the door out, and a
   * label read off a list that is empty is no label at all.
   */
  week: string | null;
  /**
   * Open the contests screen, on one of its two shelves.
   *
   * ONE PROP AND NOT TWO, because it is one screen. `contests.tsx` is three
   * views behind one route — open contests, `Recent contests`, and a recap
   * reader — so the rail's two buttons are two doors into the same room and the
   * signature says so. Two callbacks would have hidden that, and the first
   * question anybody asks about this row is why it has two buttons.
   */
  onEnter: (view: 'open' | 'history') => void;
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
        week={week}
        onGo={goTo}
        onEnter={onEnter}
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
          week={week}
          onGo={goTo}
          onEnter={onEnter}
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
  week,
  onGo,
  onEnter,
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
  /** The week these cards belong to. See the carousel's prop. */
  week: string | null;
  onGo: (page: number) => void;
  /** The contests screen, from either end of the row. See the carousel's prop. */
  onEnter: (view: 'open' | 'history') => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

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
       * PREVIOUS WEEKS: the same screen the other end of the row opens, on its
       * archive shelf.
       *
       * IT IS A SHORTCUT AND IT IS ALLOWED TO BE ONE. `contests.tsx` has held a
       * `Recent contests` view for as long as it has existed, reachable by
       * opening Contests and switching shelves — two taps for the thing a
       * player wants most often on a Tuesday.
       *
       * IT IS ALSO THE ONLY WAY THERE NOW. The board used to carry last week's
       * entries as recap cards; it does not, because a finished week is not
       * something you swipe past on your way to setting a lineup. That makes
       * this the door to every week behind the current one rather than a
       * shortcut to the one the carousel was already showing.
       *
       * NO PILL. It was a chip matching the one at the far end, and two chips
       * flanking a pager is a row of three objects competing — the pager, and
       * the two things it is between. A pill is a promise that something
       * happens; this is a place to go, so it is set as a mark and words, the
       * way a link is.
       *
       * ---------------------------------------------------------------------
       * IT NAMES THE WEEK YOU ARE ON, NOT THE ONE IT GOES TO
       * ---------------------------------------------------------------------
       *
       * It said `Previous weeks`, which is a label for a destination and was
       * doing only that job. Naming the CURRENT week instead does two jobs with
       * the same eight characters.
       *
       * It states where the board is. Nothing else on this screen says which
       * week these cards belong to — the card's own head spends that corner on
       * a countdown, and did so precisely because a live card had no use for a
       * week label. On a Tuesday, with last week's results still in the reader's
       * head, "which week am I setting" is a real question.
       *
       * And it makes the `‹` mean something specific. A back arrow beside a
       * week is an offer to go to the week BEFORE it, which is exactly where it
       * goes; a back arrow beside the words "previous weeks" is an arrow beside
       * a sign pointing at itself. It is the same construction as a date
       * stepper, minus the forward half — there is no week after this one.
       *
       * NULL DRAWS NOTHING. An empty board still has to keep the door at the
       * far end (see the note where `contests.length === 0` is handled), but a
       * back arrow beside a week that could not be named would be a control
       * that is all mark and no subject.
       */}
      <View style={styles.side}>
        {week === null ? null : (
          <Pressable
            onPress={() => onEnter('history')}
            accessibilityRole="button"
            accessibilityLabel={`${week}. Open contests from previous weeks`}
            /* Bare words are a small target, so the slop does all the work —
               the same trick `Pip` uses. */
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Chevron side="left" color={c.textTertiary} />
            <Text style={[styles.backLabel, { color: c.textSecondary }]}>{week}</Text>
          </Pressable>
        )}
      </View>

      {/**
       * THE PAGER, ON THE PAGE'S OWN CENTRE.
       *
       * ---------------------------------------------------------------------
       * IT WAS IN A TRAY, AND THE TRAY WAS ANSWERING A QUESTION THAT IS GONE
       * ---------------------------------------------------------------------
       *
       * The rack used to sit in a filled pill at the left of the row with the
       * free-heart count at its right end, and the pill existed to enclose a
       * hundred points of dead space between a rack pushed to one edge and a
       * button pushed to the other. It solved that. What it could not stop
       * being was a CONTAINER, and a container reads as a panel of status —
       * which is what the rack was when it drew the run's own hearts and the
       * masthead did not.
       *
       * The masthead says how many hearts you hold now. What is left here is
       * position: which of these cards am I looking at. That is not a status
       * panel, it is a page indicator, and a page indicator belongs on the
       * centre line with nothing drawn around it.
       *
       * CENTRED BY THE TWO SIDES, not by a margin. Both flanks are `flexBasis:
       * 0, flexGrow: 1`, so they take equal shares of whatever is left over and
       * the rack lands on the true middle of the column whatever the two
       * buttons happen to measure. A `justifyContent: 'space-between'` with a
       * spacer would put it in the middle of the GAP, which is a different
       * place and moves every time a label changes.
       *
       * THE RACK IS THE HALF THAT GIVES. `minWidth: 0` and a clip here, and
       * nothing shrinkable on the buttons: a week with eight cards squeezes the
       * pips and never the doors. That was the tray's one good idea and it
       * survives the tray.
       */}
      <View style={styles.pager}>
        <ContestHearts
          entries={pips}
          focus={focus}
          size={PIP_SIZE}
          onPress={(i) => onGo(pips[i].contest)}
        />
      </View>

      {/**
       * THE WAY INTO ANOTHER CONTEST, at the end of the row it belongs to.
       *
       * The lobby was reachable only by swiping past every card to a tile at
       * the end of the carousel — fine when you are in one contest, a chore
       * when you are in four, and it is the app's main call to action either
       * way. A button at a fixed position under the thumb costs one tap from
       * any page.
       *
       * IT NEVER SHRINKS AND IT NEVER MOVES. The pager beside it is the half
       * that gives. Whatever happens to the left of it, the door stays the same
       * size in the same corner.
       *
       * THE FREE COUNT IS NO LONGER SPELLED OUT, and losing the words is the
       * one real cost of taking the tray away. `1 free` was the tray's
       * right-hand occupant and there is nowhere left to put it: hard against
       * this button it reads as the button's label, which is the exact failure
       * that produced the tray in the first place.
       *
       * What it was FOR survives — the count existed to answer "is this button
       * worth pressing", and the `+` answers that. The masthead carries the
       * number. The screen reader still hears it; see `accessibilityLabel`.
       *
       * ---------------------------------------------------------------------
       * THE GOLD IS ON THE MARK NOW, NOT ON THE SLAB
       * ---------------------------------------------------------------------
       *
       * This has been an outline, then a filled gold pill, and the swing was
       * never really about the button. It was about what else the row was
       * doing. The fill was earned back when the rack gave up its gold corner
       * ticks and the accent was left saying exactly one thing.
       *
       * The row has been emptied since. The tray went, the edge chevrons went,
       * the pager came down to 16pt and the left-hand door is bare words — so
       * the same gold slab that was one strong object among several is now the
       * only loud thing on a quiet band, sitting directly under the card that
       * is the screen's actual subject. Nothing about the button changed; what
       * it is louder THAN did.
       *
       * So the pill stays and the fill goes quiet. It has to stay a pill: this
       * is the app's main call to action and the one door to the contests
       * screen, and words alone at both ends of the row would leave the act and
       * the side door looking like the same kind of thing. What carries the
       * state is the `+` — struck in the accent when a heart is free, absent
       * when none is. Gold appears once on this screen, at nine points, on the
       * one mark whose whole job is to say the act is voluntary.
       */}
      <View style={[styles.side, styles.sideEnd]}>
        <RailChip
          label="Contests"
          accessibilityLabel={
            live ? `Contests. ${free === 1 ? '1 heart' : `${free} hearts`} free` : 'Contests'
          }
          onPress={() => onEnter('open')}
          fill={c.backgroundElement}
          ink={c.text}
          /**
           * THE `+` IS BACK, AND THIS IS NOT THE ONE THAT WAS REMOVED.
           *
           * What was wrong before was a `+` ALONE: a bare glyph in a row of
           * hearts could add a heart, a card or a slot, and the words that said
           * which sat outside the button where they could not be pressed.
           *
           * Leading a label it has the opposite problem to solve and solves it
           * well — the glyph is what the eye finds at a glance and the noun is
           * what settles the ambiguity, so "a new contest, by choice" arrives
           * in one look instead of a read. It is also the only mark on this row
           * that says the act is VOLUNTARY: everything else here is a heart the
           * week has already committed.
           *
           * DRAWN, NOT TYPED. A `+` glyph sits high in its own line box, so
           * centring it needs a hand-tuned baseline nudge that drifts the first
           * time the type size changes — an earlier circle carried exactly that
           * hack. Two bars cannot drift, and it is how `Chevron` draws its own
           * arrow and how the Weeks button gets its lead mark.
           *
           * IT GOES WHEN NOTHING IS FREE, because by then it is a promise the
           * run cannot keep. The quiet state already drops the gold; leaving a
           * `+` on it would be the one part of the button still offering a new
           * contest to somebody with nothing to stake. What is left is the
           * room's name, which is the half that stays true — there are still
           * recaps in there to read.
           */
          lead={live ? <Plus color={accent} /> : null}
        />
      </View>
    </View>
  );
}

/**
 * One chip on the rail: an optional lead mark, and a word.
 *
 * BOTH ENDS OF THE ROW ARE THIS. They are the same object doing opposite jobs —
 * a call to action and a side door — and what separates them is the fill and
 * the mark, not the geometry. Drawn from two components they drifted a point in
 * height the first time either was touched, and two chips flanking a centred
 * pager show that immediately.
 */
function RailChip({
  label,
  accessibilityLabel,
  onPress,
  fill,
  ink,
  lead,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  fill: string;
  ink: string;
  /** The mark before the word. Null draws the word alone — see `chipBare`. */
  lead: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      /* Drawn at `ENTER_HEIGHT` and reached out past the platform's 44 — the
         same trick `Pip` uses, and the reason these can be quiet chips without
         being small targets. */
      hitSlop={9}
      style={({ pressed }) => [
        styles.chip,
        !lead && styles.chipBare,
        { backgroundColor: fill },
        pressed && styles.pressed,
      ]}>
      {lead}
      <Text style={[styles.chipLabel, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

/** A `+` from two bars, sized to sit inside the lobby button's label. */
function Plus({ color }: { color: string }) {
  return (
    <View style={styles.plus}>
      <View style={[styles.plusBar, { backgroundColor: color }]} />
      <View style={[styles.plusBar, styles.plusBarUp, { backgroundColor: color }]} />
    </View>
  );
}

/** One arrow, from a box and two borders. See `styles.chev`. */
function Chevron({ side, color }: { side: 'left' | 'right'; color: string }) {
  return (
    <View
      style={[
        styles.chev,
        side === 'right' ? styles.chevRight : styles.chevLeft,
        { borderColor: color },
      ]}
    />
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
  rail: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.two + 2 },
  /**
   * A FLANK, and the reason the pager lands on the true centre.
   *
   * `flexBasis: 0` with `flexGrow: 1` on both sides means the leftover width is
   * split in half whatever the two buttons measure, so the middle of the pager
   * is the middle of the column even though "Weeks" and "+ Contests" are
   * nothing like the same width.
   *
   * NO `minWidth: 0` here, deliberately. A flex item will not shrink below its
   * content unless told to, so the buttons hold their size and the pager — the
   * one box that IS told to — gives first. That was the tray's one good idea
   * and it is the only part of the tray worth keeping.
   */
  side: { flexBasis: 0, flexGrow: 1, alignItems: 'flex-start' },
  sideEnd: { alignItems: 'flex-end' },
  /* The rack. `overflow: hidden` is the interim answer to a week with more
     cards than the row can hold — a clipped pager is recoverable by swiping,
     and the alternative is pushing a door off the screen. The real answer is to
     let it scroll, which is worth doing the week a board can hold eight. */
  pager: { flexShrink: 1, minWidth: 0, overflow: 'hidden' },
  /**
   * A CHIP AT EITHER END. Both ends of the row, one geometry.
   *
   * `ENTER_HEIGHT` tall — 28 rather than the app's 32pt `ControlDiameter`,
   * which is a decision worth keeping now that there are two of these. At 32
   * beside a 20pt rack the chips are the biggest things on the row, and a
   * filter chip is not the comparison that matters here: those sit in a row of
   * their own peers, these sit either side of a pager and have to rank BELOW
   * it. The pager is what the row is about.
   *
   * The touch target does not shrink with it: `hitSlop` still reaches past 44.
   */
  chip: {
    flexShrink: 0,
    height: ENTER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two - 2,
    /* TIGHTER ON THE MARK SIDE. A `+` and a chevron are mostly air where a
       letter is mostly ink, so equal padding leaves the left visibly slacker
       than the right. Two points back is the optical correction, and it happens
       to pay for a third of what the mark costs in width. */
    paddingLeft: Spacing.two + 2,
    paddingRight: Spacing.three - 4,
    borderRadius: ENTER_HEIGHT / 2,
  },
  /**
   * THE WAY BACK, as words rather than as a chip. See the note where it is
   * drawn for why it is not a pill.
   *
   * The gap is two points tighter than the chip's, because a `‹` set beside
   * lowercase words with no fill around them has nothing to hold it in — inside
   * a pill the padding does that, and out here the word has to.
   */
  back: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two - 4 },
  /**
   * The chip's type exactly, because the two ends of this row must not look
   * like they came from different ones.
   *
   * NOT CAPITALS. `weekLabel` is `WEEK 1` — cut for a chip in the card's head,
   * where capitals are the app's voice for a stamped fact set beside something
   * else. This is not that: it is a word a person reads at the start of a line,
   * next to an arrow, and a heading shouting inside a sentence outranks the
   * pager it is meant to sit beside. `weekTitle` is the same week set as a
   * phrase — see `weekTitleOf`.
   */
  backLabel: { fontSize: 12, lineHeight: 15, fontWeight: '500' },
  /* NO MARK, NO OPTICAL CORRECTION. The tighter left padding above exists to
     pay for the air inside a `+`; with the word alone it just parks the label
     off-centre in its own pill. */
  chipBare: { paddingLeft: Spacing.three - 4 },
  /* The `+`'s box. 9 against a 12pt label — a shade under the cap height, so it
     reads as punctuation to the word rather than as a second word. */
  plus: { width: PLUS_SIZE, height: PLUS_SIZE, alignItems: 'center', justifyContent: 'center' },
  /* Both bars are the same rule; one of them stood on its end. 1.5 because a
     stroke this short needs the weight to hold its own beside 12pt type. */
  plusBar: { position: 'absolute', width: PLUS_SIZE, height: 1.5, borderRadius: 0.75 },
  plusBarUp: { width: 1.5, height: PLUS_SIZE },
  /* Not on the type scale on purpose: `body` at 12/500 is a caption's weight
     and this is a button. 13/600 is the smallest thing in this app that reads
     as one without being set in caps — and it is a notch under the fill's 700,
     because an outline does not have to work as hard to be seen. */
  /* 12/500. At 13/600 the label was the heaviest text on the screen below the
     card's own name — a button does not have to outweigh the thing it serves. */
  chipLabel: { fontSize: 12, lineHeight: 15, fontWeight: '500' },

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
  /* `top: 0, bottom: 0` and centre: the arrow finds the card's vertical middle
     from the stage's own height, which is what the old placement needed a
     measured `cardHeight` for — and why it drew nothing at all until the first
     layout had landed. */
  /* A chevron from one box and two borders, the way `TabIcon` builds every glyph
     it draws — no font, no asset, and it inherits the stroke weight of the rules
     around it. */
  chev: { width: 7, height: 7, borderTopWidth: 1.5, borderRightWidth: 1.5, opacity: 0.55 },
  chevRight: { transform: [{ rotate: '45deg' }] },
  chevLeft: { transform: [{ rotate: '-135deg' }] },
  pressed: { opacity: 0.6 },
});
