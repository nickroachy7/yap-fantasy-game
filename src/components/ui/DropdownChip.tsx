/**
 * A chip that reads out its current value and opens a grid of alternatives.
 *
 * This is the spec's single most reused control — the week selector, the season
 * selector and the position filter are all this object with a different list —
 * so it is one component with a `columns` prop rather than three that drift.
 *
 * Why a popover grid instead of the segmented control we already have: a
 * segmented control is for two to four peers that all fit on one line. Weeks
 * are eighteen. Rendered as segments they become a horizontally scrolling strip
 * where the option you want is usually off-screen, and you cannot see week 14
 * and week 3 at the same time to compare. A 3-column grid shows the whole
 * season at once, which is the entire reason to have a week picker.
 *
 * The list is a Modal rather than an absolutely-positioned View because an
 * absolute child is clipped by any scroll container above it, and every one of
 * these sits inside one.
 */
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type DropdownOption<T extends string | number> = {
  value: T;
  label: string;
  /** Rendered but unselectable — a week with no fixtures, say. */
  disabled?: boolean;
};

export function DropdownChip<T extends string | number>({
  value,
  options,
  onChange,
  columns = 3,
  title,
  accessibilityLabel,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (next: T) => void;
  /** 1 for a plain list (seasons), 3 for a week grid. */
  columns?: number;
  /** Heading above the grid. Skipped when the chip's own label is enough. */
  title?: string;
  accessibilityLabel: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const [open, setOpen] = useState(false);

  const current = options.find((o) => o.value === value);

  const pick = useCallback(
    (next: T) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}. Currently ${current?.label ?? 'none'}.`}
        style={({ pressed }) => [
          styles.chip,
          { backgroundColor: c.backgroundElement, borderColor: c.border },
          pressed && styles.pressed,
        ]}>
        <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
          {current?.label ?? '—'}
        </Text>
        <Text style={[Type.fine, { color: c.textTertiary }]}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        // Android's hardware back must dismiss this, or the picker becomes a
        // trap on the one platform where it is not obvious how to escape.
        onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          {/* The dismiss target is a SIBLING of the sheet, not its parent.
              Wrapping the sheet in a pressable backdrop is the obvious way to
              write this and produces a button containing buttons, which is
              invalid HTML — react-native-web renders `accessibilityRole`
              "button" as a real <button>, and React rejects the nesting at
              runtime. As siblings, the sheet simply paints over the dismiss
              layer and presses inside it never reach the layer at all, so the
              usual stopPropagation dance is unnecessary too. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => setOpen(false)}
          />
          <View
            style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.borderStrong }]}>
            {title ? (
              <Text style={[Type.micro, styles.title, { color: c.textTertiary }]}>
                {title.toUpperCase()}
              </Text>
            ) : null}
            <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <Pressable
                    key={String(o.value)}
                    onPress={() => pick(o.value)}
                    disabled={o.disabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: o.disabled }}
                    style={({ pressed }) => [
                      styles.option,
                      // Percentage basis rather than a measured width: the sheet
                      // is capped, not fluid, so the arithmetic is stable.
                      { width: `${100 / columns}%` },
                      pressed && !o.disabled && styles.pressed,
                    ]}>
                    <View
                      style={[
                        styles.optionInner,
                        active && { backgroundColor: c.backgroundSelected },
                      ]}>
                      <Text
                        numberOfLines={1}
                        style={[
                          Type.body,
                          {
                            color: o.disabled
                              ? c.textTertiary
                              : active
                                ? c.text
                                : c.textSecondary,
                            fontWeight: active ? '700' : '500',
                          },
                        ]}>
                        {o.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 32,
    /* Hugs its label. Without this the chip stretches to fill whatever row it
       is dropped into, and a full-width "Week 2" reads as a text field. */
    alignSelf: 'flex-start',
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '80%',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  title: { paddingHorizontal: Spacing.two, paddingTop: Spacing.one },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  option: { padding: 2 },
  optionInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 8,
    minHeight: 38,
  },
  pressed: { opacity: 0.6 },
});
