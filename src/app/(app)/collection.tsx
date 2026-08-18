import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerCard, type PlayerCardModel } from '@/components/cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { CardTier } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Row = {
  id: string;
  player_name: string | null;
  position_abbreviation: string | null;
  team_abbreviation: string | null;
  tier: CardTier;
  career_fp: number;
  lineup_starts: number;
  tier_floor_fp: number | null;
  next_tier_at: number | null;
  next_tier_label: string | null;
};

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PK'] as const;
const TIERS = ['ALL', 'bronze', 'silver', 'gold', 'diamond'] as const;

export default function CollectionScreen() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>('ALL');
  const [tier, setTier] = useState<(typeof TIERS)[number]>('ALL');

  const load = useCallback(async () => {
    setError(null);
    // my_collection is security_invoker, so RLS scopes this to the caller.
    const { data, error: err } = await supabase
      .from('my_collection')
      .select(
        'id, player_name, position_abbreviation, team_abbreviation, tier, career_fp, lineup_starts, tier_floor_fp, next_tier_at, next_tier_label',
      )
      .order('career_fp', { ascending: false });

    if (err) {
      setError(err.message);
      return;
    }
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const visible = useMemo(() => {
    if (!rows) return [];
    return rows.filter(
      (r) =>
        (position === 'ALL' || r.position_abbreviation === position) &&
        (tier === 'ALL' || r.tier === tier),
    );
  }, [rows, position, tier]);

  const toModel = useCallback(
    (r: Row): PlayerCardModel => ({
      playerName: r.player_name ?? 'Unknown player',
      positionAbbreviation: r.position_abbreviation,
      teamAbbreviation: r.team_abbreviation,
      tier: r.tier,
      careerFp: Number(r.career_fp),
      lineupStarts: r.lineup_starts,
      tierFloorFp: r.tier_floor_fp == null ? undefined : Number(r.tier_floor_fp),
      nextTierAt: r.next_tier_at == null ? null : Number(r.next_tier_at),
      nextTierLabel: r.next_tier_label?.toUpperCase(),
    }),
    [],
  );

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.header}>
          <ThemedText type="title">Collection</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {rows === null ? ' ' : `${visible.length} of ${rows.length} cards`}
          </ThemedText>
        </View>

        <FilterRow options={POSITIONS} value={position} onChange={setPosition} />
        <FilterRow options={TIERS} value={tier} onChange={setTier} labelCase />

        {rows === null && !error ? (
          <ActivityIndicator style={styles.centred} />
        ) : error ? (
          <ThemedText style={styles.centred}>{error}</ThemedText>
        ) : rows !== null && visible.length === 0 ? (
          <ThemedView style={styles.centred}>
            <ThemedText type="subtitle">
              {rows.length === 0 ? 'No cards yet' : 'Nothing matches those filters'}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.emptyBody}>
              {rows.length === 0
                ? 'Open a pack to start your collection.'
                : 'Try clearing a filter.'}
            </ThemedText>
          </ThemedView>
        ) : (
          // Virtualised from day one — a full collection is hundreds of cards.
          <FlatList
            data={visible}
            keyExtractor={(r) => r.id}
            numColumns={2}
            columnWrapperStyle={styles.column}
            contentContainerStyle={styles.list}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => <PlayerCard model={toModel(item)} size="grid" />}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function FilterRow<T extends string>({
  options,
  value,
  onChange,
  labelCase,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelCase?: boolean;
}) {
  return (
    <View style={styles.filterRow}>
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected }}>
            <ThemedView
              type={selected ? 'backgroundSelected' : 'backgroundElement'}
              style={styles.chip}>
              <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
                {labelCase && opt !== 'ALL' ? opt.toUpperCase() : opt}
              </ThemedText>
            </ThemedView>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 2 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingTop: 10 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  list: { padding: 16, gap: 16 },
  column: { gap: 16, justifyContent: 'flex-start' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  emptyBody: { textAlign: 'center' },
});
