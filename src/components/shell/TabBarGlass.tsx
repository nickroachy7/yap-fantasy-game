/**
 * The floating tab pill's material, and the surround that gives it clean ground.
 *
 * ---------------------------------------------------------------------------
 * THE DIMMING IS UNIFORM ACROSS THE CAPSULE'S EDGE, OR IT IS AN EDGE
 * ---------------------------------------------------------------------------
 *
 * This has been wrong twice in opposite directions and the two failures share a
 * cause.
 *
 * First it was two rectangles, one above the pill and one below, with the 20pt
 * margins beside the pill left undrawn — so content there jumped from dimmed to
 * lit at the capsule's top edge and put a hard line across any row scrolling
 * past. Then it was one rectangle with the capsule MASKED OUT, which removed
 * that seam and created a subtler one in its place: the glass refracted
 * undimmed content while everything around it sat at 80%, so the pill read as
 * brighter than its surroundings and the step simply moved to the capsule's
 * own outline.
 *
 * ANY DIFFERENCE IN DIMMING ACROSS THAT BOUNDARY IS A VISIBLE EDGE. Masking a
 * hole does not avoid one, it just draws it in the shape of the pill. So the
 * gradient now runs straight through, capsule included, and there is nothing
 * anywhere for the eye to catch on.
 *
 * ---------------------------------------------------------------------------
 * WHICH MEANS THE VALUE, NOT THE SHAPE, IS WHAT KEEPS THE GLASS ALIVE
 * ---------------------------------------------------------------------------
 *
 * The very first attempt dimmed behind the pill to SOLID, and Liquid Glass with
 * nothing behind it renders as flat grey — the material only exists where
 * content passes under it. That is a real constraint and it is why the mask was
 * introduced. But solid was never the requirement; it was 100% that killed it.
 *
 * At `SURROUND` the page is still more than half visible, so the glass has
 * plenty to refract and the pill sits over a dimmed page the way a frosted
 * panel over a vignette actually would. Only the strip below the capsule goes
 * fully solid, and that is past the glass entirely — it is too short to show a
 * whole row, and a fragment at the screen's edge reads as a rendering fault.
 *
 *   0                    transparent, `TOP_FADE` above the capsule
 *   at the capsule top   `SURROUND`, held all the way to its bottom edge
 *   at the screen edge   solid
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
 * `surface` at 88%, plus the hairline a floating object needs and an attached
 * one did not.
 *
 * IT READS `surface`, NOT `surfaceSheet`, SINCE THE 2026-08-31 NEUTRAL PASS.
 * The bar used to sit on the sheet token and clear a #000 page by about 12
 * points. Lifting the page to #080808 moved the ground and left the bar where
 * it was, cutting that gap to 7 — the bar visibly dissolved into the page.
 * `surface` at 88% over #080808 lands ~13 points clear, which is where it was.
 * It is also the more honest token: `surfaceSheet` is documented as the body of
 * something presented OVER the app, and a floating bar is chrome that is
 * RAISED above the page, which is what `surface` means.
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
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

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

/**
 * How far the dimming reaches above the capsule, and how dark it gets there.
 *
 * 0.55 rather than 0.8, because the dimming now passes behind the glass rather
 * than dodging it. 80% left the page barely present under the pill; a little
 * over half keeps the surround obviously darkened while leaving the glass
 * something with real contrast to work on.
 */
const TOP_FADE = 24;
const SURROUND = 0.55;

export function TabBarGlass() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const height = TOP_FADE + TabPillHeight + TabPillInset;

  return (
    <>
      <View
        style={[
          styles.scrim,
          { top: -TOP_FADE, height, start: -TabPillInset, end: -TabPillInset },
        ]}
        pointerEvents="none">
        <Svg width="100%" height={height}>
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
          </Defs>
          <Rect x="0" y="0" width="100%" height={height} fill="url(#tabSurround)" />
        </Svg>
      </View>

      {/* The capsule itself, rounding on its own now that the bar has stopped
          clipping — see `overflow: 'visible'` in the tabs layout. */}
      <View style={styles.capsule}>
        {LIQUID ? (
          <GlassView
            /* THE RADIUS IS ON THE GLASS, not just on the box clipping it.
               UIKit draws Liquid Glass with its own rim — a bright edge
               treatment that is most of what makes it read as a material — and
               it derives that rim from the view's OWN corner radius. Left
               square inside a rounded parent, the rim is drawn as a rectangle
               and the parent's clip removes it at both ends, which is the same
               outline-stopping-before-the-corners the fallback had. Clipping
               cannot round an edge; it can only delete the parts outside the
               shape. */
            style={[StyleSheet.absoluteFill, styles.glass]}
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
              { backgroundColor: at88(c.surface), borderColor: c.borderStrong },
            ]}
          />
        )}
      </View>
    </>
  );
}

/**
 * A ramp token at 88%, without adding a second token for one use.
 *
 * The token is a six-digit hex in `theme.ts` and every other consumer wants it
 * opaque, so the alpha is applied here rather than by introducing a
 * translucent twin that only this file would read. Falls back to the flat
 * colour if the token is ever changed to a form this cannot parse — an opaque
 * pill is a worse pill, not a broken screen.
 */
function at88(hex: string): string {
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
  /**
   * IT NEEDS ITS OWN RADIUS. The border was drawn on an `absoluteFill` box with
   * square corners inside a parent that rounds and clips, so the hairline
   * survived along the straight edges and was cut away at both ends — an
   * outline that stopped before the corners, which is exactly how it looked.
   *
   * Clipping cannot round a border; it can only remove the parts outside the
   * shape. The border has to be drawn on the same shape it is meant to trace.
   */
  fallback: { borderWidth: StyleSheet.hairlineWidth, borderRadius: TabPillHeight / 2 },
  glass: { borderRadius: TabPillHeight / 2 },
});
