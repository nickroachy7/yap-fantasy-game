/**
 * A titled block of content.
 *
 * The title sits OUTSIDE the surface rather than inside it — a heading inside a
 * filled card costs a line of padding above and below, and on a screen made of
 * six panels that is a whole panel's worth of scrolling spent on chrome.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function Panel({
  title,
  hint,
  action,
  children,
  inset = true,
}: {
  title?: string;
  /** A quiet qualifier: "last 5 seasons", "excludes bonuses". */
  hint?: string;
  /** Right-aligned control on the title row — a tab set, a toggle. */
  action?: ReactNode;
  children: ReactNode;
  /** False when the child draws its own edges (a full-bleed table). */
  inset?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.wrap}>
      {title || action ? (
        <View style={styles.head}>
          <View style={styles.headText}>
            {title ? <Text style={[Type.section, { color: c.text }]}>{title}</Text> : null}
            {hint ? <Text style={[Type.fine, { color: c.textTertiary }]}>{hint}</Text> : null}
          </View>
          {action}
        </View>
      ) : null}
      <View
        style={[
          inset && styles.surface,
          inset && { backgroundColor: c.surface, borderColor: c.border },
        ]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headText: { gap: 1, flexShrink: 1 },
  surface: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
