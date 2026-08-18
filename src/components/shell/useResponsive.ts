import { Platform, useWindowDimensions } from 'react-native';

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
