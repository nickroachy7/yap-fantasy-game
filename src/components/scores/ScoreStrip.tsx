/**
 * This week's games, as a band across the top of the lineup screen.
 *
 * The scoreboard was a page you had to go and find, which meant the two facts
 * that decide a lineup — who is playing, and how it is going — lived one
 * navigation away from the screen where the decision is made. It is the first
 * thing above the board now, and the separate page is gone.
 *
 * IT IS A BAND, NOT A ROW OF CARDS
 *
 * The first version drew each game as a rounded, bordered tile with a gap
 * between them. That is the wrong object: sixteen small boxes read as sixteen
 * things to consider, and every border was a second edge inside a page that
 * already had one. Every scoreboard in the sport — the reference included — is
 * one continuous rule with hairlines dividing the fixtures, and it reads as a
 * ticker: a single band your eye runs along rather than a set of cards it stops
 * at. So: one rule above, one below, one hairline between games, no radius, no
 * gap, and the band bleeds to the edges of the page so those rules actually
 * reach the sides.
 *
 * The week sits in a fixed cell at the left, where the reference puts its
 * league and week pickers. It does not scroll away with the fixtures, because
 * "which week am I looking at" is the one thing on this band that must never be
 * ambiguous.
 *
 * The games your own starters are in are marked. That is the entire reason this
 * belongs on the lineup screen rather than being a second copy of a scoreboard:
 * "MIA at BUF, final" is a fact about the league, and "two of yours were in it"
 * is a fact about your week.
 *
 * IT IS ALSO THE WIDE-WEB HEADER NOW, which is the job the band shape was
 * always the right one for and the reason three props were added rather than a
 * second ticker written. A browser window has a row of space across the top
 * that a phone does not, the app had nothing in it, and a scoreboard is the one
 * thing every screen of a fantasy app benefits from having permanently in
 * view. See `WebHeader`, which supplies the data and nothing else.
 *
 * The three props — `chrome`, `weekHref`, `alwaysShow` — are all about being
 * FURNITURE rather than being on a page, and each is argued where it is
 * declared. Everything else about the band is identical in both places, which
 * is the point: one ticker, one set of measurements, one set of bugs.
 */
import { Link } from 'expo-router';
import { memo, useCallback, useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
} from 'react-native';

