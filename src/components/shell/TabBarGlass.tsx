/**
 * The floating tab pill's material, and the fade that gives it clean ground.
 *
 * ---------------------------------------------------------------------------
 * THE FADE IS BELOW THE CAPSULE, NEVER BEHIND IT
 * ---------------------------------------------------------------------------
 *
 * The first scrim ran from 44pt above the pill down to the screen's edge and
 * was fully opaque from the capsule's top edge onward. It solved the problem it
 * was aimed at — rows sliced by the capsule's edge — and destroyed the reason
 * the pill exists: glass with a solid black panel behind it has nothing to
 * refract, so the Liquid Glass rendered as a flat grey capsule. The material
 * only exists where content passes under it.
 *
 * So content stays visible behind the glass, and the fade is a 20pt band
 * BELOW the capsule, transparent at its top and the page's own black by the
 * screen's edge. That is the one place a scrim is unambiguously worth it: the
 * strip between the pill and the bottom of the screen is too short to show a
 * whole row, so whatever lands in it is always a fragment, and a fragment
 * reads as a rendering fault. Everywhere else the content showing through IS
 * the effect.
 *
 * It reaches out past the pill's own margins to the screen's edges, so the band
 * runs the full width rather than stopping under the capsule's ends.
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
 * else in the app — true, but that was measured against a scrim that had
 * already blacked out everything behind it. With the content back, a 55% wash
 * flattens the refraction into a plain grey capsule and the tint becomes a
 * second thing muting the effect. At 25% the app's own ramp still pulls it back
 * from UIKit's default luminance without paying for it in transparency.
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
 * How far the fade reaches ABOVE the capsule, and how dark it gets there.
 *
 * This is the safe place to add weight. Above the pill's top edge is outside
 * the glass's own footprint, so darkening it cannot flatten the refraction the
 * way the first scrim did — that one was opaque from the capsule's top edge
 * DOWN, which is precisely the region the glass needs to see.
 *
 * IT STOPS AT 0.8 RATHER THAN GOING SOLID. A fade that reaches full black
 * exactly at the capsule's top edge draws a hard line there: black above,
 * content visible through glass below. Stopping short keeps rows faintly
 * present as they meet the pill, which is what the darkening around Sleeper's
 * bar actually does — it dims its surroundings rather than erasing them.
 *
 * 24 against the earlier 44: that one was both too tall and fully opaque, and
 * it made the bottom of every screen read as dimmed. This is a softening at the
 * point of contact.
 */
const TOP_FADE = 24;
const TOP_FADE_TO = 0.8;

export function TabBarGlass() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <>
      {/* ABOVE THE CAPSULE, so rows dim as they arrive at it rather than
          meeting a hard edge. Outside the glass's footprint — see `TOP_FADE`. */}
      <View
        style={[
          styles.scrim,
          { top: -TOP_FADE, height: TOP_FADE, start: -TabPillInset, end: -TabPillInset },
        ]}
        pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="tabScrimTop" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.background} stopOpacity="0" />
              <Stop offset="1" stopColor={c.background} stopOpacity={`${TOP_FADE_TO}`} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#tabScrimTop)" />
        </Svg>
      </View>

      {/* THE BAND UNDER THE CAPSULE. `top: TabPillHeight` is the bar's own
          bottom edge, so this occupies exactly the margin between the pill and
          the screen — nothing sits behind the glass. */}
      <View
        style={[
          styles.scrim,
          { top: TabPillHeight, height: TabPillInset, start: -TabPillInset, end: -TabPillInset },
        ]}
        pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="tabScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.background} stopOpacity="0" />
              {/* SOLID BY HALFWAY, not at the very last pixel. Ramping evenly
                  across all 20 points meant the band never actually reached
                  black on screen — the darkest it ever got was the bottom edge
                  itself, so a row sitting in the strip stayed legible and the
                  fade read as absent. Reaching black at the midpoint gives a
                  10pt dissolve and 10pt of clean ground under it, which is what
                  makes it visible at all. Starting at zero rather than at a low
                  opacity keeps the capsule's bottom edge seamless. */}
              <Stop offset="0.5" stopColor={c.background} stopOpacity="1" />
              <Stop offset="1" stopColor={c.background} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#tabScrim)" />
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
