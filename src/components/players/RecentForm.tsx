/**
 * The last few weeks he has played, as a shape.
 *
 * WHY IT EXISTS AT ALL. Overview could say what he has scored this season and
 * what he averages, and the career table could say whether that is normal for
 * him across years — and neither could answer "is he playing well right now",
 * which is the question somebody opens a player profile on a Thursday to ask.
 * The game log holds the answer and makes you read five rows and do the
 * comparison yourself.
 *
 * A LINE, NOT BARS, AND NOT A ROW OF NUMBERS
 *
 * Five bars was the first version and it was decorative: the heights encoded
 * the values but nothing said what a tall one meant, so the reader was left
 * comparing bars to each other with no reference. What makes this readable is
 * the DASHED LINE — the season average — because a point below it is a bad week
 * against his own standard rather than against the other four points.
 *
 * The most recent week gets the larger dot and the figure beside the chart, for
 * the same reason the section exists: recency is the whole question. The delta
 * under it is stated against the average rather than against last week, because
 * "3.4 below his average" is a fact about the player and "down 7.5 from last
 * week" is a fact about one fixture.
 *
 * NO OPPONENT STRENGTH, NO PROJECTION. Neither is in the data — see the note on
 * the profile route about what the provider does not sell — so the section
 * shows measured points and says which opponent, and stops there.
 *
 * WEEKS PLAYED, NOT WEEKS ELAPSED. A missed week is not a nought: a nought is a
 * player who took the field and did nothing, which is a different thing to know
 * about him, and averaging the two together would understate every injured
 * player in the game. Byes and DNPs are skipped, which is why the week labels
 * can read W2, W4, W5 — the gaps are the weeks he did not play, and the labels
 * are there so a reader can see them rather than assume five in a row.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { GameLogSection } from './game-log';

/** How many weeks the line holds. Five fits a phone with labels under it. */
const WINDOW = 5;

/**
 * The chart's height. Its WIDTH is measured rather than assumed.
 *
 * A fixed viewBox was the first version and it was wrong in two ways at once:
 * with the default `preserveAspectRatio` the SVG letterboxes, so on a wide
 * sheet the line drew down the middle of a box whose week labels ran the full
 * width — dots and labels pointing at different weeks. Setting it to `none`
 * fixes the span and distorts instead: stroke widths go uneven and the dots
 * become ellipses.
 *
 * So the box IS the laid-out width, 1:1, and nothing scales. One `onLayout`
 * buys a chart that is correct at every width the sheet can be.
 */
const VIEW_H = 50;
/** Kept clear at top and bottom so the end dots are never clipped. */
const PAD = 5;

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

type Point = { week: string; opponent: string | null; points: number };

/**
 * The most recent scored games, oldest first.
 *
 * Reads across seasons deliberately. In September the current season has one or
 * two games in it, and a line of two points is not a shape — the weeks before
 * it are last season's, they are the most recent football this player has
 * played, and they are what "recent form" means in every other place the phrase
 * is used.
 */
function recent(sections: GameLogSection[]): Point[] {
  const out: Point[] = [];

  /* `parseGameLog` sorts sections newest season FIRST but stages and games
     ASCENDING inside one — preseason before regular, week 1 before week 17. So
     the most recent game is the last game of the last stage of the first
     section, and this walks stages and games backwards to find it. Reading them
     forwards was the first version and it silently produced W1, W4, W3, W2 —
     the newest season's opener followed by the previous season's run, which is
     neither order and looks like a rendering fault. */
  for (const section of sections) {
    for (let si = section.stages.length - 1; si >= 0; si -= 1) {
      const stage = section.stages[si];
      for (let gi = stage.games.length - 1; gi >= 0; gi -= 1) {
        const game = stage.games[gi];
        if (game.status !== 'played' || game.points === null) continue;
        out.push({
          week: game.week === null ? '—' : `W${game.week}`,
          opponent: game.opponent,
          points: game.points,
        });
        if (out.length >= WINDOW) return out.reverse();
      }
    }
  }
  return out.reverse();
}

