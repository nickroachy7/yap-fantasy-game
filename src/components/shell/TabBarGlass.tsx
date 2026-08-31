/**
 * The floating tab pill's material.
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
 * plain view on its own, which would leave a transparent capsule with the grid
 * showing straight through the labels — legible nowhere. So the fallback is
 * drawn deliberately: `surfaceSheet` at 88%, which is the fill the bar had
 * when it was attached, plus the hairline that a floating object needs and an
 * attached one did not. It reads as a solid pill rather than a broken one.
 *
 * ---------------------------------------------------------------------------
 * WHY THE GLASS IS TINTED AND WHY THE SCHEME IS FORCED
 * ---------------------------------------------------------------------------
 *
 * Untinted regular glass over a near-black page comes out lighter than
 * anything else in the app — it is picking up a page that is mostly #000 and
 * adding UIKit's own luminance to it. A `surfaceSheet` tint pulls it back into
 * the app's own ramp, so the pill reads as one more layer above the page
 * rather than as a piece of somebody else's UI.
 *
 * `colorScheme` is passed rather than left on `auto` because this app has its
 * own theme and does not follow the system one. On `auto` a phone in light
 * mode would draw light glass under white-on-dark labels.
 */
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Called once at module load rather than per render.
 *
 * It is a device capability — an iOS version — so it cannot change while the
 * app is running, and calling it inside the component would cross the bridge
 * on every tab press for an answer that is already known.
 */
const LIQUID = isLiquidGlassAvailable();

export function TabBarGlass() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (LIQUID) {
    return (
      <GlassView
        style={StyleSheet.absoluteFill}
        glassEffectStyle="regular"
        tintColor={scheme === 'dark' ? 'rgba(14,16,19,0.55)' : 'rgba(255,255,255,0.55)'}
        colorScheme={scheme}
        /* The pill is a container for four buttons, not a button. Interactive
           glass reacts to touches on itself, which would put a highlight under
           the tab you pressed and a second one on the tab's own press state. */
        isInteractive={false}
      />
    );
  }

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.fallback,
        { backgroundColor: sheetAt88(c.surfaceSheet), borderColor: c.borderStrong },
      ]}
    />
  );
}

/**
 * `surfaceSheet` at 88%, without adding a second token for one use.
 *
 * The token is a six-digit hex in `theme.ts` and every other consumer wants it
 * opaque, so the alpha is applied here rather than by introducing a
 * `surfaceSheetTranslucent` that only this file would ever read. Falls back to
 * the flat colour if the token is ever changed to a form this cannot parse —
 * an opaque pill is a worse pill, not a broken screen.
 */
function sheetAt88(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.88)`;
}

const styles = StyleSheet.create({
  fallback: { borderWidth: StyleSheet.hairlineWidth },
});
