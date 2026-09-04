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
 * and the prize — both frozen at settlement by `contest_history`, so
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
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EntryLineup } from '@/components/contests/EntryLineup';
import { ContestFieldPanel } from '@/components/contests/ContestFieldPanel';
import { ResultMark } from '@/components/contests/ContestHistoryPanel';
import type { HistoryEntry } from '@/components/contests/use-contest-history';
import { useContestField, useContestLineup } from '@/components/contests/use-contest-field';
import { Coin } from '@/components/shell/AppHeader';
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
}: {
  entry: HistoryEntry;
  onBack: () => void;
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
          {entry.prizeCoins ? (
            <View style={styles.tallies}>
              {entry.prizeCoins ? (
                <View style={styles.pair}>
                  <Coin size={10} color={gold} />
                  <Text style={[Type.fine, NUMERIC, { color: c.textSecondary }]}>
                    {`+${entry.prizeCoins}`}
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
        /* Rows of reserved height rather than the word "Loading…", which was a
           one-line empty state standing in for an eight-row board — so the
           sheet's whole lower half jumped when the read landed. See
           `RowSkeleton`. */
        loading={mineLoading}
        empty="Nothing filed"
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
        contestId={entry.contestId}
      />
    </>
  );
}

/**
 * The way back one level, shared by every view of the contests sheet.
 *
 * Exported so that four screens of one sheet cannot drift into four different
 * back buttons — the archive, a recap, a contest and a rival's team all draw
 * this, and the reader should not be able to tell which one they are on from
 * the shape of the control that leaves it.
 *
 * ---------------------------------------------------------------------------
 * IT IS A CONTROL NOW, NOT A LINE OF TEXT
 * ---------------------------------------------------------------------------
 *
 * It was `‹  Contests` set in 13pt secondary with nothing around it, on the
 * reasoning the carousel's rail uses for its own back link: a pill is a promise
 * that something happens, and going somewhere is not that. That argument holds
 * on the rail, where the words sit in a band between two other objects and a
 * chip would make three. Here it is alone at the top of a sheet with a page of
 * air around it, and the same restraint read as an unstyled fragment left over
 * from something rather than as the way out.
 *
 * SO IT MATCHES THE ✕ IT IS THE COUNTERPART OF: the same 30pt height, the same
 * `backgroundElement` fill going to `backgroundSelected` under a press, no
 * border on either. Those two controls do the two things you can do with a
 * nested sheet — go up one, or put the whole thing down — and they now read as
 * a pair rather than as a button and a caption.
 *
 * THE LABEL IS THE DESTINATION, and it is why this is a pill rather than a bare
 * chevron matching the ✕ exactly. A ‹ on its own is unambiguous about direction
 * and silent about where it lands, and this sheet has four places it can land.
 */
export function BackRow({ label, onPress }: { label: string; onPress: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label.toLowerCase()}`}
      hitSlop={8}
      style={({ pressed }) => [
        styles.back,
        { backgroundColor: pressed ? c.backgroundSelected : c.backgroundElement },
      ]}>
      {/* Optically raised: a ‹ sits low in its own box against a 12pt label. */}
      <Text style={[styles.backGlyph, { color: c.textSecondary }]}>‹</Text>
      <Text numberOfLines={1} style={[styles.backLabel, { color: c.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* 30 and 15 are the ✕'s own height and radius — see `BackRow`. The right
     padding is tighter than the left because the chevron carries air inside its
     own box and the word does not. */
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    maxWidth: '100%',
    height: 30,
    borderRadius: 15,
    paddingLeft: Spacing.two,
    paddingRight: Spacing.three - 4,
  },
  backGlyph: { fontSize: 15, lineHeight: 16, fontWeight: '700', marginTop: -1 },
  /* The rail's back label exactly, for the reason given there: a word read at
     the start of a line beside an arrow, not a heading. */
  backLabel: { fontSize: 12, lineHeight: 15, fontWeight: '600', flexShrink: 1, minWidth: 0 },
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
