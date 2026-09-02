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
import type { GameLogSection } from './game-log';
import { RecentForm, recentFormAverage, recentFormCount, recentFormHint } from './RecentForm';
import { FigureGroup, GroupFigure, GroupRow, Row, Section, SectionStack } from './Section';
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

  /* The comment takes the designation's own colour, from the same `injuryWeight`
     the hero's identity line runs — a player printing a red Q up there cannot
     print a grey warning down here. */
  const rank = currentRank(profile);
  const lastFive = recentFormAverage(sections);

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
      <Section label="Summary" hint={`${player.season} SEASON`}>
        <GroupRow>
          <FigureGroup label="PLAYER RANK">
            <GroupFigure
              value={rank ? `${player.position ?? ''}${rank.rank}` : '—'}
              unit={rank && rank.season !== player.season ? `${rank.season} POS` : 'POSITION'}
              missing={!rank}
            />
            {/* THE DASH IS THE HONEST STATE. `player_profile` ranks within a
                position and nowhere else, so an overall rank would have to be
                invented. The cell holds its place so the group keeps its shape
                and the gap reads as a gap rather than as a design choice. */}
            <GroupFigure value="" unit="OVERALL" missing />
          </FigureGroup>

          <FigureGroup label="OWNERSHIP">
            <GroupFigure
              value={market ? String(market.totals.owners) : ''}
              unit="OWNERS"
              missing={!market}
            />
            <GroupFigure
              value={market ? String(market.totals.held) : ''}
              unit="COPIES"
              missing={!market}
            />
          </FigureGroup>
        </GroupRow>

        <GroupRow>
          <FigureGroup label="FPTS / GAME">
            <GroupFigure value={oneDp(player.fpPerGame)} unit="SEASON" />
            <GroupFigure
              value={lastFive === null ? '' : oneDp(lastFive)}
              unit={`LAST ${recentFormCount(sections)}`}
              missing={lastFive === null}
            />
          </FigureGroup>

          {/* VITALS AS A GROUP, not a row at the foot of the tab. They are the
              one thing here that never changes, so they read as identity rather
              than as a measurement — which is exactly what a group of three
              short figures under one label says. */}
          <FigureGroup label="VITALS">
            <GroupFigure
              value={profile?.player.age === null || profile?.player.age === undefined ? '' : String(profile.player.age)}
              unit="AGE"
              missing={profile?.player.age === null || profile?.player.age === undefined}
            />
            <GroupFigure
              value={profile?.player.height ?? ''}
              unit="HT"
              missing={!profile?.player.height}
            />
            <GroupFigure
              value={experienceShort(profile?.player.experience ?? null)}
              unit="EXP"
              missing={!profile?.player.experience}
            />
          </FigureGroup>
        </GroupRow>
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
            * COLLEGE ONLY, because age, height and experience have gone up into
            * the summary's VITALS group where they read as identity rather than
            * as a footnote. College is the one fact here that is a place rather
            * than a quantity, and it is the widest — it does not fit a group
            * cell and does not belong in one.
            *
            * The written description this section is eventually for is not
            * here: the provider does not sell one, and a stub saying "no
            * description available" is worse than a section that does not
            * exist.
            */}
          {profile.player.college ? (
            <Section label="About him">
              <Row label="College" value={profile.player.college} />
            </Section>
          ) : null}
        </>
      ) : null}
    </SectionStack>
  );
}

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** "2nd" out of "2nd Season" — the group cell has room for one word. */
function experienceShort(raw: string | null): string {
  if (!raw) return '';
  return raw.replace(/\s*seasons?$/i, '').trim() || raw;
}
