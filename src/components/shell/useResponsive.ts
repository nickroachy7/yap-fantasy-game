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
  return isWide ? 0 : TabBarContentHeight + bottom;
}
