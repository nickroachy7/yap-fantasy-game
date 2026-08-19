/**
 * The palette, for the handful of components that take a whole theme object
 * rather than picking colours out of `Colors` themselves (themed-text,
 * themed-view, collapsible).
 *
 * One scheme, resolved through `useColorScheme` so a future toggle reaches
 * these components too. See that hook for why the app is dark everywhere.
 */
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  return Colors[useColorScheme()];
}
