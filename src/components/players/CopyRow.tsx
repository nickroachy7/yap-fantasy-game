/**
 * One card, as the row the rest of the app already draws.
 *
 * WHY IT REUSES THE LINEUP'S ROW RATHER THAN DEFINING A THIRD ONE
 *
 * The Card tab described copies three different ways: the one you opened as a
 * progress bar plus a stack of labelled pairs, your others as a bespoke list
 * with a tier badge and a `FP TO SILVER` column, and the best copy in the game
 * as a sentence. Three treatments of one object, none of them the treatment a
 * player has already learned from the lineup board and the collection grid.
 *
 * `Identity` — the lineup row's body — is exported for exactly this. It draws
 * the name, the position and club, the injury code, the tier progress line and
 * a figure on the right, and it is the same code the starting lineup uses. A
 * reader who can read a lineup row can read this without being taught.
 *
 * WHAT IS TWEAKED, AND WHY
 *
 * The lineup's badge column carries a slot (`RB1`, `FLEX`) because that is what
 * a lineup row is FOR. Nothing here is in a lineup, so the slot is the caller's
 * to fill: a tier mark on your own copies, a rank on a leaderboard.
 *
 * `meta` is the second tweak. The lineup row's three lines are name, fixture,
 * tier progress — all about right now. A card's provenance ("acquired from a
 * pack in August", "started once, not yet scored") is about its history, and it
 * has nowhere to go in that shape. It goes UNDER the row as one quiet line
 * rather than into it, so the row stays the row and the history reads as a
 * footnote to it.
 *
 * The rule is inset to the gutter, drawn as a child rather than a border,
 * because a border cannot be inset — the same construction and the same reason
 * as the lineup's.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BADGE_WIDTH, Identity, type RowCard } from '@/components/lineup/LineupRow';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function CopyRow({
  card,
  badge,
  right,
  meta,
  progress,
  onPress,
  accessibilityLabel,
}: {
  card: RowCard;
  /** The left column: a tier mark, a rank, a season. */
  badge: ReactNode;
  /** The figure on the right of the identity block. */
  right: ReactNode;
  /** The history line under the row. One line; it truncates rather than wraps. */
  meta?: string;
  /**
   * Replaces the tier progress line inside the row.
   *
   * A leaderboard row has no progress to report — it is somebody else's copy
   * and we do not hold its thresholds — so it says who holds it instead.
   */
  progress?: { text: string } | null;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const body = (
    <>
      <View style={styles.content}>
        <View style={styles.badgeCol}>{badge}</View>
        <View style={styles.identity}>
          <Identity card={card} right={right} progress={progress} />
        </View>
      </View>

      {meta ? (
        <Text numberOfLines={1} style={[Type.fine, styles.meta, { color: c.textTertiary }]}>
          {meta}
        </Text>
      ) : null}
    </>
  );

  return (
    <View>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={({ pressed }) => [styles.press, pressed && { backgroundColor: c.backgroundElement }]}>
          {body}
        </Pressable>
      ) : (
        body
      )}
      <View style={[styles.rule, { backgroundColor: c.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  /* The press target reaches into the section's gutter on both sides, so the
     whole width of the row is tappable rather than only the text in it. */
  press: { marginHorizontal: -Spacing.three, paddingHorizontal: Spacing.three },
  content: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, paddingTop: Spacing.two },
  badgeCol: { width: BADGE_WIDTH, alignSelf: 'center' },
  identity: { flex: 1, minWidth: 0 },
  /* Indented to the identity block rather than the row, so it hangs under the
     name it is about and not under the badge. */
  meta: { paddingLeft: BADGE_WIDTH + Spacing.two, paddingBottom: Spacing.two },
  rule: { height: StyleSheet.hairlineWidth },
});
