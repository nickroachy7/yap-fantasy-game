/**
 * Every contest you have finished, newest first.
 *
 * ---------------------------------------------------------------------------
 * IT IS A VIEW OF THE LOBBY, NOT A SHEET OVER IT
 * ---------------------------------------------------------------------------
 *
 * This was a presented route for about an hour, and it was wrong in the way
 * this app has already been wrong once: `/contests` is itself a sheet, so
 * pushing a second one put a popup on top of a popup, with two ✕s on screen
 * and a back gesture nobody has a reason to expect. `pull.tsx` has the same
 * lesson written on it — see the note on `dismissTo` there.
 *
 * So the lobby OWNS the sheet and swaps what is inside it. One surface, one
 * dismiss, and a back row that returns to the list you came from rather than
 * unstacking a layer. What is here is the content and nothing else: no frame,
 * no title, no close button, because the sheet already has all three and this
 * is not entitled to a second set.
 *
 * IT IS STILL NOT A PANEL UNDER THE OPEN LIST, which was the other option. The
 * lobby answers one question — what can I enter — in a list short enough to
 * read at a glance. A season of results is long, it pages, and nothing on it
 * can be acted on; hung underneath, it would push the thing the screen is FOR
 * below the fold by week three and grow for the rest of the year.
 *
 * WHAT A ROW SAYS, AND IN WHAT ORDER
 *
 * The result first, as a mark rather than a word — a column of W/L/T is the
 * thing the eye runs down when the question is "how have I been doing", and
 * that question is the reason this screen exists. Then the contest and the week
 * it belongs to, then what it scored and where that finished.
 *
 * A NULL RESULT IS DRAWN, NOT SKIPPED. A field too small to be a contest
 * produces no result at all — see `HistoryEntry.result` — and it is a different
 * fact from a loss. Flattening the two would make the column a lie in exactly
 * the weeks a player is most likely to be looking at it.
 *
 * NOTHING IS RECOMPUTED HERE. The rank, the field size, the prize and the
 * the prize is the server's, frozen at settlement; see `contest_history`.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BackRow, weekLabel } from '@/components/contests/ContestRecapPanel';
import { Coin } from '@/components/shell/AppHeader';
import { useContestHistory, type HistoryEntry } from '@/components/contests/use-contest-history';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Colors, NUMERIC, Radius, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The record, for the sheet's subtitle.
 *
 * Counted off what has LOADED, and it says so while there is more to come:
 * "3 of 7 won so far" is honest about being a running total where "3 of 7 won"
 * would be claiming to have counted the season.
 */
export function historySummary(
  entries: HistoryEntry[] | null,
  loading: boolean,
  done: boolean,
): string | undefined {
  if (loading) return undefined;
  const played = entries?.length ?? 0;
  if (played === 0) return 'Nothing settled yet';
  const won = entries?.filter((e) => e.result === 'W').length ?? 0;
  return `${won} of ${played} won${done ? '' : ' so far'}`;
}

export function ContestHistoryPanel({
  entries,
  loading,
  loadingMore,
  done,
  error,
  more,
  onBack,
  onOpen,
}: ReturnType<typeof useContestHistory> & {
  onBack: () => void;
  /* THE ROW HANDS THE WHOLE ENTRY UP, not a code to look up again. Everything
     the recap needs — result, score, place, prize — is already on it,
     frozen at settlement, and the contest it names is very likely too old for
     `contest_lobby` to answer about. See `ContestRecapPanel`. */
  onOpen: (entry: HistoryEntry) => void;
}) {
  const played = entries?.length ?? 0;

  return (
    <>
      {/* THE WAY BACK, and it is the first thing in the view rather than a
          control on the frame. The sheet's own ✕ still means "put the whole
          thing down"; this means "back to what I can enter", and the two must
          not be the same button wearing two meanings. */}
      <BackRow label="Open contests" onPress={onBack} />

      {error ? <ErrorLine message={error} /> : null}

      <Panel title="Finished" inset={false}>
        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator />
          </View>
        ) : played === 0 ? (
          <EmptyState
            pad={false}
            title="No finished contests yet"
            body="Once a week is swept, every contest you entered lands here — the free one included — and stays for the season."
          />
        ) : (
          <View>
            {entries?.map((e) => (
              <HistoryRow key={e.contestId} entry={e} onPress={() => onOpen(e)} />
            ))}

            {/* MORE IS A BUTTON, NOT A SCROLL TRIGGER. This list sits inside a
                sheet that already scrolls, and hanging a fetch off that scroll
                means the page loads whenever a thumb overshoots. A player
                looking for last month presses once and knows they did. */}
            {done ? null : (
              <Pressable
                onPress={() => void more()}
                disabled={loadingMore}
                accessibilityRole="button"
                accessibilityLabel="Load older contests"
                accessibilityState={{ busy: loadingMore }}
                style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
                {loadingMore ? <ActivityIndicator /> : <MoreLabel />}
              </Pressable>
            )}
          </View>
        )}
      </Panel>
    </>
  );
}

