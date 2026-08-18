/**
 * Season-by-season career history.
 *
 * Two things here are stated rather than implied, because both would otherwise
 * mislead:
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
 * A season the provider never reported shows "—", not 0. Those are different
 * claims and a career table is exactly where the difference matters.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { careerColumnsFor, type CareerSeason } from './profile';

const NUMERIC = { fontVariant: ['tabular-nums' as const] };

const DASH = '—';
const int = (n: number | null) => (n === null ? DASH : Math.round(n).toLocaleString());
const oneDp = (n: number | null) => (n === null ? DASH : n.toFixed(1));

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

  const anyUnreported = career.some((s) => s.baseFp === null);

  return (
    <View style={styles.wrap}>
      {/* Horizontally scrollable so a wide stat set never squeezes the season
          column into unreadability on a phone. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.row, styles.headRow, { borderColor: c.backgroundElement }]}>
            <Text style={[styles.season, styles.head, { color: c.textSecondary }]}>SEASON</Text>
            <Text style={[styles.narrow, styles.head, { color: c.textSecondary }]}>GP</Text>
            <Text style={[styles.fp, styles.head, { color: c.textSecondary }]}>FP*</Text>
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
              <Text style={[styles.fp, styles.cell, styles.strong, NUMERIC, { color: c.text }]}>
                {oneDp(s.baseFp)}
              </Text>
              <Text style={[styles.narrow, styles.cell, NUMERIC, { color: c.textSecondary }]}>
                {oneDp(s.baseFpPerGame)}
              </Text>
              <Text style={[styles.rank, styles.cell, NUMERIC, { color: c.textSecondary }]}>
                {s.posRank === null
                  ? DASH
                  : `${position ?? ''}${s.posRank}${s.rankPool ? ` / ${s.rankPool}` : ''}`}
              </Text>
              {columns.map((col) => (
                <Text
                  key={col.key}
                  style={[styles.stat, styles.cell, NUMERIC, { color: c.textSecondary }]}>
                  {int(s.stats[col.key] ?? null)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Text style={[styles.footnote, { color: c.textSecondary }]}>
        * From season totals, so the per-game yardage bonuses in our scoring are
        not included — those need game-by-game data, which we hold from 2026
        onward. Rank is among players on a roster today, which is why the pool
        shrinks in older seasons.
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
  strong: { fontWeight: '700' },
  season: { width: 52 },
  narrow: { width: 44, textAlign: 'right' },
  fp: { width: 58, textAlign: 'right' },
  rank: { width: 66, textAlign: 'right' },
  stat: { width: 62, textAlign: 'right' },
  empty: { fontSize: 13 },
  footnote: { fontSize: 11, lineHeight: 15 },
});
