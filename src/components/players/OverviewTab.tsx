/**
 * The Overview tab, identical on both profiles.
 *
 * It answers "should I start him" — which is a question about the FOOTBALLER,
 * so the answer cannot differ between the page about the player and the page
 * about your copy of him. Anything that differs belongs in the Card tab.
 *
 * `lead` is the one seam. Overview being identical on both pages is correct,
 * but it means the tab says nothing about the copy when you reached it from a
 * card — a dead end on a page you opened to look at one specific object. The
 * card profile passes a single line naming which copy this is; it does not
 * duplicate card CONTENT into a player tab, which would undo the split.
 *
 * THE STAT ROW HAS GONE UP INTO THE HEADER, and that is the whole change here.
 * `SEASON FP / GAMES / FP-GAME / RANK / COPIES` was five figures at the top of
 * this tab, which meant the page's headline answer was one tab-press and one
 * scroll away, and was missing entirely if you were reading Card or Game log.
 * Three of them now sit in `PlayerHero`'s figure strip where every tab can see
 * them; the two that did not survive the cut to three are `GAMES`, which the
 * career table's first row prints anyway, and `COPIES`, which is the community
 * section's whole subject.
 *
 * What is left is the four things this tab is actually for, one per section:
 * the seasons behind the headline, how his side uses him, who his side is, and
 * who he is. No boxes — see `Section`.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { DirectoryPlayer } from '@/components/cards/player-directory';
import { BioFacts } from './BioFacts';
import { CareerTable } from './CareerTable';
import type { GameLogSection } from './game-log';
import { RecentForm, recentFormCount, recentFormHint } from './RecentForm';
import { Section, SectionStack } from './Section';
import { TeamContext } from './TeamContext';
import { UsagePanel } from './UsagePanel';
import type { PlayerProfile } from './profile';

/**
 * The player's position rank, for the header strip.
 *
 * Prefers the current season, falling back to the most recent season that has a
 * rank at all. In August the current season has no ranked games yet, and last
 * year's rank clearly labelled beats showing nothing.
 *
 * There is no cross-position "overall" rank, and inventing one would be
 * meaningless under a scoring system where a quarterback's baseline is twice a
 * tight end's.
 *
 * EXPORTED, because the figure it feeds is drawn by the route now rather than
 * by this tab. It stays in this file because the reasoning above is the tab's
 * reasoning, not the route's.
 */
export function currentRank(profile: PlayerProfile | null): {
  rank: number;
  pool: number | null;
  season: number;
} | null {
  if (!profile) return null;
  const ranked = profile.career.filter((s) => s.posRank !== null);
  if (ranked.length === 0) return null;
  const forCurrent = ranked.find((s) => s.season === profile.current?.season);
  const best = forCurrent ?? ranked.reduce((a, b) => (b.season > a.season ? b : a));
  return { rank: best.posRank as number, pool: best.rankPool, season: best.season };
}

export function OverviewTab({
  player,
  profile,
  lead,
  sections,
}: {
  player: DirectoryPlayer;
  profile: PlayerProfile | null;
  /** A line of card context, on the card profile only. */
  lead?: ReactNode;
  /**
   * The game log's sections, used only to reconcile them against the career
   * table below — see the note this renders. The tab does not draw games.
   */
  sections: GameLogSection[];
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /* The career table is built from SEASON aggregates and the game log from
     per-game rows, so one can know about seasons the other does not. Saying so
     is better than letting the reader find a season here and not in the log and
     conclude the page is broken. */
  const careerSeasons = new Set((profile?.career ?? []).map((s) => s.season));
  const loggedSeasons = new Set(sections.map((s) => s.season));
  const missingFromLog = [...careerSeasons]
    .filter((s) => !loggedSeasons.has(s))
    .sort((a, b) => b - a);

  return (
    <SectionStack>
      {lead ? <Section>{lead}</Section> : null}

      {profile?.player.injuryComment ? (
        <Section label={(player.injuryStatus ?? 'STATUS').toUpperCase()}>
          <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
            {profile.player.injuryComment}
          </Text>
        </Section>
      ) : null}

      {/* RECENT FORM FIRST, because it is the only thing on the tab that
          answers "is he playing well right now" — the header says the season,
          the table says the career, and neither says this week. It draws
          nothing on a player with fewer than three scored games, which is most
          of the league in August. */}
      {recentFormCount(sections) >= 3 ? (
        <Section
          label={`LAST ${recentFormCount(sections)} WEEKS`}
          hint={recentFormHint(sections)}>
          <RecentForm sections={sections} />
        </Section>
      ) : null}

      {/* SEASON BY SEASON. The header says how he is doing now; this
          says whether that is normal for him, and the Game log tab says which
          weeks made it up. */}
      {profile ? (
        <Section label="SEASON BY SEASON" hint={`${player.gamesPlayed} GP THIS SEASON`} flush>
          <CareerTable career={profile.career} position={profile.player.positionAbbreviation} />
          {missingFromLog.length > 0 ? (
            <Text style={[Type.fine, styles.reconcile, { color: c.textTertiary }]}>
              {`${missingFromLog.join(', ')} ${missingFromLog.length === 1 ? 'has' : 'have'} season totals but no per-game rows ingested, so ${missingFromLog.length === 1 ? 'it appears' : 'they appear'} here and not in the game log.`}
            </Text>
          ) : null}
        </Section>
      ) : null}

      {profile ? (
        <>
          <Section label="USAGE SHARE" hint="MEASURED, NOT PROJECTED">
            <UsagePanel
              usage={profile.usage}
              position={profile.player.positionAbbreviation}
              teamAbbreviation={profile.player.teamAbbreviation}
            />
          </Section>

          <Section label="TEAM">
            <TeamContext bio={profile.player} standings={profile.standings} />
          </Section>

          {/* THE PERSON, at the foot of the tab. */}
          <Section label="PLAYER">
            <BioFacts bio={profile.player} />
          </Section>
        </>
      ) : null}
    </SectionStack>
  );
}

const styles = StyleSheet.create({
  reconcile: { paddingHorizontal: Spacing.three },
});
