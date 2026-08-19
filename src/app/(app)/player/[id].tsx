/**
 * Player profile: who this player is, what he has produced across his career
 * and this season, how his team uses him, and the game log behind the total.
 *
 * Most of this comes from one RPC (`player_profile`) rather than four client
 * round trips, because the ranking has to happen server-side against every
 * player-season anyway.
 *
 * Three things the provider does not sell, and which are therefore NOT here:
 * projections, depth charts, and news. Rather than invent them, the usage
 * panel shows measured share of the team's work and says plainly that it is a
 * measurement. See UsagePanel.
 *
 * ONE OF TWO PROFILES. This is the DIRECTORY one: it is about the footballer,
 * it is identical for every user, and ownership appears only in aggregate. Its
 * sibling, `/card/<card_instance_id>`, is about ONE copy you hold — what that
 * copy has earned, which weeks it started, and where it ranks against every
 * other copy of him. Two people holding the same player hold genuinely
 * different objects, and one screen could not put both cases first.
 *
 * The route param is therefore the PLAYER id, never the card id. `Your cards`
 * is the bridge: it lists your copies and each one links across. Selling lives
 * over there too, because selling is per-copy and this screen shows a player.
 *
 * `Across the community` is the panel that only exists because this is a
 * collection game — how many copies are in circulation, how many are actually
 * being played, and how good the best one in the game has become.
 *
 * No photo, no logo, no jersey: unlicensed. Club and position are text — the
 * sheet's own header carries them, so this screen no longer draws an identity
 * block of its own.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { InjuryChip } from '@/components/cards/InjuryChip';
import {
  DIRECTORY_COLUMNS,
  normalise,
  type DirectoryPlayer,
} from '@/components/cards/player-directory';
import { BioStrip } from '@/components/players/BioStrip';
import { CardHistory, type OwnedCard } from '@/components/players/CardHistory';
import { CommunityPanel } from '@/components/players/CommunityPanel';
import { CareerTable } from '@/components/players/CareerTable';
import { TeamContext } from '@/components/players/TeamContext';
import { UsagePanel } from '@/components/players/UsagePanel';
import { GameLog } from '@/components/players/GameLog';
import { parseGameLog, type GameLogSection } from '@/components/players/game-log';
import { parseMarket, type PlayerMarket } from '@/components/players/market';
import { parseProfile, type PlayerProfile } from '@/components/players/profile';
import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { Colors, Spacing, type CardTier } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

const NUMERIC = { fontVariant: ['tabular-nums' as const] };

type PlayerTab = 'overview' | 'career' | 'log';

/**
 * Tabs rather than one long scroll.
 *
 * Everything here is worth having, but stacked it runs to five screens and the
 * game log — the part a manager checks most often — ends up furthest from the
 * top. Splitting is what every real fantasy player page does, and for the same
 * reason. Overview stays first because it answers "should I start him".
 */
