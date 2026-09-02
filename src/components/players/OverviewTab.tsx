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
import { Text } from 'react-native';

import { Colors, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryWeight } from '@/lib/injury';
import type { DirectoryPlayer } from '@/components/cards/player-directory';
import { BioFacts } from './BioFacts';
import type { GameLogSection } from './game-log';
import { RecentForm, recentFormCount, recentFormHint } from './RecentForm';
import { Figure, FigureRow, Section, SectionStack } from './Section';
import { TeamContext } from './TeamContext';
import { UsagePanel } from './UsagePanel';
import type { PlayerMarket } from './market';
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
  market,
  lead,
  sections,
}: {
  player: DirectoryPlayer;
  profile: PlayerProfile | null;
  /** For the summary's ownership figures. Null until the market read lands. */
  market: PlayerMarket | null;
  /** A line of card context, on the card profile only. */
  lead?: ReactNode;
  /** The game log's sections, for the form line. The tab draws no games. */
  sections: GameLogSection[];
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const rank = currentRank(profile);

  /* The comment takes the designation's own colour, from the same `injuryWeight`
     the hero's identity line runs — a player printing a red Q up there cannot
     print a grey warning down here. */
  const weight = injuryWeight(player.injuryStatus);
  const commentColour = weight
    ? weight === 'blocking'
      ? c.negative
      : c.warning
    : c.textSecondary;

  return (
    <SectionStack>
      {lead ? <Section>{lead}</Section> : null}

      {/**
        * A SUMMARY BLOCK, WHICH THE TAB DID NOT HAVE.
        *
        * It opened straight into a chart. The figures a reader wants first are
        * the ones that place him — where he ranks, and how many people hold
        * him — and only two of those fit the header strip, which is spoken for
        * by season FP, FP per game and positional rank.
        *
        * So this holds what the strip cannot. It deliberately does NOT repeat
        * the strip: a figure printed twice on one screen is two figures that
        * can disagree, which is the bug the strip was built to close.
        */}
      <Section label="Summary">
        <FigureRow>
          <Figure
            label="GAMES"
            value={String(player.gamesPlayed)}
            hint={rank && rank.season !== player.season ? `${rank.season} rank above` : undefined}
          />
          {market ? (
            <Figure
              label="OWNERS"
              value={String(market.totals.owners)}
              /* A COUNT, NOT A PERCENTAGE. A share of a beta-sized user base
                 reads 0% or 100% and teaches people to distrust the column,
                 where "9 owners" is exactly as true at every scale. It becomes
                 a percentage the day there is a denominator worth dividing by. */
              hint={market.totals.owners === 1 ? 'holds him' : 'hold him'}
            />
          ) : null}
          {market ? (
            <Figure
              label="COPIES"
              value={String(market.totals.held)}
              hint={`${market.totals.minted} minted`}
            />
          ) : null}
        </FigureRow>
      </Section>

      {profile?.player.injuryComment ? (
        <Section label={player.injuryStatus ?? 'Status'}>
          <Text style={[Type.bodyRelaxed, { color: commentColour }]}>
            {profile.player.injuryComment}
          </Text>
        </Section>
      ) : null}

      {/* THE START/SIT SIGNALS, in the order they answer the question: how has
          he been scoring, and is his side still giving him the ball. */}
      {recentFormCount(sections) >= 3 ? (
        <Section
          label={`Last ${recentFormCount(sections)} weeks`}
          hint={recentFormHint(sections)}>
          <RecentForm sections={sections} />
        </Section>
      ) : null}

      {profile ? (
        <>
          <Section label="Usage share" hint="MEASURED, NOT PROJECTED">
            <UsagePanel
              usage={profile.usage}
              position={profile.player.positionAbbreviation}
              teamAbbreviation={profile.player.teamAbbreviation}
            />
          </Section>

          <Section label="Team">
            <TeamContext bio={profile.player} standings={profile.standings} />
          </Section>

          {/**
            * THE PERSON, LAST.
            *
            * It is the only block on the tab that is read rather than scanned,
            * and nothing in it changes a start/sit decision — a reader deciding
            * about Sunday does not need his college. The written description
            * this section is eventually for is not here: the provider does not
            * sell one, and a stub that says "no description available" is worse
            * than a section that does not exist.
            */}
          <Section label="About him">
            <BioFacts bio={profile.player} />
          </Section>
        </>
      ) : null}
    </SectionStack>
  );
}