function MoreLabel() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return <Text style={[Type.strong, { color: c.textSecondary }]}>Load older</Text>;
}

function ErrorLine({ message }: { message: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return <Text style={[Type.fine, { color: c.negative }]}>{message}</Text>;
}

/**
 * The result, as a mark.
 *
 * A LETTER RATHER THAN AN ICON. W, L and T are already the vocabulary — the
 * schema stores those three characters and the run panel says "3–1" out of them
 * — and three invented glyphs would be a second language for the same fact.
 * What carries the meaning is the colour and the fill, which is the same
 * treatment `StatusChip` uses and reads at a glance down a column.
 *
 * NO RESULT IS A DASH, and deliberately not an empty cell: a blank reads as a
 * row that failed to load, where a dash is an answer.
 */
export function ResultMark({ result }: { result: 'W' | 'L' | 'T' | null }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const tone =
    result === 'W' ? c.positive : result === 'L' ? c.negative : result === 'T' ? c.text : c.border;
  const ink = result === null ? c.textTertiary : c.background;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        result === 'W' ? 'Won' : result === 'L' ? 'Lost' : result === 'T' ? 'Tied' : 'No result'
      }
      style={[
        styles.mark,
        { backgroundColor: result === null ? 'transparent' : tone, borderColor: c.border },
        result === null && styles.markEmpty,
      ]}>
      <Text style={[Type.strong, styles.markText, { color: ink }]}>{result ?? '–'}</Text>
    </View>
  );
}

function HistoryRow({ entry, onPress }: { entry: HistoryEntry; onPress: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  const week = weekLabel(entry.seasonType, entry.week);
  const place =
    entry.rank !== null && entry.entrants !== null ? `#${entry.rank} of ${entry.entrants}` : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.name}, ${week}, ${entry.points.toFixed(1)} points${place ? `, ${place}` : ''}`}
      style={({ pressed }) => [styles.row, { borderColor: c.border }, pressed && styles.pressed]}>
      <ResultMark result={entry.result} />

      <View style={styles.who}>
        <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
          {entry.name}
        </Text>
        <View style={styles.meta}>
          <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
            {[week, place].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {/* WHAT IT PAID, on its own line and only when it paid something. A
            contest that paid no coins — which is the free one, most weeks —
            should not draw an empty slot to say so. This carried a heart delta
            beside the prize until the mechanic was removed. */}
        {entry.prizeCoins ? (
          <View style={styles.meta}>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* The settled lineup's geometry, so a result row and a lineup row read as the
     same kind of object: a mark, two or three lines of identity, one figure. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  who: { flex: 1, minWidth: 0, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  points: { minWidth: 56, textAlign: 'right' },

  mark: {
    width: 26,
    height: 26,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markEmpty: { borderWidth: StyleSheet.hairlineWidth },
  markText: { fontSize: 13 },

  centre: { paddingVertical: Spacing.four, alignItems: 'center' },
  more: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
  },
  pressed: { opacity: 0.8 },
});
