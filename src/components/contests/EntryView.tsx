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
 * `/entry/<contest uuid>/<user uuid>` is still the route. The contest's `code`
 * would read better, but both RPCs behind this view are keyed by the contest's
 * id, and a path that had to resolve a code to an id before it could ask
 * anything would put a lookup in front of every open. The contest's NAME is
 * handed in so the subtitle is right on the first frame; a cold deep link has
 * none and falls back to the plain word, which is the only thing it costs.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IN THE APP OPENS THIS ANY MORE, AND IT IS NOT DEAD
 * ---------------------------------------------------------------------------
 *
 * A rival's team was reached from two places — a row of the field on a contest,
 * and a row of the field on a settled recap. Both of those draw the lineup in
 * place now, inside the row that names them, with the same `EntryLineup` this
 * page is built on; see the header on `ContestFieldPanel` for why that reverses
 * an earlier call without reversing its reasoning.
 *
 * What is left for this file is the URL. `/entry/<contest>/<user>` is public,
 * it is in people's history, and a path that used to draw a lineup should keep
 * drawing one. It renders as a frame of the contests sheet like any other — it
 * is simply always the bottom one, so it has no back row and its ✕ goes to the
 * board.
 *
 * IT WAS ALSO A PRESENTED ROUTE, and briefly a pushed frame, and both of those
 * are worth remembering rather than only the destination. Presenting it over
 * the contest it came from stacked a modal on a modal — two grabbers, two ✕s,
 * and a swipe-down that dismissed whichever one the gesture happened to hit.
 * Pushing it as a frame fixed that and left the real problem: comparing your
 * eight cards with theirs meant leaving the page yours is on.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EntryLineup } from './EntryLineup';
import { useContestField, useContestLineup } from './use-contest-field';
import { BackRow } from './ContestRecapPanel';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { SummaryStrip } from '@/components/ui/SummaryStrip';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
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

export function EntryView({
  contestId,
  userId,
  name,
  manager,
  backLabel,
  onBack,
  onClose,
  dismissible,
  onOpenManager,
}: {
  contestId: string | null;
  userId: string | null;
  /** The contest's name, handed over so the subtitle needs no second fetch. */
  name?: string;
  /**
   * The manager's handle, where the row that opened this knew it.
   *
   * A TITLE ON THE FIRST FRAME. `entrant` arrives with the field, a round trip
   * after mount, so a view pushed off a row that was already showing the name
   * would spend that trip titled with nothing — the one string the reader is
   * certain of, missing, on the view they just tapped. The fetched value still
   * wins once it lands; this only fills the gap.
   */
  manager?: string;
  /** The view under this one, or undefined on a cold deep link. */
  backLabel?: string;
  onBack: () => void;
  onClose: () => void;
  /** False while this view sits on top of another — see `dismissible`. */
  dismissible?: boolean;
  /**
   * Their ACCOUNT, as opposed to this one team of theirs.
   *
   * A frame on the same stack rather than a route, so ‹ returns to this lineup
   * — `ContestSheet` owns the push. Undefined on a cold deep link into this
   * route, where the name is all we were given and there is no stack to push
   * onto; the sheet is still readable, it simply offers one door fewer.
   */
  onOpenManager?: (userId: string, name: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const { entrants, loading: fieldLoading, error: fieldError } = useContestField(contestId);
  const { slots, loading, error } = useContestLineup(contestId, userId);

  const entrant = useMemo(
    () => entrants?.find((e) => e.userId === userId) ?? null,
    [entrants, userId],
  );

  const rows = slots ?? [];
  const scored = entrant !== null && entrant.points > 0;

  return (
    <PlayerSheetFrame
      title={entrant?.displayName ?? manager}
      subtitle={
        entrant
          ? [name, `${ordinal(entrant.rank)} of ${entrants?.length ?? 0}`]
              .filter(Boolean)
              .join(' · ')
          : (name ?? undefined)
      }
      onClose={onClose}
      dismissible={dismissible}
      closeLabel="Close lineup"
      /* THE ONE ACTION ON A RIVAL'S TEAM, pinned so it is reachable without
         scrolling past their whole lineup. Conditional rather than a component
         that returns null: the frame draws a bar around whatever it is handed,
         so nothing to offer must be nothing at all. */
      footer={
        onOpenManager && userId ? (
          <ManagerFooter
            label={`View ${entrant?.displayName ?? manager ?? 'manager'}'s profile`}
            onPress={() => onOpenManager(userId, entrant?.displayName ?? manager ?? '')}
          />
        ) : undefined
      }>
      {fieldError ?? error ? (
        <Text style={[Type.fine, { color: c.negative }]}>{fieldError ?? error}</Text>
      ) : (loading || fieldLoading) && slots === null ? null : (
        <View style={styles.body}>
          {/* Back to whatever pushed this — a contest, or a settled recap. */}
          {backLabel ? <BackRow label={backLabel} onPress={onBack} /> : null}

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
                   number of coins already implies the W. Before settlement
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
                      ? `Won ${entrant.prize} coins`
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

/**
 * The footer control. A bar with one door in it, drawn the way the friend
 * button's wide form is drawn — same height, same radius, same border — because
 * they appear in the same slot on two sheets a reader opens one after the other.
 */
function ManagerFooter({ label, onPress }: { label: string; onPress: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.footer}>
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.footerButton,
          { borderColor: c.border, backgroundColor: c.surface },
          pressed && styles.footerPressed,
        ]}>
        <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  footerButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  footerPressed: { opacity: 0.7 },
  body: { gap: Spacing.three },
});
