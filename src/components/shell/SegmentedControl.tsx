/**
 * A two- or three-way switch inside a page — the trend board's up/down, the
 * shell gallery's view picker. Plain RN so it behaves identically on web and
 * iOS.
 *
 * NOT navigation any more, despite the name and the original doc comment: every
 * section's sub-pages moved into the action bar (see `SectionNav`), and what is
 * left here is filtering.
 *
 * The selected segment is marked in the app's gold, not with a raised tile. It
 * had the tile, and so did the action bar, and the two were the only controls
 * in the app that said "you are here" by drawing a box. The bar's was removed
 * for being louder than the thing it marked; leaving this one would have made
 * the same word mean two different shapes on one screen — on the trend board
 * they sit within a hundred points of each other. Both read `selectionAccent`
 * so they cannot drift apart again.
 */
import { StyleSheet, Text, View, Pressable } from 'react-native';

import { Colors, Radius, selectionAccent, Spacing, Type } from '@/constants/theme';
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
  const accent = selectionAccent(scheme);

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
              /* Either/or, never layered. See `grow` and `compactSegment`. */
              compact ? styles.compactSegment : styles.grow,
              pressed && !active && styles.pressed,
            ]}>
            <Text
              numberOfLines={1}
              style={[
                compact ? [Type.label, styles.compactLabel] : styles.label,
                { color: active ? accent : c.textSecondary },
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
   * IT SETS NO FLEX AT ALL, which is the fix that finally held. Two earlier
   * attempts to say "do not grow" both broke, in opposite directions and on
   * opposite platforms: `flex: 0` collapsed the segments on web, because
   * react-native-web expands the shorthand to `flexBasis: 0%`; spelling out
   * `flexGrow/flexShrink/flexBasis` fixed web and left iOS broken, because
   * Yoga got that alongside the base style's `flex: 1` and kept the shorthand.
   * A segment that sets nothing sizes to its contents on both, and the base
   * style no longer has a `flex` to argue with — see `segment` and `grow`.
   *
   * No `alignSelf` here either. It reads as "make it small" in a column, where
   * the cross axis is horizontal; in the row this now lives in, the cross axis
   * is vertical, so it only ever top-aligned the control against chips it is
   * supposed to sit level with. A track whose segments hug their labels needs
   * nothing to keep it narrow.
   */
  compactTrack: {
    /* Never shrinks. The row it lives in gives the chips `flex: 1`, so at any
       width where the pair together exceed the line the chips are the side that
       is supposed to give — they scroll, and this does not. Without it the
       track is squeezed and the labels go first, which is the failure that
       looks like the control is broken rather than merely narrow. */
    flexShrink: 0,
    borderRadius: Radius.chip + 2,
    padding: 2,
    gap: 2,
  },
  /** Full width, divided evenly — the ordinary segmented control. */
  grow: { flex: 1 },
  compactSegment: {
    minHeight: 24,
    paddingVertical: 0,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.chip,
  },
  /* Chips uppercase their labels in the component rather than at the call site,
     so a control sitting among them has to do the same or the row reads in two
     casings — the exact thing Chip's own note warns about. */
  /* `flexShrink: 0` here too, and it is the belt to the track's braces: a label
     is the entire content of a segment, so a squeezed one does not render
     smaller, it renders as nothing at all. */
  compactLabel: { textTransform: 'uppercase', flexShrink: 0 },
  /* NO `flex` HERE. It used to carry `flex: 1`, with the compact variant
     layering `flexGrow/flexShrink/flexBasis` over the top to switch it off —
     which works on web and does not work on iOS, and is the whole of the bug
     where the compact toggle rendered as an empty pill.
     
     react-native-web resolves styles to CSS, where a longhand after a shorthand
     wins, so `flexBasis: 'auto'` reliably beat `flex: 1`. Yoga is handed both in
     ONE merged style object and does not promise that ordering: `flex: 1`
     survived, the segments took a zero basis and grew into the track, and the
     labels — the entire content of a segment — clipped to nothing.
     
     So the two are mutually exclusive branches rather than a base and an
     override. Neither can silently win over the other because they are never
     both present. */
  segment: {
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