import { useIsWide } from '@/components/shell/useResponsive';
import { ChromeBand, Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { kickoffLabel, scoreText, type ScoreGame } from './scoreboard';

const BAND_HEIGHT = 62;
const CELL_WIDTH = 116;
const WEEK_CELL_WIDTH = 92;
const ARROW_WIDTH = 30;

/** Slop, in points, before a scroll offset counts as "there is more that way". */
const EDGE = 2;

function ScoreStripImpl({
  games,
  /** "Preseason Wk 3", already worded by the caller. */
  week,
  /** Starters per team abbreviation, so a game can say how many are yours. */
  startersByTeam,
  loading,
  chrome = false,
  weekHref,
  alwaysShow = false,
}: {
  games: ScoreGame[];
  week: string;
  startersByTeam: Map<string, number>;
  loading: boolean;
  /**
   * The band is the app's own chrome rather than a panel on a page.
   *
   * Two differences, and both are about meeting the rail at the top-left
   * corner. The fill becomes `ChromeBand` — the rail's exact value, so the two
   * read as one frame instead of drawing a seam across the corner where they
   * meet — and the top rule goes, because there is nothing above it for a rule
   * to divide it from.
   */
  chrome?: boolean;
  /**
   * Makes the fixed week cell a link.
   *
   * Only the week cell, and deliberately not the fixtures: a per-game
   * destination does not exist yet (see `GameCell`), and making sixteen cells
   * hoverable targets for one page would promise detail the app cannot show.
   * The week is the honest link — it goes to the full scoreboard, which is
   * exactly "more of this".
   */
  weekHref?: string;
  /**
   * Draw the band even with no fixtures.
   *
   * The default is to vanish, which is right on a PAGE: an empty strip above
   * the lineup is a hole that looks like a failure. It is wrong for chrome,
   * where vanishing means the window's whole top row appears and disappears
   * with the fixture list and every page below it jumps 62pt. Furniture has to
   * be furniture on a quiet week too.
   */
  alwaysShow?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* A sixteen-game week is ~1,850pt of fixtures in a 940pt column, so the band
     scrolls. On a phone that is a swipe and needs no furniture. On a desktop
     there is no swipe: the row simply ran off the side of the page with nothing
     to say it continued — which is what the reference's chevron is for. */
  const scroller = useRef<ScrollView>(null);
  const [offset, setOffset] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  /* Wide web only. A touch screen scrolls this with a thumb and needs no
     furniture, and on a narrow browser the two arrows would eat 60 of the
     375pt the fixtures have to share. `useIsWide` is already "web, and wide
     enough", which is exactly the condition. */
  const paged = useIsWide();
  const canLeft = offset > EDGE;
  const canRight = offset + viewport < content - EDGE;

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => setOffset(e.nativeEvent.contentOffset.x),
    [],
  );

  const page = useCallback(
    (direction: 1 | -1) => {
      /* A page is a whole number of fixtures — the visible count less one, so
         the game you were reading at the edge is still on screen after the jump
         rather than the list teleporting past it. Whole cells, and snapped to a
         cell boundary, because paging by a raw pixel width left a two-character
         sliver of the previous fixture pinned at the left edge. */
      const perPage = Math.max(1, Math.floor(viewport / CELL_WIDTH) - 1);
      const from = Math.round(offset / CELL_WIDTH) * CELL_WIDTH;
      const x = Math.max(
        0,
        Math.min(from + direction * perPage * CELL_WIDTH, content - viewport),
      );

      /* Assign `scrollLeft` on the DOM node, rather than calling either
       * `ScrollView.scrollTo` or the element's own `scrollTo`.
       *
       * Both of those returned without error and without moving. The element's
       * `scrollTo` is a no-op in some engines — verified in the browser this
       * was built against, where `el.scrollTo({left: 444})` left `scrollLeft`
       * at 0 while `el.scrollLeft = 444` worked — and react-native-web's
       * `scrollTo` resolves through it. So the arrow looked dead, silently,
       * with the handler running and the offsets all correct.
       *
       * The jump is instant, which is what a scoreboard's paging arrow does
       * anyway. `getScrollableNode()` is RNW's own accessor for the element the
       * browser actually scrolls; the RN call stays as the fallback for any
       * platform that grows these arrows later, since today they are web-only.
       */
      const node = scroller.current?.getScrollableNode?.() as HTMLElement | undefined;
      if (node) {
        node.scrollLeft = x;
        setOffset(x);
      } else {
        scroller.current?.scrollTo({ x, animated: true });
      }
    },
    [offset, viewport, content],
  );

  /* Nothing at all rather than an empty band. Before the fixtures for a week
     land — and through the offseason — an empty strip is a hole at the top of
     the screen that looks like a failure; the lineup below it is unaffected. */
  if (!loading && games.length === 0 && !alwaysShow) return null;

  const weekCell = (
    <>
      <Text numberOfLines={2} style={[Type.micro, { color: c.textSecondary }]}>
        {week.toUpperCase()}
      </Text>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        {games.length === 0 ? (loading ? '' : 'NO GAMES') : `${games.length} GAMES`}
      </Text>
    </>
  );
  const weekStyle = [styles.weekCell, { borderColor: c.border }];

  return (
    <View
      style={[
        styles.band,
        chrome
          ? { backgroundColor: ChromeBand, borderTopWidth: 0, borderColor: c.border }
          : { backgroundColor: c.surface, borderColor: c.border },
      ]}>
      {weekHref ? (
        /* A plain View inside the anchor, not a styled Pressable: `Link asChild`
           clones its child and a function style does not survive the clone —
           the same defect documented at length in `Sidebar`.
         *
         * `weekFill` IS LOAD-BEARING, and its absence was a real bug: linking
         * the cell puts an anchor between the band's flex ROW and the cell, so
         * the cell stopped being a row child that stretches to the band's 62pt
         * and became a column child sized to its own two lines. It rendered
         * 26pt tall and top-aligned — the week sat jammed against the top of
         * the window while every fixture beside it was centred, and the cell's
         * right-hand divider was a third of the height of every other one.
         *
         * It cannot be folded into `weekCell` itself: `flex: 1` grows along the
         * PARENT's axis, and unlinked the cell's parent is the row — where it
         * would eat all the space the fixtures need. The anchor is a column, so
         * here the same declaration grows vertically. Different axis, same
         * word, which is exactly why this is a separate style with a note on
         * it. */
        <Link href={weekHref as never} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${week}, all scores`}>
            {({ pressed }) => (
              <View style={[weekStyle, styles.weekFill, pressed && styles.pressed]}>
                {weekCell}
              </View>
            )}
          </Pressable>
        </Link>
      ) : (
        <View style={weekStyle}>{weekCell}</View>
      )}

      {paged ? <Arrow direction={-1} enabled={canLeft} onPress={page} /> : null}

      {/* `flex: 1` AND `minWidth: 0`. Without the second, react-native-web
          leaves the flex item at its content width — the row of fixtures — so
          the band grew to ~1,850pt inside a 940pt page and ran off the side of
          the window instead of scrolling inside its own box. It looked like a
          clipping bug and was a flexbox default. */}
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={paged ? onScroll : undefined}
        onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContent(w)}
        style={styles.scroll}>
        {loading && games.length === 0
          ? // Placeholders, not a spinner: the band keeps its height so the
            // page below does not jump down when the games arrive.
            [0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.cell, { borderColor: c.border }]} />
            ))
          : games.map((g, i) => (
              <GameCell
                key={g.id}
                game={g}
                // No divider after the last fixture: on a wide window a
                // fourteen-game week fills the band, but a four-game preseason
                // one ends in a rule with nothing after it, which reads as a
                // column that failed to load.
                last={i === games.length - 1}
                mine={
                  (startersByTeam.get(g.away?.abbreviation ?? '') ?? 0) +
                  (startersByTeam.get(g.home?.abbreviation ?? '') ?? 0)
                }
              />
            ))}
      </ScrollView>

      {paged ? <Arrow direction={1} enabled={canRight} onPress={page} /> : null}
    </View>
  );
}

/**
 * One end of the band, on web only.
 *
 * Always rendered, dimmed when it cannot move: an arrow that appears and
 * disappears shifts every fixture sideways by 30pt as you reach either end,
 * which is worse than a grey chevron.
 */
function Arrow({
  direction,
  enabled,
  onPress,
}: {
  direction: 1 | -1;
  enabled: boolean;
  onPress: (direction: 1 | -1) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <Pressable
      onPress={() => onPress(direction)}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={direction === 1 ? 'Later games' : 'Earlier games'}
      accessibilityState={{ disabled: !enabled }}
      style={({ pressed }) => [
        styles.arrow,
        { borderColor: c.border },
        direction === 1 ? styles.arrowRight : null,
        pressed && enabled ? { backgroundColor: c.backgroundElement } : null,
      ]}>
      <Text style={[Type.strong, { color: enabled ? c.textSecondary : c.textTertiary }]}>
        {direction === 1 ? '›' : '‹'}
      </Text>
    </Pressable>
  );
}

export const ScoreStrip = memo(ScoreStripImpl);

/**
 * One fixture in the band.
 *
 * Not pressable. It was, and it opened the Scores page, which no longer exists;
 * a cell that highlights under the finger and then does nothing is worse than
 * one that plainly does not. If per-game detail comes back, this is where it
 * hangs off.
 */
function GameCell({ game, mine, last }: { game: ScoreGame; mine: number; last: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const final = game.status === 'final';
  const away = game.awayScore;
  const home = game.homeScore;
  // Same rule as everywhere else: a live leader is not a winner, and a final
  // with a missing score is a gap in our data rather than a nil-all draw.
  const awayWon = final && away !== null && home !== null && away > home;
  const homeWon = final && away !== null && home !== null && home > away;

  const state =
    game.status === 'live'
      ? 'LIVE'
      : final
        ? (game.statusText ?? 'FINAL').toUpperCase()
        : kickoffLabel(game.startsAt);

  return (
    <View
      accessible
      accessibilityLabel={`${game.away?.abbreviation ?? 'unknown'} at ${game.home?.abbreviation ?? 'unknown'}, ${state.toLowerCase()}${mine > 0 ? `, ${mine} of your starters` : ''}`}
      style={[styles.cell, { borderColor: c.border }, last && styles.lastCell]}>
      <View style={styles.cellHead}>
        <Text
          numberOfLines={1}
          style={[Type.micro, styles.state, { color: game.status === 'live' ? c.positive : c.textTertiary }]}>
          {state}
        </Text>
        {mine > 0 ? (
          <View style={styles.mine}>
            <View style={[styles.dot, { backgroundColor: c.positive }]} />
            <Text style={[Type.micro, NUMERIC, { color: c.textSecondary }]}>{mine}</Text>
          </View>
        ) : null}
      </View>

      <TeamLine
        abbr={game.away?.abbreviation ?? '—'}
        score={scoreText(away, game.status)}
        won={awayWon}
      />
      <TeamLine
        abbr={game.home?.abbreviation ?? '—'}
        score={scoreText(home, game.status)}
        won={homeWon}
      />
    </View>
  );
}

function TeamLine({ abbr, score, won }: { abbr: string; score: string; won: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  // The loser is dimmed rather than the winner emboldened: at sixteen fixtures
  // in a row, weight reads as noise where contrast reads as a result. The
  // caret is the reference's own mark and survives greyscale, which colour
  // alone would not.
  const colour = won ? c.text : c.textSecondary;

  return (
    <View style={styles.teamLine}>
      <Text numberOfLines={1} style={[Type.strong, styles.abbr, { color: colour }]}>
        {abbr}
      </Text>
      <View style={styles.scoreCell}>
        <Text numberOfLines={1} style={[Type.strong, NUMERIC, { color: colour }]}>
          {score}
        </Text>
        <Text style={[styles.caret, { color: won ? c.text : 'transparent' }]}>◂</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Rules top and bottom, nothing at the sides: the band is bled to the page
     edges by its caller, so a left or right border would be a line drawn on
     the bezel. */
  band: {
    height: BAND_HEIGHT,
    width: '100%',
    flexDirection: 'row',
    /* The fixtures scroll INSIDE this box. Without the clip, a long week paints
       over whatever sits beside the page. */
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: { flex: 1, minWidth: 0 },
  arrow: {
    width: ARROW_WIDTH,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  /* The right-hand arrow closes the band, so its rule goes on the other side. */
  arrowRight: { borderRightWidth: 0, borderLeftWidth: StyleSheet.hairlineWidth },
  weekCell: {
    width: WEEK_CELL_WIDTH,
    flexShrink: 0,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: Spacing.three,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  /* Only when the cell is wrapped in a link — see the note at the call site. */
  weekFill: { flex: 1 },
  /* The divider lives on the cell rather than between cells, so the row can be
     built from a map without interleaving separator elements — the same
     construction as ContestCard's tiles. */
  cell: {
    width: CELL_WIDTH,
    height: '100%',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: Spacing.two + 2,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  lastCell: { borderRightWidth: 0 },
  cellHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one },
  state: { flexShrink: 1 },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  teamLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  abbr: { letterSpacing: 0.5 },
  /* The caret is always drawn, transparent on the loser, so both lines share
     one right edge and the scores stay in a column. */
  scoreCell: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  caret: { fontSize: 9, lineHeight: 14 },
  pressed: { opacity: 0.6 },
});
