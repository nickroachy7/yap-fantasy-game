/**
 * The directory's sort control.
 *
 * The table this list replaced sorted by pressing a column header, which is the
 * best control there is when there are columns: the thing you press IS the
 * thing you are ordering by. The redesigned row has no columns, so that
 * affordance had to be replaced rather than merely moved — an invisible sort is
 * worse than a verbose one.
 *
 * Chips rather than a dropdown, because sort is a control people toggle
 * repeatedly (points, then per-game, then back) and a dropdown costs two taps
 * and a modal each time. Pressing the ACTIVE chip reverses it, which is the
 * behaviour the column headers had and the one people expect from anything
 * shaped like this.
 */
import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SORT_OPTIONS, type SortKey, type SortState } from './player-directory';

export function SortBar({
  sort,
  onSort,
}: {
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.wrap}>
      <Text style={[Type.micro, styles.label, { color: c.textTertiary }]}>SORT</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {SORT_OPTIONS.map((option) => {
          const active = sort.key === option.key;
          const ascending = sort.dir === 'asc';
          return (
            <Pressable
              key={option.key}
              onPress={() => onSort(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={
                active
                  ? `Sorted by ${option.label}, ${ascending ? 'ascending' : 'descending'}. Reverses the order.`
                  : `Sort by ${option.label}`
              }
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: active ? c.text : c.backgroundElement,
                  borderColor: active ? c.text : c.border,
                },
                pressed && styles.pressed,
              ]}>
              <Text
                numberOfLines={1}
                style={[Type.fine, { color: active ? c.background : c.textSecondary }]}>
                {option.label}
              </Text>
              {/* Only the active chip carries a caret, so the arrow spills into
                  the chip's own padding rather than needing width reserved on
                  six chips that will never draw one. */}
              {active ? (
                <Text style={[Type.micro, { color: c.background }]}>{ascending ? '↑' : '↓'}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { flexShrink: 0 },
  row: { flexDirection: 'row', gap: Spacing.one + 2, paddingRight: Spacing.three },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 28,
  },
  pressed: { opacity: 0.6 },
});
