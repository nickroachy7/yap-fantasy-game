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
 *
 * `FilterChips` is the same chip put to a second job: the page-level toggles —
 * search, sort, tiers — that used to sit in the section's action bar. They came
 * out of it because the bar has to be identical on every page of a section, and
 * a page's own controls are by definition not. A chip is the right size for
 * them: they are worth one line, below the strip that says where you are.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
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
            // Keep the box identical either way so nothing shifts on press:
            // the heavier selected border eats half a point on each side, so
            // the padding gives it back.
            paddingHorizontal: selected ? Spacing.two + 1 : Spacing.two + 2,
            paddingVertical: selected ? 4.5 : 5,
          },
        ]}>
        {children}
        {label ? (
          <Text style={[Type.label, styles.label, { color: selected ? c.text : c.textSecondary }]}>
            {label}
          </Text>
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
    borderRadius: Radius.chip,
    // One height for every chip on the page, whatever it holds — a label, a
    // count, a tier badge — so a row of them has a single baseline.
    minHeight: 28,
  },
  /* Uppercased HERE rather than by each caller, which is how the row ended up
     reading "ALL · QB · Career FP · SEARCH" — three casings in one strip.
     `Type.label` is specified as a 10pt uppercase style; this is what makes
     that true of every chip. */
  label: { textTransform: 'uppercase' },
  count: { fontWeight: '600' },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: Spacing.one },
  pressed: { opacity: 0.7 },
});


export type FilterChip = {
  key: string;
  label: string;
  active: boolean;
  onPress: () => void;
};

/**
 * A group of page-level toggles.
 *
 * Rendered after a divider when it shares a row with something else — the
 * position facets, usually — so "which position" and "show me the search box"
 * do not read as one list of eight equal choices.
 */
export function FilterChips({ items, divided }: { items: FilterChip[]; divided?: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  if (items.length === 0) return null;

  return (
    <>
      {divided ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
      {items.map((f) => (
        <Chip
          key={f.key}
          selected={f.active}
          label={f.label}
          onPress={f.onPress}
          accessibilityLabel={f.label}
        />
      ))}
    </>
  );
}
