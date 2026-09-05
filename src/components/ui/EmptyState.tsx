/**
 * The empty state, in the shape the spec calls for everywhere: a bold line
 * saying what is not here, a quieter line saying why, and at most one action.
 *
 * Shared because it was already written four times — the old combined player
 * directory, the player detail screen, the inventory and the sets panel each had
 * their own, with four different type scales and three different paddings. An empty state is the
 * screen a new user sees most often, so it is exactly the wrong thing to let
 * drift.
 *
 * AN OPTIONAL MARK, AND ONLY WHERE IT IS TRUE. This used to read "no
 * illustration" because there was nothing to draw — the set had no mark for a
 * league or a friend, and a greyed-out goalpost built from Views would have
 * been worse than the honest absence. The drawn set closes that gap, so
 * `glyph` exists now.
 *
 * IT IS STILL WRONG ON MOST OF THESE SCREENS. An empty state that reports a
 * FAILURE ("could not load the players") or a gap in the DATA ("not enough
 * football yet") is not an invitation, and dressing it with artwork tells the
 * reader the app is pleased about it. The mark belongs only on the empties
 * that describe a thing the reader has not done YET — no friends, no leagues —
 * where it names the thing that would fill the space.
 *
 * Quiet on purpose: tertiary ink at 40pt. It sits above the title as a
 * subject, not a decoration, and must never out-shout the line that says what
 * is missing.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import type { Glyph } from '@/components/icons/system';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  glyph,
  /** False inside a panel that already provides its own vertical room. */
  pad = true,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Only for an empty that names something the reader has not done yet. See
   * the header: never on a failure or a data gap.
   */
  glyph?: Glyph;
  pad?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.wrap, pad && styles.padded]}>
      {glyph ? (
        <View style={styles.mark}>
          <Icon glyph={glyph} size={40} color={c.textTertiary} focused />
        </View>
      ) : null}
      <Text style={[Type.section, styles.centre, { color: c.text }]}>{title}</Text>
      {body ? (
        <Text style={[Type.bodyRelaxed, styles.centre, styles.body, { color: c.textSecondary }]}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: c.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <Text style={[Type.strong, { color: c.text }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  /* The mark answers to the TITLE, not to the block: the wrap's own gap would
     set it the same distance from the heading as the heading is from the body,
     and a subject that floats equidistant between two lines belongs to
     neither. Half a step closer is what makes it read as the heading's. */
  mark: { marginBottom: -Spacing.one },
  padded: { paddingVertical: Spacing.five, paddingHorizontal: Spacing.four },
  centre: { textAlign: 'center' },
  /* A caveat is a sentence, so it gets a reading measure rather than the
     screen's full width — a 900pt-wide single line of grey is unreadable. */
  body: { maxWidth: 380 },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 8,
    marginTop: Spacing.two,
  },
  pressed: { opacity: 0.6 },
});
