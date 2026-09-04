/**
 * A board's name and its count, on one baseline.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS SHARED RATHER THAN COPIED
 * ---------------------------------------------------------------------------
 *
 * It began inside `LineupEditor` as a private helper for the two boards on that
 * page — "Starting lineup 8/8 FILLED" and "Bench 6 CARDS" — and the collection
 * now opens the same way: "Inventory 31/30 HELD".
 *
 * That is not a coincidence to be re-typed. The two pages are the two halves of
 * the same loop, and a reader who has learned that a name on the left with a
 * count on the right means "this board, this full" should find it meaning the
 * same thing one tab over. Two copies drift — one gains a tone rule, the other
 * a different baseline — and the drift is invisible until they are seen
 * together, which on a phone they never are.
 *
 * ---------------------------------------------------------------------------
 * THE BASELINE IS THE POINT
 * ---------------------------------------------------------------------------
 *
 * `alignItems: 'baseline'` rather than centre: the label is `Type.section` and
 * the hint is `Type.micro`, so centring sets the small text floating in the
 * middle of the large one's line box. On a baseline they read as one line with
 * two weights, which is what they are.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function SectionHead({
  label,
  hint,
  tone,
  hintLabel,
  tight = false,
}: {
  label: string;
  /** Drawn uppercased. Keep it short — it shares one line with the name. */
  hint: string;
  /** The hint's colour, which is where a board says it is over or under. */
  tone: string;
  /**
   * What a screen reader hears instead of the hint.
   *
   * "31/30" is announced as "thirty-one slash thirty", which is not how anyone
   * says it. Pass the sentence — "31 of 30 cards held" — wherever the hint is
   * a ratio rather than words.
   */
  hintLabel?: string;
  /**
   * Pull the board under this heading up against it.
   *
   * `Screen` puts an even 14pt gap between its children, which leaves a heading
   * floating exactly between the board above and the board below — belonging to
   * neither. The negative margin spends that gap downward, so the heading sits
   * with the thing it names.
   *
   * OFF BY DEFAULT, because it is only right where a heading is one of several
   * children in that even rhythm. The collection's is inside its own toolbar
   * block and sets its own spacing; applying this there would crop the list.
   */
  tight?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={[styles.head, tight && styles.tight]}>
      <Text style={[Type.section, { color: c.text }]}>{label}</Text>
      <Text
        accessibilityRole="text"
        accessibilityLabel={hintLabel}
        style={[Type.micro, { color: tone }]}>
        {hint.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  /* See `tight`. */
  tight: { marginBottom: -Spacing.one - 2 },
});
