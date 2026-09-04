/**
 * "Here is how you did" — the one thing a settled week owes a player who was
 * not watching.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A BANNER AND NOT A SHEET
 * ---------------------------------------------------------------------------
 *
 * The obvious build is a modal on first open: unmissable, ceremonial, and the
 * shape most games reach for. It is the wrong one here for two reasons.
 *
 * THE BOARD IS ALREADY TWO SHEETS DEEP ON ITS BUSIEST PATH. Opening the app to
 * set a lineup and being handed a dismissal first is a tax on the action the
 * screen exists for, paid every Tuesday, by a player who may already know the
 * result. This app has spent three commits removing layers; adding one back for
 * news is the wrong trade.
 *
 * AND THE RESULT IS NOT URGENT. Nothing about it needs answering — the week is
 * over, the results are already recorded, the coins are already in the wallet. A
 * modal is for a question, and this is an announcement.
 *
 * So it sits at the top of the board, above the carousel, in the reading order
 * somebody scanning the screen already follows. It cannot be missed on a screen
 * you have opened, and it costs nothing to ignore on a screen you opened for
 * something else.
 *
 * ---------------------------------------------------------------------------
 * IT WAITS AS LONG AS IT HAS TO
 * ---------------------------------------------------------------------------
 *
 * There is no timer on it, deliberately, and it is the reason the rail's pips
 * are allowed to have one. `recap_slate()` was written because results that
 * expire on a clock mean a player who does not open the app for two days never
 * learns how they did. This carries that guarantee instead: it is bounded by
 * acknowledgement, not by time. See `use-results-seen`.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT SAYS
 * ---------------------------------------------------------------------------
 *
 * The record first, as marks — that is the answer to the question the player
 * actually has — then the contests by name. Pressing it opens the archive,
 * which is where the whole story already lives; there is no third copy of a
 * recap built into this banner.
 *
 * DISMISS IS EXPLICIT AND IT IS NOT THE ROW. A banner that vanishes when you
 * tap it for detail has punished you for reading it — you would open the
 * archive, come back, and the summary would be gone. So the ✕ acknowledges and
 * the row navigates, and only the ✕ ever marks it seen.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ResultMark } from '@/components/contests/ContestHistoryPanel';
import type { HistoryEntry } from '@/components/contests/use-contest-history';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** "You won 2 of 3" / "You lost your one contest" — the week in one clause. */
function line(entries: HistoryEntry[]): string {
  const n = entries.length;
  const won = entries.filter((e) => e.result === 'W').length;
  const lost = entries.filter((e) => e.result === 'L').length;

  if (n === 1) {
    const only = entries[0];
    if (only.result === 'W') return `You won ${only.name}.`;
    if (only.result === 'L') return `You lost ${only.name}.`;
    if (only.result === 'T') return `You tied ${only.name}.`;
    /* NO RESULT IS NOT A LOSS — a field too small to be a contest produces
       none at all, and saying "you lost" would be inventing one. */
    return `${only.name} finished.`;
  }
  if (won === 0 && lost === 0) return `${n} contests finished.`;
  return `You won ${won} of ${n}.`;
}

export function WelcomeBackBanner({
  entries,
  onOpen,
  onDismiss,
}: {
  /** Unseen results, newest first. Never empty — the caller does not render this otherwise. */
  entries: HistoryEntry[];
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (entries.length === 0) return null;

  return (
    <View
      style={[styles.bar, { borderColor: c.border, backgroundColor: c.backgroundElement }]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Welcome back. ${line(entries)} Open your recent contests.`}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
        {/* THE MARKS, CAPPED. A player returning after a fortnight can have a
            dozen unseen results, and twelve pips in a banner is a texture
            rather than a summary. Four and a count reads at any size. */}
        <View style={styles.marks}>
          {entries.slice(0, 4).map((e) => (
            <ResultMark key={e.contestId} result={e.result} />
          ))}
          {entries.length > 4 ? (
            <Text style={[Type.fine, { color: c.textTertiary }]}>{`+${entries.length - 4}`}</Text>
          ) : null}
        </View>

        <View style={styles.text}>
          <Text style={[Type.strong, { color: c.text }]}>Welcome back</Text>
          <Text numberOfLines={2} style={[Type.fine, { color: c.textSecondary }]}>
            {`${line(entries)} Tap to see how every card did.`}
          </Text>
        </View>
      </Pressable>

      {/* ACKNOWLEDGE. Its own target, away from the row, because pressing the
          row is how you go and READ this — and a banner that cleared itself on
          the way to the detail would be gone when you came back. */}
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss, and mark these results as seen"
        hitSlop={Spacing.two}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <Text style={[Type.section, styles.x, { color: c.textTertiary }]}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.panel,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  body: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  marks: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  x: { lineHeight: 22 },
  pressed: { opacity: 0.75 },
});
