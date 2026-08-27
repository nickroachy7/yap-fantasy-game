/**
 * The section bar above a page gets out of the way while you read down it.
 *
 * THE PROBLEM IS ARITHMETIC. On a 375×812 phone the masthead is ~52pt, the
 * board strip another ~40, and a section's action bar another ~56 — a third of
 * the screen spent on navigation before the first row of the thing you came to
 * look at.
 *
 * ONLY THE THIRD OF THOSE COLLAPSES. The masthead and the board strip stay
 * where they are (see `FantasyFrame`): they carry the way out of the board and
 * the gem balance, and a reader deep in a list should not have to scroll back
 * up to find either. The section bar is different — it names the page you are
 * already on among two or three peers, which is worth its 56pt on arrival and
 * worth none of it once you are twenty rows in.
 *
 * IT LEAVES ON A GESTURE AND RETURNS AT THE TOP, and the asymmetry is the whole
 * design. Going is direction-driven: a short push up the page — the thing you
 * are doing anyway — and it is gone. Coming back is POSITION-driven: it returns
 * when you reach the top of the list, and at no other moment.
 *
 * A reveal on the upward gesture was tried first and is what this replaced. The
 * trouble is that scrolling back up is not a request for navigation — it is
 * re-reading, correcting an overshoot, chasing a row that went past — and every
 * one of those threw the rows down the screen mid-sentence to make room for a
 * bar nobody had asked for. Raising the threshold only moved the line; it did
 * not change what was being guessed at. The top of the list, on the other hand,
 * is unambiguous: you have finished with the rows, and the bar is what is there
 * when you arrive.
 *
 * ONE PROGRESS VALUE, HELD ABOVE THE NAVIGATORS. `SectionFrame` is remounted
 * whenever you move between sections and its bar is redrawn, so the state
 * saying whether the bar is up or down cannot live inside it.
 *
 * IT MOVES, IT DOES NOT SHRINK. `CollapsingSection` slides the bar and the
 * pages under it as one block, on a transform, and never touches layout while
 * it does. The first version animated the bar's box instead and was unusable
 * for it — the whole argument is there.
 *
 * PLAIN JS SCROLL EVENTS, NOT `useAnimatedScrollHandler`. A Reanimated handler
 * only runs on the UI thread if it is attached to an `Animated.*` component,
 * which would mean converting every list in the app — and `Animated.FlatList`
 * on web is a different code path from the one the carousel already had to be
 * taught about (see `ContestCarousel`). What this handler does per event is
 * two subtractions and a compare, and it decides ONE thing: whether the bar is
 * up or down. The slide itself never touches JS again — it is a timing on a
 * shared value, so it plays at frame rate however busy the JS thread is, which
 * is the property that makes a threshold worth having instead of tracking the
 * finger. Wiring a list is one spread — see `useChromeScroll`.
 *
 * NARROW ONLY. On wide web the rail is the navigation and `SectionNav` draws
 * nothing at all; both halves of this file no-op there rather than making every
 * caller ask.
 */
import { usePathname } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useIsWide } from '@/components/shell/useResponsive';

/**
 * How far you must push the page up before the bar goes.
 *
 * Far enough that reading is never mistaken for a request, short enough that
 * the request is over before you think about it. There is no matching number
 * for the other direction: nothing brings the bar back except the top of the
 * list — see `TOP_ZONE`.
 */
const HIDE_TRAVEL = 28;

/**
 * No hiding until there is this much scrolled past, and it is a SAFETY rather
 * than a taste: collapsing the bar makes the page taller, which on a barely
 * scrollable list can remove the very scroll that would bring the bar back.
 * Past 72pt there is always at least 72pt of scrolling-up available, so the top
 * of the list — the only thing that restores the bar — is always reachable.
 */
const HIDE_AFTER = 72;

/**
 * Inside this much of the top the bar is on, whatever the finger did.
 *
 * THIS IS THE ONLY WAY BACK, so it is deliberately generous about what counts
 * as the top: an offset that settles a point or two shy of zero, an iOS bounce
 * passing through it, a list whose first row is a hair taller than it measured.
 * Missing the top by 3pt and leaving the reader with no bar and no way to ask
 * for one is a far worse failure than showing it 8pt early.
 */
