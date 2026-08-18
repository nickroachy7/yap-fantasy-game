/**
 * Season-by-season career history.
 *
 * Three things here are stated rather than implied, because each would
 * otherwise mislead:
 *
 * 1. FP is computed from SEASON TOTALS, so it excludes the per-game yardage
 *    bonuses in the active ruleset (+3 at 300 pass / 100 rush / 100 rec yards).
 *    A threshold crossed in a particular game cannot be recovered from a
 *    season sum. Every historical season is therefore slightly understated,
 *    and the footnote says so.
 *
 * 2. Rank is computed against players on an NFL roster TODAY — 126 running
 *    backs in 2025, seven in 2017 — because that is who we hold season stats
 *    for. "RB1" alone would be a boast the data cannot support, so the pool
 *    size is printed with every rank.
 *
 * 3. Cells are HEAT-MAPPED down each column. A career table's job is "when was
 *    he good", and answering it from bare digits means reading twelve numbers
 *    and holding them in your head. Shading each cell against the best season
 *    in its own column answers it before you have read anything — the two
 *    strong years are simply the dark ones. Column-relative, not table-relative,
 *    because passing yards and touchdowns do not share a scale.
 *
 * A season the provider never reported shows "—", not 0. Those are different
 * claims and a career table is exactly where the difference matters.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, TierColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { careerColumnsFor, type CareerSeason } from './profile';

const NUMERIC = { fontVariant: ['tabular-nums' as const] };

const DASH = '—';
const int = (n: number | null) => (n === null ? DASH : Math.round(n).toLocaleString());
const oneDp = (n: number | null) => (n === null ? DASH : n.toFixed(1));

/**
 * Peak alpha for the heat wash.
 *
 * Kept low, and lower in dark mode, because this sits UNDER text that must stay
 * readable. The shading is meant to be felt while scanning the column, not
 * looked at — if a cell's fill is the first thing you notice, it is too strong
 * and it is competing with the number it exists to describe.
 */
const HEAT_MAX = { light: 0.26, dark: 0.2 } as const;

/**
 * A wash proportional to `value / max`, in the gold tier's accent.
 *
 * Gold rather than a new hue: it already means "this is a lot of accumulated
 * production" everywhere else in the app, and a career table is the same claim
 * at season granularity. Returns undefined — not a transparent colour — for
 * anything unshadeable, so an unreported season stays visibly blank rather than
 * becoming the coldest cell in a column it never belonged to.
 */
