/**
 * The weekly decision.
 *
 * A lineup screen that shows eight names is a form. What makes it a decision is
 * the context beside each name — who the team plays, when that game starts, what
 * the player has actually produced, and whether he is trending up — so the row
 * carries all of it and the bench is drawn in the same columns for comparison.
 *
 * The screen reads top to bottom as the week does: what is on (the scoreboard
 * strip), where you stand (the contest card, which COUNTS who needs a look
 * rather than listing them — the rows say which), who is
 * starting, and who is not. The starters and the bench used to be two tabs;
 * they are now one scroll, because choosing between them is the entire task and
 * a tab pair meant only ever seeing half of it.
 *
 * Nothing here is a projection. Every number is either a clock or something
 * that has already happened.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BenchBoard } from '@/components/lineup/BenchBoard';
import { ContestCard } from '@/components/lineup/ContestCard';
import { SlotBoard } from '@/components/lineup/SlotBoard';
import { SwapSheet, type SwapRequest } from '@/components/lineup/SwapSheet';
import {
  eligibleSlotsFor,
  firstOpenSlotFor,
  isEligible,
  lockCaption,
  sortCards,
  type Alert,
  type LineupCard,
  type SortKey,
} from '@/components/lineup/model';
import { useLineupData } from '@/components/lineup/use-lineup-data';
import { ScoreStrip } from '@/components/scores/ScoreStrip';
import { shortWeekLabel } from '@/components/scores/scoreboard';
import { useSlateGames } from '@/components/scores/use-scores';
import { Screen } from '@/components/shell/Screen';
import { useIsWide } from '@/components/shell/useResponsive';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryWeight } from '@/lib/injury';
import { usePlayer } from '@/context/PlayerContext';
import { supabase } from '@/lib/supabase';

/**
 * What the swap sheet is open on, held as an identity rather than as the sheet's
 * whole contents: an edit made while it is open — clearing the slot, say — must
 * change what it shows, and a snapshot taken at open time would not.
 */
type Swap = { kind: 'slot'; slot: string } | { kind: 'bench'; cardId: string };

