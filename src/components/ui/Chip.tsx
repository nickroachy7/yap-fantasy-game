/**
 * A filter pill, and the scrolling row they sit in.
 *
 * Lifted out of `collection/CollectionFilters` unchanged, because the Players
 * directory needed the same control and had a different one: positions there
 * were an underlined `Tabs` strip, so the same act — narrowing a list of
 * players to one position — looked like navigation on one screen and like a
 * filter on the other. One component, both screens.
 *
 * Selection is not colour alone: the selected chip gains a heavier border and
 * a fill, both of which survive greyscale.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function Chip({
  selected,
  label,
  count,
  children,
  onPress,
  accessibilityLabel,
}: {
  selected: boolean;
  label?: string;
  /** e.g. how many cards match. Rendered quieter than the label. */
  count?: number;
  /** A badge drawn before the label — the tier chips use this. */
  children?: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      // The chip is 24pt tall so several facet rows fit above the fold; hitSlop
      // buys the touch target back without spending the pixels.
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={({ pressed }) => [pressed && styles.pressed]}>
      <View
        style={[
          styles.chip,
          {
            backgroundColor: selected ? c.backgroundSelected : c.backgroundElement,
            borderColor: selected ? c.text : c.border,
            borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
            // Keep the box identical either way so nothing shifts on press.
            paddingHorizontal: selected ? Spacing.two - 1 : Spacing.two,
            paddingVertical: selected ? 3.5 : 4,
          },
        ]}>
        {children}
        {label ? (
          <Text style={[Type.label, { color: selected ? c.text : c.textSecondary }]}>{label}</Text>
        ) : null}
        {count === undefined ? null : (
          <Text
            style={[Type.label, NUMERIC, styles.count, { color: selected ? c.text : c.textTertiary }]}>
            {count}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A tap on a facet with the search field focused must apply the facet,
      // not just dismiss the keyboard and be swallowed.
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, paddingRight: Spacing.two },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1, borderRadius: 7 },
  count: { fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
