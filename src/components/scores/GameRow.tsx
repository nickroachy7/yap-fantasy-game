/**
 * One fixture in the schedule column.
 *
 * Two team lines, each an abbreviation against a right-aligned score, and a
 * state marker. The whole row is the target, because the useful gesture here is
 * "show me what happened in this game" rather than "show me this team".
 *
 * No helmets, no club marks: unlicensed, same rule as the card art. The
 * abbreviation carries the identity and the row is designed around it being the
 * only thing there — which is why the two lines are stacked in a fixed column
 * rather than laid out as `AWAY @ HOME`, a form that needs a logo to scan.
 */
import { StyleSheet, Pressable, Text, View } from 'react-native';

import { StatusChip } from '@/components/ui/StatusChip';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { scoreText, type ScoreGame } from './scoreboard';

export function GameRow({
  game,
  selected,
  onPress,
}: {
  game: ScoreGame;
  selected: boolean;
  onPress: (game: ScoreGame) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const final = game.status === 'final';
  const away = game.awayScore;
  const home = game.homeScore;
  /* Only claim a winner once the game is final AND both scores exist. A live
     leader is not a winner, and a final with a missing score is a gap in our
     data rather than a nil-all draw. */
  const awayWon = final && away !== null && home !== null && away > home;
  const homeWon = final && away !== null && home !== null && home > away;

  return (
    <Pressable
      onPress={() => onPress(game)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={describe(game)}
      style={({ pressed }) => [
        styles.row,
        { borderColor: c.border },
        selected && { backgroundColor: c.backgroundElement },
        pressed && styles.pressed,
      ]}>
      {/* Always rendered, transparent when unselected, so selecting a game
          does not shift every abbreviation three pixels to the right. */}
      <View style={[styles.marker, selected && { backgroundColor: c.text }]} />

      <View style={styles.teams}>
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

      <View style={styles.state}>
        {game.status === 'live' ? (
          <StatusChip label="Live" tone="live" />
        ) : final ? (
          /* `Final/OT` is worth keeping — it is the one thing the provider's
             status string says that `status_state` throws away. */
          <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
            {(game.statusText ?? 'FINAL').toUpperCase()}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function TeamLine({ abbr, score, won }: { abbr: string; score: string; won: boolean }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  // The loser is dimmed rather than the winner emboldened: at two lines in a
  // list of sixteen, weight reads as noise where contrast reads as a result.
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

function describe(game: ScoreGame): string {
  const away = game.away?.abbreviation ?? 'unknown';
  const home = game.home?.abbreviation ?? 'unknown';
  if (game.status === 'scheduled') return `${away} at ${home}, not yet played`;
  const label = game.status === 'live' ? 'in progress' : 'final';
  return `${away} ${game.awayScore ?? 0}, ${home} ${game.homeScore ?? 0}, ${label}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  marker: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: 'transparent' },
  teams: { flex: 1, minWidth: 0, gap: 2 },
  teamLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  abbr: { letterSpacing: 0.5 },
  /* Wide enough for `FINAL/OT`, which is the longest string this cell can
     hold — at 52 it sat right on the edge and wrapped at larger text sizes. */
  state: { width: 58, alignItems: 'flex-end' },
  pressed: { opacity: 0.65 },
});
