/**
 * Somebody else's team, in one contest.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A PAGE AND NOT A ROW THAT OPENS
 * ---------------------------------------------------------------------------
 *
 * The field used to expand a rival's slots inside the row you tapped: four
 * columns, 11pt, squeezed under a 40pt list row. That is the densest object in
 * the game — a lineup — drawn at the size of a footnote, and only one could be
 * open at a time on a page whose whole point is comparing one manager with
 * another.
 *
 * A lineup is a page everywhere else in this app. It is a page here too.
 *
 * ---------------------------------------------------------------------------
 * IT IS READ-ONLY, AND THAT IS SAID IN THE FRAME RATHER THAN PER ROW
 * ---------------------------------------------------------------------------
 *
 * Nothing here is pressable, no slot offers a swap, and there is no autosave
 * line — which between them is the strongest statement the screen can make. The
 * one sentence that is written down is the one the layout cannot say: whether
 * what you are reading is settled, or a draft they can still change before
 * kickoff.
 *
 * ---------------------------------------------------------------------------
 * IT TAKES IDS, AND ON PURPOSE
 * ---------------------------------------------------------------------------
 *
 * `/entry/<contest uuid>/<user uuid>`. The contest's `code` would read better,
 * but both RPCs behind this page are keyed by the contest's id, and a route
 * that had to resolve a code to an id before it could ask anything would put a
 * lookup in front of every open. The contest's NAME comes in as a param so the
 * subtitle is right on the first frame; a cold deep link has none and falls
 * back to the plain word, which is the only thing it costs.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EntryLineup } from '@/components/contests/EntryLineup';
import { useContestField, useContestLineup } from '@/components/contests/use-contest-field';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { SummaryStrip } from '@/components/ui/SummaryStrip';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** The place, spelled out. The strip has room and "3RD" reads better than "3". */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export default function EntryLineupScreen() {
  const { contest, user, name } = useLocalSearchParams<{
    contest: string;
    user: string;
    /** The contest's name, handed over so the subtitle needs no second fetch. */
    name?: string;
  }>();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const contestId = typeof contest === 'string' ? contest : null;
  const userId = typeof user === 'string' ? user : null;

  const { entrants, loading: fieldLoading, error: fieldError } = useContestField(contestId);
  const { slots, loading, error } = useContestLineup(contestId, userId);

  const entrant = useMemo(
    () => entrants?.find((e) => e.userId === userId) ?? null,
    [entrants, userId],
  );

  /* Same guard as every other sheet in the stack: `back()` on an empty stack
     does nothing, so a page opened from a link or a refreshed browser tab had
     a close button that did not close. The contest is what is underneath this
     one — but only its code would address it, and this route holds the id, so
     the fallback goes to the board rather than guessing. */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/fantasy/compete');
  }, [router]);

  const rows = slots ?? [];
  const scored = entrant !== null && entrant.points > 0;

  return (
    <PlayerSheetFrame
      title={entrant?.displayName}
      subtitle={
        entrant
          ? [name, `${ordinal(entrant.rank)} of ${entrants?.length ?? 0}`]
              .filter(Boolean)
              .join(' · ')
          : (name ?? undefined)
      }
      onClose={close}
      closeLabel="Close lineup">
      {fieldError ?? error ? (
        <Text style={[Type.fine, { color: c.negative }]}>{fieldError ?? error}</Text>
      ) : (loading || fieldLoading) && slots === null ? null : (
        <View style={styles.body}>
          {entrant ? (
            <SummaryStrip
              cells={[
                {
                  key: 'points',
                  label: 'POINTS',
                  value: scored ? entrant.points.toFixed(1) : '—',
                  accessibilityLabel: scored
                    ? `${entrant.points.toFixed(1)} points`
                    : 'No points yet',
                },
                {
                  key: 'rank',
                  label: 'PLACE',
                  value: ordinal(entrant.rank),
                  accessibilityLabel: `${ordinal(entrant.rank)} in the field`,
                },
                {
                  key: 'cards',
                  label: 'CARDS',
                  value: String(entrant.filled),
                  accessibilityLabel: `${entrant.filled} cards filed`,
                },
                /* THE PRIZE REPLACES THE RESULT once there is one, because a
                   number of gems already implies the W. Before settlement
                   there is neither, and the cell says so rather than
                   disappearing — the strip cannot wrap, so a cell that comes
                   and goes re-divides the whole row. */
                {
                  key: 'won',
                  label: entrant.prize !== null && entrant.prize > 0 ? 'WON' : 'RESULT',
                  value:
                    entrant.prize !== null && entrant.prize > 0
                      ? `${entrant.prize}`
                      : (entrant.result ?? '—'),
                  tone:
                    entrant.result === 'W'
                      ? c.positive
                      : entrant.result === 'L'
                        ? c.negative
                        : undefined,
                  accessibilityLabel:
                    entrant.prize !== null && entrant.prize > 0
                      ? `Won ${entrant.prize} gems`
                      : entrant.result === null
                        ? 'Not settled yet'
                        : `Result ${entrant.result}`,
                },
              ]}
            />
          ) : null}

          <EntryLineup
            slots={rows}
            hint={entrant?.locked ? 'Locked in' : 'Can still change before kickoff'}
            emptyBody="This entry has no cards in it yet."
          />

          {/* WHY YOU CANNOT DO ANYTHING HERE, said once. Everything above is a
              lineup drawn exactly as your own is drawn, which is the point and
              also the risk: a reader who has swapped a hundred cards on that
              layout will try to swap one here. */}
          <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
            You are looking at another manager&apos;s entry. Nothing here can be
            changed, and their cards are theirs — the field is open so you can
            see what you are up against.
          </Text>
        </View>
      )}
    </PlayerSheetFrame>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.three },
});
