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
 * This row carries roughly three times as much, because the space goes to what
 * a manager actually reads — the rank and the club beside the name, the week's
 * fixture and whatever designation qualifies it, and a strip of the five stats
 * that matter for that player's position. "Who is the fourth-best tight end" is
 * still answerable at a glance; "and why" now is too.
 *
 * IT SHARES ITS SHAPE WITH THE LINEUP ROW, and deliberately. Name, then the
 * position in its accent, then `— CLUB`, on one line; the fixture under it,
 * with the designation as a one- or two-character code at the end of it; the
 * figure unboxed in a fixed column at the right. The two screens are the same
 * players seen from two angles, and a reader who has learned to read one row
 * should not have to learn a second.
 *
 * WHAT IT DOES NOT SHARE, because the questions differ. The stat strip stays —
 * this screen ranks strangers against each other and the five numbers ARE that
 * comparison, where a lineup is eight cards you already own. There is no tier
 * line: these are players, not copies. And separation is still the two fills
 * rather than the lineup's hairline, because the strip is still here to
 * provide it.
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
 *    The rank now sits beside the name fused to its position (`WR8`), where
 *    it is unambiguous, and the row starts with the badge.
 *
 * 2. The position was printed twice — once as the badge, once as the first
 *    word beside the name. Fusing it with the rank removes the repetition and
 *    hands ~28pt back to the name.
 *
 * 3. The stat strip's last cell was left-aligned like the other four, so the
 *    row ended in a ragged 120pt of nothing while the FP figure above it was
 *    flush right. The last cell is right-aligned now, so the figure and the
 *    FP/G column share an outer edge and the row has a straight side.
 *
 * 4. Zebra striping AND a hairline under every row. Either separates rows;
 *    both together is a grid, and it read as noise in light mode.
 *
 * ...and then zebra went too, superseded by something better. The two bands
 * now carry DIFFERENT fills: the identity sits on the page, the stat strip on
 * a tray one step in from it. That does three jobs at once where zebra did
 * one — it binds a player's name to his own numbers, it tells you where a row
 * begins without a rule, and it separates adjacent rows for free, because
 * every boundary is a tray meeting a page. Alternating whole rows on top of
 * that would be a third fill competing with the two that carry meaning.
 *
 * "One step in" is a direction, not a colour: away from the page background,
 * which is darker in light mode and lighter in dark. There is no single token
 * for that because `background` is at the extreme in both schemes, so the
 * tray is picked per scheme and the reason is written down here rather than
 * inferred from two hex values.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PositionBadge } from '@/components/ui/PositionBadge';
import { DASH } from '@/components/ui/DataTable';
import { positionColors } from '@/constants/positions';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryCode, injuryWeight } from '@/lib/injury';
import { formatStat, statStrip, type DirectoryPlayer } from './player-directory';

/**
 * Row box, and the single most load-bearing constant in this file: it is handed
 * to `getItemLayout` verbatim, so a row that renders taller than this scrolls
 * out of alignment. 76 = identity band (44) + stat strip (32).
 */
export const PLAYER_ROW_HEIGHT = 76;

/** The two bands. They must sum to PLAYER_ROW_HEIGHT. */
const IDENTITY_HEIGHT = 44;
const STRIP_HEIGHT = PLAYER_ROW_HEIGHT - IDENTITY_HEIGHT;

/**
 * The badge column, and the figure column. Both fixed, for the same reason the
 * lineup's are: nine rows of badges that each size themselves to their own
 * contents step the name column in and out down the page, and a figure column
 * that sizes itself to its own digits does the same at the other edge. See the
 * note on `PositionBadge`'s `width`.
 */
const BADGE_SIZE = 26;
const BADGE_WIDTH = 26;
const FIGURE_WIDTH = 52;

/**
 * Side margin for the row AND for the controls above it, so the search field,
 * the chips and every name share one left edge. 10pt sat the first character
 * almost on the bezel.
 *
 * `Spacing.three`, which is what the Collection, the lineup rows and every
 * `Screen` gutter use. It was 14 — two points in from everything else, which is
 * exactly the sort of difference nobody can name and everybody can see when the
 * two screens are flipped between.
 */
export const ROW_GUTTER = Spacing.three;

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
  onPress: (player: DirectoryPlayer) => void;
  /** "Sun 1:05p vs BUF" or "BYE". Absent when the schedule has not loaded. */
  fixture?: string | null;
};

