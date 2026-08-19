/**
 * One player in the directory.
 *
 * WHY THIS IS NOT A TABLE ROW ANY MORE
 *
 * It used to be a 34pt row in a nine-column table, and the reasoning for that
 * was density: fifteen players on screen lets you compare a position group
 * without scrolling. That reasoning was sound about the goal and wrong about
 * how it was being met. The columns that made it a *table* — college, age,
 * years, games — are bio, not production, and on a phone the layout dropped
 * them anyway. What was left was a name, a club, and two fantasy-point figures
 * in 12pt type: dense, but dense with very little.
 *
 * This row is twice as tall and carries roughly three times as much, because
 * the space goes to what a manager actually reads — the club and designation on
 * their own line, the week's fixture, and a strip of the five stats that matter
 * for that player's position. "Who is the fourth-best tight end" is still
 * answerable at a glance; "and why" now is too.
 *
 * The height is still FIXED, which is the part that matters for a ~1,000-row
 * list: `getItemLayout` needs it, and without it scrolling this list on a phone
 * stutters. Two bands, both of known height, is what keeps that true — nothing
 * here may wrap.
 *
 * No photo, no logo, no jersey — we hold no licence for any of them. The
 * reference design puts a circular headshot at the left of every row; ours is
 * the position badge, which is the same slot doing an honest job.
 *
 * FOUR THINGS THE FIRST DRAFT GOT WRONG, kept here because each looks like
 * taste and is not:
 *
 * 1. A rank column at the left edge. It held POSITION rank, so in a list
 *    sorted by points it read 1, 1, 1, 2, 2, 3, 3 down the page — the same
 *    small numbers over and over, which looks like a bug rather than a rank.
 *    The rank now sits in the meta line fused to its position (`WR8`), where
 *    it is unambiguous, and the row starts with the badge.
 *
 * 2. The position was printed twice — once as the badge, once as the first
 *    word of the meta line. Fusing it with the rank removes the repetition and
 *    hands ~28pt back to the name.
 *
 * 3. The stat strip's last cell was left-aligned like the other four, so the
 *    row ended in a ragged 120pt of nothing while the FP figure above it was
 *    flush right. FP and FP/G now share a right edge, which is what gives the
 *    row a straight side.
 *
 * 4. Zebra striping AND a hairline under every row. Either separates rows;
 *    both together is a grid, and it read as noise in light mode.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { PositionBadge } from '@/components/ui/PositionBadge';
import { DASH } from '@/components/ui/DataTable';
import { positionColors } from '@/constants/positions';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { injuryAbbr, injuryWeight } from '@/lib/injury';
import { formatStat, statStrip, type DirectoryPlayer } from './player-directory';

/**
 * Row box, and the single most load-bearing constant in this file: it is handed
 * to `getItemLayout` verbatim, so a row that renders taller than this scrolls
 * out of alignment. 76 = identity band (44) + stat strip (32).
 */
export const PLAYER_ROW_HEIGHT = 76;

/**
 * Side margin for the row AND for the controls above it, so the search field,
 * the tabs and every name share one left edge. 10pt sat the first character
 * almost on the bezel.
 */
export const ROW_GUTTER = 14;

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * A player with no games has no season total — not a total of zero. The
 * distinction matters most in preseason, where 354 of 968 players are in that
 * state and printing 0.0 for all of them implies they were measured and found
 * to be worth nothing. `played` gates every figure in the row, so the branch
 * lives at the render site rather than inside a formatter that would have to
 * return a dash the caller then styles as if it were a number.
 */

export type PlayerRowProps = {
  player: DirectoryPlayer;
  index: number;
  onPress: (player: DirectoryPlayer) => void;
  /** "Sun 1:05p vs BUF" or "BYE". Absent when the schedule has not loaded. */
  fixture?: string | null;
};