export default function LineupScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const router = useRouter();
  const wide = useIsWide();

  const {
    slate,
    lockAt,
    slots,
    cards,
    savedPicks,
    savedPoints,
    totalPoints,
    scoredAt,
    loading,
    error: loadError,
    reload,
  } = useLineupData();
  const { displayName } = usePlayer();

  /**
   * Edits are an overlay on the saved lineup rather than a copy of it. Copying
   * would need an effect to re-seed local state whenever the fetch lands, which
   * is both a render loop waiting to happen and the reason a slow network used
   * to blank out changes you had already made. `null` means "cleared".
   */
  const [edits, setEdits] = useState<Record<string, string | null>>({});
  const [swap, setSwap] = useState<Swap | null>(null);
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

  /** What the empty rows advertise. The lists themselves live in the sheet. */
  const eligibleCounts = useMemo(
    () => new Map([...eligibleBySlot].map(([slot, list]) => [slot, list.length])),
    [eligibleBySlot],
  );

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

  /**
   * Counted, not listed.
   *
   * There was a panel here that named every flagged starter above the boards.
   * It is gone: the rows themselves carry the designation chip and say BYE in
   * the negative colour, so the panel was the same warning a second time, in a
   * different vocabulary, twenty points further from the player it was about.
   * What survives is the NUMBER on the contest card — "two of your eight want
   * looking at" — which sends you to the rows rather than trying to replace
   * them.
   */
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

  /* The scoreboard reads its own week, in the scores module's vocabulary. Built
     from the slate's VALUES rather than passing the slate object through, so the
     once-a-second tick above cannot make it look like a new week. */
  const scoreSlate = useMemo(
    () =>
      slate
        ? { season: slate.season, seasonType: slate.season_type, week: slate.week }
        : null,
    [slate],
  );
  const { games: weekGames, loading: gamesLoading } = useSlateGames(scoreSlate);

  /** Your starters per club, so the strip can mark the games you are in. */
  const startersByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const { card } of starters) {
      if (!card.team) continue;
      map.set(card.team, (map.get(card.team) ?? 0) + 1);
    }
    return map;
  }, [starters]);

  const setPick = useCallback((slot: string, cardId: string) => {
    setEdits((e) => ({ ...e, [slot]: cardId }));
    setSwap(null);
    setSaved(null);
  }, []);

  const clearPick = useCallback((slot: string) => {
    setEdits((e) => ({ ...e, [slot]: null }));
    setSwap(null);
    setSaved(null);
  }, []);

  // Stable identities so the memoised boards below are not defeated by a new
  // arrow function on every countdown tick.
  const openSlot = useCallback((slot: string) => setSwap({ kind: 'slot', slot }), []);
  const openBenchCard = useCallback(
    (card: LineupCard) => setSwap({ kind: 'bench', cardId: card.id }),
    [],
  );
  const closeSwap = useCallback(() => setSwap(null), []);

  /**
   * Open the card, not the slot.
   *
   * The badge on the left of a row changes the lineup; the rest of the row
   * opens what the row IS — one copy you own — which is the same object the
   * collection grid opens, so both reach the same screen. A lineup row and a
   * grid cell are two doors into the same card, and sending them to different
   * profiles made the app feel like it had two ideas about what you tapped.
   *
   * This wants the CARD INSTANCE id, never the player id — the opposite of the
   * directory's links, and the same distinction `set_lineup` cares about in the
   * other direction. `LineupCard.id` is the instance; `playerId` is the man.
   *
   * Nothing is lost for start/sit: the card profile carries the same Overview
   * and Game log as the player profile, and links across to it.
   */
  const openProfile = useCallback(
    (card: LineupCard) => {
      router.push({ pathname: '/card/[id]', params: { id: card.id } });
    },
    [router],
  );

  const targetSlotFor = useCallback(
    (card: LineupCard) => firstOpenSlotFor(card, slots, picks),
    [slots, picks],
  );

  const startableFor = useCallback(
    (card: LineupCard) => eligibleSlotsFor(card, slots).length > 0,
    [slots],
  );

  /**
   * The sheet's contents, rebuilt from current state on every render rather
   * than captured when it opened — so clearing a slot from inside the sheet
   * redraws it as an empty slot instead of leaving a stale incumbent pinned to
   * the top of it.
   */
  const swapRequest = useMemo<SwapRequest | null>(() => {
    /* Locked closes it, and does so here rather than in an effect: the
       countdown re-renders this screen every second, so the lock is already
       reflected in the derivation. An effect would have been a second source of
       truth for the same instant. */
    if (!swap || locked) return null;
    if (swap.kind === 'slot') {
      const cfg = slots.find((s) => s.slot === swap.slot);
      if (!cfg) return null;
      const pickedId = picks[cfg.slot];
      return {
        kind: 'slot',
        slot: cfg.slot,
        eligiblePositions: cfg.eligible_positions.join('/'),
        current: pickedId ? (byId.get(pickedId) ?? null) : null,
        options: eligibleBySlot.get(cfg.slot) ?? [],
      };
    }
    const card = byId.get(swap.cardId);
    if (!card) return null;
    return {
      kind: 'bench',
      card,
      destinations: eligibleSlotsFor(card, slots).map((cfg) => ({
        slot: cfg.slot,
        occupant: picks[cfg.slot] ? (byId.get(picks[cfg.slot]) ?? null) : null,
      })),
    };
  }, [swap, locked, slots, picks, byId, eligibleBySlot]);

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
      {slate ? (
        <View style={styles.bleed}>
          <ScoreStrip
            games={weekGames}
            week={shortWeekLabel(slate.season_type, slate.week)}
            startersByTeam={startersByTeam}
            loading={gamesLoading}
          />
        </View>
      ) : null}

      <ContestCard
        displayName={displayName}
        weekLabel={context}
        lockAt={lockAt}
        locked={locked}
        now={now}
        filled={filled}
        slotCount={slots.length}
        fpPerGame={lineupFpPerGame}
        totalPoints={totalPoints}
        scored={scoredAt !== null}
        alerts={alerts.length}
      />

      {lockCaption(lockAt, locked) ? (
        <Text style={[Type.fine, { color: c.textTertiary }]}>{lockCaption(lockAt, locked)}</Text>
      ) : null}

      {cards.length === 0 ? (
        <Text style={[Type.body, { color: c.textSecondary }]}>
          You have no cards yet — open a pack first.
        </Text>
      ) : (
        <>
          {/* Headings rather than tabs. Both boards are always on the page, so
              what these have to do is name them and say how full each is. */}
          <SectionHead
            label="Starting lineup"
            hint={`${filled}/${slots.length} filled`}
            tone={filled < slots.length ? c.warning : c.textTertiary}
          />
          <View style={styles.bleed}>
            <SlotBoard
              slots={slots}
              byId={byId}
              picks={picks}
              eligibleCounts={eligibleCounts}
              openSlot={swap?.kind === 'slot' ? swap.slot : null}
              locked={locked}
              savedPoints={savedPoints}
              scored={scoredAt !== null}
              onOpenSlot={openSlot}
              onOpenProfile={openProfile}
            />
          </View>

          <SectionHead
            label="Bench"
            hint={`${bench.length} card${bench.length === 1 ? '' : 's'}`}
            tone={c.textTertiary}
          />
          <View style={styles.bleed}>
            <BenchBoard
              cards={bench}
              targetSlotFor={targetSlotFor}
              startableFor={startableFor}
              locked={locked}
              sort={sort}
              onSort={setSort}
              onOpen={openBenchCard}
              onOpenProfile={openProfile}
              offSeasonCount={offSeasonCount}
            />
          </View>
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

      <SwapSheet
        request={swapRequest}
        wide={wide}
        sort={sort}
        onSort={setSort}
        onPick={setPick}
        onClear={clearPick}
        onClose={closeSwap}
      />
    </Screen>
  );
}

/** A board's name and its count, on one baseline. */
function SectionHead({ label, hint, tone }: { label: string; hint: string; tone: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.sectionHead}>
      <Text style={[Type.section, { color: c.text }]}>{label}</Text>
      <Text style={[Type.micro, { color: tone }]}>{hint.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingVertical: Spacing.four },
  /* The boards run to the page edges, like the directory and the collection
     do, rather than sitting in a 16pt trough inside it. `Screen` pads its
     content; this gives that padding back, and the rows supply their own
     gutter — which is why LineupRow's is 16 and not the directory's 14. */
  bleed: { marginHorizontal: -Spacing.three },
  /* Negative top margin against `Screen`'s 14pt content gap: a heading belongs
     to the board under it, and an even 14 above and below made it float
     between the two. */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginBottom: -Spacing.one - 2,
  },
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
