/**
 * Sub-navigation within a tab (Cards: Players/Shop, Collection: Inventory/Sets).
 * Plain RN so it behaves identically on web and iOS.
 */
import { StyleSheet, Text, View, Pressable, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export type Segment<T extends string> = { value: T; label: string; badge?: string };

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.track, { backgroundColor: c.backgroundElement }]}>
      {segments.map((seg) => {
        const active = seg.value === value;
        return (
          <Pressable
            key={seg.value}
            onPress={() => onChange(seg.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.segment,
              active && { backgroundColor: c.background },
              pressed && !active && styles.pressed,
            ]}>
            <Text
              numberOfLines={1}
              style={[styles.label, { color: active ? c.text : c.textSecondary }]}>
              {seg.label}
            </Text>
            {seg.badge ? (
              <Text style={[styles.badge, { color: c.textSecondary }]}>{seg.badge}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
    minHeight: 38,
  },
  label: { fontSize: 13, fontWeight: '600' },
  badge: { fontSize: 11, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
