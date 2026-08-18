/**
 * A small state label: `LIVE`, `FINAL`, `LOCKED`, `NEW`.
 *
 * The spec uses one chip shape for every status in the app and varies only the
 * tone, which is what makes a status readable without reading it. This is that
 * chip. Tone is semantic, not decorative — pick by what the state MEANS, not by
 * what colour looks right in the row.
 *
 * `live` is deliberately the only filled-and-saturated tone. If everything is
 * emphasised nothing is, and the one status a fantasy app must never bury is
 * "this is happening right now".
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ChipTone = 'neutral' | 'live' | 'positive' | 'negative' | 'warning';

export function StatusChip({
  label,
  tone = 'neutral',
  /** Overrides the tone's fill — for a chip carrying a position's colour. */
  accent,
}: {
  label: string;
  tone?: ChipTone;
  accent?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const { bg, fg } = (() => {
    if (accent) return { bg: accent, fg: scheme === 'dark' ? c.background : '#FFFFFF' };
    switch (tone) {
      case 'live':
        return { bg: c.negative, fg: scheme === 'dark' ? '#1A0708' : '#FFFFFF' };
      case 'positive':
        return { bg: 'transparent', fg: c.positive };
      case 'negative':
        return { bg: 'transparent', fg: c.negative };
      case 'warning':
        return { bg: 'transparent', fg: c.warning };
      default:
        return { bg: c.backgroundElement, fg: c.textSecondary };
    }
  })();

  const filled = bg !== 'transparent';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.chip,
        filled ? { backgroundColor: bg } : { borderWidth: StyleSheet.hairlineWidth, borderColor: fg },
      ]}>
      <Text numberOfLines={1} style={[Type.micro, { color: fg }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    flexShrink: 1,
  },
});
