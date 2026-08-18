import { getTierTheme, type CardTier, type TierTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Resolves the tier palette + non-colour treatment for the active colour
 * scheme. `userInterfaceStyle` is `automatic`, and the web build resolves the
 * scheme only after hydration, so anything other than an explicit 'dark'
 * falls back to 'light'.
 */
export function useTierTheme(tier: CardTier): TierTheme {
  const scheme = useColorScheme();

  return getTierTheme(tier, scheme === 'dark' ? 'dark' : 'light');
}
