/**
 * The weekly decision.
 *
 * A lineup screen that shows eight names is a form. What makes it a decision is
 * the context beside each name — who the team plays, when that game starts, what
 * the player has actually produced, and whether he is trending up — so the row
 * carries all of it and the bench is drawn in the same columns for comparison.
 *
 * The screen reads top to bottom as the week does: where you stand (the contest
 * card, which places your score inside the whole community's range rather than
 * against an opponent — there are no pairings in this game), who is starting,
 * and who is not. What is ON this week — the fixtures, the live scores — was a
 * band above all of it until the scoreboard was given its own tab; see
 * `(tabs)/scores.tsx` for why it moved and what it gained.
 * The starters and the bench used to be two tabs;
 * they are now one scroll, because choosing between them is the entire task and
 * a tab pair meant only ever seeing half of it.
 *
 * Nothing here is a projection. Every number is either a clock or something
 * that has already happened.
 *
 * THERE IS NO SAVE BUTTON. Every change writes itself.
 *
 * A save button on this screen was asking people to confirm a decision they had
 * already made — the swap sheet is where the choosing happens, and by the time
 * it closes the choice is finished. What the button actually added was a way to
 * lose work: pick a lineup, get distracted, leave the tab, and the week locks
 * on whatever was there before. Autosave removes that failure entirely, and the
 * lock is the only deadline that was ever real.
 *
 * The write is DEBOUNCED, not immediate — see the effect below. Swapping three
 * slots in a row is one decision, and it should cost one round trip.
 *
 * What replaces the button is a status line, because a silent autosave is worse
 * than no autosave: it asks you to trust that something happened. And the one
 * case a button genuinely handled — the write FAILING — gets a retry, because
 * an autosave that cannot save and cannot be told to try again is a dead end.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BenchBoard } from '@/components/lineup/BenchBoard';
import { ContestCard } from '@/components/lineup/ContestCard';
import { useFieldRecord } from '@/components/lineup/field';
import { SlotBoard } from '@/components/lineup/SlotBoard';
import { SwapSheet, type SwapRequest } from '@/components/lineup/SwapSheet';
import {
  eligibleSlotsFor,
  firstOpenSlotFor,
  isEligible,
  lockCaption,
  sortByPosition,
  sortCards,
  type LineupCard,
  type SortKey,
} from '@/components/lineup/model';
import { useLineupData } from '@/components/lineup/use-lineup-data';
import { Screen } from '@/components/shell/Screen';
import { useIsWide } from '@/components/shell/useResponsive';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlayer } from '@/context/PlayerContext';
import { supabase } from '@/lib/supabase';

/**
 * What the swap sheet is open on, held as an identity rather than as the sheet's
 * whole contents: an edit made while it is open — clearing the slot, say — must
 * change what it shows, and a snapshot taken at open time would not.
 */
type Swap = { kind: 'slot'; slot: string } | { kind: 'bench'; cardId: string };

/**
 * How long the screen waits after the last edit before writing.
 *
 * Long enough that a run of swaps is one write, short enough that it has
 * happened by the time you have finished reading the row you just changed.
 */
