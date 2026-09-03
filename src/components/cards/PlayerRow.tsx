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
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PlayerAvatar, AVATAR_SIZE } from './PlayerAvatar';
import { DASH } from '@/components/ui/DataTable';
import { positionColors } from '@/constants/positions';
import { Coin } from '@/components/shell/AppHeader';
import { Colors, NUMERIC, Spacing, TierColors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryCode, injuryWeight } from '@/lib/injury';
import { tierCounts, type DirectoryPlayer } from './player-directory';

/**
 * Row box, and the single most load-bearing constant in this file: it is handed
 * to `getItemLayout` verbatim, so a row that renders taller than this scrolls
 * out of alignment. 76 = identity band (44) + stat strip (32).
 */
export const PLAYER_ROW_HEIGHT = 88;

/** The two bands. They must sum to PLAYER_ROW_HEIGHT. */
const IDENTITY_HEIGHT = 60;
const STRIP_HEIGHT = PLAYER_ROW_HEIGHT - IDENTITY_HEIGHT;

/**
 * The figure column, fixed for the same reason the lineup's is: a column that
 * sizes itself to its own digits steps in and out down the page as the numbers
 * change length.
 */
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
 * Only ever used to get the LABELS out of `cardStrip` for a player nobody
 * owns — every value it carries is discarded and drawn as a dash. It exists so
 * the strip's column headings live in one place rather than being written once
 * for the populated case and again for the empty one.
 */
const EMPTY_MARKET = { copies: 0, bronze: 0, silver: 0, gold: 0, diamond: 0, bestFp: 0 };

/**
 * A player with no games has no season total — not a total of zero. The
 * distinction matters most in preseason, where 354 of 968 players are in that
 * state and printing 0.0 for all of them implies they were measured and found
 * to be worth nothing. `played` gates every figure in the row, so the branch
 * lives at the render site rather than inside a formatter that would have to
 * return a dash the caller then styles as if it were a number.
 */

/**
 * The one number a row LEADS with, when the screen it is on is about something
 * other than season points.
 *
 * The right-hand figure is not "season FP" so much as "the quantity this list
 * is ordered by" — on the directory those are the same thing, on the trend
 * board it is the week-over-week delta, and a trend list whose headline figure
 * was a season total would be sorted by a number it does not show.
 *
 * Default when absent: season points, gated on having played. See the note on
 * `played` above.
 */
export type RowFigure = {
  /**
   * Null means the caller HAS the slot but has no number for it — an unplayed
   * player on a board that still wants his price underneath. It draws the same
   * quiet dash an unplayed row draws for itself, rather than the em dash at
   * figure weight, which reads as a redaction rather than an absence. Passing
   * `DASH` as a string would get the loud one; that is why this is nullable
   * instead.
   */
  value: string | null;
  /** The unit under it — `FP`, `WK`. Kept short; it sits in a 52pt column. */
  label: string;
  /** Overrides the figure's colour. For a signed delta, which reads as one. */
  color?: string;
  /**
   * COINS UNDER THE FIGURE, in place of the unit label.
   *
   * The second line is a unit on most surfaces and a second QUANTITY here, and
   * the pair is deliberately the collection row's: a figure about the player
   * over what a card of him is worth. Two boards drawing the same two numbers
   * two different ways is the thing the shared `Identity` was built to stop,
   * and the figure column had drifted into being the exception.
   *
   * The coin glyph is what makes the line legible without a caption — the
   * collection makes the same argument in `InventoryRow.ValueFigure`, and it is
   * why `label` is not merely set to `COINS`.
   */
  coins?: number | null;
};

/**
 * ONE FIGURE COLUMN FOR ALL THREE BOARDS — how he scores, over what a card of
 * him is worth.
 *
 * Trend, Top and Search were drawing three different things in the same box:
 * a week's movement, a season total, and a price. A reader moving between them
 * had to re-learn the right-hand column each time, on rows that were otherwise
 * identical. This is the shared answer; what makes each board different is its
 * ORDER, which is what a board is.
 *
 * A DASH RATHER THAN 0.0 where he has not played — see `RowFigure.value`, which
 * is nullable for exactly this. Before week one that is everybody, and printing
 * a nought for the whole league would be the board inventing a bad season for
 * the best players in football.
 */
