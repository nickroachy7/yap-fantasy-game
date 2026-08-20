/**
 * The game log: every season we hold, newest first, with the current one
 * already open.
 *
 * Two things here are deliberate and were specifically asked for:
 *
 * 1. UPCOMING FIXTURES ARE SHOWN. A game log that only lists what has already
 *    happened answers "how did he do" but not "what is coming", and the second
 *    question is the one you ask before setting a lineup. Unplayed games carry
 *    the kickoff time where a played one carries the result, and are dimmed so
 *    the eye can still skim past them to the real rows.
 *
 * 2. OLDER SEASONS COLLAPSE rather than paginate. A player with three seasons
 *    has sixty-odd rows; showing them all buries the current season, and
 *    paginating hides that prior seasons exist at all. Collapsed sections keep
 *    the summary line visible, which is usually the answer anyway.
 *
 * 3. EVERY SEASON WE HOLD IS HERE — there is no "last N" cut. A twelve-year
 *    veteran gets twelve sections, not three, because the question "was he ever
 *    actually good" is one a card game asks constantly and a truncated log
 *    cannot answer. Collapsing is what makes that affordable; truncating would
 *    have been the cheaper and wrong answer. `Expand all` exists for exactly
 *    the vet case, where opening twelve sections one at a time is the tax that
 *    collapsing would otherwise impose.
 *
 * Season summaries count PLAYED games only. An upcoming fixture is not a zero,
 * and averaging it in would drag every in-progress season toward nothing.
 *
 * `startedWeeks` is passed only by the CARD profile, and is the whole reason
 * the bench rule is legible: it marks the weeks THIS copy was in the lineup, so
 * a 30-point week your card earned nothing from is visibly a week you sat him
 * rather than a number that does not add up. The player profile passes nothing
 * and the column disappears — there is no "your copy" on a page about a person.
 *
 * The mark is a glyph AND a screen-reader phrase, never colour: it has to
 * survive greyscale like every other status in this app.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { careerColumnsFor } from './profile';
import { weekLabel, type GameLogGame, type GameLogSection } from './game-log';
import { horizontalStrip } from '@/components/ui/scroll-strip';

const DASH = '—';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Hand-formatted rather than via `Intl`: Hermes ships without full ICU data on
 * some builds, and a game log is not worth a locale gamble.
 */
function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function resultOf(g: GameLogGame): { label: string; tone: 'win' | 'loss' | 'tie' | null } {
  if (!g.played || g.teamScore === null || g.oppScore === null) {
    return { label: shortDate(g.startsAt) ?? DASH, tone: null };
  }
  const tone = g.teamScore > g.oppScore ? 'win' : g.teamScore < g.oppScore ? 'loss' : 'tie';
  const mark = tone === 'win' ? 'W' : tone === 'loss' ? 'L' : 'T';
  return { label: `${mark} ${g.teamScore}-${g.oppScore}`, tone };
}

const int = (n: number | null | undefined) =>
  n === null || n === undefined ? DASH : Math.round(n).toLocaleString();

/** `season-seasonType-week`, the key both sides build from. */
export function startKey(season: number, seasonType: number, week: number | null): string {
  return `${season}-${seasonType}-${week ?? 'x'}`;
}

