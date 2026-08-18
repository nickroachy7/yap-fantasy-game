/**
 * The empty state, in the shape the spec calls for everywhere: a bold line
 * saying what is not here, a quieter line saying why, and at most one action.
 *
 * Shared because it was already written four times — PlayersPanel, the player
 * detail screen, the inventory and the sets panel each had their own, with four
 * different type scales and three different paddings. An empty state is the
 * screen a new user sees most often, so it is exactly the wrong thing to let
 * drift.
 *
 * No illustration. Sleeper puts a mascot here; we have no mark to put and a
 * greyed-out goalpost drawn in Views would be worse than the honest absence.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  /** False inside a panel that already provides its own vertical room. */
  pad = true,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  pad?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.wrap, pad && styles.padded]}>
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