export function RecentForm({ sections }: { sections: GameLogSection[] }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const [width, setWidth] = useState(0);

  const points = recent(sections);

  /* TWO POINTS IS NOT A TREND. One game is a figure the header already prints,
     and a line between two dots says "up" or "down" with the confidence of a
     coin toss. The caller draws nothing rather than a chart that is wrong about
     how much it knows. */
  if (points.length < 3) return null;

  const values = points.map((p) => p.points);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const top = Math.max(...values);
  /* Floored at the average so a run of near-identical weeks does not get
     magnified into a mountain range by a scale that fits it exactly. */
  const ceiling = Math.max(top, average * 1.2, 1);

  const y = (v: number) => PAD + (1 - v / ceiling) * (VIEW_H - PAD * 2);
  /* The CENTRE of each week's column, because the labels underneath are equal
     flex cells and centre their text. Spreading the points edge to edge instead
     puts the first dot at x=0 above a label centred at half a column — off by
     enough to notice on five weeks. */
  const x = (i: number) => ((i + 0.5) * width) / points.length;

  const last = points[points.length - 1];
  const delta = last.points - average;

  return (
    <View style={styles.row}>
      <View style={styles.chart} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
        <Svg width={width} height={VIEW_H} viewBox={`0 0 ${width} ${VIEW_H}`}>
          {/* THE REFERENCE, drawn first so the line crosses over it. Without
              this the points are only comparable to each other. */}
          <Line
            x1="0"
            y1={y(average)}
            x2={width}
            y2={y(average)}
            stroke={c.borderStrong}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <Polyline
            points={points.map((p, i) => `${x(i)},${y(p.points)}`).join(' ')}
            fill="none"
            stroke={c.positive}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p, i) => (
            <Circle
              key={`${p.week}-${i}`}
              cx={x(i)}
              cy={y(p.points)}
              /* The most recent week is the one the section is about. */
              r={i === points.length - 1 ? 4 : 2.5}
              fill={c.positive}
            />
          ))}
        </Svg>
        ) : (
          <View style={{ height: VIEW_H }} />
        )}

        <View style={styles.weeks}>
          {points.map((p, i) => (
            <Text
              key={`${p.week}-${i}`}
              numberOfLines={1}
              style={[Type.micro, styles.week, { color: c.textTertiary }]}>
              {p.week}
            </Text>
          ))}
        </View>
      </View>

      <View style={[styles.latest, { borderColor: c.border }]}>
        <Text style={[NUMERIC, styles.latestValue, { color: c.text }]}>
          {oneDp(last.points)}
        </Text>
        <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
          {`LAST${last.opponent ? ` · ${last.opponent.toUpperCase()}` : ''}`}
        </Text>
        <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
          {/* Against his own average, not against last week — see the note at
              the top. Under a tenth of a point the two are the same number and
              a signed nought reads as a bug. */}
          {Math.abs(delta) < 0.05
            ? 'at his average'
            : `${oneDp(Math.abs(delta))} ${delta > 0 ? 'above' : 'below'}`}
        </Text>
      </View>
    </View>
  );
}

/** The window's average, for the summary's FPTS/GAME group. */
export function recentFormAverage(sections: GameLogSection[]): number | null {
  const points = recent(sections);
  if (points.length < 3) return null;
  return points.reduce((a, p) => a + p.points, 0) / points.length;
}

/** The hint the section wears: what the dashed line is. */
export function recentFormHint(sections: GameLogSection[]): string | undefined {
  const points = recent(sections);
  if (points.length < 3) return undefined;
  const avg = points.reduce((a, p) => a + p.points, 0) / points.length;
  return `${oneDp(avg)} AVG`;
}

/** How many weeks the line covers, for the section's label. */
export function recentFormCount(sections: GameLogSection[]): number {
  return recent(sections).length;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  chart: { flex: 1, minWidth: 0 },
  weeks: { flexDirection: 'row', marginTop: 3 },
  week: { flex: 1, textAlign: 'center' },
  /* Fixed and divided off, so the figure sits in the same place whatever the
     chart does. It is the one number in this section a reader might quote. */
  latest: { width: 84, borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: Spacing.three, alignItems: 'flex-end' },
  latestValue: { fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3 },
});