export function figureFor(player: DirectoryPlayer, coins?: number | null): RowFigure {
  return {
    value: player.gamesPlayed > 0 ? player.fpPerGame.toFixed(1) : null,
    label: 'FP/G',
    /* The caller's live price where it has landed, the cached snapshot until it
       does — see `useDirectoryBoard` for why there are two of them. */
    coins: coins ?? player.baseCoins,
  };
}

export type PlayerRowProps = {
  player: DirectoryPlayer;
  onPress: (player: DirectoryPlayer) => void;
  /** "Sun 1:05p vs BUF" or "BYE". Absent when the schedule has not loaded. */
  fixture?: string | null;
  figure?: RowFigure;
  /**
   * His place on the board, drawn to the LEFT of the portrait.
   *
   * Optional, and the option is the point: only a list whose ORDER IS ITS
   * SUBJECT may draw one. On the directory the order changes with every sort
   * chip, so a number beside a name would mean a different thing from one press
   * to the next — see the head of `leaders.tsx`, which makes the same argument
   * from the other side.
   */
  rank?: number;
  /**
   * Replaces the tray's contents.
   *
   * The default strip is a HISTOGRAM OF A PLAYER — how many copies of him exist
   * at each tier, and what the best one has scored. That is the right answer on
   * the directory, where every row is a different player and the question is
   * which of them to chase.
   *
   * On the card profile every row is the SAME player, so that strip would
   * repeat itself down the list while saying nothing about the thing that
   * actually differs: which copy this is. The tray becomes the caller's, and
   * everything above it stays exactly as the directory draws it — which is the
   * point of reusing the row at all. It keeps its own height and fill, because
   * `getItemLayout` is promised that both bands sum to `PLAYER_ROW_HEIGHT`.
   */
  strip?: ReactNode;
};