const TOP_ZONE = 8;


type Collapse = {
  /** 0 = bar fully drawn, 1 = fully collapsed. Read by every block. */
  progress: SharedValue<number>;
  /** The scroll handler shared by whichever list is on screen. */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Put the bar back immediately, no animation. Used on navigation. */
  reset: () => void;
  /** The measured height of the bar on screen, once it has one. */
  inset: number;
  /** Announced by the section that drew the bar. */
  setInset: (h: number) => void;
};

const CollapseContext = createContext<Collapse | null>(null);

/**
 * Mounted once, above every tab — see `(app)/_layout`.
 *
 * It has to be above the navigators rather than inside a screen for the same
 * reason the bar itself is drawn by a frame: the value has to outlive a
 * `replace` between two pages, or moving between them would tear down the state
 * that says whether the bar is up or down.
 */
export function ChromeCollapseProvider({ children }: { children: ReactNode }) {
  const progress = useSharedValue(0);
  /* JS-side, because the handler that reads them is JS-side. A ref rather than
     state throughout: none of this should render anything, it only decides when
     to start an animation. */
  const lastY = useRef(0);
  const travel = useRef(0);
  const hidden = useRef(false);
  /* Published so a page can leave room for it — see `useChromeInset`. State
     rather than a ref because it is read during render, and a shared value
     because the slide itself is read on the UI thread; the two are set from the
     same measurement. */
  const [inset, setInset] = useState(0);

  /**
   * The one place the progress value is written.
   *
   * `now` skips the animation, which is what a navigation wants — a new page
   * should not be watching the last page's bars slide back down. It is a
   * parameter rather than a second callback because a shared value may only be
   * assigned from inside a single hook closure; two of them and
   * `react-hooks/immutability` (rightly) reads the second as reaching into
   * something another hook already captured.
   */
  const settle = useCallback((next: boolean, now = false) => {
    if (hidden.current === next && !now) return;
    hidden.current = next;
    const to = next ? 1 : 0;
    progress.value = now
      ? to
      : /* Out-cubic, and longer than it needs to be to travel 56pt: the bar
           should read as getting out of the way rather than as being switched
           off, and the ease-out is what puts the deceleration at the end where
           the eye follows it. Cheap to lengthen now that the whole slide is a
           transform — see `CollapsingSection`. */
        withTiming(to, { duration: next ? 260 : 240, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => {
    lastY.current = 0;
    travel.current = 0;
    settle(false, true);
  }, [settle]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - lastY.current;
      lastY.current = y;

      /* At the top the bar belongs to the page again, and the accumulator
         starts clean — otherwise a long drag down, then a bounce back to zero,
         would leave enough stored travel to re-hide on the next pixel. */
      if (y <= TOP_ZONE) {
        travel.current = 0;
        settle(false);
        return;
      }

      if (dy === 0) return;
      // A flip in direction restarts the count; only sustained travel counts.
      if (dy > 0 !== travel.current > 0) travel.current = 0;
      travel.current += dy;

      /* One direction only. Upward travel still resets the accumulator above —
         so a drag back up costs a fresh 28pt before the bar can go again — but
         it never brings the bar back; the top of the list does that. */
      if (travel.current > HIDE_TRAVEL && y > HIDE_AFTER) settle(true);
    },
    [settle],
  );

  /* Rebuilt only when the measured bar height changes, which is once per
     section. Everything else in here is stable for the life of the provider — a
     shared value, two callbacks with no dependencies, a state setter — and
     `progress` is deliberately not listed: passing it to a hook is what
     `react-hooks/immutability` reads as "do not assign to this". */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo<Collapse>(() => ({ progress, onScroll, reset, inset, setInset }), [inset]);

  return (
    <CollapseContext.Provider value={value}>
      {/* A component of its own so that `usePathname` — which changes on every
          navigation in the app — re-renders one null-returning node instead of
          the entire tree under this provider. */}
      <ResetOnRoute reset={reset} />
      {children}
    </CollapseContext.Provider>
  );
}

/**
 * Every page arrives with its bar drawn.
 *
 * Without this a list left scrolled with the bar up would hand the next screen
 * a collapsed one it had no way to ask for — the new page starts at offset
 * zero, so nothing would ever scroll up to bring it back.
 */
function ResetOnRoute({ reset }: { reset: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    reset();
  }, [pathname, reset]);
  return null;
}

function useCollapse(): Collapse | null {
  return useContext(CollapseContext);
}

/**
 * Props for the scrollable that drives the collapse. Spread them on it:
 *
 *     <FlatList {...useChromeScroll()} … />
 *
 * VERTICAL PAGE SCROLLS ONLY. A horizontal strip — the contest carousel, the
 * chip rows, the score ticker — reports offsets on the other axis and would
 * collapse the bar as you swiped sideways.
 *
 * Returns nothing on wide web, so a component shared by both layouts can spread
 * it unconditionally.
 */
export function useChromeScroll(): {
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
} {
  const collapse = useCollapse();
  const wide = useIsWide();
  if (wide || !collapse) return NO_SCROLL;
  /* 32ms rather than 16: the handler decides a direction, not a position, and
     halving the event rate halves the bridge traffic for a decision that cannot
     be felt at either rate. */
  return { onScroll: collapse.onScroll, scrollEventThrottle: 32 };
}

const NO_SCROLL = {};

/**
 * How much room the bar takes at the top of the page, once it has been
 * measured. Zero where there is no bar.
 *
 * A page uses it to add that much to the BOTTOM of its scroll content, and the
 * reason is `CollapsingSection`: the sliding block is one bar-height taller
 * than the frame, so at rest its last bar-height sits below the screen edge.
 * Content that reaches into that strip is fine on a list long enough to scroll
 * — it comes up as you scroll and the bar leaves — but a page whose content
 * ends just inside it would have no scroll to give and no way to show it. The
 * extra padding guarantees the scroll exists.
 *
 * Lists that already pad by `useTabBarInset` clear it several times over and
 * need nothing.
 */
export function useChromeInset(): number {
  const collapse = useCollapse();
  const wide = useIsWide();
  return wide || !collapse ? 0 : collapse.inset;
}

/**
 * A section: its bar, and the pages under it, sliding as ONE BLOCK.
 *
 * NOTHING HERE CHANGES LAYOUT WHILE IT MOVES, and that is the whole design.
 *
 * The first version of this collapsed the bar by animating its box — a negative
 * top margin, so the box shrank and everything below rose into the space. It
 * was correct and it was unusable: a margin is a LAYOUT property, so every
 * frame of the slide re-laid out the frame, which changed the height of the
 * list container below it, which fired the list's `onLayout`, which made
 * `VirtualizedList` re-measure and re-render — a dozen times over the slide. The
 * frames were dropped and what reached the screen was the start and the end.
 * The bar appeared to SNAP, on iOS Safari worst of all, and no easing or
 * duration could have fixed it because the frames in between were never drawn.
 *
 * So the bar and the pages are one `transform` now. The block is a
 * bar-height TALLER than the frame — `flex: 1` against a negative bottom margin
 * — so sliding it up by exactly that much lands the pages flush against the top
 * of the frame with their bottom edge back on the screen edge. The frame clips
 * what leaves the top. Nothing measures, nothing re-renders, and the slide runs
 * entirely on the UI thread whatever the JS thread is doing.
 *
 * THE COST IS AT REST, and it is the one thing to know about this component: a
 * bar-height of the page hangs below the screen while the bar is up. It costs
 * nothing visually — the visible area is exactly what it always was — but a
 * page must not lay content into that strip without leaving a way to scroll to
 * it. See `useChromeInset`.
 *
 * Wide draws neither part of this: `SectionNav` renders nothing there, so the
 * pages are returned as they came.
 */
export function CollapsingSection({
  /** The section's bar. */
  bar,
  /** The section's navigator. */
  children,
}: {
  bar: ReactNode;
  children: ReactNode;
}) {
  const collapse = useCollapse();
  const wide = useIsWide();
  const height = useSharedValue(0);
  /* The same number twice: on the UI thread for the slide, in React for the
     negative margin that makes room for it. The margin must NOT be animated —
     it is layout, and a layout prop written every frame is the exact mistake
     this component exists to undo — so it goes through state and settles once. */
  const [barHeight, setBarHeight] = useState(0);
  const publish = collapse?.setInset;

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h <= 0) return;
      height.value = h;
      setBarHeight((prev) => (prev === h ? prev : h));
      publish?.(h);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publish],
  );

  const progress = collapse?.progress;
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: -height.value * (progress?.value ?? 0) }],
  }));

  if (wide || !collapse)
    return (
      <>
        {bar}
        {children}
      </>
    );

  return (
    <View style={styles.clip}>
      <Animated.View style={[styles.block, { marginBottom: -barHeight }, slide]}>
        {/* THE MEASUREMENT IS ON A PLAIN VIEW, not on the animated one around
            it. Reanimated's wrapper does not forward `onLayout` on web —
            verified in the shell gallery, where the callback simply never
            fired and the bar sat at its full height with the slide running
            against a height of zero. A plain `View` measures everywhere. */}
        <View onLayout={onLayout}>{bar}</View>
        <View style={styles.pages}>{children}</View>
      </Animated.View>
    </View>
  );
}

