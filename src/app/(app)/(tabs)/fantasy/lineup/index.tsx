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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { BenchBoard } from '@/components/lineup/BenchBoard';
import { ContestCard } from '@/components/lineup/ContestCard';
import { useFieldRecord } from '@/components/lineup/field';
import { SlotBoard } from '@/components/lineup/SlotBoard';
import { SwapSheet, type SwapRequest } from '@/components/lineup/SwapSheet';
import {
  eligibleSlotsFor,
  firstOpenSlotFor,
  isEligible,
  isLocked,
  lockCaption,
  nextLockAtMs,
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

/**
 * How often the screen re-reads while a game is being played.
 *
 * Matched to the server's sweep, which moved to once a minute for this
 * (20260821150000). Polling faster would only re-read numbers that cannot have
 * changed; polling slower would add the client's own lag on top of the sweep's,
 * and the two delays compound into the gap between a touchdown and the row
 * moving — which is the entire thing being built here.
 *
 * It runs ONLY while a game in the shown week is actually live. A week in play
 * on a Friday afternoon has nothing happening in it, and a screen that polled
 * on that basis would re-read a static answer 1,440 times before Sunday.
 */
const LIVE_POLL_MS = 60_000;

export default function LineupScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const router = useRouter();
  const wide = useIsWide();

  const {
    slate,
    inPlay,
    hasLiveGame,
    lockAt,
    slots,
    cards,
    savedPicks,
    savedPoints,
    totalPoints,
    scoredAt,
    finalizedAt,
    loading,
    error: loadError,
    reload,
    reloadLineup,
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

  /**
   * THE LOCK IS NO LONGER ONE MOMENT, so this is no longer one boolean.
   *
   * `week_lock_time` is the week's FIRST kickoff, and treating it as the
   * lineup's deadline froze eleven players on account of the one who was
   * playing — for the four days an NFL week runs. A player now locks at his own
   * kickoff (20260821210000), so what the screen needs is not "are we past the
   * lock" but two derived facts: when the next player locks, and whether
   * anything at all is still movable.
   *
   * `lockAt` from the server is kept only as the pre-kickoff fallback: before
   * ANY of the week's games have started it and the earliest card kickoff are
   * the same instant, and it is the one the caption's absolute time is written
   * from.
   */
  /**
   * LOCKS TICK ON THEIR OWN BOUNDARY, not on the countdown's second.
   *
   * Whether a player is locked is a function of the clock, so something has to
   * re-evaluate it as time passes. Doing that on the one-second countdown tick
   * would work and would also rebuild every bench row once a second — which on
   * a three-hundred-card collection is three hundred rows a second to discover
   * that nothing changed. Both boards are memoised precisely to stop that.
   *
   * So instead: one timer, set for the exact instant the next player locks.
   * Nothing between now and then can change any lock, because a lock only ever
   * arrives — it never lifts — and the earliest unlocked kickoff is by
   * definition the first one that can. When it fires, `lockTick` advances,
   * `lockedIds` is rebuilt once, and the effect re-arms for the boundary after.
   */
  /**
   * The instant the locks were last evaluated at. NOT `now`.
   *
   * It carries the timestamp rather than a counter so the derivations below can
   * stay pure — reading `Date.now()` inside a `useMemo` is exactly what
   * `react-hooks/purity` is for, and it would also make them silently
   * un-memoisable.
   */
  const [lockNow, setLockNow] = useState(() => Date.now());

  const lockedIds = useMemo(() => {
    const out = new Set<string>();
    for (const card of cards) if (isLocked(card.game, lockNow)) out.add(card.id);
    return out;
  }, [cards, lockNow]);

  const nextLockMs = useMemo(() => nextLockAtMs(cards, lockNow), [cards, lockNow]);

  useEffect(() => {
    if (nextLockMs === null) return;
    // A quarter-second past the whistle, so a clock that is fractionally behind
    // the server's cannot fire this before the kickoff it is waiting for.
    const delay = Math.max(0, nextLockMs - Date.now()) + 250;
    const t = setTimeout(() => setLockNow(Date.now()), delay);
    return () => clearTimeout(t);
  }, [nextLockMs]);

  const nextLockAt = nextLockMs === null ? null : new Date(nextLockMs).toISOString();

  /** Locked by id, so the boards never have to re-derive it per row per second. */
  const isCardLocked = useCallback(
    (card: LineupCard | null | undefined) => (card ? lockedIds.has(card.id) : false),
    [lockedIds],
  );

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
  /**
   * Nothing left to move: every card you hold is either playing or played.
   *
   * Deliberately about the CARDS and not about the slots. A board with eight
   * locked starters still has a live decision in it if the bench has somebody
   * whose game is at eight o'clock, and calling that "locked" would hide the
   * only move left.
   */
  const allLocked = seasonCards.length > 0 && seasonCards.every((card) => lockedIds.has(card.id));

  const eligibleBySlot = useMemo(() => {
    const map = new Map<string, LineupCard[]>();
    for (const cfg of slots) {
      /* LOCKED CARDS STAY IN THIS LIST. They cannot be picked, and the sheet
         draws them dimmed and unpressable — but withholding them made the sheet
         announce "0 eligible RB" to somebody holding four, with no way to tell
         a rule from a fault. The sheet gets `lockedIds` and says which is
         which. */
      const list = seasonCards.filter(
        (card) => isEligible(card, cfg) && (!usedIds.has(card.id) || picks[cfg.slot] === card.id),
      );
      map.set(cfg.slot, sortCards(list, sort));
    }
    return map;
  }, [slots, seasonCards, usedIds, picks, sort]);

  /**
   * What the empty rows advertise. The lists themselves live in the sheet.
   *
   * Counts only what can actually be STARTED. The list behind it keeps its
   * locked cards so the sheet can show them, but a row promising "4 eligible"
   * that opens onto four players you cannot pick is worse than one that says 0.
   */
  const eligibleCounts = useMemo(
    () =>
      new Map(
        [...eligibleBySlot].map(([slot, list]) => [
          slot,
          list.filter((card) => !lockedIds.has(card.id)).length,
        ]),
      ),
    [eligibleBySlot, lockedIds],
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
    /* Gated on THIS slot or THIS card, not on the board. The old check refused
       to open the sheet at all once the week's first game had started, which is
       why the swap modal stopped opening on a Friday: week 3 kicked off on the
       Thursday and every remaining fixture was still days away.

       Done here rather than in an effect: the countdown re-renders this screen
       every second, so the lock is already reflected in the derivation, and an
       effect would be a second source of truth for the same instant. */
    if (!swap) return null;
    if (swap.kind === 'slot') {
      const cfg = slots.find((s) => s.slot === swap.slot);
      if (!cfg) return null;
      const pickedId = picks[cfg.slot];
      const occupant = pickedId ? (byId.get(pickedId) ?? null) : null;
      // An empty slot is always openable; a filled one only while its occupant
      // can still be taken out.
      if (isCardLocked(occupant)) return null;
      return {
        kind: 'slot',
        slot: cfg.slot,
        eligiblePositions: cfg.eligible_positions.join('/'),
        current: occupant,
        options: eligibleBySlot.get(cfg.slot) ?? [],
        lockedIds,
      };
    }
    const card = byId.get(swap.cardId);
    if (!card || isCardLocked(card)) return null;
    return {
      kind: 'bench',
      card,
      /* A destination whose occupant is already playing is not a destination:
         taking him out is exactly what the server refuses, so offering the slot
         would be offering an error. */
      destinations: eligibleSlotsFor(card, slots)
        .map((cfg) => ({
          slot: cfg.slot,
          occupant: picks[cfg.slot] ? (byId.get(picks[cfg.slot]) ?? null) : null,
        }))
        .filter((d) => !isCardLocked(d.occupant)),
    };
  }, [swap, slots, picks, byId, eligibleBySlot, isCardLocked, lockedIds]);

  /**
   * Re-read both halves of the fixture, without the pull-to-refresh spinner.
   *
   * Together, not in sequence: your total and the field's median are two halves
   * of one fixture, and refreshing them a round trip apart is a visible moment
   * where the margin on the card is arithmetic between two different instants.
   *
   * Separated from `onRefresh` because the SPINNER is the difference between a
   * refresh you asked for and one that happens on its own. A poll that flashed
   * the pull-to-refresh indicator once a minute would turn a screen you are
   * watching a game on into a screen that appears to be struggling.
   */
  const reread = useCallback(async () => {
    await Promise.all([reload(), reloadField()]);
  }, [reload, reloadField]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reread();
    setRefreshing(false);
  }, [reread]);

  /**
   * Keep it moving while a game is on.
   *
   * Nothing on this screen used to re-read after the first mount. The server
   * has been recomputing every lineup on a schedule since the sweep was built,
   * and the client simply never asked again — so the only way to see a point
   * land was to force-quit the app. That is the second half of why last week's
   * live scoring was invisible; the first half was reading the wrong week
   * entirely.
   */
  useEffect(() => {
    if (!hasLiveGame) return;
    const t = setInterval(() => void reread(), LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [hasLiveGame, reread]);

  /**
   * And on the way back in.
   *
   * A phone put down at kickoff and picked up at half time has missed thirty
   * polls, and the interval above cannot fire while the app is backgrounded.
   * Without this the first thing a returning reader sees is a stale board that
   * corrects itself a minute later, which is a worse first impression than a
   * slow load.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void reread();
    });
    return () => sub.remove();
  }, [reread]);

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
    /**
     * ORDER IS THE WHOLE FIX HERE.
     *
     * This used to clear the overlay and then re-read, which meant `picks` fell
     * back to `savedPicks` — the state from BEFORE the swap — for the entire
     * duration of the re-read. The board visibly reverted to the old lineup and
     * then jumped forward again when the answer landed. That flash is what read
     * as glitchiness, and it got worse the more cards you owned, because the
     * re-read was fetching all of them.
     *
     * Re-reading first and clearing after leaves the two states overlapping for
     * one render, and an overlap is invisible: `savedPicks` now says what
     * `edits` said, so `picks` is unchanged through the handover and the row
     * never moves.
     *
     * Still a re-read rather than trusting the payload — the server is the only
     * thing that knows what actually stuck — but only of the row that changed.
     */
    await reloadLineup();
    setEdits({});
    setSaving(false);
  }, [slate, picks, reloadLineup]);

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
    if (!dirty || saving || blocked || !slate) return;
    const t = setTimeout(() => void submit(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [dirty, saving, blocked, slate, submit]);

  /**
   * AND THE FLUSH, WHICH IS WHAT MAKES THE DEBOUNCE SAFE.
   *
   * The effect above cancels its timer on cleanup, and unmounting is a cleanup.
   * So a swap followed inside 700ms by a tap on any other tab threw the edit
   * away — no request sent, no error, and a board that showed the change right
   * up until the moment you left it. The faster you moved the more you lost,
   * which is the worst possible shape for a bug like this: it punished exactly
   * the people who knew what they wanted.
   *
   * The ref carries the newest unsaved payload; the second effect has an empty
   * dependency list so its cleanup runs on unmount and nowhere else.
   *
   * IT DELIBERATELY DOES NOT TOUCH STATE. There is no component left to render
   * a spinner or an error by the time this fires, so it sends the write and
   * lets the server be the record. Anything it cannot report is recoverable:
   * the next mount re-reads the lineup, and whatever did not stick is simply
   * not there.
   *
   * `saving` is not a guard here. If a write is already in flight then this
   * payload is the newer one — the whole reason it is still dirty — and the
   * server applies whichever lands last against the same slots.
   */
  const pendingRef = useRef<{ season: number; season_type: number; week: number; slots: { slot: string; card_instance_id: string }[] } | null>(null);

  useEffect(() => {
    pendingRef.current =
      dirty && !blocked && slate
        ? {
            season: slate.season,
            season_type: slate.season_type,
            week: slate.week,
            slots: Object.entries(picks).map(([slot, card_instance_id]) => ({
              slot,
              card_instance_id,
            })),
          }
        : null;
  }, [dirty, blocked, slate, picks]);

  useEffect(
    () => () => {
      const p = pendingRef.current;
      if (!p) return;
      void supabase.rpc('set_lineup', {
        p_season: p.season,
        p_season_type: p.season_type,
        p_week: p.week,
        p_slots: p.slots,
      });
    },
    [],
  );

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
  const pending = dirty && !blocked;
  /* The week, without the lock state. The contest card carries the lock in its
     own tile and its own chip, so repeating it here put "Locked" on the card
     three times. */
  const week = slate
    ? `${slate.season_type === 1 ? 'Preseason' : 'Season'} · Week ${slate.week}`
    : 'No slate scheduled';

  /**
   * What state the week is in, in one word, or nothing when there is nothing to
   * add. Four cases and they are strictly ordered — a week can be live AND
   * locked, and "Live" is the one worth the space.
   *
   * `finalizedAt` and not `scoredAt`: the sweep stamps scored_at on every pass,
   * so it is non-null from the first snap of the week and reading it as "done"
   * is how a lineup came to describe itself as final in the opening quarter.
   */
  const phase = hasLiveGame
    ? 'Live'
    : finalizedAt
      ? 'Final'
      : allLocked
        ? 'Locked'
        : null;
  const context = slate && phase ? `${week} · ${phase}` : week;


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
        lockAt={nextLockAt ?? lockAt}
        locked={allLocked}
        now={now}
        /* Passed raw. Whether a nought is a SCORE or just an unswept row is a
           question about the field, not about this lineup, so the card decides
           it from `field.high` — see the note there. */
        myPoints={totalPoints}
        field={field}
        record={record}
      />

      {/* ONE CAPTION, AND WHICH ONE DEPENDS ON WHETHER THE WEEK HAS STARTED.
 
          Before kickoff the useful fact is the deadline. Once the week is in
          play that deadline is in the past and unactionable, and the useful
          fact becomes how old the numbers are — because every figure on the
          board below is now a moving one, and a reader watching a game needs to
          know whether a total that has not changed is a total that has not
          changed or a screen that has stopped asking.
 
          The staleness is stated rather than implied. `scoredAt` is when the
          sweep last recomputed this lineup, not when this screen last read it,
          so it is the honest number: it accounts for the minute the server may
          be behind as well as the minute the client may be. */}
      {inPlay && scoredAt ? (
        <Text style={[Type.fine, { color: c.textTertiary }]}>
          {`Points as of ${new Date(scoredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
          {hasLiveGame ? ' · updating every minute' : ''}
        </Text>
      ) : lockCaption(nextLockAt ?? lockAt, allLocked) ? (
        <Text style={[Type.fine, { color: c.textTertiary }]}>
          {lockCaption(nextLockAt ?? lockAt, allLocked)}
        </Text>
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
              lockedIds={lockedIds}
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
              lockedIds={lockedIds}
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
        ) : allLocked ? (
          <Text style={[Type.fine, { color: c.textTertiary }]}>
            Locked — this week&apos;s lineup is final.
          </Text>
        ) : filled > 0 ? (
          <Text style={[Type.fine, { color: c.textTertiary }]}>Saved automatically.</Text>
        ) : null}
      </View>

      {!allLocked && filled < slots.length ? (
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