function PlayerRowInner({ player, onPress, fixture, figure, strip, rank }: PlayerRowProps) {
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
  const gold = TierColors[scheme].gold.accent;

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
        {/* THE PLACE ON THE BOARD, OUTSIDE THE PORTRAIT AND BEFORE IT.
            Only the Top board passes one — see `leaders.tsx`: a rank beside a
            name means nothing on a list whose order changes with the sort key,
            and everything on a list whose order IS the subject.
            Right-aligned in a fixed box so 1 and 50 share a right edge and the
            portraits behind them start at one x. Tabular figures for the same
            reason. */}
        {rank === undefined ? null : (
          <Text
            numberOfLines={1}
            style={[styles.boardRank, NUMERIC, { color: c.textTertiary }]}>
            {rank}
          </Text>
        )}
        <View style={styles.avatar}>
          <PlayerAvatar />
        </View>

        {/* Three lines: who he is, when he plays, and where he places.
            The middle one leads, not trails — the fixture is the part that
            decides whether to start him this week, and it used to sit a third
            of the way down a block that spent its first two baselines on six
            characters of rank and club. Those now share the name's line, and
            the baseline they freed went to the ranks, which had been hiding
            inside the position label. */}
        <View style={styles.names}>
          <View style={styles.nameLine}>
            <Text numberOfLines={1} style={[styles.name, { color: c.text }]}>
              {player.name}
            </Text>
            {/* Position and rank as one token — `WR8`. Alone, either half is
                worse: the position repeats the badge, and the rank floats free
                of the pool it ranks within. */}
            {/* The position ALONE. It used to carry the rank fused to it —
                `WR8` — which was right while there was nowhere else to put a
                rank, and became a rank hidden inside a label the moment there
                was. The ranks now have a line of their own below, where both
                of them fit and neither has to be decoded. */}
            <Text numberOfLines={1} style={[styles.meta, { color: accent }]}>
              {(player.position ?? '—').toUpperCase()}
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

          {/* WHERE HE PLACES, both ways round. The row already says what he
              scored; this says what that was worth against everyone, and
              against the only pool that decides a lineup — a receiver 40th
              overall may be the 12th receiver, and those are two different
              players to own.

              Dashes for a man who has not played. `assignRanks` leaves him
              unranked rather than tied at the bottom: 380th for someone who
              has not taken a snap reads as information and is not, and in
              preseason that is 354 of 968 rows. */}
          <View style={styles.rankLine}>
            <Rank label="RK" value={player.overallRank} />
            {/* `PRK`, not the position. The heading names the KIND of rank, and
                using `WR` for it made the pair read as two different subjects
                rather than as one measure taken against two pools — which is
                the entire reason both are here. */}
            <Rank label="PRK" value={player.posRank} />
          </View>
        </View>

        {/* Unboxed. The chip that used to be here was earning its keep against
            a THREE-line block, where a bare number at the right edge reads as
            belonging to whichever line it happens to sit beside. Two lines and
            a fixed column do that job with alignment, and the border on top of
            it was a frame around something already anchored. */}
        <View style={styles.figure}>
          {/* An em dash at figure weight is a black bar, not an absence — it
              reads as a redaction. Unplayed drops to the strip's weight.
              A supplied figure is never dashed: the caller has already decided
              it is worth printing, and a screen that ranks by it cannot then
              claim not to have it. */}
          {figure && figure.value !== null ? (
            <Text
              numberOfLines={1}
              style={[styles.figureValue, NUMERIC, { color: figure.color ?? c.text }]}>
              {figure.value}
            </Text>
          ) : figure ? (
            <Text numberOfLines={1} style={[styles.figureEmpty, NUMERIC, { color: c.textTertiary }]}>
              {DASH}
            </Text>
          ) : played ? (
            <Text numberOfLines={1} style={[styles.figureValue, NUMERIC, { color: c.text }]}>
              {oneDp(player.seasonFp)}
            </Text>
          ) : (
            <Text numberOfLines={1} style={[styles.figureEmpty, NUMERIC, { color: c.textTertiary }]}>
              {DASH}
            </Text>
          )}
          {/* A COIN AND A NUMBER, or the unit — never both. Where a caller has
              a price the second line is what the card fetches; everywhere else
              it is what the figure above is measured in. */}
          {figure?.coins !== undefined && figure?.coins !== null ? (
            <View style={styles.figureCoins}>
              <Coin size={9} color={figure.coins > 0 ? gold : c.textTertiary} />
              <Text
                numberOfLines={1}
                style={[
                  styles.figureCoinValue,
                  NUMERIC,
                  { color: figure.coins > 0 ? c.textSecondary : c.textTertiary },
                ]}>
                {figure.coins.toLocaleString()}
              </Text>
            </View>
          ) : (
            <Text style={[Type.micro, styles.figureLabel, { color: c.textTertiary }]}>
              {figure?.label ?? 'FP'}
            </Text>
          )}
        </View>
      </View>

      {/* The strip is drawn even for a player nobody owns, as marks over
          dashes. Collapsing it would make rows different heights, which is
          exactly what getItemLayout forbids — and an empty strip is itself the
          answer to "is he in circulation".

          DASHES, NOT NOUGHTS, and the distinction is the whole reason
          `market` is nullable. A player with no copies has not been measured;
          a player with six bronzes and no diamonds has, and the nought there
          is a real and useful statement. Printing 0 for both would say the
          same thing about a card nobody has pulled and a card everybody has.

          INLINE PAIRS, NOT COLUMNS. The band used to be six label-over-value
          cells on an even grid, which is the right shape for six quantities of
          equal standing and the wrong one for these: `B 21` is one fact, not a
          heading and a figure, and stacking it made four small numbers look
          like a table of four different things. Read across, they read as the
          histogram they are — and the space that saves is what lets the best
          copy have a name rather than an abbreviation. */}
      {/* Full-bleed, so the tray runs edge to edge and the band reads as a
          band rather than an inset card. The gutter is on the contents. */}
      <View style={[styles.strip, { backgroundColor: tray }]}>
        {strip ?? (
          <>
        <View style={styles.tiers}>
          {tierCounts(player.market ?? EMPTY_MARKET).map((t) => (
            <View key={t.tier} style={styles.tierPair}>
              <Text
                numberOfLines={1}
                style={[styles.tierLetter, { color: TierColors[scheme][t.tier].accent }]}>
                {t.letter}
              </Text>
              <Text numberOfLines={1} style={[Type.body, NUMERIC, { color: c.textSecondary }]}>
                {player.market ? t.value.toLocaleString() : DASH}
              </Text>
            </View>
          ))}
        </View>

        {/* The best copy in the game, named rather than headed. `BEST FP` was a
            column title for a number; `BEST CARD … FPTS` is a sentence about an
            object, which is what it actually is — and this screen is a card
            directory before it is a stat table. */}
        <View style={styles.best}>
          <Text numberOfLines={1} style={[Type.micro, styles.unit, { color: c.textTertiary }]}>
            BEST CARD
          </Text>
          <Text numberOfLines={1} style={[Type.body, NUMERIC, { color: c.textSecondary }]}>
            {player.market ? player.market.bestFp.toFixed(1) : DASH}
          </Text>
          <Text numberOfLines={1} style={[Type.micro, styles.unit, { color: c.textTertiary }]}>
            FPTS
          </Text>
        </View>
          </>
        )}
      </View>
    </Pressable>
  );
}

