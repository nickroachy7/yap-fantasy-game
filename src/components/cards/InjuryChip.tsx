/**
 * Injury designation, rendered at the weight `injuryWeight()` assigns it.
 *
 * Two weights on purpose (see src/lib/injury.ts): `Questionable` is the most
 * common status in the feed, so shouting about it at the same volume as `Out`
 * would train people to ignore the warning entirely.
 *
 * Never colour alone — blocking carries a filled chip AND a bullet mark AND the
 * status text, so it survives greyscale and colour blindness.
 */
import { StyleSheet, Text, View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryWeight } from '@/lib/injury';

/**
 * Local rather than in the theme: `@/constants/theme` has no semantic status
 * palette and is owned elsewhere. Both pairs clear 4.5:1 on their background.
 */
const StatusColors = {
  light: { blockingBg: '#B3261E', blockingText: '#FFFFFF', advisory: '#8A5A00' },
  dark: { blockingBg: '#F2B8B5', blockingText: '#2B1513', advisory: '#F1C97A' },
} as const;

export function InjuryChip({ status, size = 'row' }: { status: string | null; size?: 'row' | 'detail' }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = StatusColors[scheme];
  const weight = injuryWeight(status);
  if (!weight || !status) return null;

  const label = status.trim().toUpperCase();
  const detail = size === 'detail';

  if (weight === 'blocking') {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Injury: ${status}. Unlikely to play.`}
        style={[styles.chip, { backgroundColor: c.blockingBg }, detail && styles.chipDetail]}>
        <Text
          numberOfLines={1}
          style={[styles.text, { color: c.blockingText }, detail && styles.textDetail]}>
          {`● ${label}`}
        </Text>
      </View>
    );
  }

  return (
    <Text
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Injury: ${status}. Uncertain.`}
      numberOfLines={1}
      style={[styles.quiet, { color: c.advisory }, detail && styles.textDetail]}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    flexShrink: 1,
  },
  chipDetail: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  text: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  textDetail: { fontSize: 12 },
  quiet: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, flexShrink: 1 },
});
