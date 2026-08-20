/**
 * In-page tabs: switching what a screen SHOWS, not where you are.
 *
 * Distinct from `SectionNav`, which navigates between routes and therefore
 * changes the URL. These do not — they are local state, so they suit
 * "Season / Career / Splits" on one page where a route per view would be a
 * back-button trap.
 *
 * Underline rather than a pill, because the tab row here sits directly above a
 * dense table and a filled pill competes with the data for weight.
 */
import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { horizontalStrip } from '@/components/ui/scroll-strip';

export type Tab<T extends string> = {
  value: T;
  label: string;
  /** e.g. a count. Rendered quieter than the label, never as a badge pill. */
  hint?: string;
};

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  accent,
}: {
  tabs: Tab<T>[];
  value: T;
  onChange: (next: T) => void;
  accent?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const mark = accent ?? c.text;

  return (
    // Scrolls horizontally so a long tab set degrades by scrolling rather than
    // by wrapping into a second row that shifts the content below it.
    <ScrollView
      horizontal
      {...horizontalStrip}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
            <View style={styles.labelRow}>
              <Text
                numberOfLines={1}
                style={[Type.strong, { color: active ? c.text : c.textSecondary }]}>
                {t.label}
              </Text>
              {t.hint ? (
                <Text style={[Type.fine, { color: c.textTertiary }]}>{t.hint}</Text>
              ) : null}
            </View>
            {/* Always rendered, transparent when inactive, so selecting a tab
                never changes the row's height and nudges the page. */}
            <View
              style={[styles.underline, { backgroundColor: active ? mark : 'transparent' }]}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.four },
  tab: { gap: Spacing.one + 2, paddingTop: Spacing.one },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one + 2 },
  underline: { height: 2, borderRadius: 2 },
  pressed: { opacity: 0.6 },
});
