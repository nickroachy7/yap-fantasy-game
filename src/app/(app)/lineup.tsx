/**
 * The weekly decision.
 *
 * A lineup screen that shows eight names is a form. What makes it a decision is
 * the context beside each name — who the team plays, when that game starts, what
 * the player has actually produced, and whether he is trending up — so the row
 * carries all of it and the bench is drawn in the same columns for comparison.
 *
 * Nothing here is a projection. Every number is either a clock or something
 * that has already happened.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BenchBoard } from '@/components/lineup/BenchBoard';
import { LineupSummary } from '@/components/lineup/LineupSummary';
import { SlotBoard } from '@/components/lineup/SlotBoard';
import {
  firstOpenSlotFor,
  isEligible,
  lockCaption,
  sortCards,
  type Alert,
  type LineupCard,
  type SortKey,
} from '@/components/lineup/model';
import { useLineupData } from '@/components/lineup/use-lineup-data';
import { Screen } from '@/components/shell/Screen';
import { useIsWide } from '@/components/shell/useResponsive';
import { Tabs } from '@/components/ui/Tabs';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryWeight } from '@/lib/injury';
import { supabase } from '@/lib/supabase';

type Pane = 'lineup' | 'bench';

export default function LineupScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const wide = useIsWide();

  const { slate, lockAt, slots, cards, savedPicks, loading, error: loadError, reload } = useLineupData();

  /**
   * Edits are an overlay on the saved lineup rather than a copy of it. Copying
   * would need an effect to re-seed local state whenever the fetch lands, which
   * is both a render loop waiting to happen and the reason a slow network used
   * to blank out changes you had already made. `null` means "cleared".
   */
  const [edits, setEdits] = useState<Record<string, string | null>>({});
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [view, setView] = useState<Pane>('lineup');
  const [sort, setSort] = useState<SortKey>('fp');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick so the lock state flips on its own rather than on a re-render by luck.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const picks = useMemo(() => {
    const out: Record<string, string> = { ...savedPicks };
    for (const [slot, id] of Object.entries(edits)) {
      if (id === null) delete out[slot];
      else out[slot] = id;
    }
    return out;
  }, [savedPicks, edits]);

  const locked = lockAt ? now >= new Date(lockAt).getTime() : false;
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const usedIds = useMemo(() => new Set(Object.values(picks)), [picks]);

  /**
   * `set_lineup` rejects any card whose season differs from the slate's, so
   * offering one is offering a guaranteed server error. Filtering here is a
   * convenience — the check that matters is still the one in the database.
   */
  const seasonCards = useMemo(
    () => (slate ? cards.filter((card) => card.season === slate.season) : cards),
    [cards, slate],
  );
  const offSeasonCount = cards.length - seasonCards.length;

  const eligibleBySlot = useMemo(() => {
    const map = new Map<string, LineupCard[]>();
    for (const cfg of slots) {
      const list = seasonCards.filter(
        (card) => isEligible(card, cfg) && (!usedIds.has(card.id) || picks[cfg.slot] === card.id),
      );
      map.set(cfg.slot, sortCards(list, sort));
    }
    return map;
  }, [slots, seasonCards, usedIds, picks, sort]);

  const bench = useMemo(
    () => sortCards(seasonCards.filter((card) => !usedIds.has(card.id)), sort),
    [seasonCards, usedIds, sort],
  );

  const starters = useMemo(
    () =>
      slots
        .map((cfg) => ({ slot: cfg.slot, card: picks[cfg.slot] ? byId.get(picks[cfg.slot]) : undefined }))
        .filter((s): s is { slot: string; card: LineupCard } => Boolean(s.card)),
    [slots, picks, byId],
  );

  /**
   * The lineup's weekly worth: the starters' FP per game added up. Not a
   * forecast — it is what these eight have averaged, which is the only honest
   * single number this screen can put next to the clock.
   */
  const lineupFpPerGame = useMemo(() => {
    const scored = starters.filter((s) => s.card.form !== null);
    if (scored.length === 0) return null;
    return scored.reduce((sum, s) => sum + (s.card.form?.fpPerGame ?? 0), 0);
  }, [starters]);

  const alerts = useMemo<Alert[]>(
    () =>
      starters.flatMap<Alert>(({ slot, card }) => {
        // A team with no game this week is the failure people actually lose
        // weeks to, and no injury feed ever mentions it.
        if (!card.game?.opponent) return [{ slot, card, kind: 'no-game' as const }];
        const weight = injuryWeight(card.injuryStatus);
        return weight ? [{ slot, card, kind: weight }] : [];
      }),
    [starters],
  );

  const dirty = useMemo(() => {
    const a = Object.entries(picks).sort();
    const b = Object.entries(savedPicks).sort();
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [picks, savedPicks]);

  const setPick = useCallback((slot: string, cardId: string) => {
    setEdits((e) => ({ ...e, [slot]: cardId }));
    setOpenSlot(null);
    setSaved(null);
  }, []);

  const clearPick = useCallback((slot: string) => {
    setEdits((e) => ({ ...e, [slot]: null }));
    setOpenSlot(null);
    setSaved(null);
  }, []);

  // Stable identities so the memoised boards below are not defeated by a new
  // arrow function on every countdown tick.
  const toggleSlot = useCallback(
    (slot: string) => setOpenSlot((cur) => (cur === slot ? null : slot)),
    [],
  );

  const placeFromBench = useCallback(
    (slot: string, cardId: string) => {
      setPick(slot, cardId);
      // Jump back so the change is visible where it happened; leaving the user
      // on the bench makes a successful tap look like a no-op.
      setView('lineup');
    },
    [setPick],
  );

  const targetSlotFor = useCallback(
    (card: LineupCard) => firstOpenSlotFor(card, slots, picks),
    [slots, picks],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const submit = useCallback(async () => {
    if (!slate) return;
    setSaving(true);
    setSubmitError(null);
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
    if (err) {
      setSubmitError(err.message);
      setSaving(false);
      return;
    }
    setSaved(`Lineup saved for week ${slate.week}.`);
    setSaving(false);
    // Re-read rather than trusting the payload: the server is the only thing
    // that knows what actually stuck, and clearing the edit overlay against a
    // stale saved lineup would show the change as unsaved forever.
    setEdits({});
    await reload();
  }, [slate, picks, reload]);

  if (loading) {
    return (
      <Screen title="Lineup" measure="table">
        <ActivityIndicator style={styles.pad} />
      </Screen>
    );
  }

  const filled = starters.length;
  const canSubmit = !locked && !saving && filled > 0 && dirty;
  const context = slate
    ? `${slate.season_type === 1 ? 'Preseason' : 'Season'} · Week ${slate.week}${locked ? ' · Locked' : ''}`
    : 'No slate scheduled';

  return (
    <Screen
      title="Lineup"
      measure="table"
      context={context}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}>
      <LineupSummary
        lockAt={lockAt}
        locked={locked}
        now={now}
        filled={filled}
        slotCount={slots.length}
        fpPerGame={lineupFpPerGame}
        alerts={alerts.length}
      />

      {lockCaption(lockAt, locked) ? (
        <Text style={[Type.fine, { color: c.textTertiary }]}>{lockCaption(lockAt, locked)}</Text>
      ) : null}

      {alerts.length > 0 && !locked ? (
        <View style={[styles.alerts, { backgroundColor: c.surface, borderColor: c.border }]}>
          {alerts.map(({ slot, card, kind }) => (
            <View key={slot} style={styles.alertRow}>
              <Text style={[Type.micro, styles.alertSlot, { color: c.textTertiary }]}>{slot}</Text>
              <Text numberOfLines={1} style={[Type.fine, styles.alertText, { color: c.text }]}>
                {card.name}
              </Text>
              {/* Blocking and "no game" are the same practical outcome — no
                  points — so they get the same weight. Questionable does not:
                  it is the most common designation in the feed, and shouting
                  about it teaches people to ignore the shouting. */}
              <Text
                numberOfLines={1}
                style={[
                  Type.fine,
                  { color: kind === 'advisory' ? c.textSecondary : c.negative },
                ]}>
                {kind === 'no-game'
                  ? 'no game this week'
                  : (card.injuryStatus ?? 'unavailable').toLowerCase()}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {cards.length === 0 ? (
        <Text style={[Type.body, { color: c.textSecondary }]}>
          You have no cards yet — open a pack first.
        </Text>
      ) : (
        <>
          <Tabs<Pane>
            value={view}
            onChange={setView}
            tabs={[
              { value: 'lineup', label: 'Lineup', hint: `${filled}/${slots.length}` },
              { value: 'bench', label: 'Bench', hint: String(bench.length) },
            ]}
          />

          {view === 'lineup' ? (
            <SlotBoard
              slots={slots}
              byId={byId}
              picks={picks}
              eligibleBySlot={eligibleBySlot}
              openSlot={openSlot}
              locked={locked}
              wide={wide}
              sort={sort}
              onSort={setSort}
              onToggleSlot={toggleSlot}
              onPick={setPick}
              onClear={clearPick}
            />
          ) : (
            <BenchBoard
              cards={bench}
              targetSlotFor={targetSlotFor}
              locked={locked}
              wide={wide}
              sort={sort}
              onSort={setSort}
              onPlace={placeFromBench}
              offSeasonCount={offSeasonCount}
            />
          )}
        </>
      )}

      <Pressable
        onPress={() => void submit()}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel={locked ? 'Lineup locked' : 'Save lineup'}
        accessibilityState={{ disabled: !canSubmit, busy: saving }}
        style={({ pressed }) => [
          styles.submit,
          { backgroundColor: canSubmit ? c.text : c.backgroundElement },
          pressed && styles.pressed,
        ]}>
        {saving ? (
          <ActivityIndicator color={c.background} />
        ) : (
          <Text style={[Type.strong, { color: canSubmit ? c.background : c.textTertiary }]}>
            {locked ? 'Locked' : dirty ? 'Save lineup' : 'Lineup saved'}
          </Text>
        )}
      </Pressable>

      {!locked && filled < slots.length ? (
        <Text style={[Type.fine, styles.centreText, { color: c.textTertiary }]}>
          {slots.length - filled} slot{slots.length - filled === 1 ? '' : 's'} still empty. A partial
          lineup is allowed — an empty slot simply scores nothing.
        </Text>
      ) : null}

      {saved ? (
        <Text style={[Type.fine, styles.centreText, { color: c.positive }]}>{saved}</Text>
      ) : null}
      {submitError ?? loadError ? (
        <Text style={[Type.fine, styles.centreText, { color: c.negative }]}>
          {submitError ?? loadError}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingVertical: Spacing.four },
  alerts: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.one,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  alertSlot: { width: 30 },
  alertText: { flex: 1 },
  submit: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    marginTop: Spacing.one,
  },
  pressed: { opacity: 0.75 },
  centreText: { textAlign: 'center' },
});
