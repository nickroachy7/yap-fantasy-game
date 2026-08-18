import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Entry = {
  rank: number;
  user_id: string;
  display_name: string;
  total_points: number;
  weeks_played: number;
};

type Slate = { season: number; season_type: number; week: number };

// Fallback only — the live slate comes from current_slate().
const SEASON = 2026;

export default function LeaderboardScreen() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [slate, setSlate] = useState<Slate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    // Follow whatever slate is actually being played. Hardcoding season_type 2
    // (regular season) made the board render empty for the whole preseason
    // validation window, which reads as "the leaderboard is broken".
    const slateRes = await supabase.rpc('current_slate');
    if (slateRes.error) return setError(slateRes.error.message);
    const slate = (slateRes.data as Slate[] | null)?.[0] ?? null;

    const { data, error: err } = await supabase.rpc('leaderboard', {
      p_season: slate?.season ?? SEASON,
      p_season_type: slate?.season_type ?? 2,
      p_week: undefined, // omitted -> SQL default null -> season to date
      p_limit: 100,
    });
    if (err) return setError(err.message);
    setSlate(slate);
    setRows((data ?? []) as Entry[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.header}>
          <ThemedText type="title">Leaderboard</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {slate ? `${slate.season} ${slate.season_type === 1 ? 'preseason' : 'season'}` : `${SEASON} season`} · all players
          </ThemedText>
        </View>

        {rows === null && !error ? (
          <ActivityIndicator style={styles.centred} />
        ) : error ? (
          <ThemedText style={styles.centred}>{error}</ThemedText>
        ) : rows !== null && rows.length === 0 ? (
          <ThemedView style={styles.centred}>
            <ThemedText type="subtitle">No scores yet</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centreText}>
              The board fills in once Week 1 lineups are scored.
            </ThemedText>
          </ThemedView>
        ) : (
          <FlatList
            data={rows ?? []}
            keyExtractor={(r) => r.user_id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => {
              const isMe = item.user_id === session?.user.id;
              return (
                <ThemedView
                  type={isMe ? 'backgroundSelected' : 'backgroundElement'}
                  style={styles.row}>
                  <ThemedText style={styles.rank}>{item.rank}</ThemedText>
                  <ThemedText style={styles.name} numberOfLines={1}>
                    {item.display_name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.weeks_played}w
                  </ThemedText>
                  <ThemedText>{Number(item.total_points).toFixed(1)}</ThemedText>
                </ThemedView>
              );
            }}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 2 },
  list: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
  rank: { width: 32 },
  name: { flex: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  centreText: { textAlign: 'center' },
});