function PlayerRowInner({ player, index, onPress, fixture }: PlayerRowProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = positionColors(player.position, scheme).accent;

  const weight = injuryWeight(player.injuryStatus);
  const played = player.gamesPlayed > 0;

  return (
    <Pressable
      onPress={() => onPress(player)}
      accessibilityRole="button"
      accessibilityLabel={describe(player)}
      style={({ pressed }) => [
        styles.row,
        // Zebra alone. Every boundary is a colour change because the fill
        // alternates, so a hairline as well is a second separator doing the
        // same job — and at this row height that reads as a grid.
        index % 2 === 1 && { backgroundColor: c.surfaceSunken },
        pressed && { backgroundColor: c.backgroundElement },
      ]}>
      <View style={styles.identity}>
        <PositionBadge label={player.position} size={26} />

        <View style={styles.names}>
          <Text numberOfLines={1} style={[styles.name, { color: c.text }]}>
            {player.name}
          </Text>
          <View style={styles.meta}>
            {/* Position and rank as one token — `WR8`. Alone, either half is
                worse: the position repeats the badge, and the rank floats free
                of the pool it ranks within. */}
            <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: accent }]}>
              {`${(player.position ?? '—').toUpperCase()}${player.posRank ?? ''}`}
            </Text>
            <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
              {player.team?.toUpperCase() ?? DASH}
            </Text>
            {/* The designation rides on the identity line rather than in a
                column, so it is read with the name it qualifies. */}
            {weight && player.injuryStatus ? (
              <Text
                numberOfLines={1}
                style={[Type.micro, { color: weight === 'blocking' ? c.negative : c.warning }]}>
                {injuryAbbr(player.injuryStatus)}
              </Text>
            ) : null}
            {fixture ? (
              <Text numberOfLines={1} style={[Type.fine, styles.fixture, { color: c.textTertiary }]}>
                {fixture}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.figure}>
          <Text style={[Type.micro, { color: c.textTertiary }]}>FP</Text>
          {/* An em dash at 19pt/800 is a black bar, not an absence — it reads
              as a redaction. A player with no games gets the dash at the
              strip's weight instead, which is what "nothing here yet" should
              look like. */}
          {played ? (
            <Text numberOfLines={1} style={[styles.figureValue, NUMERIC, { color: c.text }]}>
              {oneDp(player.seasonFp)}
            </Text>
          ) : (
            <Text numberOfLines={1} style={[Type.body, NUMERIC, { color: c.textTertiary }]}>
              {DASH}
            </Text>
          )}
        </View>
      </View>

      {/* The strip is drawn even for a player with no games, as labels over
          dashes. Collapsing it would make rows different heights, which is
          exactly what getItemLayout forbids — and an empty strip is itself the
          answer to "has he played". */}
      <View style={styles.strip}>
        {statStrip(player).map((cell, i, all) => {
          // The last cell is FP/G, and it sits directly under the season FP
          // figure. Right-aligning it is what squares off the row.
          const last = i === all.length - 1;
          return (
            <View key={cell.label} style={[styles.cell, last && styles.cellRight]}>
              <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
                {cell.label}
              </Text>
              <Text numberOfLines={1} style={[Type.body, NUMERIC, { color: c.textSecondary }]}>
                {played ? formatStat(cell) : DASH}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

function describe(p: DirectoryPlayer): string {
  const rank = p.posRank ? `${p.position ?? ''}${p.posRank}` : 'unranked';
  const points =
    p.gamesPlayed > 0
      ? `${oneDp(p.seasonFp)} fantasy points over ${p.gamesPlayed} games`
      : 'no games played';
  return `${p.name}, ${p.position ?? 'unknown position'} ${p.team ?? ''}, ${rank}, ${points}`;
}

export const PlayerRow = memo(PlayerRowInner);

const styles = StyleSheet.create({
  row: {
    height: PLAYER_ROW_HEIGHT,
    paddingHorizontal: ROW_GUTTER,
    justifyContent: 'center',
    gap: 4,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  names: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  /* Pushed to the right of the meta line so the fixture is the first thing to
     be squeezed out on a narrow screen, rather than the club or the injury. */
  fixture: { flexShrink: 1 },
  figure: { alignItems: 'flex-end', minWidth: 54, paddingLeft: Spacing.two },
  figureValue: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  strip: { flexDirection: 'row', alignItems: 'flex-end' },
  /* Equal shares rather than fixed widths: five cells across a phone and across
     a 940pt table are the same five cells, just further apart. */
  cell: { flex: 1, minWidth: 0, gap: 1 },
  cellRight: { alignItems: 'flex-end' },
});
