/**
 * The band under a pinned section strip: a solid shoulder, then an eased fade.
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------
 *
 * The section strip does not scroll. The page does. So the state that matters
 * is not the one at rest — it is every state after that, where a card slides up
 * and is guillotined against the strip's bottom border. Padding cannot help:
 * anything inside the scroll content travels with it and is gone the moment
 * something moves.
 *
 * What fixes a hard edge is a soft one. This is the scrim `TabBarGlass` lays
 * over the bottom of every page, mirrored.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS SHARED RATHER THAN COPIED
 * ---------------------------------------------------------------------------
 *
 * Two different frames put a scroller under that strip. `Screen` does it for
 * Lineups and Inventory; `PlayerSheetFrame` in page mode does it for Contests
 * and Sets, which are pages inside their sections but render through the sheet
 * frame. A reader crosses between them by tapping one tab, so the two edges
 * have to be the same edge — and two copies of a four-stop gradient would drift
 * the first time either was tuned.
 *
 * ---------------------------------------------------------------------------
 * THE NUMBERS
 * ---------------------------------------------------------------------------
 *
 * `SOLID` is full page background, and it is what stops the strip having
 * anything touching it at all: a card's border arriving at the exact pixel the
 * strip's border ends reads as one thick line, however soft the fade under it
 * is. Ten points of nothing is what separates the two objects; the fade only
 * handles what comes after.
 *
 * `RUN` is the fade proper, longer than the 24 this began at. `TabBarGlass`
 * uses 24 at the other end of the page, but it fades into a floating capsule
 * with margins either side; this fades into a full-width bar with a hard bottom
 * border, which is a more abrupt edge and wants a longer exit.
 *
 * FOUR STOPS, NOT TWO, and the middle pair is what makes it subtle. A straight
 * ramp from 1 to 0 is the most VISIBLE fade available: it has a corner at each
 * end, so the eye finds where it starts and where it stops and reads the band
 * as an object. These ease it — opacity falls quickly through the first third
 * and then tails off, so the bottom has no edge to find.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const SOLID = 10;
const RUN = 28;
export const TOP_FADE = SOLID + RUN;

export function TopFade({ top = 0 }: {
  /**
   * How far below the parent's top edge the band starts.
   *
   * IT IS NOT ALWAYS ZERO, and the reason is the difference between the two
   * frames this serves. A `ScrollView` takes its top gap as padding INSIDE the
   * content, so rows scroll up through the band and the band belongs at the
   * container's edge. A `scroll={false}` screen pads the CONTAINER instead and
   * puts a list inside it — that list clips at its own top, so nothing ever
   * enters the space above it, and a band drawn at the container's edge spends
   * its opaque half on empty page and lands only its weakest tail on the rows.
   * That reads as no fade at all.
   *
   * So the caller passes the offset it actually padded by, and the band starts
   * where the scrolling content starts.
   */
  top?: number;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    /* `pointerEvents="none"` throughout: it sits over the top of a scrolling
       list and must not eat the first row's taps, or a flick that starts under
       it. */
    <View style={[styles.fade, { top }]} pointerEvents="none">
      <Svg width="100%" height={TOP_FADE}>
        <Defs>
          <LinearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.background} stopOpacity="1" />
            {/* Held solid to the bottom of `SOLID`. */}
            <Stop offset={`${SOLID / TOP_FADE}`} stopColor={c.background} stopOpacity="1" />
            <Stop
              offset={`${(SOLID + RUN * 0.38) / TOP_FADE}`}
              stopColor={c.background}
              stopOpacity="0.58"
            />
            <Stop
              offset={`${(SOLID + RUN * 0.72) / TOP_FADE}`}
              stopColor={c.background}
              stopOpacity="0.2"
            />
            <Stop offset="1" stopColor={c.background} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={TOP_FADE} fill="url(#topFade)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Over the scroller, pinned to its top edge. Full width deliberately: the
     content may be capped at a measure and gutter-padded, but the thing being
     softened is the strip's border, which runs edge to edge. */
  fade: { position: 'absolute', left: 0, right: 0 },
});
