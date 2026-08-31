/**
 * A filter pill, and the scrolling row they sit in.
 *
 * Lifted out of `collection/CollectionFilters` unchanged, because the Players
 * directory needed the same control and had a different one: positions there
 * were an underlined `Tabs` strip, so the same act — narrowing a list of
 * players to one position — looked like navigation on one screen and like a
 * filter on the other. One component, both screens.
 *
 * SELECTION IS THE APP'S GOLD, FILLED. It was a white 1.5pt outline over a
 * lifted grey fill, which is the same "raised tile" the action bar and the
 * segmented control both moved off — a lot of furniture to say one word, and
 * on a row of seven chips the outline was the loudest mark on the screen while
 * being the one carrying the least meaning. Filling with `selectionAccent`
 * makes the selected chip the only warm thing in a grey row, which is the
 * treatment every other selected control in the app already uses.
 *
 * IT IS STILL NOT COLOUR ALONE, and it is now further from it than the outline
 * was: the label INVERTS, dark ink on a light fill against light text on a dark
 * one. That survives greyscale by a wide margin — #E3BE4A against
 * `backgroundElement` is most of the luminance range — where two dark greys a
 * border apart did not.
 *
 * The ink is the palette's own `gold.onAccent` rather than a black picked here,
 * so it moves if the accent ever does. 10.5:1 against the fill.
 *
 * `FilterChips` is the same chip put to a second job: the page-level toggles —
 * search, sort, tiers — that used to sit in the section's action bar. They came
 * out of it because the bar has to be identical on every page of a section, and
 * a page's own controls are by definition not. A chip is the right size for
 * them: they are worth one line, below the strip that says where you are.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Radius, Spacing, TierColors, Type, selectionAccent } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { horizontalStrip } from '@/components/ui/scroll-strip';

export function Chip({
  selected,
  label,
  count,
  children,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  selected: boolean;
  label?: string;
  /** e.g. how many cards match. Rendered quieter than the label. */
  count?: number;
  /** A badge drawn before the label — the tier chips use this. */
  children?: React.ReactNode;
  /**
   * Shown, dimmed, and unpressable.
   *
   * FOR A FACET WHOSE COUNT IS ZERO, which is not the same as a facet that does
   * not apply here. The inventory's decision chips carry counts that ARE the
   * answer — "Spares 0" is the reader learning they hold no duplicates — so
   * dropping the chip would take the answer with it, and leaving it pressable
   * would walk them into an empty grid to find out the same thing.
   */
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);
  /* The pair is fixed by construction — `selectionAccent` IS `gold.accent` —
     so reading the ink from the same swatch is what stops the two drifting. */
  const onAccent = TierColors[scheme].gold.onAccent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: disabled === true }}
      accessibilityLabel={accessibilityLabel}
      // The chip is 24pt tall so several facet rows fit above the fold; hitSlop
      // buys the touch target back without spending the pixels.
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={({ pressed }) => [disabled && styles.disabled, pressed && styles.pressed]}>
      <View
        style={[
          styles.chip,
          {
            backgroundColor: selected ? accent : c.backgroundElement,
            // Same colour as the fill, so the ring is invisible and the box
            // keeps the geometry below rather than growing a second edge.
            borderColor: selected ? accent : c.border,
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
          <Text style={[Type.label, styles.label, { color: selected ? onAccent : c.textSecondary }]}>
            {label}
          </Text>
        ) : null}
        {count === undefined ? null : (
          <Text
            style={[Type.label, NUMERIC, styles.count, { color: selected ? onAccent : c.textTertiary }]}>
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
      {...horizontalStrip}
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
  disabled: { opacity: 0.4 },
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
