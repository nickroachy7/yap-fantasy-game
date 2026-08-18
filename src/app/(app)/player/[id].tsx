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
 * The route param is the PLAYER id (not the card id) — a player is one row in
 * the directory but potentially many owned card instances.
 *
 * No photo, no logo, no jersey: unlicensed. Club is text, position is a glyph.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { InjuryChip } from '@/components/cards/InjuryChip';
import { PositionGlyph } from '@/components/cards/PositionGlyph';
import {
  DIRECTORY_COLUMNS,
  normalise,
  type DirectoryPlayer,
} from '@/components/cards/player-directory';
import { BioStrip } from '@/components/players/BioStrip';
import { CareerTable } from '@/components/players/CareerTable';
import { TeamContext } from '@/components/players/TeamContext';
import { UsagePanel } from '@/components/players/UsagePanel';
import { GameLog } from '@/components/players/GameLog';
import { parseGameLog, type GameLogSection } from '@/components/players/game-log';
import { parseProfile, type PlayerProfile } from '@/components/players/profile';
import { Screen } from '@/components/shell/Screen';
import { BottomTabInset, Colors, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const NUMERIC = { fontVariant: ['tabular-nums' as const] };

const oneDp = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const [player, setPlayer] = useState<DirectoryPlayer | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [sections, setSections] = useState<GameLogSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!id) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [directoryRes, profileRes, gameLogRes] = await Promise.all([
        supabase
          .from('player_directory')
          .select(DIRECTORY_COLUMNS)
          .eq('player_id', id)
          .order('season', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.rpc('player_profile', { p_player_id: id }),
        supabase.rpc('player_game_log', { p_player_id: id }),
      ]);

      const failure = directoryRes.error;
      if (failure) {
        setError(failure.message);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setPlayer(directoryRes.data ? normalise(directoryRes.data) : null);
      // A profile failure is non-fatal on purpose: the directory row and the
      // game log stand on their own, and half a page beats an error page.
      setProfile(profileRes.error || !profileRes.data ? null : parseProfile(profileRes.data));

      // The game log RPC spans every season we hold AND the fixtures still to
      // come, so there is no client-side merging left to do here.
      setSections(gameLogRes.error || !gameLogRes.data ? [] : parseGameLog(gameLogRes.data));

      setLoading(false);
      setRefreshing(false);
    },
    [id],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/cards');
  }, [router]);

  const body = () => {
    if (loading) {
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

    return (
      <>
        <View style={[styles.identity, { backgroundColor: c.backgroundElement }]}>
          <PositionGlyph
            position={player.position}
            size={48}
            color={c.text}
            background={c.background}
            borderColor={c.backgroundSelected}
          />
          <View style={styles.identityText}>
            <Text numberOfLines={2} style={[styles.name, { color: c.text }]}>
              {player.name}
            </Text>
            <Text numberOfLines={1} style={[styles.subline, { color: c.textSecondary }]}>
              {[player.team?.toUpperCase(), player.position, player.rarity?.toUpperCase()]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <InjuryChip status={player.injuryStatus} size="detail" />
          </View>
        </View>

        {profile ? <BioStrip bio={profile.player} /> : null}

        {/* This season, scored from per-game rows — so unlike the career table
            these DO include the per-game bonuses. The two are not the same
            kind of number and are deliberately not shown side by side. */}
        <View style={styles.statRow}>
          <StatTile label="SEASON FP" value={oneDp(player.seasonFp)} emphasis />
          <StatTile label="GAMES" value={String(player.gamesPlayed)} />
          <StatTile label="FP / GAME" value={oneDp(player.fpPerGame)} />
        </View>

        {profile?.player.injuryComment ? (
          <View style={[styles.note, { backgroundColor: c.backgroundElement }]}>
            <Text style={[styles.noteBody, { color: c.textSecondary }]}>
              {profile.player.injuryComment}
            </Text>
          </View>
        ) : null}

        {profile ? (
          <>
            <Text style={[styles.sectionTitle, { color: c.text }]}>Career</Text>
            <CareerTable
              career={profile.career}
              position={profile.player.positionAbbreviation}
            />

            <Text style={[styles.sectionTitle, { color: c.text }]}>Usage</Text>
            <UsagePanel
              usage={profile.usage}
              position={profile.player.positionAbbreviation}
              teamAbbreviation={profile.player.teamAbbreviation}
            />

            <Text style={[styles.sectionTitle, { color: c.text }]}>Team</Text>
            <TeamContext bio={profile.player} standings={profile.standings} />
          </>
        ) : null}

        <Text style={[styles.sectionTitle, { color: c.text }]}>Game log</Text>
        <GameLog sections={sections} position={profile?.player.positionAbbreviation ?? null} />

        <View style={styles.tailSpace} />
      </>
    );
  };

  return (
    <Screen
      title={player?.name}
      measure="table"
      context={player ? `${player.season ?? ''} game log`.trim() : 'Player'}
      refreshing={refreshing}
      onRefresh={() => void load('refresh')}>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Back to cards"
        hitSlop={8}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Text style={[styles.backText, { color: c.textSecondary }]}>‹ Cards</Text>
      </Pressable>
      {body()}
    </Screen>
  );
}

function StatTile({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
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
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', paddingVertical: 4, minHeight: 32, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  centre: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 16,
  },
  identityText: { flex: 1, minWidth: 0, gap: Spacing.one },
  name: { fontSize: 24, fontWeight: '800', lineHeight: 29 },
  subline: { fontSize: 13, fontWeight: '600', letterSpacing: 0.8 },
  statRow: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, minWidth: 0, borderRadius: 12, padding: Spacing.three, gap: 2 },
  tileLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  tileValue: { fontWeight: '800' },
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
  tailSpace: { height: BottomTabInset },
});
