/**
 * The floating tab pill's material, and the fade that gives it clean ground.
 *
 * ---------------------------------------------------------------------------
 * THE SCRIM IS NOT DECORATION. IT IS WHAT MAKES A FLOATING BAR READABLE
 * ---------------------------------------------------------------------------
 *
 * A detached pill has content on every side of it — above, beside and beneath,
 * continuously, because the list scrolls through that ring. Without a fade you
 * get a player's name sliced in half by a capsule and avatar chips peering out
 * of the 20pt margins, which reads as a rendering fault rather than as depth.
 * The first version shipped exactly that.
 *
 * So a gradient sits behind the pill: transparent at the top, the page's own
 * black by the time it reaches the capsule, and solid from there down. Rows
 * dissolve into the background before they arrive rather than being cut by an
 * edge. It extends past the pill on every side — see `FADE` above it, and out
 * to the screen's edges — so the margins are clean ground rather than a window
 * onto the list.
 *
 * IT LIVES HERE RATHER THAN ON THE PAGE because `tabBarBackground` is the only
 * hook that renders between the scene and the bar's own contents. Drawing it
 * per page would mean every screen in the app owning a copy of the navigation's
 * appearance. The bar is `overflow: visible` for the same reason — a clipping
 * bar would crop this to the capsule and there would be nothing left to fade.
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
 * The glass is tinted and its scheme is forced. Untinted regular glass over a
 * near-black page comes out lighter than anything else in the app, and on
 * `auto` a phone in light mode would draw light glass under white labels — this
 * app has its own theme and does not follow the system one.
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
 * How far the fade reaches above the capsule.
 *
 * IT WENT IN AT 44 AND THAT WAS TOO FAR. The reasoning was that a lineup row is
 * 62 tall, so a fade a little under one row would catch a row before its type
 * reached the glass. What that missed is that the ramp is not the only thing
 * you see — everything under it is solid, so a 44pt fade darkens most of a row
 * ABOVE the capsule as well, and the bottom of the screen reads as dimmed
 * rather than as a bar sitting on a page.
 *
 * 24 keeps what the scrim is actually for. Rows still dissolve rather than
 * being sliced by the capsule's edge, because the dissolve only has to happen
 * in the few points before contact — not across a whole row.
 */
const FADE = 24;

export function TabBarGlass() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <>
      {/* OUT PAST THE PILL ON EVERY SIDE. The negative insets are the pill's
          own margins back out to the screen's edges, so the ring around the
          capsule is clean ground rather than a view of the list. */}
      <View
        style={[
          styles.scrim,
          { top: -FADE, start: -TabPillInset, end: -TabPillInset, bottom: -TabPillInset },
        ]}
        pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="tabScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.background} stopOpacity="0" />
              {/* Solid by the time it reaches the capsule's top edge, which is
                  `FADE` down a box of `FADE + height + inset`. */}
              <Stop
                offset={`${FADE / (FADE + TabPillHeight + TabPillInset)}`}
                stopColor={c.background}
                stopOpacity="1"
              />
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
            tintColor={scheme === 'dark' ? 'rgba(14,16,19,0.55)' : 'rgba(255,255,255,0.55)'}
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
