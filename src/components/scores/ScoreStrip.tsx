/**
 * This week's games, across the top of the lineup screen.
 *
 * The scoreboard was a page you had to go and find, which meant the two facts
 * that decide a lineup — who is playing, and how it is going — lived one
 * navigation away from the screen where the decision is made. Here it is the
 * first thing above the board, in the space a fantasy app usually gives to a
 * banner.
 *
 * It is a strip and not the Scores page. Sixteen tiles of two abbreviations and
 * a state is the most a header can carry and still be a header; per-game
 * leaders, the position filter and the week picker stay on the page that has
 * room for them, one tap away through the link on the right.
 *
 * The tiles your own starters are in are marked. That is the entire reason this
 * belongs on the lineup screen rather than being a second copy of a scoreboard:
 * "MIA at BUF, final" is a fact about the league, and "two of yours were in it"
 * is a fact about your week.
 */
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { kickoffLabel, scoreText, type ScoreGame } from './scoreboard';

function ScoreStripImpl({
  games,
  title,
  /** Starters per team abbreviation, so a tile can say how many are yours. */
  startersByTeam,
  loading,
  onOpenScores,
}: {
  games: ScoreGame[];
  /** "Week 2", already worded by the caller. */
  title: string;
  startersByTeam: Map<string, number>;
  loading: boolean;
  onOpenScores: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* Nothing at all rather than an empty frame. Before the fixtures for a week
     land — and through the offseason — an empty strip is a hole at the top of
     the screen that looks like a failure; the lineup below it is unaffected. */
  if (!loading && games.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[Type.micro, { color: c.textTertiary }]}>{title.toUpperCase()}</Text>
        <Pressable
          onPress={onOpenScores}
          accessibilityRole="button"
          accessibilityLabel="Open the full scoreboard"
          hitSlop={8}
          style={({ pressed }) => (pressed ? styles.pressed : null)}>
          <Text style={[Type.micro, { color: c.textSecondary }]}>ALL SCORES ›</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}>
        {loading && games.length === 0
          ? // Placeholders, not a spinner: the strip keeps its height so the
            // board below does not jump down when the games arrive.
            [0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]}
              />
            ))
          : games.map((g) => (
              <GameTile
                key={g.id}
                game={g}
                mine={
                  (startersByTeam.get(g.away?.abbreviation ?? '') ?? 0) +
                  (startersByTeam.get(g.home?.abbreviation ?? '') ?? 0)
                }
                onPress={onOpenScores}
              />
            ))}
      </ScrollView>
    </View>
  );
}

export const ScoreStrip = memo(ScoreStripImpl);

function GameTile({
  game,
  mine,
  onPress,
}: {
  game: ScoreGame;
  /** How many of your starters play in this game. */
  mine: number;
  onPress: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const final = game.status === 'final';
  const away = game.awayScore;
  const home = game.homeScore;
  // Same rule as GameRow: a live leader is not a winner, and a final with a
  // missing score is a gap in our data rather than a nil-all draw.
  const awayWon = final && away !== null && home !== null && away > home;
  const homeWon = final && away !== null && home !== null && home > away;

  const state =
    game.status === 'live'
      ? 'LIVE'
      : final
        ? (game.statusText ?? 'FINAL').toUpperCase()
        : kickoffLabel(game.startsAt);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${game.away?.abbreviation ?? 'unknown'} at ${game.home?.abbreviation ?? 'unknown'}, ${state.toLowerCase()}${mine > 0 ? `, ${mine} of your starters` : ''}`}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: c.surface,
          // A tile with your players in it is bordered rather than filled: at
          // sixteen tiles a fill reads as selection, and nothing here is
          // selected.
          borderColor: mine > 0 ? c.borderStrong : c.border,
        },
        pressed && styles.pressed,
      ]}>
      <View style={styles.tileHead}>
        <Text
          numberOfLines={1}
          style={[
            Type.micro,
            { color: game.status === 'live' ? c.positive : c.textTertiary },
          ]}>
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
    </Pressable>
  );
}

function TeamLine({ abbr, score, won }: { abbr: string; score: string; won: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const colour = won ? c.text : c.textSecondary;

  return (
    <View style={styles.teamLine}>
      <Text numberOfLines={1} style={[Type.strong, styles.abbr, { color: colour }]}>
        {abbr}
      </Text>
      <Text numberOfLines={1} style={[Type.strong, NUMERIC, { color: colour }]}>
        {score}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one + 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rail: { flexDirection: 'row', gap: Spacing.two, paddingRight: Spacing.two },
  /* Wide enough for `FINAL/OT` over two 3-letter clubs and their scores, which
     is the widest this tile ever has to be. */
  tile: {
    width: 112,
    height: 74,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 2,
    justifyContent: 'space-between',
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  teamLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  abbr: { letterSpacing: 0.5 },
  pressed: { opacity: 0.7 },
});
