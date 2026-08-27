/**
 * ONE STRIP collapses while you read down a page: the statement of what you
 * own, at the top of the collection and the sets board.
 *
 * WHAT IS ALLOWED TO GO, AND WHY IT IS ONLY THIS. A phone spends its first
 * third on chrome — a ~52pt masthead, a ~40pt board strip, a ~56pt section bar,
 * and on these two pages another ~50 on a summary. All of it was on the table
 * at one point and only the summary survived the argument:
 *
 *   the masthead carries the way out and the gem balance;
 *   the board strip is how you leave the board;
 *   the section bar names the page among its peers AND is the control you use
 *     to move between them — Collection and Sets are one press apart, and a
 *     bar that leaves is a press you have to scroll to get back;
 *   the chips, the search and the mode switch are controls you just pressed.
 *
 * A summary is the one thing up there that answers nothing you can ask it. It
 * is worth its height on arrival and none of it twenty rows in, and nothing
 * about the page stops working while it is gone. So it is the only thing that
 * moves, and everything above and below it holds still.
 *
 * A LONGER VERSION OF THIS COLLAPSED THE SECTION BAR TOO, and it is worth
 * saying why it was wrong rather than only that it went. Two things travelling
 * meant the whole page frame moved, so every list under the bar had to reserve
 * a strip for it, empty states had to be pushed clear of it by hand, and pages
 * that merely happened to sit under a section — a sheet, the search modal —
 * had to be taught not to. The pack button was the tell: it lived in the
 * summary, so a collapse took the shop with it. Moving the button up into the
 * bar and leaving the bar alone answers all of it at once.
 *
 * ---------------------------------------------------------------------------
 * THE MODEL: THE STRIP AND THE PAGE UNDER IT SLIDE AS ONE BLOCK
 * ---------------------------------------------------------------------------
 *
 * The strip sits in flow above the page's list, exactly where it reads. The two
 * are wrapped in a block one strip TALLER than the frame — `flex: 1` against a
 * negative bottom margin — so sliding that block up by exactly a strip lands
 * the list flush against the top of the frame with its bottom edge back on the
 * screen edge. The frame clips what leaves the top, which is the strip.
 *
 * IT IS A THRESHOLD AND A TIMING, NOT A TRACK. Push the page past the strip's
 * own height and it goes, in 180ms; return to the top of the list and it comes
 * back. Nothing is proportional to anything.
 *
 * A VERSION THAT TRACKED THE SCROLL POINT-FOR-POINT came in between, and it is
 * worth saying why it went. It drew the strip OVER a matching pad of empty
 * content at the top of the list, so the two scrolled away together and nothing
 * ever moved faster than the finger. That is the better motion when a lot of
 * chrome is travelling — but it can only be smooth, because a header that snaps
 * ahead of the content it is covering leaves a band of bare page behind it. Once
 * the section bar, the chips and the search stopped collapsing there was only a
 * ~50pt strip left in motion, and 50pt of smooth is slower than the same 50pt
 * gone. Snappy won, so the tracking had to go with it.
 *
 * NOTHING CHANGES LAYOUT WHILE IT MOVES, which predates all of this. The first
 * version collapsed by animating the box — a negative top margin, so the box
 * shrank and everything below rose into the space. It was correct and it was
 * unusable: a margin is a LAYOUT property, so every frame re-laid out the
 * frame, which changed the height of the list container, which fired the list's
 * `onLayout`, which made `VirtualizedList` re-measure and re-render — a dozen
 * times over the slide. The frames were dropped and what reached the screen was
 * the start and the end. It appeared to SNAP, on iOS Safari worst of all, and
 * no easing could have fixed it because the frames in between were never drawn.
 * So the whole slide is one transform on a shared value, and the negative
 * margin that makes room for it is set once from state.
 *
 * THE COST IS AT REST: a strip's height of the page hangs below the screen
 * while the strip is up. It costs nothing visually — the visible area is what
 * it always was — but a list must add that much to the BOTTOM of its content or
 * its last row sits in a strip nobody can scroll to.
 *
 * ONE PROGRESS VALUE, HELD ABOVE THE NAVIGATORS, because a page is remounted
 * whenever you move between sections and the value has to outlive that.
 *
 * PLAIN JS SCROLL EVENTS, NOT `useAnimatedScrollHandler`. A Reanimated handler
 * only runs on the UI thread if it is attached to an `Animated.*` component,
 * which would mean converting every list in the app — and `Animated.FlatList`
 * on web is a different code path from the one the carousel already had to be
 * taught about (see `ContestCarousel`). Wiring a list is one spread — see
 * `useChromeScroll`.
 *
 * WHICH IS WHY THE THRESHOLD IS WORTH HAVING. What the handler does per event
 * is a compare, and it decides ONE thing: whether the strip is up or down. The
 * slide itself never touches JS again — it is a timing on a shared value, so it
 * plays at frame rate however busy the JS thread is, which a grid of cards
 * being virtualised very much is.
 *
 * NARROW ONLY. On wide web the rail is the navigation and the vertical budget
 * is not the problem it is on a phone; every part of this file no-ops there
 * rather than making each caller ask.
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
 * How far past the strip you must be before it goes.
 *
 * Measured from the strip's OWN height rather than from zero, which is what
 * makes the rule statable: the strip leaves once you have scrolled past where
 * it was. Earlier than that and it vanishes while still half on screen, which
 * reads as a flinch; much later and you are staring at a summary you finished
 * with two rows ago.
 *
 * It is also the safety. Collapsing makes the page taller, and on a barely
 * scrollable list that can remove the very scroll that brings the strip back —
 * so the trigger sits at a point from which there is always a strip's worth of
 * scrolling-up available to reach the top again.
 */