/**
 * A PAGE's own header block, leaving on the same push as the section bar.
 *
 * `CollapsingSection` gets the CHROME out of the way. This gets the top of the
 * page out of the way, and it exists because the two together are the arithmetic
 * problem: the inventory pins a summary strip above its grid, so a phone spent
 * the section bar's ~56pt AND the strip's ~50 on every screen of scrolling
 * before the first card.
 *
 * WHAT GOES IN IT IS A STATEMENT, NEVER A CONTROL. The rule the collection
 * screen was already written to — a control you just pressed must not leave —
 * does not change here; it decides what may be passed in. The summary says what
 * you own and answers nothing you can ask it, so it is worth its height on
 * arrival and none of it twenty rows in. The chips, the search and the mode
 * switch below it stay on screen, and they stay because they are BELOW the
 * `by` line rather than because anything special is done for them: the block
 * moves as one, so only the first `by` points of it ever leave.
 *
 * `by` IS MEASURED BY THE CALLER, which is the one awkward part of the API and
 * is deliberate. The alternative is measuring in here and handing the number
 * back down through a render prop, and the caller needs the number anyway —
 * see the note below on the bottom padding — so it would be the same value
 * travelling in a circle.
 *
 * THE MECHANISM IS `CollapsingSection`'s, and its long note is the argument for
 * all of it: one transform, no layout touched while it moves, the block a `by`
 * TALLER than the frame so sliding it up by exactly that much lands its bottom
 * edge back on the frame's. The cost is the same too — at rest, `by` points of
 * the page hang below the screen — so a list inside this must add `by` to the
 * BOTTOM of its content padding, exactly as `useChromeInset` asks pages to do
 * for the bar. Anything that must stay pinned to the bottom of the screen, a
 * selection bar or a toolbar, belongs OUTSIDE this block.
 *
 * Narrow only, like everything else in this file: on wide web the children are
 * returned as they came.
 */