export function GameLog({
  sections,
  position,
  startedWeeks,
}: {
  sections: GameLogSection[];
  position: string | null;
  /** Weeks the viewer's copy started. Card profile only; omitted elsewhere. */
  startedWeeks?: Set<string>;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  // The newest section starts open; everything older starts collapsed.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    sections.length > 0 ? { [sections[0].key]: true } : {},
  );

  if (sections.length === 0) {
    return (
      <Text style={[Type.body, { color: c.textSecondary }]}>
        No games on record for this player yet.
      </Text>
    );
  }

  const openCount = sections.filter((s) => open[s.key]).length;
  const allOpen = openCount === sections.length;

  return (
    <View style={styles.wrap}>
      {/* Only worth drawing once there is more than one season to move. With a
          rookie this is a control that does nothing, which is worse than no
          control at all. */}
      {sections.length > 1 ? (
        <View style={styles.toolbar}>
          <Text style={[Type.fine, { color: c.textTertiary }]}>
            {`${sections.length} seasons on record`}
          </Text>
          <Pressable
            onPress={() =>
              setOpen(
                allOpen
                  ? {}
                  : Object.fromEntries(sections.map((s) => [s.key, true])),
              )
            }
            accessibilityRole="button"
            accessibilityLabel={allOpen ? 'Collapse every season' : 'Expand every season'}
            hitSlop={8}
            style={({ pressed }) => [pressed && styles.pressed]}>
            <Text style={[Type.micro, { color: c.textSecondary }]}>
              {allOpen ? 'COLLAPSE ALL' : 'EXPAND ALL'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {sections.map((section) => (
        <SeasonSection
          key={section.key}
          section={section}
          position={position}
          startedWeeks={startedWeeks}
          open={open[section.key] ?? false}
          onToggle={() =>
            setOpen((prev) => ({ ...prev, [section.key]: !(prev[section.key] ?? false) }))
          }
        />
      ))}
    </View>
  );
}

function SeasonSection({
  section,
  position,
  startedWeeks,
  open,
  onToggle,
}: {
  section: GameLogSection;
  position: string | null;
  startedWeeks?: Set<string>;
  open: boolean;
  onToggle: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const columns = careerColumnsFor(position);

  return (
    <View style={[styles.section, { borderColor: c.border, backgroundColor: c.surface }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${section.label}, ${open ? 'collapse' : 'expand'}`}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}>
        <Text style={[Type.micro, styles.chevron, { color: c.textTertiary }]}>
          {open ? '▾' : '▸'}
        </Text>
        <Text style={[Type.strong, styles.headLabel, { color: c.text }]} numberOfLines={1}>
          {section.label}
        </Text>

        {/* The summary stays visible when collapsed, because it is usually the
            answer the reader came for. */}
        <View style={styles.summary}>
          {section.totalPoints !== null ? (
            <>
              <Summary label="FP" value={section.totalPoints.toFixed(1)} />
              <Summary label="AVG" value={section.pointsPerGame?.toFixed(1) ?? DASH} />
              <Summary label="BEST" value={section.best?.toFixed(1) ?? DASH} />
            </>
          ) : null}
          <Summary
            label="GP"
            value={
              section.upcomingCount > 0
                ? `${section.playedCount}+${section.upcomingCount}`
                : String(section.playedCount)
            }
          />
        </View>
      </Pressable>

      {open ? (
        <View>
          <ScrollView horizontal {...horizontalStrip} showsHorizontalScrollIndicator={false}>
            <View>
              <View style={[styles.row, styles.headRow, { borderColor: c.border }]}>
                {startedWeeks ? (
                  <Text
                    numberOfLines={1}
                    style={[Type.micro, styles.started, { color: c.textTertiary }]}>
                    YOU
                  </Text>
                ) : null}
                <Text style={[Type.micro, styles.wk, { color: c.textTertiary }]}>WK</Text>
                <Text style={[Type.micro, styles.opp, { color: c.textTertiary }]}>OPP</Text>
                <Text style={[Type.micro, styles.result, { color: c.textTertiary }]}>RESULT</Text>
                <Text style={[Type.micro, styles.fp, { color: c.textTertiary }]}>FP</Text>
                {columns.map((col) => (
                  <Text key={col.key} style={[Type.micro, styles.stat, { color: c.textTertiary }]}>
                    {col.label}
                  </Text>
                ))}
              </View>

              {section.games.map((g) => {
                const result = resultOf(g);
                const tone =
                  result.tone === 'win'
                    ? c.positive
                    : result.tone === 'loss'
                      ? c.negative
                      : c.textSecondary;

                return (
                  <View
                    key={g.gameId}
                    style={[styles.row, { borderColor: c.border }, !g.played && styles.upcoming]}>
                    {startedWeeks ? (
                      <Text
                        accessibilityLabel={
                          startedWeeks.has(startKey(g.season, g.seasonType, g.week))
                            ? 'You started your copy this week'
                            : 'Your copy was benched this week'
                        }
                        style={[
                          Type.body,
                          styles.started,
                          {
                            color: startedWeeks.has(startKey(g.season, g.seasonType, g.week))
                              ? c.positive
                              : c.textTertiary,
                          },
                        ]}>
                        {startedWeeks.has(startKey(g.season, g.seasonType, g.week)) ? '●' : '○'}
                      </Text>
                    ) : null}
                    <Text style={[Type.body, styles.wk, NUMERIC, { color: c.textSecondary }]}>
                      {weekLabel(g.seasonType, g.week)}
                    </Text>
                    <Text style={[Type.body, styles.opp, { color: c.text }]} numberOfLines={1}>
                      {g.opponent ? `${g.isHome === false ? '@' : 'vs'} ${g.opponent}` : DASH}
                    </Text>
                    <Text
                      style={[Type.body, styles.result, NUMERIC, { color: tone }]}
                      numberOfLines={1}>
                      {result.label}
                    </Text>
                    <Text
                      style={[
                        g.played ? Type.strong : Type.body,
                        styles.fp,
                        NUMERIC,
                        { color: g.points === null ? c.textTertiary : c.text },
                      ]}>
                      {g.points === null ? DASH : g.points.toFixed(1)}
                    </Text>
                    {columns.map((col) => (
                      <Text
                        key={col.key}
                        style={[Type.body, styles.stat, NUMERIC, { color: c.textSecondary }]}>
                        {int(g.stats[col.key])}
                      </Text>
                    ))}
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {startedWeeks ? (
            <Text style={[Type.fine, styles.note, { color: c.textTertiary }]}>
              ● you started your copy that week · ○ it was on your bench and earned nothing
            </Text>
          ) : null}

          {section.upcomingCount > 0 ? (
            <Text style={[Type.fine, styles.note, { color: c.textTertiary }]}>
              {section.upcomingCount} fixture{section.upcomingCount === 1 ? '' : 's'} still to
              play, shown with kickoff dates.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.summaryCell}>
      <Text style={[Type.micro, { color: c.textTertiary }]}>{label}</Text>
      <Text style={[Type.body, NUMERIC, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  section: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two,
  },
  chevron: { width: 12 },
  headLabel: { flexShrink: 1 },
  summary: { flexDirection: 'row', gap: Spacing.three, marginLeft: 'auto' },
  summaryCell: { alignItems: 'flex-end', gap: 0 },
  headRow: { paddingTop: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 28,
    paddingHorizontal: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  /** Dimmed so the eye skims past what has not happened yet. */
  upcoming: { opacity: 0.55 },
  started: { width: 24, textAlign: 'center' },
  wk: { width: 30 },
  opp: { width: 62 },
  result: { width: 62 },
  fp: { width: 44, textAlign: 'right' },
  stat: { width: 58, textAlign: 'right' },
  note: { paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.two },
  pressed: { opacity: 0.7 },
});
