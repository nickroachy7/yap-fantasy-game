/**
 * The floating tab pill's material, and the surround that gives it clean ground.
 *
 * ---------------------------------------------------------------------------
 * ONE SHAPE WITH A HOLE IN IT, BECAUSE FOUR RECTANGLES NEVER MEET CLEANLY
 * ---------------------------------------------------------------------------
 *
 * The surround was assembled out of separate bands — one above the capsule, one
 * below — and the pieces did not join. Beside the pill, in the 20pt margins
 * either side of it, nothing was drawn at all: content there went from 80%
 * dimmed to fully lit at exactly the capsule's top edge, which put a hard
 * horizontal line across a bench row every time one scrolled past. That is not
 * a tuning problem. Any surround built from rectangles that dodge the capsule
 * has seams wherever two of them abut.
 *
 * So it is ONE rectangle covering the whole region, with the capsule punched
 * out of it by a mask. There is nothing for a seam to form between, and the
 * dimming is continuous from the top of the fade to the bottom of the screen
 * and out to both edges.
 *
 * ---------------------------------------------------------------------------
 * THE HOLE IS WHAT KEEPS THE GLASS ALIVE
 * ---------------------------------------------------------------------------
 *
 * An earlier version blacked out everything from the capsule's top edge down.
 * It fixed rows being sliced and destroyed the reason the pill exists: glass
 * with a solid panel behind it has nothing to refract, so Liquid Glass rendered
 * as flat grey. The material only exists where content passes under it.
 *
 * The mask is the resolution. Everything around the capsule dims; the capsule's
 * own footprint stays perfectly clear, so the list runs under the glass exactly
 * as before. The pill reads as a lit window in a dimmed surround, which is what
 * Sleeper's does.
 *
 * ---------------------------------------------------------------------------
 * THE RAMP
 * ---------------------------------------------------------------------------
 *
 *   0                    transparent, `TOP_FADE` above the capsule
 *   at the capsule top   `SURROUND`, and it holds that value down the sides
 *   at the screen edge   solid
 *
 * SURROUND STOPS SHORT OF SOLID. Reaching full black at the capsule's edge
 * draws the same hard line this rewrite exists to remove, just in a different
 * place: black outside, lit content through glass inside. At 0.8 rows stay
 * faintly present as they pass, which is dimming a surround rather than erasing
 * it. Only the last strip goes solid, because it is too short to show a whole
 * row and a fragment at the screen's edge reads as a rendering fault.
 *
 * ---------------------------------------------------------------------------
 * REAL GLASS WHERE THERE IS REAL GLASS, AND A DESIGNED FALLBACK WHERE NOT
 * ---------------------------------------------------------------------------
 *
 * `expo-glass-effect` has been a dependency since the first commit and was
 * never used, so it is already in the native project — which is the only
 * reason this ships over the air rather than through TestFlight. It binds
 * UIKit's Liquid Glass, and that exists from iOS 26. `isLiquidGlassAvailable`
 * is the whole test.
 *
 * BELOW 26 IT MUST NOT LOOK LIKE THE GLASS FAILED. `GlassView` degrades to a
 * plain view on its own, which would leave a transparent capsule with the list
 * showing through the labels. So the fallback is drawn deliberately:
 * `surfaceSheet` at 88%, the fill the bar had when it was attached, plus the
 * hairline a floating object needs and an attached one did not.
 *
 * THE TINT IS LIGHT, AND IT WAS NOT. It went in at 55% on the argument that
 * untinted regular glass over a near-black page comes out lighter than anything
 * else in the app — true, but measured against a scrim that had already
 * blacked out everything behind it. With the content back, a 55% wash flattens
 * the refraction into a plain grey capsule. At 25% the app's own ramp still
 * pulls it back from UIKit's default luminance without paying in transparency.
 *
 * The scheme is forced rather than left on `auto`, because this app has its own
 * theme and does not follow the system one — on `auto` a phone in light mode
 * would draw light glass under white labels.
 */
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Mask, Rect, Stop } from 'react-native-svg';

