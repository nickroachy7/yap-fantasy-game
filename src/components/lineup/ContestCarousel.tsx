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
 * ONE CARD DRAWS NO CHROME, and the chrome it draws otherwise is one row of
 * dots. That is a REVERSAL and worth the note, because the dots were removed
 * once on a good argument: they stated position and nothing else, sitting
 * directly above the run's rack of hearts — two indicators of the same size,
 * arguing about which one the reader should be counting. The rack won, because
 * it could be counted AND pressed, and it carried a second meaning besides.
 *
 * Hearts are gone, so the rack is gone, and what it displaced comes back. The
 * dots are the pressable half of what the rack was: the lit one names the page
 * and tapping one goes there. What does not come back is the second meaning —
 * a dot is position and nothing else, which is what a page indicator is for.
 *
 * A pair of edge chevrons had the middle of that history and went for a version
 * of the same reason: a second thing saying "there is more of this", drawn
 * where the card is closest to the edge, when the rail beneath it already said
 * so in a form you can count and press.
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
  Pressable,
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
import { DOOR_HEIGHT, DoorChip, Plus } from "@/components/ui/DoorChip";
import { Colors, Spacing, selectionAccent } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

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
 * One dot on the rail's pager, and the tap target around it.
 *
 * THE FLOOR THAT USED TO HOLD THIS AT 16 IS GONE WITH THE HEARTS. A pip was a
 * drawn heart — a blade through it, or a tear down it — and those are shapes
 * whose edges stop reading below about 16pt, which is where that argument was
 * being made. A dot has no silhouette to lose, so it is sized as what it is:
 * a page indicator, which outranks nothing and reports where you are.
 *
 * 7 DRAWN, 28 PRESSED. The dot is quiet enough to sit under a card without
 * competing with it; the box around it is what makes a row of them tappable
 * with a thumb. Hit area is not visual weight, which is the mistake the 24pt
 * rack made in the other direction.
 */
const PIP_SIZE = 7;
const PIP_TAP = 28;

