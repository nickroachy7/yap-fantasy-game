/**
 * The Game log tab: season-by-season first, then game by game.
 *
 * CAREER USED TO BE ITS OWN TAB AND SHOULD NOT HAVE BEEN. The career table is a
 * season-grained view of exactly what the game log shows game-grained — the
 * same question at two zoom levels — so splitting them made you tab back and
 * forth to answer one thing. The reference does not split them either: its game
 * log is per-season sections you open.
 *
 * Order is deliberate: the heat-mapped career table answers "when was he good"
 * in one glance, and the per-game sections below are where you go once that
 * glance raises a question. Summary above detail.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CareerTable } from './CareerTable';
import { GameLog } from './GameLog';
import type { GameLogSection } from './game-log';
import type { PlayerProfile } from './profile';

export function GameLogTab({
  profile,
  sections,
  startedWeeks,
}: {
  profile: PlayerProfile | null;
  sections: GameLogSection[];
  /** Card profile only — marks the weeks the viewer's copy was started. */
  startedWeeks?: Set<string>;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const position = profile?.player.positionAbbreviation ?? null;

  /* The career table is built from SEASON aggregates and the game log from
     per-game rows, so one can know about seasons the other does not. Saying so
     is better than letting the reader notice a season in one and not the other
     and conclude the page is broken. */
  const careerSeasons = new Set((profile?.career ?? []).map((s) => s.season));
  const loggedSeasons = new Set(sections.map((s) => s.season));
  const missingFromLog = [...careerSeasons].filter((s) => !loggedSeasons.has(s)).sort((a, b) => b - a);

  return (
    <>
      {profile ? <CareerTable career={profile.career} position={position} /> : null}

      {missingFromLog.length > 0 ? (
        <Text style={[Type.fine, styles.note, { color: c.textTertiary }]}>
          {`${missingFromLog.join(', ')} ${missingFromLog.length === 1 ? 'has' : 'have'} season totals but no per-game rows ingested, so ${missingFromLog.length === 1 ? 'it appears' : 'they appear'} above and not below.`}
        </Text>
      ) : null}

      <View style={styles.gap}>
        <GameLog sections={sections} position={position} startedWeeks={startedWeeks} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: Spacing.half },
  gap: { marginTop: Spacing.one },
});
