import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerCard, type PlayerCardModel } from '@/components/cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { CardTier } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Pack = {
  id: string;
  code: string;
  name: string;
  gem_cost: number;
  card_count: number;
  once_per_user: boolean;
};
type Pulled = {
  card_instance_id: string;
  player_name: string | null;
  position_abbreviation: string | null;
  team_abbreviation: string | null;
};

export default function PacksScreen() {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [gems, setGems] = useState<number | null>(null);
  const [opening, setOpening] = useState(false);
  const [pulled, setPulled] = useState<Pulled[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [packRes, gemRes, openedRes] = await Promise.all([
      supabase
        .from('packs')
        .select('id, code, name, gem_cost, card_count, once_per_user')
        .order('gem_cost'),
      supabase.from('gem_balances').select('balance').single(),
      // RLS scopes this to the caller, so it is exactly "packs I have opened".
      supabase.from('pack_openings').select('pack_id'),
    ]);
    if (packRes.error) return setError(packRes.error.message);
    if (gemRes.error) return setError(gemRes.error.message);
    if (openedRes.error) return setError(openedRes.error.message);
    setPacks(packRes.data as Pack[]);
    setGems(gemRes.data?.balance ?? 0);
    setClaimed(new Set((openedRes.data ?? []).map((r) => r.pack_id as string)));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(
    async (code: string) => {
      setOpening(true);
      setError(null);
      setPulled(null);
      // All RNG, gem math and minting happen inside this one call, server-side.
      const { data, error: err } = await supabase.rpc('open_pack', { p_pack_code: code });
      if (err) {
        setError(err.message);
      } else {
        setPulled((data ?? []) as Pulled[]);
        await load();
      }
      setOpening(false);
    },
    [load],
  );

  const toModel = (p: Pulled): PlayerCardModel => ({
    playerName: p.player_name ?? 'Unknown player',
    positionAbbreviation: p.position_abbreviation,
    teamAbbreviation: p.team_abbreviation,
    // A freshly pulled card has never been started, so it starts at the floor.
    tier: 'bronze' as CardTier,
    careerFp: 0,
    lineupStarts: 0,
    tierFloorFp: 0,
    nextTierAt: 200,
    nextTierLabel: 'SILVER',
  });

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="title">Packs</ThemedText>
            <ThemedText themeColor="textSecondary">
              {gems === null ? ' ' : `${gems.toLocaleString()} gems`}
            </ThemedText>
          </View>

          {packs === null && !error ? <ActivityIndicator /> : null}

          {packs?.map((p) => {
            const affordable = (gems ?? 0) >= p.gem_cost;
            const isClaimed = p.once_per_user && claimed.has(p.id);
            const blocked = opening || isClaimed || !affordable;
            const label = isClaimed ? 'Claimed' : affordable ? 'Open' : 'Not enough gems';
            return (
              <ThemedView key={p.id} type="backgroundElement" style={styles.packRow}>
                <View style={styles.packInfo}>
                  <ThemedText type="subtitle">{p.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {p.card_count} cards · {p.gem_cost === 0 ? 'Free' : `${p.gem_cost} gems`}
                    {p.once_per_user ? ' · one per player' : ''}
                  </ThemedText>
                  {p.once_per_user && !isClaimed ? (
                    <ThemedText type="small">
                      Guarantees one card at every lineup position.
                    </ThemedText>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => void open(p.code)}
                  disabled={blocked}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: blocked, busy: opening }}
                  style={({ pressed }) => [
                    styles.openButton,
                    blocked && styles.disabled,
                    pressed && !blocked && styles.pressed,
                  ]}>
                  {opening ? <ActivityIndicator /> : <ThemedText>{label}</ThemedText>}
                </Pressable>
              </ThemedView>
            );
          })}

          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

          {pulled ? (
            <>
              <ThemedText type="subtitle">You pulled</ThemedText>
              <View style={styles.grid}>
                {pulled.map((p) => (
                  <PlayerCard key={p.card_instance_id} model={toModel(p)} size="grid" />
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 20, gap: 16, maxWidth: 700, width: '100%', alignSelf: 'center' },
  header: { gap: 2 },
  packRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16 },
  packInfo: { flex: 1, gap: 2 },
  openButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, minWidth: 96, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  error: { textAlign: 'center' },
});
