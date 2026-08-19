/**
 * Sub-navigation within a tab (Cards: Players/Shop, Collection: Inventory/Sets).
 * Plain RN so it behaves identically on web and iOS.
 */
import { StyleSheet, Text, View, Pressable } from 'react-native';

import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type Segment<T extends string> = { value: T; label: string; badge?: string };

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  compact,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (next: T) => void;
  /**
   * Hug the labels instead of dividing the width.
   *
   * A control that spans the page reads as the page's SUBJECT — which is right
   * for a two-way split of everything below it, and wrong for a switch sitting
   * under a row of filter chips it is a peer of. Full width, the trend board's
   * up/down toggle was the loudest thing on the screen and looked like a second
   * navigation; hugging, it reads as what it is: one more filter.
   */
  compact?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View
      style={[
        styles.track,
        compact && styles.compactTrack,
        { backgroundColor: c.backgroundElement },
      ]}>
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
              compact && styles.compactSegment,
              active && { backgroundColor: c.background },
              pressed && !active && styles.pressed,
            ]}>
            <Text
              numberOfLines={1}
              style={[
                compact ? [Type.label, styles.compactLabel] : styles.label,
                { color: active ? c.text : c.textSecondary },
              ]}>
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
  /* COMPACT IS SIZED TO `Chip`, DELIBERATELY AND TO THE POINT.
   *
   * This variant exists to stand at the end of a row of position chips, so it
   * has to be the same object at a glance: 28pt tall, the same corner, the same
   * 10pt uppercase label at the same tracking, the same 10pt of air either side
   * of the words. Every number below is Chip's number, not one picked to look
   * close — 24 + 2 + 2 of track padding is the 28 a chip states outright, and
   * `Radius.chip` inset by that padding is what makes the outer corner sit
   * concentric with a chip's rather than a point tighter or looser.
   *
   * NOT `flex: 0`, which is the obvious way to stop a segment growing and is
   * wrong on web: react-native-web expands the shorthand to
   * `flexGrow: 0; flexShrink: 0; flexBasis: 0%`, so each segment got a zero
   * base width, never grew back, and rendered as 20pt of padding around a
   * label clipped to nothing. The three properties are spelled out instead,
   * with `flexBasis: 'auto'` — size to your contents — which is what `flex: 0`
   * means everywhere except in the shorthand.
   *
   * No `alignSelf` here either. It reads as "make it small" in a column, where
   * the cross axis is horizontal; in the row this now lives in, the cross axis
   * is vertical, so it only ever top-aligned the control against chips it is
   * supposed to sit level with. A track whose segments hug their labels needs
   * nothing to keep it narrow.
   */
  compactTrack: {
    borderRadius: Radius.chip + 2,
    padding: 2,
    gap: 2,
  },
  compactSegment: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    minHeight: 24,
    paddingVertical: 0,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.chip,
  },
  /* Chips uppercase their labels in the component rather than at the call site,
     so a control sitting among them has to do the same or the row reads in two
     casings — the exact thing Chip's own note warns about. */
  compactLabel: { textTransform: 'uppercase' },
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
