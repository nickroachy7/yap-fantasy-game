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
 * The stat band is the reference's `PLAYER RANK / OWNERSHIP / FPTS-GAME` strip.
 * Ownership is a COUNT rather than the percentage the reference prints: a
 * percentage of a beta-sized user base reads 0% or 100% and teaches people to
 * distrust the column, where "12 copies held by 3 people" is exactly as true at
 * every scale.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, NUMERIC, Radius, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { DirectoryPlayer } from '@/components/cards/player-directory';
import { BioFacts } from './BioFacts';
import { CareerTable } from './CareerTable';
import type { GameLogSection } from './game-log';
import { TeamContext } from './TeamContext';
import { UsagePanel } from './UsagePanel';
import type { PlayerMarket } from './market';
import type { PlayerProfile } from './profile';

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * The player's position rank.
 *
 * Prefers the current season, falling back to the most recent season that has a
 * rank at all. In August the current season has no ranked games yet, and last
 * year's rank clearly labelled beats showing nothing.
 *
 * There is no cross-position "overall" rank to match the reference's `#9
 * OVERALL`, and inventing one would be meaningless under a scoring system where
 * a quarterback's baseline is twice a tight end's.
 */
function currentRank(profile: PlayerProfile | null): {
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
  market: PlayerMarket | null;
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
  const rank = currentRank(profile);

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
    <>
      {lead}

      {/* This season, scored from per-game rows — so unlike the career table
          these DO include the per-game bonuses. The two are not the same kind
          of number and are deliberately not shown side by side. */}
      <View style={styles.statRow}>
        <StatTile label="SEASON FP" value={oneDp(player.seasonFp)} />
        <StatTile label="GAMES" value={String(player.gamesPlayed)} />
        <StatTile label="FP / GAME" value={oneDp(player.fpPerGame)} />
        {rank ? (
          <StatTile
            /* `RANK`, not `POS RANK` — the VALUE already names the pool, since
               `QB4` carries the position in the figure. Two characters matter
               at a fifth of the width. */
            label={rank.season === player.season ? 'RANK' : `RANK ${rank.season}`}
            value={`${player.position ?? ''}${rank.rank}`}
            /* The pool travels with the rank everywhere in this app — see
               CareerTable. "QB4" alone is a claim the data cannot support. */
            hint={rank.pool ? `of ${rank.pool}` : undefined}
          />
        ) : null}
        {market ? (
          <StatTile
            label="COPIES"
            value={String(market.totals.held)}
            hint={`${market.totals.owners} owner${market.totals.owners === 1 ? '' : 's'}`}
          />
        ) : null}
      </View>

      {profile?.player.injuryComment ? (
        <View style={[styles.note, { backgroundColor: c.backgroundElement }]}>
          <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
            {profile.player.injuryComment}
          </Text>
        </View>
      ) : null}

      {/* SEASON BY SEASON, directly under this season's headline. Summary above
          detail: the tiles say how he is doing now, this says whether that is
          normal for him, and the Game log tab says which weeks made it up. */}
      {profile ? (
        <CareerTable career={profile.career} position={profile.player.positionAbbreviation} />
      ) : null}

      {missingFromLog.length > 0 ? (
        <Text style={[Type.fine, styles.reconcile, { color: c.textTertiary }]}>
          {`${missingFromLog.join(', ')} ${missingFromLog.length === 1 ? 'has' : 'have'} season totals but no per-game rows ingested, so ${missingFromLog.length === 1 ? 'it appears' : 'they appear'} here and not in the game log.`}
        </Text>
      ) : null}

      {profile ? (
        <>
          <UsagePanel
            usage={profile.usage}
            position={profile.player.positionAbbreviation}
            teamAbbreviation={profile.player.teamAbbreviation}
          />
          <TeamContext bio={profile.player} standings={profile.standings} />

          {/* THE PERSON, at the foot of the tab. Age, height, weight,
              experience and college came off the profile header together —
              see `BioFacts` for why they were never going to sit right up
              there whatever shape they were given. */}
          <BioFacts bio={profile.player} />
        </>
      ) : null}
    </>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  /** A qualifier under the figure — "of 84". Never load-bearing on its own. */
  hint?: string;
  emphasis?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.tile}>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        {label}
      </Text>
      <Text numberOfLines={1} style={[NUMERIC, styles.tileValue, { color: c.text }]}>
        {value}
      </Text>
      {hint ? (
        <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * ONE ROW, NO WRAP, AND NO FILLS — and the third is what buys the first.
   *
   * These were filled tiles that wrapped to 2/2/1, and the note this replaces
   * recorded why: four across a phone-width sheet left ~46pt inside each one,
   * which truncated both the label and the figure. That was true, and it was a
   * verdict on the PADDING rather than on five columns. A filled tile spends 32
   * of its ~68pt on its own inset; an unboxed column spends none, which is the
   * whole difference between "SEASO…" and "SEASON FP".
   *
   * Losing the fills costs less than it sounds. The figures are 20pt bold —
   * still the loudest thing on the tab — and they now sit on the same ground as
   * the bio row at the foot of it, so the page has one way of setting a
   * labelled number instead of two.
   *
   * EVERY LABEL IS MEASURED AGAINST ~68pt, which is why `COPIES HELD` is now
   * `COPIES` and `POS RANK` is `RANK`. Do not lengthen one without checking it
   * still fits; `numberOfLines={1}` will hide the mistake by ellipsising the
   * one word the column exists to name.
   */
  statRow: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, minWidth: 0, gap: 2 },
  tileValue: { fontSize: 20, fontWeight: '800' },
  reconcile: { paddingHorizontal: Spacing.half },
  note: { borderRadius: Radius.panel, padding: Spacing.two + 4 },
});