export function ContestCarousel({
  contests,
  index,
  onIndexChange,
  onOpen,
  lockAt,
  locked,
  now,
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
   * Open the contests screen, on one of its shelves.
   *
   * IT STILL TAKES A SHELF even though the rail only ever asks for `open`. The
   * archive was the left-hand door on this row and it is gone — a shortcut to a
   * view one tap inside the room the other door opens — but `contests.tsx` is
   * three views behind one route and a recap link elsewhere still arrives at
   * the same screen by the same param. Narrowing this to a bare callback would
   * hide that the destination has shelves at all.
   */
  onEnter: (view: "open" | "history") => void;
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
    return <BoardRail pages={0} page={0} onGo={goTo} onEnter={onEnter} />;
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
      <BoardRail
        pages={contests.length}
        page={page}
        onGo={goTo}
        onEnter={onEnter}
      />
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
 * The rail under the whole carousel: where you are in the board, and the way
 * into another contest.
 *
 * ---------------------------------------------------------------------------
 * IT IS UNDER THE CAROUSEL BECAUSE IT DOES NOT SWIPE
 * ---------------------------------------------------------------------------
 *
 * This was `RunRail` and it drew the run: a rack of hearts, one per card on the
 * board, the lit one naming the page you were on. The rack is gone with the
 * mechanic; the POSITION it was also reporting is not, so the rail keeps that
 * job and gives up the other one.
 *
 * The placement argument survives its subject and is why this is not inside the
 * card. As a BAND OF THE CARD the rail was rendered once per page, so an
 * indicator of a fixed set of pages slid off the screen and an identical one
 * slid on every time you swiped — drawing a thing that does not change inside
 * the thing that moves. Here it is FIXED and only the lit dot travels.
 *
 * (And not a panel: a bordered, filled, rounded box under a bordered, filled,
 * rounded card is a second card, and two cards argue about which one matters.
 * This is a row. No border, no fill, no radius.)
 *
 * ---------------------------------------------------------------------------
 * WHAT THE ROW LOST WITH THE HEARTS
 * ---------------------------------------------------------------------------
 *
 * Two lines of text on the right: how much of what you held was committed, and
 * what the contest in view would cost you. Both were about a stake, and there
 * is no longer one to report — an entry fee is on the card itself, where the
 * price of a thing belongs.
 *
 * So the row is a pager and two doors to one room, which is little enough that
 * it is worth saying why the doors are still two. The CHIP is the labelled one
 * and it teaches that the lobby exists. The `+` at the head of the row is the
 * shortcut for somebody who has already learned it, under the left thumb, at
 * the end of the row a right-handed grip never reaches. If the chip is ever
 * unlabelled or moved, the shortcut stops being a shortcut and becomes an
 * ambiguity.
 *
 * BOTH ARE ALWAYS ON NOW. They used to disappear when the run had no heart
 * left to stake — a `+` offered to somebody who could not spend was a promise
 * the run could not keep. Nothing gates entering a contest but the fee, and the
 * card says the fee, so the doors no longer have a state.
 */
function BoardRail({
  pages,
  page,
  onGo,
  onEnter,
}: {
  /** Cards on the board. Zero draws no dots and still draws the doors. */
  pages: number;
  page: number;
  onGo: (page: number) => void;
  /** The contests screen. See the carousel's prop. */
  onEnter: (view: "open" | "history") => void;
}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  return (
    <View style={styles.rail}>
      <View style={styles.run}>
        {/* THE SHORTCUT, at the head of the row. In the QUIET ink, deliberately:
            gold appears exactly once on this row, on the chip that is the real
            call to action. A second accent here would make the row choose
            between two doors to the same place. */}
        <Pressable
          onPress={() => onEnter("open")}
          accessibilityRole="button"
          accessibilityLabel="Contest lobby"
          /* Reaches past 44 from a 28pt mark, the same trick `DoorChip` uses —
             see `DOOR_HEIGHT`. */
          hitSlop={9}
          style={({ pressed }) => [
            styles.enter,
            { backgroundColor: c.surface },
            pressed && styles.pressed,
          ]}
        >
          <Plus color={c.textSecondary} />
        </Pressable>

        {/**
         * THE PAGER. `minWidth: 0` and a clip on the row that holds it, nothing
         * shrinkable on the doors: a week with eight cards squeezes the dots and
         * never the way out. That was the old tray's one good idea and it has
         * outlived three versions of this row.
         *
         * ONE DOT IS NO INFORMATION, so a single-card board draws none. The
         * doors stay — they are the reason the rail is here when there is
         * nothing to page through at all.
         */}
        <View style={styles.pager}>
          {pages > 1
            ? Array.from({ length: pages }, (_, i) => (
                <Pressable
                  key={i}
                  onPress={() => onGo(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: i === page }}
                  accessibilityLabel={`Contest ${i + 1} of ${pages}`}
                  style={styles.pip}
                >
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: i === page ? c.text : c.textTertiary,
                        opacity: i === page ? 1 : 0.45,
                      },
                    ]}
                  />
                </Pressable>
              ))
            : null}
        </View>
      </View>

      {/**
       * ONE DOOR AT THE END OF THE ROW, AND IT IS BIGGER FOR BEING ALONE.
       *
       * `+ Packs` sat beside this once, on the argument that the row was the
       * whole answer to "what can I spend, and where". It is not the wallet —
       * the balance is in the masthead — so packs is reached from the
       * collection, which is the board where "I need more cards" is the actual
       * next thought.
       *
       * WHICH IS WHY THE CHIP CAN GROW. A PAIR of chips at this size was
       * plainly the biggest object on the row, and a door has to rank below the
       * card it serves. One is a single call to action under a card, which is
       * what this screen's main button is supposed to be — and the two words
       * are what buy the growth: "Contests" named a room in a way that could be
       * read as a filter on the board above it. "Contest Lobby" cannot be
       * anything but somewhere to go.
       *
       * THE `+` LEADS THE WORD, and it is not the `+` that was once removed
       * from this row. What was wrong before was a `+` ALONE: a bare glyph
       * could add a card or a slot, and the words that said which sat outside
       * the button where they could not be pressed. Leading a label, the glyph
       * is what the eye finds and the noun is what settles it.
       *
       * DRAWN, NOT TYPED. A `+` glyph sits high in its own line box, so centring
       * it needs a baseline nudge that drifts the first time the type size
       * changes — an earlier circle carried exactly that hack. Two bars cannot
       * drift.
       */}
      <View style={styles.doors}>
        <DoorChip
          large
          label="Contest Lobby"
          accessibilityLabel="Contest lobby"
          onPress={() => onEnter("open")}
          fill={c.backgroundElement}
          ink={c.text}
          lead={<Plus color={accent} />}
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
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  /**
   * The shortcut into the lobby, in the slot the heart pill vacated.
   *
   * SQUARE, AT THE SMALL DOOR'S HEIGHT. `DOOR_HEIGHT` rather than the chip at
   * the far end, because this is the quiet half of the pair — a 32pt circle at
   * the head of the row would compete with the labelled door for the same act.
   * A full round rather than the pill's `999`: with no word in it the shape has
   * nothing to be long for, and a circle is what the eye reads as "a mark you
   * press" beside a rack of drawn hearts.
   */
  enter: {
    width: DOOR_HEIGHT,
    height: DOOR_HEIGHT,
    borderRadius: DOOR_HEIGHT / 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  /* The doors, and neither of them ever gives. See the note where they are
     drawn, and `DoorChip` for the chip itself — the collection's toolbar draws
     the same pair, which is why the geometry no longer lives in this file. The
     gap is the chip's own internal one, so the two read as one cluster rather
     than as two buttons that happen to be near each other. */
  doors: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two - 2,
    flexShrink: 0,
  },
  /* The rack. `overflow: hidden` is the interim answer to a week with more
     cards than the row can hold — a clipped pager is recoverable by swiping,
     and the alternative is pushing a door off the screen. The real answer is to
     let it scroll, which is worth doing the week a board can hold eight. */
  pager: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  /* The TAP TARGET, which is most of what is here: the dot inside it is 7pt and
     a 7pt press target is not one. Square so a row of them has even gaps at
     both ends without a margin doing it. */
  pip: {
    width: PIP_TAP,
    height: PIP_TAP,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: PIP_SIZE, height: PIP_SIZE, borderRadius: PIP_SIZE / 2 },
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
  pressed: { opacity: 0.6 },
});
