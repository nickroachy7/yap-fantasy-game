/**
 * The facts about a person rather than a fantasy asset: age, size, school,
 * years in. All of this was already synced on `players` and had simply never
 * been rendered anywhere.
 *
 * Wraps rather than scrolls, and each fact is omitted entirely when unknown —
 * an empty "COLLEGE —" cell tells the reader nothing they wanted.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { PlayerBio } from './profile';

export function BioStrip({ bio }: { bio: PlayerBio }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const facts: { label: string; value: string }[] = [];
  if (bio.jerseyNumber) facts.push({ label: 'NO.', value: `#${bio.jerseyNumber}` });
  if (bio.age !== null) facts.push({ label: 'AGE', value: String(bio.age) });
  if (bio.height) facts.push({ label: 'HT', value: bio.height });
  if (bio.weight) facts.push({ label: 'WT', value: bio.weight });
  if (bio.experience) facts.push({ label: 'EXP', value: bio.experience });
  if (bio.college) facts.push({ label: 'COLLEGE', value: bio.college });

  if (facts.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {facts.map((f) => (
        <View key={f.label} style={[styles.fact, { borderColor: c.backgroundElement }]}>
          <Text style={[styles.label, { color: c.textSecondary }]}>{f.label}</Text>
          <Text numberOfLines={1} style={[styles.value, { color: c.text }]}>
            {f.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  fact: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
    gap: 1,
    minWidth: 64,
  },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  value: { fontSize: 13, fontWeight: '600' },
});