import { Colors, TabPillHeight, TabPillInset } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Called once at module load rather than per render.
 *
 * It is a device capability — an iOS version — so it cannot change while the
 * app is running, and calling it inside the component would cross the bridge
 * on every tab press for an answer that is already known.
 */
const LIQUID = isLiquidGlassAvailable();

/** How far the dimming reaches above the capsule, and how dark it gets there. */
const TOP_FADE = 24;
const SURROUND = 0.8;

export function TabBarGlass() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /**
   * The surround spans the screen, and the mask needs real numbers.
   *
   * Percentages would do for the rectangle but not for the hole: the capsule
   * has to be punched at a fixed inset from both edges with a fixed corner
   * radius, and a radius cannot be expressed as a percentage of a box whose
   * width it does not follow. The scrim box IS the screen's width — it is the
   * bar, inset by `TabPillInset` on each side and then pushed back out by the
   * same amount — so the window's width is the right measure.
   */
  const { width } = useWindowDimensions();
  const height = TOP_FADE + TabPillHeight + TabPillInset;

  return (
    <>
      <View
        style={[
          styles.scrim,
          { top: -TOP_FADE, height, start: -TabPillInset, end: -TabPillInset },
        ]}
        pointerEvents="none">
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="tabSurround" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.background} stopOpacity="0" />
              {/* At the capsule's top edge, and held at the same value to its
                  bottom edge — so the margins either side of the pill are one
                  even tone rather than two bands with a seam between them. */}
              <Stop
                offset={`${TOP_FADE / height}`}
                stopColor={c.background}
                stopOpacity={`${SURROUND}`}
              />
              <Stop
                offset={`${(TOP_FADE + TabPillHeight) / height}`}
                stopColor={c.background}
                stopOpacity={`${SURROUND}`}
              />
              <Stop offset="1" stopColor={c.background} stopOpacity="1" />
            </LinearGradient>
            {/* White shows the dimming, black punches it away. The black
                capsule is the pill's exact footprint, so the glass sees the
                page unobstructed. */}
            <Mask id="tabHole">
              <Rect x="0" y="0" width={width} height={height} fill="white" />
              <Rect
                x={TabPillInset}
                y={TOP_FADE}
                width={width - TabPillInset * 2}
                height={TabPillHeight}
                rx={TabPillHeight / 2}
                fill="black"
              />
            </Mask>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={width}
            height={height}
            fill="url(#tabSurround)"
            mask="url(#tabHole)"
          />
        </Svg>
      </View>

      {/* The capsule itself, rounding on its own now that the bar has stopped
          clipping — see `overflow: 'visible'` in the tabs layout. */}
      <View style={styles.capsule}>
        {LIQUID ? (
          <GlassView
            style={StyleSheet.absoluteFill}
            glassEffectStyle="regular"
            tintColor={scheme === 'dark' ? 'rgba(14,16,19,0.25)' : 'rgba(255,255,255,0.25)'}
            colorScheme={scheme}
            /* The pill is a container for four buttons, not a button.
               Interactive glass reacts to touches on itself, which would put a
               highlight under the tab you pressed and a second one on the tab's
               own press state. */
            isInteractive={false}
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.fallback,
              { backgroundColor: sheetAt88(c.surfaceSheet), borderColor: c.borderStrong },
            ]}
          />
        )}
      </View>
    </>
  );
}

/**
 * `surfaceSheet` at 88%, without adding a second token for one use.
 *
 * The token is a six-digit hex in `theme.ts` and every other consumer wants it
 * opaque, so the alpha is applied here rather than by introducing a
 * `surfaceSheetTranslucent` that only this file would read. Falls back to the
 * flat colour if the token is ever changed to a form this cannot parse — an
 * opaque pill is a worse pill, not a broken screen.
 */
function sheetAt88(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.88)`;
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute' },
  capsule: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    borderRadius: TabPillHeight / 2,
    overflow: 'hidden',
  },
  fallback: { borderWidth: StyleSheet.hairlineWidth },
});
