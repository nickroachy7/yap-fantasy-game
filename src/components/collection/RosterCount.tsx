/**
 * "29/30", beside what the collection is worth.
 *
 * ---------------------------------------------------------------------------
 * IT WAS A FULL-WIDTH BAND
 * ---------------------------------------------------------------------------
 *
 * `RosterBar` — still right on the lineup, where it BLOCKS the screen it sits on
 * and the sentence is the remedy — is a bordered row carrying a count and a
 * sentence. On this screen it spent 41pt on two numbers, permanently, on the one
 * page whose whole argument is fitting more cards above the fold. Nearly all of
 * that width was empty.
 *
 * A cap is a GLANCE. You read it the way you read a battery: to see whether you
 * are near the end, not to read a sentence about it.
 *
 * ---------------------------------------------------------------------------
 * IT NEVER CHANGES COLOUR, AND THAT IS THE WHOLE OF THE DESIGN
 * ---------------------------------------------------------------------------
 *
 * Two earlier versions tinted it: amber near the cap, then amber-and-bordered
 * over it. Both were wrong for the same reason. A readout that changes colour is
 * trying to be an alert, and it is a bad one — there is no room beside two
 * digits for what to DO about the state it has gone loud about, so the reader
 * gets alarm without remedy and has to work out the rest themselves.
 *
 * Being over the cap is announced by `RosterAlert`, a real notice under this row
 * with the remedy written in it. That leaves this element with one job: say how
 * many of how many, in the same voice, always. It is `textSecondary` at 29/30
 * and `textSecondary` at 31/30.
 *
 * IT IS ALSO NOT PRESSABLE any more, for the same reason. A number that is
 * silently a button in one state is a control nobody discovers; the alert below
 * carries the explanation where it can actually be read.
 *
 * ---------------------------------------------------------------------------
 * WHY IT SITS BESIDE THE VALUE, AND WHY IT USED TO SIT AFTER THE BUTTON
 * ---------------------------------------------------------------------------
 *
 * It was last on the row, on the argument that a capacity reading belongs at
 * the end of a gauge — and on a real fear: a bare number immediately right of a
 * button reading "Select" invites being read as the button's count, which is
 * exactly the "Select 18" wording that was removed for saying the wrong thing.
 * The margin below is what kept them two objects.
 *
 * The row was rebuilt around two doors (`+ Sets`, `+ Packs`) and the end of it
 * is theirs now. This came to the head of the row instead, next to the value —
 * which is where it should have been all along. They are two facts about ONE
 * collection, what it is worth and how full it is, and a reader takes them in
 * together. Nothing sits beside this any more that could be mistaken for its
 * subject, so the adjacency risk went with the move.
 *
 * The margin stays, doing a smaller job: it keeps the count from binding to the
 * gold figure on its left as though it were part of the same number.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { PlayerState } from '@/context/PlayerContext';

export function RosterCount({ roster }: { roster: PlayerState['roster'] }) {
  const c = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];

  /* Nothing to draw before the roster has loaded. A "0/0" flashing into the
     corner on every cold start is worse than a figure that arrives late. */
  if (!roster) return null;

  return (
    <View style={styles.slot}>
      <Text
        accessibilityRole="text"
        accessibilityLabel={`${roster.held} of ${roster.cap} cards held`}
        style={[Type.body, NUMERIC, { color: c.textSecondary }]}>
        {`${roster.held}/${roster.cap}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* The left margin is load-bearing — see the header on adjacency. */
  slot: { flexShrink: 0, marginLeft: Spacing.half },
});