const PAST_STRIP = 8;

/**
 * Inside this much of the top the strip is down, whatever else is true.
 *
 * THIS IS THE ONLY WAY BACK, so it is deliberately generous about what counts
 * as the top: an offset that settles a point or two shy of zero, an iOS bounce
 * passing through it, a list whose first row is a hair taller than it measured.
 * Missing the top by 3pt and leaving the reader with no strip and no way to ask
 * for one is a far worse failure than showing it 8pt early.
 */
const TOP_ZONE = 8;

type Collapse = {
  /** 0 = strip fully drawn, 1 = fully collapsed. Read by the block. */
  progress: SharedValue<number>;
  /** The scroll handler shared by whichever list is on screen. */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Put the strip back immediately, no animation. Used on navigation. */
  reset: () => void;
  /**
   * The height of the page's retracting strip, where it has one.
   *
   * The trigger is stated in terms of it — see `PAST_STRIP` — so the handler
   * needs the number even though the slide itself does not.
   *
   * Zero on every page without a strip, which is why `CollapsingHeader` clears
   * it on the way out: a page with nothing to collapse must not inherit the
   * last page's height and start collapsing something that is not there.
   */
  setTravel: (h: number) => void;
};

const CollapseContext = createContext<Collapse | null>(null);

/**
 * Mounted once, above every tab — see `(app)/_layout`.
 *
 * It has to be above the navigators rather than inside a screen, or moving
 * between two pages would tear down the state that says where the strip is.
 */
