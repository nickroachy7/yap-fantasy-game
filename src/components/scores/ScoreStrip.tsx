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
 */
import { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { kickoffLabel, scoreText, type ScoreGame } from './scoreboard';

const BAND_HEIGHT = 62;
const CELL_WIDTH = 116;
const WEEK_CELL_WIDTH = 92;

function ScoreStripImpl({
  games,
  /** "Preseason Wk 3", already worded by the caller. */
  week,
  /** Starters per team abbreviation, so a game can say how many are yours. */
  startersByTeam,
  loading,
}: {
  games: ScoreGame[];
  week: string;
  startersByTeam: Map<string, number>;
  loading: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* Nothing at all rather than an empty band. Before the fixtures for a week
     land — and through the offseason — an empty strip is a hole at the top of
     the screen that looks like a failure; the lineup below it is unaffected. */
  if (!loading && games.length === 0) return null;

  return (
    <View
      style={[
        styles.band,
        { backgroundColor: c.surface, borderColor: c.border },
      ]}>
      <View style={[styles.weekCell, { borderColor: c.border }]}>
        <Text numberOfLines={2} style={[Type.micro, { color: c.textSecondary }]}>
          {week.toUpperCase()}
        </Text>
        <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
          {games.length === 0 ? '' : `${games.length} GAMES`}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
    </View>
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
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekCell: {
    width: WEEK_CELL_WIDTH,
    flexShrink: 0,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: Spacing.three,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
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
});
