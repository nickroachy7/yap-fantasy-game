/**
 * Cards > Shop: buy and open packs.
 *
 * Replaces the standalone Packs tab. Behaviour carried across verbatim where it
 * was already right — a claimed one-per-player pack must render as a disabled
 * "Claimed" button rather than letting the user fire the RPC and read a raw
 * Postgres error, and a zero gem cost reads as "Free".
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { BottomTabInset, Colors, Spacing, TierColors, type CardTier } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { supabase } from '@/lib/supabase';
import { PlayerCard, type PlayerCardModel } from './PlayerCard';

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
  rarity: string | null;
};

/** Every card is minted at the floor tier; only lineup starts move it. */
const MINT_TIER: CardTier = 'bronze';
const NEXT_TIER_LABEL = 'SILVER';

export function ShopPanel() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  // Single source of truth for the balance: the header reads the same value, so
  // fetching it separately here is how the two drift apart.
  const { gems, refresh } = usePlayer();

  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const [silverAt, setSilverAt] = useState<number>(200);
  const [openingCode, setOpeningCode] = useState<string | null>(null);
  const [pulled, setPulled] = useState<Pulled[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [packRes, openedRes, tierRes] = await Promise.all([
      supabase
        .from('packs')
        .select('id, code, name, gem_cost, card_count, once_per_user')
        .order('gem_cost'),
      // RLS scopes this to the caller, so it is exactly "packs I have opened".
      supabase.from('pack_openings').select('pack_id'),
      // The silver floor is tunable in the database; reading it beats baking
      // 200 into the client and having the card lie after a balance change.
      supabase.from('tier_thresholds').select('min_career_fp').eq('tier', 'silver').maybeSingle(),
    ]);
    if (packRes.error) return setError(packRes.error.message);
    if (openedRes.error) return setError(openedRes.error.message);

    setError(null);
    setPacks(packRes.data as Pack[]);
    setClaimed(new Set((openedRes.data ?? []).map((r) => r.pack_id)));
    if (!tierRes.error && tierRes.data) setSilverAt(Number(tierRes.data.min_career_fp));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(
    async (code: string) => {
      setOpeningCode(code);
      setError(null);
      setPulled(null);
      // All RNG, gem math and minting happen inside this one call, server-side.
      const { data, error: err } = await supabase.rpc('open_pack', { p_pack_code: code });
      if (err) {
        setError(err.message);
      } else {
        setPulled((data ?? []) as Pulled[]);
        // Both matter: `load` re-reads the claimed set so a one-per-player pack
        // flips to Claimed, `refresh` re-reads the balance the header shows.
        await Promise.all([load(), refresh()]);
      }
      setOpeningCode(null);
    },
    [load, refresh],
  );

  const toModel = (p: Pulled): PlayerCardModel => ({
    playerName: p.player_name ?? 'Unknown player',
    positionAbbreviation: p.position_abbreviation,
    teamAbbreviation: p.team_abbreviation,
    // A freshly pulled card has never been started, so it starts at the floor.
    tier: MINT_TIER,
    careerFp: 0,
    lineupStarts: 0,
    tierFloorFp: 0,
    nextTierAt: silverAt,
    nextTierLabel: NEXT_TIER_LABEL,
  });

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {packs === null && !error ? <ActivityIndicator /> : null}

      {packs?.map((p) => {
        const isClaimed = p.once_per_user && claimed.has(p.id);
        const affordable = gems >= p.gem_cost;
        const busy = openingCode === p.code;
        const blocked = openingCode !== null || isClaimed || !affordable;
        const label = isClaimed ? 'Claimed' : affordable ? 'Open' : 'Not enough gems';
        const accent = TierColors[scheme].gold.accent;

        return (
          <View key={p.id} style={[styles.packRow, { backgroundColor: c.backgroundElement }]}>
            <View style={styles.packInfo}>
              <Text numberOfLines={2} style={[styles.packName, { color: c.text }]}>
                {p.name}
              </Text>
              <Text numberOfLines={2} style={[styles.packMeta, { color: c.textSecondary }]}>
                {`${p.card_count} cards · ${p.gem_cost === 0 ? 'Free' : `${p.gem_cost} gems`}`}
                {p.once_per_user ? ' · one per player' : ''}
              </Text>
              {p.once_per_user && !isClaimed ? (
                <Text style={[styles.packNote, { color: c.textSecondary }]}>
                  Guarantees one card at every lineup position.
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={() => void open(p.code)}
              disabled={blocked}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${p.name}`}
              accessibilityState={{ disabled: blocked, busy }}
              style={({ pressed }) => [
                styles.openButton,
                { backgroundColor: isClaimed || !affordable ? c.backgroundSelected : accent },
                blocked && styles.disabled,
                pressed && !blocked && styles.pressed,
              ]}>
              {busy ? (
                <ActivityIndicator />
              ) : (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.openLabel,
                    { color: isClaimed || !affordable ? c.textSecondary : '#17130A' },
                  ]}>
                  {label}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}

      {error ? (
        <Text style={[styles.error, { color: c.text, backgroundColor: c.backgroundSelected }]}>
          {error}
        </Text>
      ) : null}

      {pulled ? (
        <View style={styles.pulledBlock}>
          <Text style={[styles.pulledTitle, { color: c.text }]}>
            {pulled.length === 1 ? 'You pulled 1 card' : `You pulled ${pulled.length} cards`}
          </Text>
          <View style={styles.grid}>
            {pulled.map((p) => (
              <PlayerCard key={p.card_instance_id} model={toModel(p)} size="grid" />
            ))}
          </View>
          <Text style={[styles.packNote, { color: c.textSecondary }]}>
            New cards start at bronze. Start them in a lineup to earn their way up.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 16,
  },
  packInfo: { flex: 1, minWidth: 0, gap: 2 },
  packName: { fontSize: 17, fontWeight: '700' },
  packMeta: { fontSize: 13, fontWeight: '600' },
  packNote: { fontSize: 12, lineHeight: 17 },
  openButton: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    minWidth: 108,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  openLabel: { fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
  error: { fontSize: 13, padding: Spacing.two, borderRadius: 8, overflow: 'hidden' },
  pulledBlock: { gap: Spacing.three },
  pulledTitle: { fontSize: 20, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, justifyContent: 'center' },
});
