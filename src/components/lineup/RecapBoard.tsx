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
 * IT IS THE BOARD'S HEADING AND THE BOARD'S ROWS, AND NOTHING ELSE
 * ---------------------------------------------------------------------------
 *
 * This carried a bordered block between the card and the rows:
 *
 *     This week is finished.
 *     Your entry is here to read while the next week gets going. Nothing in it
 *     can be changed, and the cards in it are back on your bench.
 *     Play this week →
 *
 * Four lines of permanent furniture standing between the two things a reader
 * came to this screen for, every time they swiped to it. It went in two steps
 * and the second is the one worth recording.
 *
 * FIRST the block became a hint and a control on the heading row — smaller, but
 * still two things the live board does not have. And that is what was wrong
 * with it: the carousel's whole promise is that swiping changes the CONTEST and
 * not the page, so a heading that grows a subtitle and a link on one page and
 * loses them on the next makes the rows under it jump by a line every time you
 * cross that boundary. Two words of guidance are not worth a board that moves.
 *
 * So the heading is `Starting lineup` on both, and every sentence is somewhere
 * that was already going to be read:
 *
 *   "This week is finished"      THE CARD, which is written in the past tense
 *                                once the week is final — `STAKED` and `EARNED`
 *                                where `RISK` and `REWARD` were, over a score
 *                                that has stopped moving. A band that has
 *                                stopped asking for a decision IS the finished
 *                                state; a sentence underneath saying so was the
 *                                card's own news reported by its neighbour.
 *
 *   "Nothing can be changed"     The absence of every control. There is no swap
 *                                target, no autosave line and no bench, which a
 *                                reader learns in the half-second it takes to
 *                                not find them — and `WelcomeBackBanner` is the
 *                                one place this is TAUGHT, once, on the way in.
 *
 *   "Play this week →"           The rack and the chevrons, which are the
 *                                carousel's navigation on every other page and
 *                                are directly above this one. A control that
 *                                duplicates the page's own pager, on one page
 *                                out of four, is not a way forward — it is a
 *                                second way forward that has to be learned.
 *
 *   "Cards back on your bench"   Cut. It is true and it is not urgent: the
 *                                bench is one tab away and shows it, and this
 *                                line was being read every week by somebody who
 *                                only needed it once.
 */
import { StyleSheet, Text, View } from 'react-native';

import { EntryLineup } from '@/components/contests/EntryLineup';
import { useContestLineup } from '@/components/contests/use-contest-field';
import type { MyContest } from '@/components/contests/use-my-contests';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function RecapBoard({ contest }: { contest: MyContest }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { session } = useAuth();
  const { slots, loading, error } = useContestLineup(contest.id, session?.user.id ?? null);

  return (
    <View style={styles.wrap}>
      {error ? <Text style={[Type.fine, { color: c.negative }]}>{error}</Text> : null}
      <EntryLineup
        slots={slots ?? []}
        /* THE BOARD IS ITS FINAL HEIGHT FROM THE FIRST FRAME. This used to
           render nothing at all while the read was open, which took the board
           to nought and sprang it back to eight rows — the page bouncing on
           every swipe onto a finished contest, and the whole of why that swipe
           did not feel like a swipe between two live ones. The contest knows
           its own slot count, so the reservation is exact and the real rows
           land without moving anything. See `RowSkeleton`. */
        loading={loading}
        placeholder={contest.slotCount}
        /* NO HINT AND NO CONTROL — the live board's heading is the bare
           `Starting lineup · 3/3 filled`, and anything extra here is a line
           that appears and disappears as the carousel is swiped. See the
           head of this file. */
        empty="Nothing was filed"
        emptyBody="This entry never had a card in it, so it scored nothing."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  /* Vertical padding only: the heading row aligns its children to the baseline
     of the title, and a hit target the size of its own text is the smallest
     thing on this screen anybody has to press. */
  go: { paddingVertical: Spacing.one, flexShrink: 0 },
  pressed: { opacity: 0.6 },
});