const PLAYER_TABS: Tab<PlayerTab>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'career', label: 'Career' },
  { value: 'log', label: 'Game log' },
];

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * The player's position rank, for the stat strip.
 *
 * The spec's hero band carries `#5 QB` and `#9 OVERALL`. Only the first is
 * available: `player_season_ranks` ranks within a position, and there is no
 * cross-position ranking in the data — nor would one mean much under a scoring
 * system where a quarterback's baseline is twice a tight end's.
 *
 * Prefers the current season, falling back to the most recent season that has
 * a rank at all. In August the current season has no ranked games yet, and
 * showing last year's rank clearly labelled beats showing nothing.
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

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const [player, setPlayer] = useState<DirectoryPlayer | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [sections, setSections] = useState<GameLogSection[]>([]);
  const [market, setMarket] = useState<PlayerMarket | null>(null);
  const [owned, setOwned] = useState<OwnedCard[]>([]);
  const [ownedLoading, setOwnedLoading] = useState(true);
  const [tab, setTab] = useState<PlayerTab>('overview');

  const load = useCallback<Load>(
    async (live) => {
      if (!id) return;

      const [directoryRes, profileRes, gameLogRes, marketRes, ownedRes] = await Promise.all([
        supabase
          .from('player_directory')
          .select(DIRECTORY_COLUMNS)
          .eq('player_id', id)
          .order('season', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.rpc('player_profile', { p_player_id: id }),
        supabase.rpc('player_game_log', { p_player_id: id }),
        supabase.rpc('player_market', { p_player_id: id }),
        /* RLS scopes `my_collection` to the caller, so this needs no user
           filter — and cannot leak anyone else's cards even if one were added
           by mistake. Unpaged deliberately: this is one player's copies, which
           is a handful, not the whole collection. */
        supabase
          .from('my_collection')
          .select(
            'id, tier, career_fp, lineup_starts, season, acquired_at, tier_floor_fp, next_tier_at, next_tier_label, sell_value',
          )
          .eq('player_id', id)
          .order('acquired_at', { ascending: false }),
      ]);

      if (!live()) return;
      if (directoryRes.error) return directoryRes.error.message;

      setPlayer(directoryRes.data ? normalise(directoryRes.data) : null);
      // A profile failure is non-fatal on purpose: the directory row and the
      // game log stand on their own, and half a page beats an error page.
      setProfile(profileRes.error || !profileRes.data ? null : parseProfile(profileRes.data));

      // The game log RPC spans every season we hold AND the fixtures still to
      // come, so there is no client-side merging left to do here.
      setSections(gameLogRes.error || !gameLogRes.data ? [] : parseGameLog(gameLogRes.data));

      // Also non-fatal. Community ownership is the most interesting panel on
      // the page and the least load-bearing: nobody should lose a player's
      // stats because an aggregate over card_instances timed out.
      setMarket(marketRes.error || !marketRes.data ? null : parseMarket(marketRes.data));

      // Also non-fatal: not knowing which cards you hold should never take the
      // player's stats off the screen.
      setOwned(
        ownedRes.error || !ownedRes.data
          ? []
          : ownedRes.data.map((r) => ({
              id: String(r.id),
              tier: (r.tier ?? 'bronze') as CardTier,
              careerFp: Number(r.career_fp ?? 0),
              lineupStarts: Number(r.lineup_starts ?? 0),
              season: r.season,
              acquiredAt: r.acquired_at,
              tierFloorFp: r.tier_floor_fp === null ? null : Number(r.tier_floor_fp),
              nextTierAt: r.next_tier_at === null ? null : Number(r.next_tier_at),
              nextTierLabel: r.next_tier_label,
              // Priced by the server, never derived here — a client that
              // computes its own price will eventually disagree with the
              // balance the user actually receives.
              sellValue: Number(r.sell_value ?? 0),
            })),
      );
      setOwnedLoading(false);
    },
    [id],
  );

  /* No `refreshing`, deliberately. Pull-to-refresh is gone from this screen:
     inside a native page sheet a downward drag is the DISMISS gesture, so a
     RefreshControl competing for it would make the sheet feel broken at the
     top of the scroll. Nothing on this screen mutates any more either —
     selling moved to the card profile — so there is nothing to re-read. */
  const { loading, error } = useLoader(load);

  /**
   * Open one of your copies.
   *
   * `/card/<card_instance_id>`, NOT `/player/<player_id>`: this is the one
   * place in the app where both ids are in scope at once, and they are easy to
   * confuse. A player is one row; the copies of him are many, and this link is
   * about exactly one of them.
   */
  const openCard = useCallback(
    (card: OwnedCard) => {
      router.push({ pathname: '/card/[id]', params: { id: card.id } });
    },
    [router],
  );

  /**
   * Dismiss the sheet.
   *
   * `back()` is a DISMISSAL now, not a navigation — the tabs are still mounted
   * underneath, so this puts the profile down and leaves you exactly where you
   * were, mid-scroll. The fallback still matters and is still not /players:
   * a cold deep link to /player/<id> opens the sheet with nothing beneath it,
   * and `replace` is what gives that visitor an app rather than a dead end.
   */
  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/players');
  }, [router]);

  const body = () => {
    // `!id` cannot happen on this route, but if it ever did the loader would
    // settle immediately with nothing read — a spinner is the honest answer to
    // that, not "player not found".
    if (loading || !id) {
      return (
        <View style={styles.centre}>
          <ActivityIndicator />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centre}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>Could not load this player</Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>{error}</Text>
        </View>
      );
    }
    if (!player) {
      return (
        <View style={styles.centre}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>Player not found</Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
            This player is not in the current card set.
          </Text>
        </View>
      );
    }

    const rank = currentRank(profile);

    return (
      <>
        {/* No identity block here any more. The sheet's own header carries the
            name and `TEAM · POS · RARITY`, and repeating it immediately below
            printed the player's name twice on a surface where vertical space is
            the scarcest thing there is. The designation still needs somewhere to
            live, because it is the one part of that block which is news. */}
        {player.injuryStatus ? (
          <View style={styles.injuryRow}>
            <InjuryChip status={player.injuryStatus} size="detail" />
          </View>
        ) : null}

        {profile ? <BioStrip bio={profile.player} /> : null}

        {/* This season, scored from per-game rows — so unlike the career table
            these DO include the per-game bonuses. The two are not the same
            kind of number and are deliberately not shown side by side. */}
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
          {/* The spec's OWNERSHIP block, as a COUNT rather than the percentage
              Sleeper prints. A percentage of a beta-sized user base reads 0% or
              100% and teaches people to distrust the column; "12 copies held by
              3 people" is exactly as true at every scale. The rest of the
              picture — tier spread, how many are actually played, the best copy
              in the game — is in the community panel below. */}
          {market ? (
            <StatTile
              label="COPIES HELD"
              value={String(market.totals.held)}
              hint={`${market.totals.owners} owner${market.totals.owners === 1 ? '' : 's'}`}
            />
          ) : null}
        </View>

        <View style={[styles.tabBar, { borderColor: c.backgroundElement }]}>
          <Tabs
            tabs={PLAYER_TABS.map((t) =>
              t.value === 'log' && sections.length > 0
                ? { ...t, hint: String(sections.length) }
                : t,
            )}
            value={tab}
            onChange={setTab}
          />
        </View>

        {tab === 'overview' ? (
          <>
            {profile?.player.injuryComment ? (
              <View style={[styles.note, { backgroundColor: c.backgroundElement }]}>
                <Text style={[styles.noteBody, { color: c.textSecondary }]}>
                  {profile.player.injuryComment}
                </Text>
              </View>
            ) : null}

            {/* Before the league-wide context, because "what do I hold" is the
                question that brought most people to this page from a pack. */}
            <CardHistory
              cards={owned}
              loading={ownedLoading}
              playerName={player.name}
              onOpen={openCard}
            />

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

            {/* Last on the tab, and deliberately so. Everything above is about
                the footballer; this is about the card, and it is the part that
                only exists because this is a collection game. */}
            <CommunityPanel market={market} />
          </>
        ) : null}

        {tab === 'career' && profile ? (
          <CareerTable career={profile.career} position={profile.player.positionAbbreviation} />
        ) : null}

        {tab === 'log' ? (
          <GameLog sections={sections} position={profile?.player.positionAbbreviation ?? null} />
        ) : null}

      </>
    );
  };

  return (
    <PlayerSheetFrame
      title={player?.name}
      /* Carries the rarity too, now that the body no longer prints an identity
         block. This is the whole of `TEAM · POS · RARITY` that used to sit
         under the name below — said once, at the top, where a sheet's title
         belongs. */
      subtitle={
        player
          ? [player.team?.toUpperCase(), player.position, player.rarity?.toUpperCase()]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      onClose={dismiss}>
      {body()}
    </PlayerSheetFrame>
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
      <Text numberOfLines={1} style={[styles.tileLabel, { color: c.textSecondary }]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.tileValue, NUMERIC, { color: c.text, fontSize: emphasis ? 24 : 20 }]}>
        {value}
      </Text>
      {hint ? (
        <Text numberOfLines={1} style={[styles.tileHint, NUMERIC, { color: c.textSecondary }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  injuryRow: { flexDirection: 'row' },
  /* Wraps. Four tiles across a phone-width sheet leaves ~46pt of usable width
     inside each one, which truncated both the label AND the figure — "SEASO…"
     over "30…", the two things the tile exists to say. `flexBasis` lets the row
     lay out two-up on a phone and four-up once there is room, without a
     breakpoint to keep in sync. */
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 140,
    borderRadius: 12,
    padding: Spacing.three,
    gap: 2,
  },
  tileLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  tileValue: { fontWeight: '800' },
  tileHint: { fontSize: 10, fontWeight: '600' },
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 2 },
  note: { borderRadius: 12, padding: Spacing.two + 4 },
  noteBody: { fontSize: 12, lineHeight: 17 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: Spacing.two },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logWeek: { width: 74, flexShrink: 0, gap: 1 },
  logWeekText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  logOpponent: { fontSize: 12, fontWeight: '600' },
  logDate: { fontSize: 10, opacity: 0.8 },
  logStats: { flex: 1, minWidth: 0, gap: 2 },
  logStatText: { fontSize: 12, lineHeight: 16 },
  logStatus: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  logPoints: { fontSize: 18, fontWeight: '800', width: 56, textAlign: 'right', flexShrink: 0 },
});
