import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { injuryWeight } from '@/lib/injury';
import { supabase } from '@/lib/supabase';

type Slate = { season: number; season_type: number; week: number };
type SlotConfig = { slot: string; eligible_positions: string[]; display_order: number };
type Card = {
  id: string;
  player_name: string | null;
  position_abbreviation: string | null;
  team_abbreviation: string | null;
  injury_status: string | null;
  career_fp: number;
  tier: string;
};

/**
 * Injury statuses come in two weights, and collapsing them was a mistake worth
 * not repeating: `Questionable` is by far the most common status in the NFL, so
 * flagging it with the same alarm as `Out` trains people to ignore the alarm.
 *
 * BLOCKING  — the player is very unlikely to play. Loud.
 * ADVISORY  — genuinely uncertain. Worth knowing, not worth shouting.
 */

export default function LineupScreen() {
  const [slate, setSlate] = useState<Slate | null>(null);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotConfig[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick so the lock state flips on its own rather than on a re-render by luck.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // upcoming_slate(), not current_slate(): the latter returns the week already
    // in progress, whose lock time is by definition in the past — which made this
    // screen render as permanently locked.
    const slateRes = await supabase.rpc('upcoming_slate');
    if (slateRes.error) {
      setError(slateRes.error.message);
      setLoading(false);
      return;
    }
    const s = (slateRes.data as Slate[] | null)?.[0] ?? null;
    setSlate(s);

    const [cfg, coll, lock, existing] = await Promise.all([
      supabase.from('lineup_slot_config').select('slot, eligible_positions, display_order').order('display_order'),
      supabase
        .from('my_collection')
        .select('id, player_name, position_abbreviation, team_abbreviation, injury_status, career_fp, tier')
        .order('career_fp', { ascending: false }),
      s
        ? supabase.rpc('week_lock_time', {
            p_season: s.season,
            p_season_type: s.season_type,
            p_week: s.week,
          })
        : Promise.resolve({ data: null, error: null }),
      s
        ? supabase
            .from('lineups')
            .select('id, lineup_slots(slot, card_instance_id)')
            .eq('season', s.season)
            .eq('season_type', s.season_type)
            .eq('week', s.week)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (cfg.error) setError(cfg.error.message);
    else setSlots((cfg.data ?? []) as SlotConfig[]);
    if (!coll.error) setCards((coll.data ?? []) as Card[]);
    if (!lock.error && lock.data) setLockAt(String(lock.data));

    // Re-hydrate a lineup already submitted for this week.
    const prior = existing.data as { lineup_slots?: { slot: string; card_instance_id: string }[] } | null;
    if (prior?.lineup_slots) {
      setPicks(Object.fromEntries(prior.lineup_slots.map((r) => [r.slot, r.card_instance_id])));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = lockAt ? now >= new Date(lockAt).getTime() : false;
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const usedIds = useMemo(() => new Set(Object.values(picks)), [picks]);

  const picked = useMemo(
    () => Object.values(picks).map((id) => byId.get(id)).filter((c): c is Card => Boolean(c)),
    [picks, byId],
  );
  const blockingPicks = useMemo(
    () => picked.filter((c) => injuryWeight(c.injury_status) === 'blocking'),
    [picked],
  );
  const advisoryPicks = useMemo(
    () => picked.filter((c) => injuryWeight(c.injury_status) === 'advisory'),
    [picked],
  );

  async function submit() {
    if (!slate) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    const payload = Object.entries(picks).map(([slot, card_instance_id]) => ({ slot, card_instance_id }));
    // The server re-checks ownership, eligibility and the lock. This is a
    // convenience, not the enforcement.
    const { error: err } = await supabase.rpc('set_lineup', {
      p_season: slate.season,
      p_season_type: slate.season_type,
      p_week: slate.week,
      p_slots: payload,
    });
    if (err) setError(err.message);
    else setSaved(`Lineup saved for week ${slate.week}.`);
    setSaving(false);
  }

  if (loading) {
    return (
      <ThemedView style={styles.fill}>
        <SafeAreaView style={styles.centre}>
          <ActivityIndicator />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Lineup</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {slate
              ? `${slate.season} ${slate.season_type === 1 ? 'preseason' : 'season'} · week ${slate.week}`
              : 'No slate scheduled'}
          </ThemedText>

          {lockAt ? (
            <ThemedView type="backgroundElement" style={styles.lockBanner}>
              <ThemedText type="small">
                {locked
                  ? `Locked at ${new Date(lockAt).toLocaleString()}`
                  : `Locks ${new Date(lockAt).toLocaleString()}`}
              </ThemedText>
            </ThemedView>
          ) : null}

          {blockingPicks.length > 0 && !locked ? (
            <ThemedView type="backgroundElement" style={styles.warn}>
              <ThemedText type="small">
                ⚠︎ Unlikely to play:{' '}
                {blockingPicks.map((c) => `${c.player_name} (${c.injury_status})`).join(', ')}
              </ThemedText>
            </ThemedView>
          ) : null}

          {advisoryPicks.length > 0 && !locked ? (
            <ThemedView type="backgroundElement" style={styles.warn}>
              <ThemedText type="small" themeColor="textSecondary">
                Check before kickoff:{' '}
                {advisoryPicks.map((c) => `${c.player_name} (${c.injury_status})`).join(', ')}
              </ThemedText>
            </ThemedView>
          ) : null}

          {cards.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              You have no cards yet — open a pack first.
            </ThemedText>
          ) : null}

          {slots.map((cfg) => {
            const pickedId = picks[cfg.slot];
            const picked = pickedId ? byId.get(pickedId) : undefined;
            const isOpen = openSlot === cfg.slot;
            const eligible = cards.filter(
              (c) =>
                c.position_abbreviation != null &&
                cfg.eligible_positions.includes(c.position_abbreviation) &&
                (!usedIds.has(c.id) || c.id === pickedId),
            );

            return (
              <View key={cfg.slot}>
                <Pressable
                  disabled={locked}
                  onPress={() => setOpenSlot(isOpen ? null : cfg.slot)}
                  accessibilityRole="button">
                  <ThemedView
                    type={isOpen ? 'backgroundSelected' : 'backgroundElement'}
                    style={[styles.slotRow, locked && styles.dim]}>
                    <ThemedText style={styles.slotLabel}>{cfg.slot}</ThemedText>
                    <View style={styles.slotBody}>
                      {picked ? (
                        <>
                          <ThemedText numberOfLines={1}>
                            {picked.player_name}
                            {injuryWeight(picked.injury_status) === 'blocking' ? ' ⚠︎' : ''}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {picked.position_abbreviation} · {picked.team_abbreviation ?? '—'} ·{' '}
                            {Number(picked.career_fp).toFixed(1)} FP
                            {injuryWeight(picked.injury_status) === 'advisory'
                              ? ` · ${picked.injury_status}`
                              : ''}
                          </ThemedText>
                        </>
                      ) : (
                        <ThemedText themeColor="textSecondary">Empty</ThemedText>
                      )}
                    </View>
                  </ThemedView>
                </Pressable>

                {isOpen && !locked ? (
                  <View style={styles.options}>
                    {pickedId ? (
                      <Pressable
                        onPress={() => {
                          setPicks((p) => {
                            const next = { ...p };
                            delete next[cfg.slot];
                            return next;
                          });
                          setOpenSlot(null);
                        }}>
                        <ThemedText type="link" style={styles.clear}>
                          Clear slot
                        </ThemedText>
                      </Pressable>
                    ) : null}
                    {eligible.length === 0 ? (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.clear}>
                        No eligible {cfg.eligible_positions.join('/')} cards
                      </ThemedText>
                    ) : (
                      eligible.map((c) => (
                        <Pressable
                          key={c.id}
                          onPress={() => {
                            setPicks((p) => ({ ...p, [cfg.slot]: c.id }));
                            setOpenSlot(null);
                          }}>
                          <ThemedView type="backgroundElement" style={styles.option}>
                            <ThemedText numberOfLines={1} style={styles.optionName}>
                              {c.player_name}
                              {injuryWeight(c.injury_status) === 'blocking' ? ` ⚠︎ ${c.injury_status}` : ''}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {c.position_abbreviation} · {Number(c.career_fp).toFixed(1)}
                              {injuryWeight(c.injury_status) === 'advisory'
                                ? ` · ${c.injury_status}`
                                : ''}
                            </ThemedText>
                          </ThemedView>
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}

          <Pressable
            onPress={() => void submit()}
            disabled={locked || saving || Object.keys(picks).length === 0}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.submit,
              (locked || saving || Object.keys(picks).length === 0) && styles.dim,
              pressed && styles.pressed,
            ]}>
            {saving ? <ActivityIndicator /> : <ThemedText>{locked ? 'Locked' : 'Save lineup'}</ThemedText>}
          </Pressable>

          {saved ? <ThemedText style={styles.centreText}>{saved}</ThemedText> : null}
          {error ? <ThemedText style={styles.centreText}>{error}</ThemedText> : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 10, maxWidth: 640, width: '100%', alignSelf: 'center' },
  lockBanner: { padding: 12, borderRadius: 12 },
  warn: { padding: 12, borderRadius: 12 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
  slotLabel: { width: 52 },
  slotBody: { flex: 1, gap: 2 },
  options: { paddingLeft: 12, paddingTop: 6, gap: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10 },
  optionName: { flex: 1 },
  clear: { paddingVertical: 6 },
  submit: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8, minHeight: 52, justifyContent: 'center' },
  dim: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  centreText: { textAlign: 'center' },
});