export function CollapsingBlock({
  /** How far it slides — the measured height of the part that may leave. */
  by,
  /** The header and everything under it, sliding as one. */
  children,
}: {
  by: number;
  children: ReactNode;
}) {
  const collapse = useCollapse();
  const wide = useIsWide();
  const progress = collapse?.progress;

  /* `by` is captured from JS rather than mirrored into a shared value, which is
     what `CollapsingSection` needs and this does not: there the height arrives
     in an `onLayout` and must reach the UI thread without a render, here it is
     already state by the time it gets here. The worklet is rebuilt when it
     changes — once, when the header is first measured. */
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: -by * (progress?.value ?? 0) }],
  }));

  if (wide || !collapse) return <>{children}</>;

  /* Rendered whether or not `by` has landed yet. Branching on the measurement
     would swap this subtree for a bare fragment on the first frame and back
     again on the second, and the child here is a virtualised grid — a remount
     it can see no reason for. */
  return (
    <View style={styles.clip}>
      <Animated.View style={[styles.block, { marginBottom: -by }, slide]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* The frame. It clips because the block slides past its top edge, and a bar
     drawn over the board strip above would be worse than one that is gone. */
  clip: { flex: 1, overflow: 'hidden' },
  /* One bar taller than the frame — see the component. */
  block: { flex: 1 },
  pages: { flex: 1 },
});
