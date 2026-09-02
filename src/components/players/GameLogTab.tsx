/**
 * The Game log tab: the whole history, at both grains.
 *
 * THIS HAS MOVED TWICE, AND THE SECOND MOVE IS NOT A REVERSAL OF THE FIRST.
 *
 * The career table sat here once, on the argument that a season-grained and a
 * game-grained view of the same thing belong together. It was moved out on the
 * argument that the tabs split by KIND of question — who is he (Overview), what
 * is this copy (Card), what happened week by week (here) — and that a
 * season-by-season summary answered the first.
 *
 * That was true while Overview was "who is he". Overview is a SUMMARY now: a
 * headline block, recent form, how his side uses him, and who he is. A
 * fourteen-row table of every season he has played is not a summary of
 * anything, and leaving it there meant two tabs both answered "is he actually
 * good" and neither owned it.
 *
 * So the split is by QUESTION and this tab owns the history one, at both
 * grains: the seasons, and then the weeks inside a season. Summary above
 * detail, which is the same shape every other block on these pages uses.
 *
 * IT ALSO CLOSES A GAP THAT WAS ONLY EVER VISIBLE ACROSS A TAB BOUNDARY. The
 * career table is built from season aggregates and the log from per-game rows,
 * so one can know about a season the other does not. Overview used to print a
 * note apologising for that, about a table on a different tab. Now both are
 * here and the note sits between the two things it reconciles.
 */
import { StyleSheet, Text } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CareerTable } from './CareerTable';
import { GameLog } from './GameLog';
import { Section, SectionStack } from './Section';
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

  /* Seasons the career table knows about and the log does not. Said here, once,
     between the two tables it is about. */
  const careerSeasons = new Set((profile?.career ?? []).map((s) => s.season));
  const loggedSeasons = new Set(sections.map((s) => s.season));
  const missingFromLog = [...careerSeasons]
    .filter((s) => !loggedSeasons.has(s))
    .sort((a, b) => b - a);

  return (
    <SectionStack>
      {profile && profile.career.length > 0 ? (
        <Section label="Season by season" hint="EXCLUDES PER-GAME BONUSES" flush>
          <CareerTable career={profile.career} position={profile.player.positionAbbreviation} />
          {missingFromLog.length > 0 ? (
            <Text style={[Type.fine, styles.reconcile, { color: c.textTertiary }]}>
              {`${missingFromLog.join(', ')} ${missingFromLog.length === 1 ? 'has' : 'have'} season totals but no per-game rows ingested, so ${missingFromLog.length === 1 ? 'it appears' : 'they appear'} above and not below.`}
            </Text>
          ) : null}
        </Section>
      ) : null}

      <Section label="Week by week" flush>
        <GameLog
          sections={sections}
          position={profile?.player.positionAbbreviation ?? null}
          startedWeeks={startedWeeks}
        />
      </Section>
    </SectionStack>
  );
}

const styles = StyleSheet.create({
  reconcile: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
});