function heat(
  value: number | null,
  max: number,
  scheme: 'light' | 'dark',
): string | undefined {
  if (value === null || max <= 0 || value <= 0) return undefined;
  const accent = TierColors[scheme].gold.accent;
  const alpha = Math.min(1, value / max) * HEAT_MAX[scheme];
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

/** Largest non-null value in a column, or 0 when the column is entirely empty. */
function maxOf(values: (number | null)[]): number {
  return values.reduce<number>((m, v) => (v !== null && v > m ? v : m), 0);
}

export function CareerTable({
  career,
  position,
}: {
  career: CareerSeason[];
  position: string | null;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const columns = careerColumnsFor(position);

  if (career.length === 0) {
    return (
      <Text style={[styles.empty, { color: c.textSecondary }]}>
        No prior seasons on record for this player.
      </Text>
    );
  }

  /* Column maxima, computed once per render rather than per cell — a career
     is at most a dozen rows, but recomputing inside the map would make the
     table quadratic for no reason. */
  const fpMax = maxOf(career.map((s) => s.exactFp ?? s.baseFp));
  const fpgMax = maxOf(career.map((s) => s.exactFpPerGame ?? s.baseFpPerGame));
  const statMax = new Map(
    columns.map((col) => [col.key, maxOf(career.map((s) => s.stats[col.key] ?? null))]),
  );

  const anyUnreported = career.some((s) => s.baseFp === null);
  // True only while some seasons still fall back to season totals. Once every
  // season has per-game rows ingested, the caveat stops being printed rather
  // than lingering as a warning about a problem that no longer exists.
  const anyApproximate = career.some((s) => s.exactFp === null && s.baseFp !== null);

  return (
    <View style={styles.wrap}>
      {/* Horizontally scrollable so a wide stat set never squeezes the season
          column into unreadability on a phone. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.row, styles.headRow, { borderColor: c.backgroundElement }]}>
            <Text style={[styles.season, styles.head, { color: c.textSecondary }]}>SEASON</Text>
            <Text style={[styles.narrow, styles.head, { color: c.textSecondary }]}>GP</Text>
            <Text style={[styles.fp, styles.head, { color: c.textSecondary }]}>
              {anyApproximate ? 'FP*' : 'FP'}
            </Text>
            <Text style={[styles.narrow, styles.head, { color: c.textSecondary }]}>FP/G</Text>
            <Text style={[styles.rank, styles.head, { color: c.textSecondary }]}>RANK</Text>
            {columns.map((col) => (
              <Text key={col.key} style={[styles.stat, styles.head, { color: c.textSecondary }]}>
                {col.label}
              </Text>
            ))}
          </View>

          {career.map((s) => (
            <View key={s.season} style={[styles.row, { borderColor: c.backgroundElement }]}>
              <Text style={[styles.season, styles.cell, NUMERIC, { color: c.text }]}>
                {s.season}
              </Text>
              <Text style={[styles.narrow, styles.cell, NUMERIC, { color: c.textSecondary }]}>
                {int(s.gamesPlayed)}
              </Text>
              {/* Exact where we hold the game rows, season totals otherwise.
                  The asterisk marks only the rows that are actually
                  approximate, rather than tarring the whole column. */}
              <Text
                style={[
                  styles.fp,
                  styles.cell,
                  styles.strong,
                  styles.heated,
                  NUMERIC,
                  { color: c.text, backgroundColor: heat(s.exactFp ?? s.baseFp, fpMax, scheme) },
                ]}>
                {oneDp(s.exactFp ?? s.baseFp)}
                {s.exactFp === null && s.baseFp !== null ? '*' : ''}
              </Text>
              <Text
                style={[
                  styles.narrow,
                  styles.cell,
                  styles.heated,
                  NUMERIC,
                  {
                    color: c.textSecondary,
                    backgroundColor: heat(s.exactFpPerGame ?? s.baseFpPerGame, fpgMax, scheme),
                  },
                ]}>
                {oneDp(s.exactFpPerGame ?? s.baseFpPerGame)}
              </Text>
              <Text style={[styles.rank, styles.cell, NUMERIC, { color: c.textSecondary }]}>
                {s.posRank === null
                  ? DASH
                  : `${position ?? ''}${s.posRank}${s.rankPool ? ` / ${s.rankPool}` : ''}`}
              </Text>
              {columns.map((col) => (
                <Text
                  key={col.key}
                  style={[
                    styles.stat,
                    styles.cell,
                    styles.heated,
                    NUMERIC,
                    {
                      color: c.textSecondary,
                      backgroundColor: heat(
                        s.stats[col.key] ?? null,
                        statMax.get(col.key) ?? 0,
                        scheme,
                      ),
                    },
                  ]}>
                  {int(s.stats[col.key] ?? null)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Text style={[styles.footnote, { color: c.textSecondary }]}>
        {anyApproximate
          ? '* From season totals, so the per-game yardage bonuses in our scoring are not included. Unmarked seasons are scored from game-by-game data and match the leaderboard exactly. '
          : 'Scored from game-by-game data, so these match the leaderboard exactly. '}
        Rank is among players on a roster today, which is why the pool shrinks in
        older seasons. Shading is relative to this player&rsquo;s own best season in
        each column.
        {anyUnreported ? ' A dash means the provider reported no stats for that season.' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headRow: { paddingTop: 0 },
  head: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  cell: { fontSize: 13 },
  /* The wash needs to read as a band across the cell rather than a tint behind
     the glyphs, so the padding is part of the treatment, not spacing. */
  heated: { paddingVertical: 3, paddingHorizontal: 4, borderRadius: 3, overflow: 'hidden' },
  strong: { fontWeight: '700' },
  season: { width: 52 },
  narrow: { width: 44, textAlign: 'right' },
  fp: { width: 58, textAlign: 'right' },
  rank: { width: 66, textAlign: 'right' },
  stat: { width: 62, textAlign: 'right' },
  empty: { fontSize: 13 },
  footnote: { fontSize: 11, lineHeight: 15 },
});
