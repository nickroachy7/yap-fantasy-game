/**
 * The two page-level controls both browsing screens need: a search field and a
 * sort strip.
 *
 * They were written twice. The Players directory had its own `TextInput` with
 * its own height, radius and border, and its own sort chips — filled black when
 * active, with the caret inside — while the Collection had `SearchField` and a
 * `SortRow` whose chips were outlined when active and whose direction lived in
 * a SEPARATE chip beside them. Same two jobs, four components, and no two of
 * them agreed on a corner radius. Moving between the pages felt like moving
 * between apps.
 *
 * One of each now, sized from the shared scale. The behaviours were merged
 * rather than picked between, keeping the better half of each:
 *
 *   - pressing the ACTIVE key reverses it, which the directory had and the
 *     collection did not, and which anything shaped like a column header
 *     implies;
 *   - the direction is drawn INSIDE the active chip as a caret, so the row does
 *     not carry a second control that is meaningless until you have chosen a
 *     first;
 *   - a new key takes its own natural direction (see each screen's
 *     `DEFAULT_SORT_DIR`), so pressing "Name" cannot silently give you Z–A.
 */
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function SearchField({
  value,
  onChange,
  placeholder,
  hint,
  accessibilityLabel,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** e.g. "142 cards". Sits inside the field's row rather than on its own line. */
  hint?: string;
  accessibilityLabel: string;
  autoFocus?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.searchWrap, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel={accessibilityLabel}
        style={[Type.body, styles.search, { color: c.text }]}
      />
      {hint ? (
        <Text numberOfLines={1} style={[Type.micro, NUMERIC, { color: c.textTertiary }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export type SortOption<K extends string> = { key: K; label: string };

export function SortChips<K extends string>({
  options,
  value,
  dir,
  onPress,
}: {
  options: SortOption<K>[];
  value: K;
  dir: 'asc' | 'desc';
  /** Called for every press. The screen decides what a new key vs the active one means. */
  onPress: (key: K) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.sortRow}>
      <Text style={[Type.micro, styles.sortLabel, { color: c.textTertiary }]}>SORT</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.sortScroll}
        contentContainerStyle={styles.sortChips}>
        {options.map((o) => {
          const active = o.key === value;
          return (
            <Chip
              key={o.key}
              selected={active}
              // The caret rides in the active chip's own label, so five inactive
              // chips do not each reserve width for an arrow they will never
              // draw.
              label={active ? `${o.label} ${dir === 'asc' ? '↑' : '↓'}` : o.label}
              onPress={() => onPress(o.key)}
              accessibilityLabel={
                active
                  ? `Sorted by ${o.label}, ${dir === 'asc' ? 'ascending' : 'descending'}. Reverses the order.`
                  : `Sort by ${o.label}`
              }
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 34,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two + 2,
  },
  search: { flex: 1, minWidth: 0, height: '100%' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sortLabel: { flexShrink: 0 },
  sortScroll: { flexShrink: 1 },
  sortChips: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, paddingRight: Spacing.two },
});
