/**
 * The two things you can do with a contest you are already in.
 *
 * ---------------------------------------------------------------------------
 * IT IS PINNED BECAUSE THE PAGE GREW
 * ---------------------------------------------------------------------------
 *
 * The contest page used to be short enough that a "Leave contest" line at the
 * bottom was in view. It is now a card, a leaderboard, nine rules and — before
 * you have entered — a lineup editor, so the bottom of it is four screens down.
 * A control that has to be scrolled to is a control most people never find, and
 * the one it hides here is the way OUT.
 *
 * So both live in the frame's footer slot, which draws its own fill, rule and
 * home-indicator inset — see `PlayerSheetFrame`. This component passes the
 * controls alone, exactly as `SetActions` does at the other end of the app.
 *
 * ---------------------------------------------------------------------------
 * LEAVING IS OUTLINED, NOT FILLED, AND IT IS NOT THE PRIMARY
 * ---------------------------------------------------------------------------
 *
 * The gems come back in full and you can enter again while the games are still
 * ahead, so a solid red button would be shouting a warning about a completely
 * reversible act. It sits beside the primary rather than under it, at its own
 * width, because it is the smaller of the two decisions on this bar.
 *
 * ---------------------------------------------------------------------------
 * ONCE A CARD HAS STARTED THERE IS NOTHING TO LEAVE
 * ---------------------------------------------------------------------------
 *
 * `leave_contest` refuses the moment any of your players has kicked off, and the
 * button used to be drawn anyway — so the page offered an exit that answered
 * with a server error. `locked` comes off your own row in `contest_field`,
 * which is the same computation the refusal uses, so the bar can say what is
 * true rather than guess at the fixtures.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function ContestActions({
  entryFeeGems,
  locked,
  canLeave,
  busy = false,
  onLineup,
  onLeave,
}: {
  entryFeeGems: number;
  /** Every card in your lineup has kicked off. Nothing can be changed or undone. */
  locked: boolean;
  /** False on the free contest — nobody joined it and nobody can leave it. */
  canLeave: boolean;
  busy?: boolean;
  onLineup: () => void;
  onLeave: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const leaveable = canLeave && !locked;

  return (
    <View style={styles.bar}>
      {locked ? (
        <Text style={[Type.fine, styles.note, { color: c.textTertiary }]}>
          Your cards have kicked off. This entry stands as it is.
        </Text>
      ) : null}

      <View style={styles.row}>
        <Pressable
          onPress={onLineup}
          accessibilityRole="button"
          accessibilityLabel="Open your lineup for this contest"
          style={({ pressed }) => [
            styles.button,
            styles.primary,
            { backgroundColor: c.text },
            pressed && styles.pressed,
          ]}>
          <Text style={[Type.strong, { color: c.background }]}>
            {locked ? 'See my lineup' : 'Edit my lineup'}
          </Text>
        </Pressable>

        {leaveable ? (
          <Pressable
            onPress={onLeave}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={
              entryFeeGems > 0
                ? `Leave this contest and take back ${entryFeeGems} gems`
                : 'Leave this contest'
            }
            accessibilityState={{ disabled: busy, busy }}
            style={({ pressed }) => [
              styles.button,
              styles.leave,
              { borderColor: c.negative },
              pressed && styles.pressed,
            ]}>
            {busy ? (
              <ActivityIndicator color={c.negative} />
            ) : (
              <>
                <Text style={[Type.strong, { color: c.negative }]}>Leave</Text>
                {entryFeeGems > 0 ? (
                  <Text style={[Type.fine, { color: c.textTertiary }]}>
                    {entryFeeGems} gems back
                  </Text>
                ) : null}
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: Spacing.one },
  note: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.two },
  button: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.control,
    gap: 1,
  },
  /* Takes the width the exit does not. The primary must not shrink to fit a
     two-line secondary. */
  primary: { flex: 1 },
  leave: { borderWidth: StyleSheet.hairlineWidth, minWidth: 96 },
  pressed: { opacity: 0.7 },
});
