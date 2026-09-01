/**
 * The two things you can do with a contest you are already in.
 *
 * ---------------------------------------------------------------------------
 * IT WAS PINNED, AND IT IS IN THE PAGE AGAIN
 * ---------------------------------------------------------------------------
 *
 * It lived in the sheet's footer slot for a while, and the reason was sound at
 * the time: the contest page had become a card, a leaderboard, nine rules and —
 * before you had entered — a lineup editor, so its bottom was four screens
 * down, and a control you have to scroll to is a control most people never
 * find. The one being hidden was the way OUT.
 *
 * TABS FIXED THAT, AND THEY FIXED IT BETTER. The page is three faces now, and
 * the one these belong to is a lineup and these two buttons — so both are in
 * view without pinning anything. What pinning cost was that the bar followed
 * the reader onto the other two faces, offering to take them off a page they
 * were still reading: navigation out of a screen, drawn over it, on every tab.
 *
 * So this renders inline, at the end of the lineup face, under the entry it
 * acts on.
 *
 * ---------------------------------------------------------------------------
 * ONCE A CARD HAS STARTED THIS DRAWS NOTHING AT ALL
 * ---------------------------------------------------------------------------
 *
 * `leave_contest` refuses the moment any of your players has kicked off, so
 * there has never been anything to press in that state. What was drawn instead
 * was a sentence — "Your cards have kicked off. This entry stands as it is." —
 * over a button reading `See my lineup`, and both had stopped being true of
 * this page. The lineup is ON the page now, directly above, with a hint that
 * already says `Locked in`; the sentence restated it and the button offered to
 * go and look at the thing the reader was looking at.
 *
 * So a locked entry renders null. A section that has nothing to offer should
 * take up no room, not explain itself.
 *
 * ---------------------------------------------------------------------------
 * THE PRIMARY IS THE EDITOR, AND ONLY WHILE THERE IS EDITING LEFT
 * ---------------------------------------------------------------------------
 *
 * `Edit my lineup` leaves for the Compete board, which owns the only editor for
 * an entry — a second copy here would be two editors for one lineup with no way
 * to know which you were changing. That makes it a real destination while the
 * cards can still change, and pure noise once they cannot, which is the whole
 * of the rule above: the button that leaves this page exists exactly as long as
 * leaving it does something.
 *
 * ---------------------------------------------------------------------------
 * LEAVING IS OUTLINED, NOT FILLED, AND IT IS NOT THE PRIMARY
 * ---------------------------------------------------------------------------
 *
 * The coins come back in full and you can enter again while the games are still
 * ahead, so a solid red button would be shouting a warning about a completely
 * reversible act. It sits beside the primary rather than under it, at its own
 * width, because it is the smaller of the two decisions here.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function ContestActions({
  entryFeeCoins,
  locked,
  canLeave,
  busy = false,
  onLineup,
  onLeave,
}: {
  entryFeeCoins: number;
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

  /* NOTHING TO CHANGE AND NOTHING TO LEAVE — see the header. */
  if (locked) return null;

  const leaveable = canLeave;

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Pressable
          onPress={onLineup}
          accessibilityRole="button"
          accessibilityLabel="Edit your lineup for this contest on the board"
          style={({ pressed }) => [
            styles.button,
            styles.primary,
            { backgroundColor: c.text },
            pressed && styles.pressed,
          ]}>
          <Text style={[Type.strong, { color: c.background }]}>Edit my lineup</Text>
        </Pressable>

        {leaveable ? (
          <Pressable
            onPress={onLeave}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={
              entryFeeCoins > 0
                ? `Leave this contest and take back ${entryFeeCoins} coins`
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
                {entryFeeCoins > 0 ? (
                  <Text style={[Type.fine, { color: c.textTertiary }]}>
                    {entryFeeCoins} coins back
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