export function ChromeCollapseProvider({ children }: { children: ReactNode }) {
  const progress = useSharedValue(0);
  const [travelPx, setTravel] = useState(0);

  /**
   * The strip's height, as the scroll handler needs to read it.
   *
   * A ref as well as the state it mirrors, because the handler has to read it
   * without being rebuilt — a handler that changed identity on every
   * measurement would be a new prop on every list that spreads it.
   */
  const travel = useRef(0);
  useEffect(() => {
    travel.current = Math.max(0, travelPx);
  }, [travelPx]);

  /* Whether the strip is up, JS-side, so an unchanged decision costs a compare
     rather than a fresh animation every scroll event. */
  const hidden = useRef(false);

  /**
   * THE ONE PLACE PROGRESS IS WRITTEN, and it stays one place for a rule rather
   * than for tidiness: a shared value may only be assigned from inside a single
   * hook closure, and `react-hooks/immutability` (rightly) reads a second one
   * as reaching into something another hook already captured.
   *
   * `now` skips the animation, which is what a navigation wants — a new page
   * should not be watching the last page's strip slide back down.
   */
  const settle = useCallback((next: boolean, now = false) => {
    if (hidden.current === next && !now) return;
    hidden.current = next;
    const to = next ? 1 : 0;
    progress.value = now
      ? to
      : /* 180 out, 200 back, out-cubic. Short enough to read as getting out of
           the way rather than as an animation you watch — this is ~50pt of
           travel, and anything slower is a strip you are waiting on. The way
           back is the slower of the two because it PUSHES the rows down, and
           motion that takes space needs longer to be followed than motion that
           gives it up. */
        withTiming(to, { duration: next ? 180 : 200, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => settle(false, true), [settle]);

  /**
   * Two positions and nothing else: past the strip it is up, at the top it is
   * down. No direction, no accumulator, no travel to store — which is what
   * makes it predictable to use and cheap enough to run at every event.
   */
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const d = travel.current;
      if (d <= 0) return;
      const y = e.nativeEvent.contentOffset.y;
      if (y <= TOP_ZONE) settle(false);
      else if (y > d + PAST_STRIP) settle(true);
    },
    [settle],
  );

  /* `progress` is deliberately not in the deps: passing it to a hook is what
     `react-hooks/immutability` reads as "do not assign to this". */
  const value = useMemo<Collapse>(
    () => ({ progress, onScroll, reset, setTravel }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onScroll, reset],
  );

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
 * Every page arrives with its strip drawn.
 *
 * Without this a list left scrolled would hand the next page a collapsed strip
 * it had no way to ask for — the new page starts at offset zero, so nothing
 * would ever scroll up to bring it back.
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
 * collapse the strip as you swiped sideways.
 *
 * Harmless on a page with no collapsing header: `travel` is zero there and the
 * handler returns on its first line. Returns nothing at all on wide web, so a
 * component shared by both layouts can spread it unconditionally.
 */
export function useChromeScroll(): {
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
} {
  const collapse = useCollapse();
  const wide = useIsWide();
  if (wide || !collapse) return NO_SCROLL;
  return { onScroll: collapse.onScroll, scrollEventThrottle: 16 };
}

const NO_SCROLL = {};

/**
 * A page's strip, and everything under it, sliding as ONE BLOCK.
 *
 * WHAT LEAVES AND WHAT STAYS IS `retract`, and it is a height rather than a
 * choice of children: the block slides up by exactly that, so whatever sits in
 * its first `retract` points goes off the top and everything below it lands
 * flush against the top of the frame. Put the part that may leave first, and
 * pass its measured height.
 *
 * MEASURE IT GENEROUSLY. A height rounded DOWN leaves the bottom edge of the
 * strip — a 1.5pt border — showing as a hairline under the controls, which is
 * exactly the bleed this went through two rounds of. Callers ceil.
 *
 * A LIST INSIDE THIS MUST ADD `retract` TO THE BOTTOM of its content padding.
 * The block is a strip taller than the frame, so at rest its last strip's worth
 * hangs below the screen edge; a list whose content ends inside that strip has
 * nothing to scroll and no way to show it. Anything that must stay pinned to
 * the bottom of the screen — a selection bar — belongs OUTSIDE this block.
 *
 * Narrow only. On wide web the children are returned in flow as they came,
 * which is what that layout wants anyway — nothing collapses there.
 */
export function CollapsingHeader({
  /** Height of the part that may leave — the top of `children`. */
  retract,
  children,
}: {
  retract: number;
  children: ReactNode;
}) {
  const collapse = useCollapse();
  const wide = useIsWide();
  const progress = collapse?.progress;

  /* ANNOUNCED, because the trigger is stated in terms of this height — see
     `PAST_STRIP`. Cleared on the way out, and that is the half that matters:
     this strip belongs to one page, and a page without one must not inherit the
     last page's height. */
  const publish = collapse?.setTravel;
  useEffect(() => {
    if (!publish) return;
    publish(wide ? 0 : retract);
    return () => publish(0);
  }, [publish, wide, retract]);

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: -retract * (progress?.value ?? 0) }],
  }));

  if (wide || !collapse) return <>{children}</>;

  /* Rendered whether or not `retract` has landed yet. Branching on the
     measurement would swap this subtree for a bare fragment on the first frame
     and back again on the second, and the child here is a virtualised grid — a
     remount it can see no reason for. */
  return (
    <View style={styles.clip}>
      <Animated.View style={[styles.block, { marginBottom: -retract }, slide]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* The frame. It clips because the block slides past its top edge, and a strip
     drawn over the section bar above would be worse than one that is gone. */
  clip: { flex: 1, overflow: 'hidden' },
  /* One strip taller than the frame — see the component. */
  block: { flex: 1 },
});