const DEBOUNCE_MS = 700;

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
  const [submitError, setSubmitError] = useState<string | null>(null);
  /**
   * A failed write STOPS the autosave until something changes.
   *
   * Without this the screen is a retry loop: the save fails, the edits are kept
   * (they must be — losing them is the thing autosave exists to prevent), so
   * `dirty` stays true, so the effect fires again, forever, against a server
   * that is already saying no. Cleared by any further edit, or by the retry the
   * status line offers.
   */
  const [blocked, setBlocked] = useState(false);
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

  /* Grouped by position, not sorted by the reader — see `sortByPosition`. The
     `sort` state below still drives the SWAP SHEET, where choosing an ordering
     is the whole point of the list. */
  const bench = useMemo(
    () => sortByPosition(seasonCards.filter((card) => !usedIds.has(card.id))),
    [seasonCards, usedIds],
  );

  const starters = useMemo(
    () =>
      slots
        .map((cfg) => ({ slot: cfg.slot, card: picks[cfg.slot] ? byId.get(picks[cfg.slot]) : undefined }))
        .filter((s): s is { slot: string; card: LineupCard } => Boolean(s.card)),
    [slots, picks, byId],
  );

  /**
   * Not counted, and not listed.
   *
   * There was a panel here naming every flagged starter, then a count of them
   * on the contest card. Both are gone. The panel was the same warning twice in
   * two vocabularies, twenty points from the player it was about; the count was
   * a number you could not act on, sitting on a card that is now about one
   * thing — where your score sits in the field.
   *
   * The signal survives where it belongs: each ROW carries its own designation
   * chip and says BYE in the negative colour, next to the name and the swap
   * that fixes it. A bye is the failure people actually lose weeks to and no
   * injury feed ever mentions it, which is why the row draws it at all.
   */

  const dirty = useMemo(() => {
    const a = Object.entries(picks).sort();
    const b = Object.entries(savedPicks).sort();
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [picks, savedPicks]);

  /**
   * The opponent: the whole base, reduced to its median score.
   *
   * Keyed off the slate's VALUES rather than the object — this screen rebuilds
   * `slate` on every countdown tick, and a hook that depended on the object
   * would re-read the season once a second.
   */
  const { current: field, record, reload: reloadField } = useFieldRecord(slate);

  /* Both of these clear the failure state as well as the error text: a new
     choice is a new thing to try, and it deserves an attempt of its own. */
  const setPick = useCallback((slot: string, cardId: string) => {
    setEdits((e) => ({ ...e, [slot]: cardId }));
    setSwap(null);
    setSubmitError(null);
    setBlocked(false);
  }, []);

  const clearPick = useCallback((slot: string) => {
    setEdits((e) => ({ ...e, [slot]: null }));
    setSwap(null);
    setSubmitError(null);
    setBlocked(false);
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
    // Together, not in sequence: your total and the field's median are two
    // halves of one fixture, and refreshing them a round trip apart is a
    // visible moment where the margin on the card is arithmetic between two
    // different instants.
    await Promise.all([reload(), reloadField()]);
    setRefreshing(false);
  }, [reload, reloadField]);

  const submit = useCallback(async () => {
    if (!slate) return;
    setSaving(true);
    setSubmitError(null);
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
      // Edits are deliberately NOT cleared: they are the user's work, and the
      // server refusing them is not a reason to throw them away. See `blocked`.
      setBlocked(true);
      setSaving(false);
      return;
    }
    setSaving(false);
    // Re-read rather than trusting the payload: the server is the only thing
    // that knows what actually stuck, and clearing the edit overlay against a
    // stale saved lineup would show the change as unsaved forever.
    setEdits({});
    await reload();
  }, [slate, picks, reload]);

  /**
   * The autosave.
   *
   * Debounced by DEBOUNCE_MS rather than firing on every edit: filling an empty
   * lineup is eight swaps in about as many seconds, and eight round trips to
   * say one thing is both wasteful and a race — the last response back wins,
   * and it is not guaranteed to be the last request sent.
   *
   * `submit` is in the dependency list and changes identity whenever `picks`
   * does, which is exactly right: a further edit inside the debounce window
   * tears down the pending timer and starts a fresh one carrying the newer
   * picks. That is the coalescing, and it falls out of the cleanup rather than
   * needing a ref to track.
   *
   * Guarded on `saving` so a write already in flight is never doubled up, and
   * on `blocked` so a rejected write is not retried forever. `dirty` is the
   * whole trigger — it compares picks against what the server last returned,
   * so a save that lands makes it false and the effect goes quiet on its own.
   */
  useEffect(() => {
    if (!dirty || locked || saving || blocked || !slate) return;
    const t = setTimeout(() => void submit(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [dirty, locked, saving, blocked, slate, submit]);

  /**
   * The one thing the reader can still ask for by hand, and only after a
   * failure. Clearing `blocked` is enough — the effect above picks it up.
   */
  const retry = useCallback(() => {
    setSubmitError(null);
    setBlocked(false);
  }, []);

  if (loading) {
    return (
      <Screen title="Lineup" measure="table">
        <ActivityIndicator style={styles.pad} />
      </Screen>
    );
  }

  const filled = starters.length;
  /* "About to save" — the debounce window. The status line has to cover it or
     there is a visible second where an edit has been made and the screen says
     it is saved. */
  const pending = dirty && !locked && !blocked;
  /* The week, without the lock state. The contest card carries the lock in its
     own tile and its own chip, so repeating it here put "Locked" on the card
     three times. */
  const week = slate
    ? `${slate.season_type === 1 ? 'Preseason' : 'Season'} · Week ${slate.week}`
    : 'No slate scheduled';
  const context = slate && locked ? `${week} · Locked` : week;

  return (
    <Screen
      title="Lineup"
      measure="table"
      context={context}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}>
      <ContestCard
        displayName={displayName}
        weekLabel={week}
        lockAt={lockAt}
        locked={locked}
        now={now}
        /* Passed raw. Whether a nought is a SCORE or just an unswept row is a
           question about the field, not about this lineup, so the card decides
           it from `field.high` — see the note there. */
        myPoints={totalPoints}
        field={field}
        record={record}
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
              onOpen={openBenchCard}
              onOpenProfile={openProfile}
              offSeasonCount={offSeasonCount}
            />
          </View>
        </>
      )}

      {/* Where the save button was. It says what just happened rather than
          asking for permission to do it — and it is the only place a failed
          write can be retried from. */}
      <View style={styles.status} accessibilityLiveRegion="polite">
        {blocked ? (
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="Try saving the lineup again"
            style={({ pressed }) => [
              styles.retry,
              { borderColor: c.negative },
              pressed && styles.pressed,
            ]}>
            <Text style={[Type.fine, { color: c.negative }]}>Not saved — tap to try again</Text>
          </Pressable>
        ) : saving || pending ? (
          <>
            <ActivityIndicator size="small" color={c.textTertiary} />
            <Text style={[Type.fine, { color: c.textTertiary }]}>Saving…</Text>
          </>
        ) : locked ? (
          <Text style={[Type.fine, { color: c.textTertiary }]}>
            Locked — this week&apos;s lineup is final.
          </Text>
        ) : filled > 0 ? (
          <Text style={[Type.fine, { color: c.textTertiary }]}>Saved automatically.</Text>
        ) : null}
      </View>

      {!locked && filled < slots.length ? (
        <Text style={[Type.fine, styles.centreText, { color: c.textTertiary }]}>
          {slots.length - filled} slot{slots.length - filled === 1 ? '' : 's'} still empty. A partial
          lineup is allowed — an empty slot simply scores nothing.
        </Text>
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
  /* A line, not a button: it reports, it does not ask. Fixed height so the
     page does not jump as it moves between saving, saved and locked. */
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 32,
    marginTop: Spacing.one,
  },
  /* The exception, and the only control here: a write that failed is the one
     state a reader can do something about. */
  retry: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  pressed: { opacity: 0.75 },
  centreText: { textAlign: 'center' },
});
