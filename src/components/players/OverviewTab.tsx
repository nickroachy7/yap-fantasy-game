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
}: {
  player: DirectoryPlayer;
  profile: PlayerProfile | null;
  market: PlayerMarket | null;
  /** A line of card context, on the card profile only. */
  lead?: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const rank = currentRank(profile);

  return (
    <>
      {lead}

      {/* This season, scored from per-game rows — so unlike the career table
          these DO include the per-game bonuses. The two are not the same kind
          of number and are deliberately not shown side by side. */}
      <View style={styles.statRow}>
        <StatTile label="SEASON FP" value={oneDp(player.seasonFp)} emphasis />
        <StatTile label="GAMES" value={String(player.gamesPlayed)} />
        <StatTile label="FP / GAME" value={oneDp(player.fpPerGame)} />
        {rank ? (
          <StatTile
            label={rank.season === player.season ? 'POS RANK' : `POS RANK ${rank.season}`}
            value={`${player.position ?? ''}${rank.rank}`}
            /* The pool travels with the rank everywhere in this app — see
               CareerTable. "QB4" alone is a claim the data cannot support. */
            hint={rank.pool ? `of ${rank.pool}` : undefined}
          />
        ) : null}
        {market ? (
          <StatTile
            label="COPIES HELD"
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

      {profile ? (
        <>
          <UsagePanel
            usage={profile.usage}
            position={profile.player.positionAbbreviation}
            teamAbbreviation={profile.player.teamAbbreviation}
          />
          <TeamContext bio={profile.player} standings={profile.standings} />
        </>
      ) : null}
    </>
  );
}

function StatTile({
  label,
  value,
  hint,
  emphasis,
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
    <View style={[styles.tile, { backgroundColor: c.backgroundElement }]}>
      <Text numberOfLines={1} style={[Type.micro, { color: c.textTertiary }]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[NUMERIC, styles.tileValue, { color: c.text, fontSize: emphasis ? 24 : 20 }]}>
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
  /* Wraps. Four tiles across a phone-width sheet leaves ~46pt of usable width
     inside each one, which truncated both the label AND the figure — "SEASO…"
     over "30…", the two things the tile exists to say. */
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 140,
    borderRadius: Radius.panel,
    padding: Spacing.three,
    gap: 2,
  },
  tileValue: { fontWeight: '800' },
  note: { borderRadius: Radius.panel, padding: Spacing.two + 4 },
});
