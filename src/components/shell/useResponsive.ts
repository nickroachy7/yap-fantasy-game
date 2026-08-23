import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBarContentHeight } from '@/constants/theme';

/** Below this the sidebar costs more room than it earns. */
export const WIDE_BREAKPOINT = 900;

/**
 * Wide layout means "web, on a window big enough for a persistent sidebar".
 *
 * Deliberately gated on web as well as width: a tablet in landscape is wide
 * enough for a rail, but a native app with a left drawer instead of bottom tabs
 * fights every platform convention its users already know.
 */
export function useIsWide(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE_BREAKPOINT;
}

/**
 * How much room a screen must leave at the bottom so its last row is not hidden
 * behind the tab bar.
 *
 * Three cases, and the constant this replaced got two of them wrong:
 *  - wide web: no tab bar at all, the rail is beside the content. Zero.
 *  - anywhere else: the bar's own height PLUS the safe-area inset it sits on
 *    top of. On a home-indicator device those are 54 and 34, and reserving
 *    only the first leaves the last row half-covered.
 *
 * A hook rather than a constant because both answers depend on state that can
 * change while the app is running — window width on a resized browser, and the
 * safe area on rotation.
 */
export function useTabBarInset(): number {
  const isWide = useIsWide();
  const { bottom } = useSafeAreaInsets();
  const chrome = useBrowserChromeInset();
  return isWide ? 0 : TabBarContentHeight + bottom + chrome;
}

/**
 * How much of the bottom of the window a mobile browser is covering with its
 * own toolbar.
 *
 * THIS EXISTS BECAUSE THE TWO OBVIOUS ANSWERS ARE BOTH WRONG, and each was
 * shipped and seen on a phone before this one was written.
 *
 * Size the document to the SMALL viewport (`height: 100%`, which is what Expo's
 * reset ships, or the identical `100dvh`) and the app stops in a hard edge
 * above Safari's toolbar. The tab bar is the last thing in that box, so its
 * fill stops there too and the page shows through underneath as a black strip.
 *
 * Size it to the LARGE viewport (`100vh`) and the fill reaches the bottom of
 * the screen — but so does the bar, and the toolbar is drawn straight over the
 * icons and labels. They disappear behind it.
 *
 * What is actually wanted is both: the FILL running to the bottom of the
 * screen, the CONTENT sitting above the toolbar. So the document stays at
 * `100vh` and the bar pads its content up by the height of the chrome.
 *
 * And that height is exactly the difference between the two viewports the
 * browser already reports — `lvh` is the window without the chrome, `svh` is
 * the window with it. CSS can express it; React Native styles cannot hold a
 * `calc`, so it is measured once against a hidden probe and handed back as a
 * number.
 *
 * Re-measured on `visualViewport` changes, because the chrome is not a
 * constant: it collapses as you scroll and returns when you stop, and rotating
 * the phone changes it outright.
 *
 * Zero everywhere but web, where there is no browser chrome to account for and
 * `useSafeAreaInsets` already describes the whole problem.
 */
export function useBrowserChromeInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const measure = () => {
      const probe = document.createElement('div');
      /* `visibility: hidden` rather than `display: none` — a display-none box
         has no layout and would measure zero. Pinned out of the way so it can
         never affect the page it is measuring. */
      probe.style.cssText =
        'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;' +
        'height:calc(100lvh - 100svh)';
      document.body.appendChild(probe);
      const h = probe.getBoundingClientRect().height;
      probe.remove();
      /* A browser without `lvh`/`svh` resolves the calc to nothing and measures
         0, which is the correct answer for a desktop window anyway. Guarded
         against a negative or absurd result rather than trusted. */
      setInset(Number.isFinite(h) && h > 0 && h < 200 ? Math.round(h) : 0);
    };

    measure();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      vv?.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  return inset;
}