/**
 * One rank, as a label over nothing much. `OVR 12` / `WR 8`.
 *
 * The label is the POOL and the number is the place in it, which is why the
 * position doubles as a heading here — `WR 8` says what `WR8` used to, with the
 * two halves separable and a matching `OVR` beside it to be read against.
 */
function Rank({ label, value }: { label: string; value: number | null }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.rank}>
      <Text numberOfLines={1} style={[Type.micro, styles.rankLabel, { color: c.textTertiary }]}>
        {label}
      </Text>
      <Text numberOfLines={1} style={[styles.meta, NUMERIC, { color: c.textSecondary }]}>
        {value === null ? DASH : `#${value}`}
      </Text>
    </View>
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
  /* Reserved at the portrait's size, so a licensed image drops in without the
     row being redesigned around it. See PlayerAvatar. */
  avatar: { width: AVATAR_SIZE, alignSelf: 'center' },
  /* CENTRED LIKE THE COMPETE BADGE, BUT NOT AS WIDE AS ONE, and the difference
     is the whole note.
 
     This was `BADGE_WIDTH` — the lineup's 40 — on the reasoning that one x for
     the left column across both screens is worth having. It is, when the thing
     in the column FILLS it: a slot badge is a 40pt block of colour, so centring
     it puts ink at both edges. A single digit is eight points wide. Centred in
     forty it leaves sixteen either side, and with the row's own gap that is
     twenty-four points of nothing between the number and the portrait it is
     labelling — the number stops reading as attached to the row and starts
     reading as a gutter with a digit in it.
 
     22 is what two digits need, and the board is fifty long so it is never
     asked for three. The centring is kept, because that part was right. */
  boardRank: {
    width: 22,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
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
  /* The two ranks sit closer to each other than to anything else on the line,
     so they read as a pair being compared rather than as two facts in a row. */
  rankLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, height: 15 },
  rank: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  rankLabel: { lineHeight: 15 },
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
  /* The collection row's coin line, at its numbers — see `InventoryRow`. Right
     aligned with the figure above it because the column is right aligned; the
     glyph leads the number the way it does everywhere else in the app. */
  figureCoins: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, height: 15 },
  figureCoinValue: { fontSize: 12, lineHeight: 15, fontWeight: '600' },
  /* Two groups pushed apart, not an even grid. The histogram is one object and
     the best copy is another, and `space-between` is what says so — on a phone
     and on a 940pt table alike, where an even grid would have stranded four
     two-character pairs in the middle of four very wide columns. */
  strip: {
    height: STRIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: ROW_GUTTER,
  },
  /* 8, not 16. The four pairs are already told apart by their own tighter
     internal gap, and the 16 they used to sit on cost 24 points that a
     four-figure best copy — `2741.0 FPTS` — needs on the same line. */
  tiers: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  /* Letter and count tight together, so the four pairs separate from each
     other by more than their own halves do. */
  tierPair: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },
  tierLetter: { fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 0.2 },
  /* Never gives way. If anything on this line has to break it should be the
     histogram, which is four independent facts, rather than the best copy,
     which is one fact in three parts and unreadable missing any of them. */
  best: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1, flexShrink: 0 },
  /* Never shrinks: these two name the figure between them, and a unit clipped
     to `FPT…` is worse than a name clipped by a character. */
  unit: { flexShrink: 0, lineHeight: 16 },
});
