/**
 * Sort control for the eligible and bench lists.
 *
 * Rendered as 9pt uppercase text rather than buttons: it sits directly above a
 * dense table, and three tappable pills there would outweigh the data they
 * reorder. The active key is marked by weight and colour, not by a fill.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import type { SortKey } from './model';

const OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'fp', label: 'SEASON FP' },
  { key: 'fppg', label: 'FP/G' },
  { key: 'name', label: 'NAME' },
];

export function SortBar({
  value,
  onChange,
  hint,
}: {
  value: SortKey;
  onChange: (next: SortKey) => void;
  /** Left-hand caption, e.g. "12 eligible". */
  hint?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.row}>
      {hint ? <Text style={[Type.micro, styles.hint, { color: c.textTertiary }]}>{hint}</Text> : null}
      <Text style={[Type.micro, { color: c.textTertiary }]}>SORT</Text>
      {OPTIONS.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${o.label.toLowerCase()}`}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => (pressed ? styles.pressed : null)}>
            <Text style={[Type.micro, { color: active ? c.text : c.textTertiary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 2,
  },
  hint: { flex: 1 },
  pressed: { opacity: 0.6 },
});
