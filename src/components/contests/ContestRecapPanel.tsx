/**
 * One contest you have already played, read inside the sheet you found it in.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT `contest/[code]`
 * ---------------------------------------------------------------------------
 *
 * The archive used to open that route, and it was wrong twice.
 *
 * IT STACKED. `/contests` is a sheet, so pushing another put a popup over a
 * popup — the same layering the history panel had just been rewritten to stop
 * doing. See the note on `ContestHistoryPanel`.
 *
 * AND FOR ANYTHING OLDER THAN LAST WEEK IT SHOWED NOTHING. That page finds its
 * contest in `useContests()`, which is `contest_lobby`, which is scoped to the
 * slate you can enter plus the one you just finished. A contest from week two
 * is in neither, so the page it opened said "That contest is no longer open" —
 * about a contest the player had just tapped in a list of contests they played.
 * The archive can reach back to the start of the season; that route cannot, and
 * making it able to would be teaching the lobby about history so that history
 * could borrow the lobby's page.
 *
 * ---------------------------------------------------------------------------
 * SO IT IS BUILT FROM WHAT A FINISHED CONTEST ACTUALLY HAS
 * ---------------------------------------------------------------------------
 *
 * The row you tapped, which already carries the result, the score, the place,
 * the prize and the hearts — all frozen at settlement by `contest_history`, so
 * nothing here re-derives a figure. Plus two reads that work on any contest at
 * any age, because neither joins a slate:
 *
 *   `contest_field`   who else was in it and where they finished
 *   `contest_lineup`  the eight cards you filed, through `EntryLineup`
 *
 * WHAT IS DELIBERATELY ABSENT is every control the live page has. There is no
 * entering a contest that is over, no leaving it, and no lineup to go and edit
 * — so the footer those live on is not missing, it is inapplicable. A finished
 * contest is a thing you read.
 */
import { StyleSheet, Text, View } from 'react-native';

import { EntryLineup } from '@/components/contests/EntryLineup';
import { ContestFieldPanel } from '@/components/contests/ContestFieldPanel';
import { ResultMark } from '@/components/contests/ContestHistoryPanel';
import type { HistoryEntry } from '@/components/contests/use-contest-history';
import { useContestField, useContestLineup } from '@/components/contests/use-contest-field';
import { Gem } from '@/components/shell/AppHeader';
import { Heart } from '@/components/runs/Hearts';
import { useAuth } from '@/context/AuthContext';
import { Colors, NUMERIC, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** "Preseason Week 4" out of the enum's own lower-cased, underscored text. */
export function weekLabel(seasonType: string, week: number): string {
  const kind = seasonType.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase());
  return `${kind} Week ${week}`;
}

export function ContestRecapPanel({
  entry,
  onBack,
  onOpenEntry,
}: {
  entry: HistoryEntry;
  onBack: () => void;
  /** Another manager's lineup. Still a push — see the note in `contests`. */
  onOpenEntry: (userId: string, displayName: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;
  const { session } = useAuth();
  const me = session?.user.id ?? null;

  const { entrants, loading: fieldLoading, error: fieldError } = useContestField(entry.contestId);
  const { slots, loading: mineLoading, error: mineError } = useContestLineup(entry.contestId, me);

  const place =
    entry.rank !== null && entry.entrants !== null ? `#${entry.rank} of ${entry.entrants}` : null;

  return (
    <>
      {/* Back to the list, not out of the sheet. Same control the history panel
          draws, one level deeper. */}
      <BackRow label="Recent contests" onPress={onBack} />

      {/* THE OUTCOME, FIRST AND WHOLE. Everything on this line is the server's,
          frozen when the week settled; see `contest_history`. */}
      <View style={[styles.head, { borderColor: c.border }]}>
        <ResultMark result={entry.result} />
        <View style={styles.headText}>
          <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
            {entry.name}
          </Text>
          <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
            {[weekLabel(entry.seasonType, entry.week), place].filter(Boolean).join(' · ')}
          </Text>
          {entry.prizeGems || entry.heartsDelta ? (
            <View style={styles.tallies}>
              {entry.prizeGems ? (
                <View style={styles.pair}>
                  <Gem size={10} color={gold} />
                  <Text style={[Type.fine, NUMERIC, { color: c.textSecondary }]}>
                    {`+${entry.prizeGems}`}
                  </Text>
                </View>
              ) : null}
              {entry.heartsDelta ? (
                <View style={styles.pair}>
                  <Heart size={11} state={entry.heartsDelta > 0 ? 'free' : 'killed'} />
                  <Text style={[Type.fine, NUMERIC, { color: c.textSecondary }]}>
                    {entry.heartsDelta > 0 ? `+${entry.heartsDelta}` : `${entry.heartsDelta}`}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <Text style={[Type.figure, NUMERIC, styles.points, { color: c.text }]}>
          {entry.points.toFixed(1)}
        </Text>
      </View>

      {/* YOUR EIGHT, with each card's own history under it — the row that says
          what a week's points did to a card. Same component the settled entry
          page uses, which is the point of it having been made shared. */}
      <EntryLineup
        slots={slots ?? []}
        hint={weekLabel(entry.seasonType, entry.week)}
        empty={mineLoading ? 'Loading…' : 'Nothing filed'}
        emptyBody={mineError ?? undefined}
      />

      {/* WHO ELSE WAS IN IT. A row still opens that manager's lineup, which is
          the one push left on this path and a genuine one: it is a different
          person's team, not another view of this contest. */}
      <ContestFieldPanel
        entrants={entrants}
        loading={fieldLoading}
        error={fieldError}
        slotCount={slots?.length ?? 0}
        onOpen={(e) => onOpenEntry(e.userId, e.displayName)}
      />
    </>
  );
}

/**
 * The way back one level, shared by both archive views.
 *
 * Exported so the history panel and this one cannot drift into two different
 * back buttons on two screens of the same sheet.
 */
export function BackRow({ label, onPress }: { label: string; onPress: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <Text
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label.toLowerCase()}`}
      onPress={onPress}
      style={[Type.strong, styles.back, { color: c.textSecondary }]}>
      {`‹  ${label}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  back: { paddingVertical: Spacing.two, alignSelf: 'flex-start' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  tallies: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  points: { minWidth: 56, textAlign: 'right' },
});
