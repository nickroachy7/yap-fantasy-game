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
 * saying whether the bar is up or down cannot live inside it. It also leaves
 * room for a second block to join the movement later — every `CollapsingChrome`
 * reads the same progress and collapses INTO ITSELF, clipped by its own box
 * rather than sliding over its neighbour, so blocks need to know nothing about
 * each other's heights.
 *
 * PLAIN JS SCROLL EVENTS, NOT `useAnimatedScrollHandler`. A Reanimated handler
 * only runs on the UI thread if it is attached to an `Animated.*` component,
 * which would mean converting every list in the app — and `Animated.FlatList`
 * on web is a different code path from the one the carousel already had to be
 * taught about (see `ContestCarousel`). What this handler does per event is
 * two subtractions and a compare; the ANIMATION still runs on the UI thread,
 * because all the JS side ever does is set a shared value once per direction
 * change. Wiring a list is one spread — see `useChromeScroll`.
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
    progress.value = now ? to : withTiming(to, { duration: next ? 200 : 180 });
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

  /* All three are stable for the life of the provider — a shared value, and two
     callbacks with no dependencies — so this is built once. Listing them as
     dependencies would also make `progress` an argument to a hook, which is what
     `react-hooks/immutability` reads as "do not assign to this". */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo<Collapse>(() => ({ progress, onScroll, reset }), []);

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
 * A bar that slides up out of the way when the page below it is scrolled down.
 *
 * HOW IT SHRINKS. The outer box has automatic height and clips; the inner one
 * carries a NEGATIVE top margin as it collapses. Yoga measures the outer box as
 * content-height-minus-that-margin, so the box shrinks by exactly as much as the
 * content has risen, whatever is inside it, and everything below moves up to
 * take the room. Margin rather than an animated `height` because the height has
 * to be measured before it can be animated, and a block whose height is zero
 * until its first layout flashes on mount — most visibly on web, where the
 * measurement is a frame behind.
 *
 * The clip is what keeps neighbours out of it: the content rises past the top of
 * its own box and is cut there, rather than drawing over the bar above.
 */
export function CollapsingChrome({ children }: { children: ReactNode }) {
  const collapse = useCollapse();
  const wide = useIsWide();
  const height = useSharedValue(0);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      /* The margin does not change this measurement — `layout.height` is the
         box, not the space it occupies — so this settles once and then only
         moves if the bar itself changes shape — a section with a different
         number of pages, or a rotation. */
      if (h > 0) height.value = h;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const progress = collapse?.progress;
  const slide = useAnimatedStyle(() => ({
    marginTop: -height.value * (progress?.value ?? 0),
  }));

  if (wide || !collapse) return <>{children}</>;

  return (
    <View style={styles.clip}>
      <Animated.View style={slide}>
        {/* THE MEASUREMENT IS ON A PLAIN VIEW, not on the animated one above
            it. Reanimated's wrapper does not forward `onLayout` on web —
            verified in the shell gallery, where the callback simply never
            fired and the bar sat at its full height with the animation
            running against a height of zero. A plain `View` measures on every
            platform. */}
        <View onLayout={onLayout}>{children}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
