/**
 * What is under a card from a week that is over.
 *
 * ---------------------------------------------------------------------------
 * WHY THE EDITOR CANNOT JUST DRAW IT
 * ---------------------------------------------------------------------------
 *
 * The carousel and the board beneath it are ONE object — swiping the card
 * changes the slots, and a card sitting over a different contest's lineup is
 * the exact bug `20260825070000` exists to prevent. A recap card makes that
 * problem worse than a mismatched contest: it belongs to a different WEEK.
 * `useLineupData` is anchored to `lineup_slate()` and always will be, so under
 * a recap card it would draw the new week's empty slots beneath last week's
 * final score.
 *
 * So the recap card gets its own board, read from `contest_lineup` — the same
 * function the field's rows open, which returns a finished entry rather than an
 * editable one. Nothing here is pressable, there is no autosave line and no
 * bench, because there is no decision left to take.
 *
 * ---------------------------------------------------------------------------
 * IT POINTS BACK AT THE WEEK YOU CAN STILL PLAY
 * ---------------------------------------------------------------------------
 *
 * A recap is a thing you read once. Leaving somebody parked on it with the new
 * week one swipe away and nothing saying so is how the empty board this feature
 * was built to fix comes back wearing a result — so the way forward is a
 * control, not an inference.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EntryLineup } from '@/components/contests/EntryLineup';
import { useContestLineup } from '@/components/contests/use-contest-field';
import type { MyContest } from '@/components/contests/use-my-contests';
import { useAuth } from '@/context/AuthContext';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function RecapBoard({
  contest,
  onCurrent,
}: {
  contest: MyContest;
  /** Swipe the carousel back to the week that can still be played. */
  onCurrent?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { session } = useAuth();
  const { slots, loading, error } = useContestLineup(contest.id, session?.user.id ?? null);

  return (
    <View style={styles.wrap}>
      {/* WHY THIS BOARD IS NOT AN EDITOR, said before the rows rather than
          after them. Everything below is drawn exactly as the live board is,
          which is the point and also the risk: without this line a reader could
          spend a while wondering why nothing responds to a tap. */}
      <View style={[styles.note, { borderColor: c.border }]}>
        <Text style={[Type.body, { color: c.text }]}>This week is finished.</Text>
        <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
          Your entry is here to read while the next week gets going. Nothing in it
          can be changed, and the cards in it are back on your bench.
        </Text>
        {onCurrent ? (
          <Pressable
            onPress={onCurrent}
            accessibilityRole="button"
            accessibilityLabel="Go to this week's contest"
            style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
            <Text style={[Type.strong, { color: c.text }]}>Play this week →</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={[Type.fine, { color: c.negative }]}>{error}</Text>
      ) : loading && slots === null ? null : (
        <EntryLineup
          slots={slots ?? []}
          hint={contest.name}
          empty="Nothing was filed"
          emptyBody="This entry never had a card in it, so it scored nothing."
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  /* Bordered rather than filled: it is a caption on the board below it, not a
     warning about it. Nothing here went wrong. */
  note: {
    gap: Spacing.one,
    padding: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
  },
  go: { paddingTop: Spacing.one },
  pressed: { opacity: 0.6 },
});