function PlayerRowInner({ player, onPress, fixture }: PlayerRowProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = positionColors(player.position, scheme).accent;

  /**
   * The stat tray. One step in from the page background — `surfaceSunken` is
   * a hair darker than white, `surface` a hair lighter than black, and both
   * are the theme's own "this is a distinct surface" step rather than a value
   * invented here.
   */
  const tray = scheme === 'dark' ? c.surface : c.surfaceSunken;

  const weight = injuryWeight(player.injuryStatus);
  const played = player.gamesPlayed > 0;

  return (
    <Pressable
      onPress={() => onPress(player)}
      accessibilityRole="button"
      accessibilityLabel={describe(player)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? c.backgroundElement : c.background },
      ]}>
      <View style={styles.identity}>
        <PositionBadge label={player.position} size={BADGE_SIZE} width={BADGE_WIDTH} />

        {/* Two lines, not three. Who he is, and when he plays.
            The rank and the club used to hold a baseline of their own between
            them, which cost a whole line to say six characters — and put the
            fixture, the part that decides whether to start him this week, a
            third of the way down a block it should have been leading. */}
        <View style={styles.names}>
          <View style={styles.nameLine}>
            <Text numberOfLines={1} style={[styles.name, { color: c.text }]}>
              {player.name}
            </Text>
            {/* Position and rank as one token — `WR8`. Alone, either half is
                worse: the position repeats the badge, and the rank floats free
                of the pool it ranks within. */}
            <Text numberOfLines={1} style={[styles.meta, NUMERIC, { color: accent }]}>
              {`${(player.position ?? '—').toUpperCase()}${player.posRank ?? ''}`}
            </Text>
            {player.team ? (
              <Text numberOfLines={1} style={[styles.meta, { color: c.textTertiary }]}>
                {`— ${player.team.toUpperCase()}`}
              </Text>
            ) : null}
          </View>

          {/* The designation qualifies the FIXTURE, not the name: it is a doubt
              about whether he plays on Sunday, and it belongs on the line that
              says when Sunday is. One or two characters — see `injuryCode`. */}
          <View style={styles.fixtureLine}>
            <Text numberOfLines={1} style={[styles.fixture, { color: c.textTertiary }]}>
              {fixture ?? ' '}
            </Text>
            {weight && player.injuryStatus ? (
              <Text
                numberOfLines={1}
                style={[
                  Type.micro,
                  styles.designation,
                  { color: weight === 'blocking' ? c.negative : c.warning },
                ]}>
                {injuryCode(player.injuryStatus)}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Unboxed. The chip that used to be here was earning its keep against
            a THREE-line block, where a bare number at the right edge reads as
            belonging to whichever line it happens to sit beside. Two lines and
            a fixed column do that job with alignment, and the border on top of
            it was a frame around something already anchored. */}
        <View style={styles.figure}>
          {/* An em dash at figure weight is a black bar, not an absence — it
              reads as a redaction. Unplayed drops to the strip's weight. */}
          {played ? (
            <Text numberOfLines={1} style={[styles.figureValue, NUMERIC, { color: c.text }]}>
              {oneDp(player.seasonFp)}
            </Text>
          ) : (
            <Text numberOfLines={1} style={[styles.figureEmpty, NUMERIC, { color: c.textTertiary }]}>
              {DASH}
            </Text>
          )}
          <Text style={[Type.micro, styles.figureLabel, { color: c.textTertiary }]}>FP</Text>
        </View>
      </View>

      {/* The strip is drawn even for a player with no games, as labels over
          dashes. Collapsing it would make rows different heights, which is
          exactly what getItemLayout forbids — and an empty strip is itself the
          answer to "has he played". */}
      {/* Full-bleed, so the tray runs edge to edge and the band reads as a
          band rather than an inset card. The gutter is on the contents. */}
      <View style={[styles.strip, { backgroundColor: tray }]}>
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
  /* No padding and no gap on the row itself: the two bands are flush, and each
     insets its own contents. Their heights sum to PLAYER_ROW_HEIGHT exactly,
     which is what getItemLayout is promised. */
  row: { height: PLAYER_ROW_HEIGHT },
  identity: {
    height: IDENTITY_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: ROW_GUTTER,
  },
  names: { flex: 1, minWidth: 0, gap: 2 },
  /* `flexShrink` on the NAME only, and `flexShrink: 0` on everything beside it:
     left to share, `WR8` and `— BUF` collapsed to `W…` and `— …`, which is the
     rank and the club rendered as noise. The name is the one thing on the line
     allowed to give way. */
  nameLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one + 2, minWidth: 0 },
  name: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
    minWidth: 0,
  },
  meta: { fontSize: 11, lineHeight: 15, fontWeight: '500', flexShrink: 0 },
  fixtureLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, minWidth: 0 },
  fixture: { fontSize: 11, lineHeight: 15, fontWeight: '500', flexShrink: 1, minWidth: 0 },
  /* Never truncates: a designation cut to one character loses the warning, and
     it is two characters at most to begin with. */
  designation: { flexShrink: 0 },
  /* Value over label, so the number sits level with the name and the word that
     explains it sits level with the fixture — the same shape as the lineup
     row's week figure, at the same sizes. */
  figure: { width: FIGURE_WIDTH, alignItems: 'flex-end', gap: 1 },
  figureValue: { fontSize: 15, lineHeight: 20, fontWeight: '800', letterSpacing: -0.3 },
  /* Same box as the value, so the column does not shift between a player who
     has played and one who has not — only the ink changes. */
  figureEmpty: { fontSize: 12, lineHeight: 20, fontWeight: '500' },
  figureLabel: { lineHeight: 15 },
  strip: {
    height: STRIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ROW_GUTTER,
  },
  /* Equal shares rather than fixed widths: five cells across a phone and across
     a 940pt table are the same five cells, just further apart. */
  cell: { flex: 1, minWidth: 0, justifyContent: 'center' },
  cellRight: { alignItems: 'flex-end' },
});
