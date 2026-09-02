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
 * and who is not. THE CARD IS PINNED and the two boards scroll under it: it is
 * what every swap is measured against, and a reason for a choice that leaves
 * the screen on the first flick is a reason nobody has while choosing. See the
 * page's return. What is ON this week — the fixtures, the live scores — was a
 * band above all of it until the scoreboard was given its own tab; see
 * `(tabs)/scores.tsx` for why it moved and what it gained.
 * The starters and the bench used to be two tabs;
 * they are now one scroll, because choosing between them is the entire task and
 * a tab pair meant only ever seeing half of it. That is still true of the two
 * boards, which share a scroll — it is only the card above them that stays.
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
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { RosterAlert } from '@/components/collection/RosterAlert';
import { BenchBoard } from '@/components/lineup/BenchBoard';
import { RowSkeleton } from '@/components/lineup/LineupRow';
import { ContestCarousel } from '@/components/lineup/ContestCarousel';
import { WelcomeBackBanner } from '@/components/contests/WelcomeBackBanner';
import { useAuth } from '@/context/AuthContext';
import { useContestHistory } from '@/components/contests/use-contest-history';
import {
  seedFor,
  unseenResults,
  useResultsSeen,
} from '@/components/contests/use-results-seen';
import { useMyContests } from '@/components/contests/use-my-contests';
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
import { useLineupData, type LineupContest } from '@/components/lineup/use-lineup-data';
import { Screen } from '@/components/shell/Screen';
import { useIsWide } from '@/components/shell/useResponsive';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlayer } from '@/context/PlayerContext';
import { supabase } from '@/lib/supabase';

export type LineupEditorProps = {
  /**
   * Edit THIS contest and draw no carousel — the contest sheet's mode, where
   * the surface is already about one contest and a row of cards for the others
   * would be offering to leave it.
   *
   * Absent on the Lineup board, where the carousel owns the selection.
   */
  pinnedContest?: string;
  /**
   * `screen` draws the page chrome (`Screen`, its title, pull-to-refresh);
   * `plain` returns the content bare for a host that has its own frame.
   *
   * THE FRAME IS A PROP RATHER THAN THE CALLER'S JOB because everything it
   * needs — the refresh handler, the week in the context line, the loading
   * state — is derived inside this component. Hoisting those to two callers
   * would put the derivation in two places, which is the whole thing this
   * extraction exists to stop.
   */
  frame?: 'screen' | 'plain';
  /**
   * Whether the bench is drawn under the slots.
   *
   * TRUE ON THE BOARD, FALSE WHEN ENTERING A CONTEST. On the board the bench is
   * the working surface: it is your whole collection for the week, you rummage
   * in it, and dragging a card up out of it is how a season lineup gets built.
   *
   * Entering a contest is the other direction. There are three or six empty
   * slots and one question per slot — who goes here — which `SwapSheet` already
   * answers with only the cards eligible for THAT slot. The bench underneath
   * was thirty rows of everything, most of it ineligible, pushing the slots and
   * the entry bar apart on a page whose whole job is filling three of them.
   */
  bench?: boolean;
  /**
   * How many slot rows to draw while the data loads, in the plain frame.
   *
   * A SPINNER IS THE WRONG SHAPE. It is one short row, so the contest page
   * rendered its card, a spinner, and the sections under it — then the slots
   * arrived and everything below them jumped down the screen. That is the
   * "refresh" a reader sees on opening a contest: not a reload, a re-layout.
   *
   * The caller knows the answer before the editor does — a contest row carries
   * its `slotCount` — so the page can hold exactly the height it is about to
   * need and nothing moves when the real rows replace the grey ones.
   */
  placeholderSlots?: number;
  /**
   * The contest, from a caller that already has it.
   *
   * The lobby fetched every field the editor needs to draw empty slots, so a
   * page opened FROM the lobby need not wait for this component to fetch the
   * same row again. With it, and with the slot shapes cached, the slots are on
   * screen before any request is made. See `useLineupData`.
   */
  contestHint?: LineupContest | null;
  /**
   * Fired once, when a submission has just BOUGHT the entry — not on the edits
   * that follow it.
   *
   * The sheet uses it to hand the reader over to the board: entering is the
   * end of what a sheet is for, and leaving them sitting in it afterwards
   * would mean the lineup they just paid for is behind a panel they have to
   * know to close.
   */
  onEntered?: (contestCode: string) => void;
  /**
   * WHERE THE ENTRY BUTTON GOES, when it is not going here.
   *
   * ---------------------------------------------------------------------------
   * WHY THE OFFER IS HANDED OUT RATHER THAN THE BUTTON
   * ---------------------------------------------------------------------------
   *
   * The entry control's whole state — whether the lineup is full, what the fee
   * is, whether a write is in flight — is derived inside this component from
   * picks it holds locally, and it stays here. What crosses the boundary is a
   * description of the offer, so the caller can draw it in its own material
   * without learning anything about how a lineup is composed.
   *
   * IT IS A DESCRIPTION AND A REF, NOT A NODE AND NOT A CALLBACK IN THE OBJECT.
   * `submit` changes identity on every edit, so putting it in the reported
   * object would either re-report on every keystroke or capture a stale closure
   * — the first is churn and the second is a button that files a lineup two
   * swaps out of date. A mutable ref written on every render is always current
   * and never a dependency.
   *
   * PASSING THIS SUPPRESSES THE INLINE BUTTON, which is the point: two live
   * entry buttons for one entry is the parallel-copy problem this file's own
   * header warns about, applied to the control that spends the coins.
   */
  onEntryOffer?: (offer: EntryOffer | null) => void;
  /** Filled with the current actions so floated buttons can call them. */
  entryRef?: MutableRefObject<EntryActions | null>;
};

/**
 * The entry, as everything a button needs to offer it and nothing else.
 *
 * `ready` is deliberately not derivable by the caller from `filled` and `slots`
 * alone: a lineup is enterable when every slot is full AND the week is not
 * locked, and the second half is this component's to know.
 */
export type EntryOffer = {
  ready: boolean;
  fee: number;
  slots: number;
  filled: number;
  /** A write is in flight; the button must not fire a second one. */
  busy: boolean;
  /**
   * There is an empty slot with a card that could go in it.
   *
   * FALSE ON A FULL LINEUP AND ON AN EMPTY BENCH ALIKE, which are the two
   * states where the control would do nothing — and a button that does nothing
   * is worse than an absent one, because pressing it teaches the reader that
   * the app is broken rather than that they are done.
   */
  canAutofill: boolean;
  /** There is at least one filled slot to empty. */
  canClear: boolean;
};

/**
 * What a floated bar can DO, held in a ref rather than reported.
 *
 * These change identity on every edit — `submit` closes over the picks and
 * `autofill` over the eligible lists — so reporting them alongside the offer
 * would either re-report on every keystroke or hand out a stale closure. A
 * mutable ref written each render is always current and never a dependency.
 */
export type EntryActions = {
  submit: () => void;
  autofill: () => void;
  clear: () => void;
};

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

export function LineupEditor({
  pinnedContest,
  frame = 'screen',
  bench: showBench = true,
  placeholderSlots,
  contestHint,
  onEntered,
  onEntryOffer,
  entryRef,
}: LineupEditorProps = {}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const router = useRouter();
  const wide = useIsWide();
  /**
   * WHICH CONTEST THIS BOARD IS EDITING. Absent means the free one, which is
   * what every link into this screen meant before the lobby existed and what
   * the tab itself still means.
   *
   * A route param rather than screen state: the board is a different board per
   * contest — different slots, different entry, different saved picks — so it
   * has to survive a reload and be linkable from the lobby.
   */
  const { contest: contestParam } = useLocalSearchParams<{ contest?: string }>();
  /* The prop wins. In the sheet the route param is the SHEET's own `code`, and
     reading it here would be the editor guessing at which screen it is on. */
  const linkedCode =
    pinnedContest ?? (typeof contestParam === 'string' ? contestParam : undefined);
  const pinned = Boolean(pinnedContest);

  const { contests: myContests, reload: reloadMyContests } = useMyContests(linkedCode);

  /**
   * WHICH CARD OF THE CAROUSEL IS IN FRONT, and it is the board's key as well
   * as the card's — swiping changes both, because they are one object.
   *
   * State rather than the route, and the route param only SEEDS it. A swipe is
   * not a navigation: routing every one of them would push a history entry per
   * card and make the back gesture walk the carousel instead of leaving the
   * screen. The param exists so the lobby can open you on a particular contest
   * — after that this owns it.
   */
  /* DERIVED UNTIL THE READER SWIPES, rather than seeded by an effect. The
     linked contest arrives with the data, so an effect would have to write
     state the moment it lands — which is the `set-state-in-effect` pattern
     `use-loader`'s header exists to argue against, and it costs a render
     showing the wrong card before the right one. `swiped` is null until a
     swipe actually happens, and from then on it owns the selection. */
  const [swiped, setSwiped] = useState<number | null>(null);

  /* ARRIVING WITH A CONTEST NAMED BEATS WHATEVER WAS SWIPED TO EARLIER.
     This board is a tab: it stays mounted while the lobby and the contest
     sheet open over it, so a swipe made ten minutes ago is still in state when
     somebody enters a contest and is handed back here. Without this the
     carousel would ignore the contest they just paid for and sit on the old
     card.

     Adjusted during render rather than in an effect — the documented way to
     reset state when a prop changes, and it avoids the extra commit that
     `set-state-in-effect` exists to complain about. */
  const [lastLinked, setLastLinked] = useState(linkedCode);
  if (linkedCode !== lastLinked) {
    setLastLinked(linkedCode);
    setSwiped(null);
  }
  /**
   * THE BOARD IS THIS WEEK, AND ONLY THIS WEEK.
   *
   * ---------------------------------------------------------------------------
   * A FINISHED WEEK IS NOT SOMETHING YOU SWIPE PAST
   * ---------------------------------------------------------------------------
   *
   * `my_contest_cards` unions the current slate with `recap_slate()` — the week
   * just gone, for as long as the lineup board has moved on and the results are
   * still fresh. That was built so a settled contest had somewhere to be read,
   * and it put last week's cards on the carousel to do it.
   *
   * Which made the board two things at once. This screen exists to SET A
   * LINEUP, and every card on it is a header for the slots underneath; a card
   * whose week is over has no slots to head, so the boards had to grow a second
   * branch to draw a recap instead. A reader swiping toward the contest they
   * came to fill passed a page where the whole screen changed meaning.
   *
   * Finished weeks live behind `Previous weeks` on the rail now, which reaches
   * every week rather than the one `recap_slate()` can still see. And a result
   * still announces itself the moment it lands: `WelcomeBackBanner` is at the
   * top of this board and says so, which is the right shape for news — it
   * arrives, you read it, you dismiss it. A card you have to swipe past is not
   * news, it is furniture.
   *
   * FILTERED HERE RATHER THAN IN THE HOOK. `contest/[code]` calls
   * `useMyContests` too, and it is the page a recap opens INTO — filtering at
   * the source would take the archive's own destination away from it. It is the
   * board that is about this week, not the data.
   *
   * The pinned lookup below reads the UNFILTERED list for the same reason: the
   * contest sheet is handed a code and must find it whatever week it belongs
   * to.
   */
  const board = useMemo(() => (myContests ?? []).filter((ct) => !ct.recap), [myContests]);

  const linkedIndex = linkedCode ? board.findIndex((ct) => ct.code === linkedCode) : -1;
  const rawIndex = swiped ?? (linkedIndex > 0 ? linkedIndex : 0);

  /* Clamped, because the list can shrink under the index: a contest settles,
     or the week rolls over, and the card that was in front is gone. */
  const cardIndex = board.length ? Math.min(rawIndex, board.length - 1) : 0;
  const current = pinned
    ? (myContests?.find((ct) => ct.code === pinnedContest) ?? null)
    : (board.length ? board[cardIndex] : null);
  /* The free contest is the default and passes no code, which is what every
     caller written before the lobby existed meant. */
  /* PINNED, THE CODE IS THE PROP. It used to be read off `current`, which is
     the row `useMyContests` returns — a third fetch this component then waited
     on before it could ask for anything. The caller pinned it by code; that is
     the answer, and it is available on the first render. */
  const contestCode = pinned
    ? (pinnedContest as string)
    : current && current.kind !== 'free'
      ? current.code
      : undefined;

  /** Measured, not derived from the window — see `ContestCarousel.width`. */
  const [cardWidth, setCardWidth] = useState(0);

  const {
    slate,
    inPlay,
    hasLiveGame,
    lockAt,
    slots,
    cards,
    savedPicks,
    savedPoints,
    scoredAt,
    finalizedAt,
    contest,
    elsewhere,
    loading,
    error: loadError,
    reload,
    reloadLineup,
  } = useLineupData(contestCode, contestHint);
  const { run, roster } = usePlayer();

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

  /**
   * Cards that cannot be brought in, for either of the two reasons there are.
   *
   * KICKED OFF is the original one: his game has begun, so picking him now
   * would be choosing a starter after watching him play.
   *
   * PLAYING ELSEWHERE is the new one, and it had been invisible. A card is in
   * one contest a week (`card_plays_one_contest`), and `set_lineup` refuses the
   * WHOLE submission if any slot breaks that — so a bench that offered a card
   * already in your main lineup produced a board that silently stopped saving,
   * with the reason rendered below sixteen bench rows. Do not offer what the
   * server will always refuse.
   *
   * One set, because both answer the same question for the boards: may this
   * row be pressed? They are told apart only where the reason is SAID, which
   * is `reasonFor` below.
   */
  const lockedIds = useMemo(() => {
    const out = new Set<string>();
    for (const card of cards) if (isLocked(card.game, lockNow)) out.add(card.id);
    return out;
  }, [cards, lockNow]);

  /**
   * What the PICKERS refuse: kicked off, or playing elsewhere.
   *
   * Kept apart from `lockedIds` rather than folded into it, and the difference
   * is not cosmetic. `lockedIds` means "his game has started", which is what
   * `allLocked` reads to decide the week is underway and what `isCardLocked`
   * reads to stop a started player being taken OUT of a slot. A card sitting
   * in another contest is neither of those things — it has not kicked off and
   * it is not in this lineup at all — so merging them would have the board
   * announce a locked week to somebody whose cards are simply committed
   * elsewhere.
   */
  /**
   * A PAID ENTRY YOU HAVE NOT BOUGHT YET, which is the one state where the
   * autosave must not run.
   *
   * Everywhere else in this game a swap is saved on a timer and that is right:
   * editing is free, the server is the record, and a button to confirm each
   * change would be furniture. But the FIRST submission into a paid contest is
   * not an edit, it is a purchase — `set_lineup` takes the fee on the create
   * path — and spending somebody's coins because they stopped typing for 700ms
   * is not a thing to do on a timer.
   *
   * It is only ever true before the entry exists. Once the fee is paid the
   * board goes back to autosaving like any other, because from then on it IS
   * only editing.
   *
   * ---------------------------------------------------------------------------
   * A FREE LOBBY CONTEST IS STILL AN ENTRY
   * ---------------------------------------------------------------------------
   *
   * This read `entryFeeCoins > 0` alone, and the reasoning was about money: no
   * fee, nothing to spend, so nothing to confirm. That is true and it is not
   * the whole job. Entering a lobby contest also spends the scarcer thing —
   * `20260825010000`'s rule is one card, one contest, one week, so filling
   * three slots here takes those three cards off every other contest on the
   * slate for the week. That is a commitment whether or not a coin moves.
   *
   * It also showed: The Warm-Up is the one free row in the lobby, and it was
   * the one row with no bar on it — no Clear, no Pick for me, no Enter —
   * because the offer is published from this flag. One row out of seven
   * behaving unlike the rest is not a considered exception, it is the fee
   * condition leaking into a question about entry.
   *
   * THE FREE WEEKLY CONTEST IS NOT THIS. `kind === 'free'` is the one nobody
   * chooses and nobody can leave; it autosaves like the board it is on,
   * because there is no act of entering it to confirm.
   */
  const needsEntry = Boolean(
    contest?.unentered && (contest.entryFeeCoins > 0 || contest.kind === 'lobby'),
  );

  /**
   * OVER THE ROSTER CAP, which is the one refusal that is about none of the
   * cards on this board.
   *
   * `set_lineup` checks the cap FIRST, before eligibility, before the lock,
   * before anything — see 20260824200700 and the copy of it in the contest
   * spine — and refuses the whole submission while you hold more than the cap.
   * So on an over-cap roster every pick on this screen is a guaranteed server
   * error, and the board used to take them anyway: the row filled with the
   * player, the autosave fired, the call was refused, and what the reader was
   * left with was a lineup that showed somebody it had not saved.
   *
   * That is the worst of the three possible failures. A row you cannot fill is
   * honest, a row that fills and says it did not save is survivable, and a row
   * that fills and looks saved is a player who finds out on Sunday.
   *
   * SO THE PICK IS REFUSED AT THE SOURCE — see `setPick`. Nothing is written,
   * so nothing is drawn, so there is no state to reconcile when the read comes
   * back. The bar above the boards carries the count and the remedy the whole
   * time, so it is a wall you can see rather than one you walk into.
   *
   * CLEARING A SLOT IS REFUSED TOO, which is not obvious and is the same bug
   * wearing the other hat. The cap gate is raised before the slots are even
   * looked at, so `set_lineup` refuses an emptier lineup exactly as flatly as a
   * fuller one — and a row drawn empty against a server that still has the
   * player in it is the identical lie in the opposite direction. Nothing on
   * this board moves until the roster is legal. See `clearPick`.
   *
   * IT CLEARS ITSELF THE MOMENT THE ROSTER IS LEGAL, because the count is the
   * one in `PlayerContext` — the same value the header's card total is drawn
   * from, refreshed by every path that mints or destroys a card and moved
   * optimistically by the ones that know how many. Commit or sell the excess on
   * the Collection tab and this board is editable before you have finished
   * navigating back to it. */
  const overCap = roster?.isOver === true;
  /**
   * What a refused pick says, and it is SHORT on purpose.
   *
   * The bar below carries the count, the cap and the remedy already. Repeating
   * all three here would put two versions of the same paragraph on screen at
   * once — this one only has to answer "why did nothing happen", and point at
   * the thing that answers the rest.
   */
  const capMessage = 'Your roster is over the limit, so this lineup cannot be changed yet.';

  const unavailableIds = useMemo(() => {
    const out = new Set(lockedIds);
    for (const id of elsewhere.keys()) out.add(id);
    return out;
  }, [lockedIds, elsewhere]);

  /**
   * Why a dimmed row is dimmed, in the words the reader needs.
   *
   * Kickoff wins when both are true — it is the one that cannot be undone by
   * going and changing another lineup.
   */
  const reasonFor = useCallback(
    (id: string): string =>
      cards.some((c) => c.id === id && isLocked(c.game, lockNow))
        ? 'has already started and cannot be brought in'
        : `is already playing in ${elsewhere.get(id) ?? 'another contest'}`,
    [cards, lockNow, elsewhere],
  );

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
          list.filter((card) => !unavailableIds.has(card.id)).length,
        ]),
      ),
    [eligibleBySlot, unavailableIds],
  );

  /**
   * Whether autofill has anything to do: an empty slot with a startable card in
   * its list. Counted rather than simulated — the exact answer would mean
   * running the whole assignment on every render to grey out one button, and
   * the two disagree only in the case where a slot's single candidate has
   * already been taken by another empty slot. That press fills what it can and
   * leaves the impossible row, which is the same outcome the reader would get
   * by hand.
   */
  const canAutofill = useMemo(
    () => slots.some((cfg) => !picks[cfg.slot] && (eligibleCounts.get(cfg.slot) ?? 0) > 0),
    [slots, picks, eligibleCounts],
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
  /* NO SEASON RECORD IS READ HERE ANY MORE. `useFieldRecord` fed exactly one
     thing — a "SEASON 1-0" in the corner of the free contest's card — and the
     card dropped it: the head is where you learn which contest this is, and a
     season standing is not that. The hook is still in `field.ts` for whatever
     surface wants to make a proper case for the season; this screen no longer
     pays for a query it does not draw. */

  /* Both of these clear the failure state as well as the error text: a new
     choice is a new thing to try, and it deserves an attempt of its own. */
  const setPick = useCallback(
    (slot: string, cardId: string) => {
      /* THE ROW IS NOT FILLED. See `overCap` — the server refuses the whole
         submission, so drawing the player in the slot would be the board
         claiming a lineup it does not have. The sheet closes either way, so
         the reader is returned to the board with the reason on it rather than
         left in a picker that appears to have ignored them. */
      if (overCap) {
        setSwap(null);
        setSubmitError(capMessage);
        return;
      }
      setEdits((e) => ({ ...e, [slot]: cardId }));
      setSwap(null);
      setSubmitError(null);
      setBlocked(false);
    },
    [overCap, capMessage],
  );

  /**
   * FILL EVERY EMPTY SLOT, from the lists the picker itself would show.
   *
   * ---------------------------------------------------------------------------
   * IT INVENTS NO RANKING, AND THAT IS THE WHOLE DESIGN
   * ---------------------------------------------------------------------------
   *
   * The obvious way to build this is to decide what "best" means — career FP,
   * tier, closest to the next threshold — and there is no honest answer,
   * because this app sells no projections and every one of those is a different
   * bet. Worse, any answer would be a SECOND opinion: the swap sheet already
   * orders each slot's candidates, by the reader's own `sort`, and an autofill
   * that disagreed with the list it is standing next to would be the app
   * arguing with itself about which card is better.
   *
   * So it takes the top of each slot's list, exactly as `eligibleBySlot` has
   * already ordered it. Change the sort and autofill changes with it, which
   * makes the control legible without a word of explanation: it picks what you
   * would have picked first.
   *
   * ---------------------------------------------------------------------------
   * SCARCEST SLOT FIRST, WHICH IS NOT FUSSINESS
   * ---------------------------------------------------------------------------
   *
   * A greedy pass in slot order starves the strict slots: FLEX is eligible for
   * nearly everybody, so filling it first can take the one running back the RB
   * slot could have used, and leave a hole in a lineup that had a legal answer.
   * Filling the narrowest choice first is the standard fix and costs one sort.
   *
   * It is not a full matching and does not need to be. A case where even that
   * fails wants a card you do not hold, and the reader is left with an empty
   * row to fill by hand — which is the same place they started, not a worse
   * one.
   *
   * ONE EDIT, NOT N. `setEdits` is called once with every slot resolved, so the
   * autosave debounce sees a single change and writes a single lineup. Calling
   * `setPick` in a loop would queue eight state updates and, worse, eight
   * chances for the cap gate to fire halfway through a half-built team.
   */
  const autofill = useCallback(() => {
    if (overCap) {
      setSubmitError(capMessage);
      return;
    }
    const taken = new Set(
      slots.map((cfg) => picks[cfg.slot]).filter((id): id is string => Boolean(id)),
    );
    const empty = slots
      .filter((cfg) => !picks[cfg.slot])
      .sort((a, b) => (eligibleCounts.get(a.slot) ?? 0) - (eligibleCounts.get(b.slot) ?? 0));

    const filled: Record<string, string> = {};
    for (const cfg of empty) {
      const pick = (eligibleBySlot.get(cfg.slot) ?? []).find(
        (card) => !unavailableIds.has(card.id) && !taken.has(card.id),
      );
      if (!pick) continue;
      filled[cfg.slot] = pick.id;
      taken.add(pick.id);
    }
    if (Object.keys(filled).length === 0) return;

    setEdits((e) => ({ ...e, ...filled }));
    setSubmitError(null);
    setBlocked(false);
  }, [overCap, capMessage, slots, picks, eligibleBySlot, eligibleCounts, unavailableIds]);

  /**
   * EMPTY EVERY SLOT, in one edit.
   *
   * The swap sheet can already clear a row at a time, which is right for
   * changing your mind about one card and wrong for starting over — eight taps
   * through eight sheets to get back to where autofill started. This is the
   * counterpart to `autofill` and it is deliberately the same shape: one
   * `setEdits`, so the autosave writes once rather than eight times.
   *
   * IT DOES NOT ASK. Nothing is spent, nothing is lost, and the picks are one
   * press of the other button away from coming back — a confirm here would be
   * ceremony around an act with no consequence. The fee is the thing that
   * cannot be undone, and it is on a different button entirely.
   */
  const clearAll = useCallback(() => {
    if (overCap) {
      setSubmitError(capMessage);
      return;
    }
    const emptied: Record<string, null> = {};
    for (const cfg of slots) if (picks[cfg.slot]) emptied[cfg.slot] = null;
    if (Object.keys(emptied).length === 0) return;

    setEdits((e) => ({ ...e, ...emptied }));
    setSubmitError(null);
    setBlocked(false);
  }, [overCap, capMessage, slots, picks]);

  const clearPick = useCallback(
    (slot: string) => {
      // The cap gate fires before the slots are read, so emptying a row is
      // refused as flatly as filling one. See `overCap`.
      if (overCap) {
        setSwap(null);
        setSubmitError(capMessage);
        return;
      }
      setEdits((e) => ({ ...e, [slot]: null }));
      setSwap(null);
      setSubmitError(null);
      setBlocked(false);
    },
    [overCap, capMessage],
  );

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
        lockedIds: unavailableIds,
        reasonFor,
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
  }, [swap, slots, picks, byId, eligibleBySlot, isCardLocked, unavailableIds, reasonFor]);

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
    await Promise.all([reload(), reloadMyContests()]);
  }, [reload, reloadMyContests]);

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
      p_contest_code: contestCode,
    });
    if (err) {
      /**
       * A CARD THAT IS GONE IS THE ONE FAILURE THE EDITS CANNOT SURVIVE.
       *
       * `set_lineup` refuses the whole call if any slot names a copy that is no
       * longer held, and a copy stops being held when it is sold or COMMITTED
       * TO A SET. Both of those happen on other tabs, and this screen is a tab
       * that stays mounted — so it could be holding a card the server destroyed
       * minutes ago, and every autosave from then on was refused with the same
       * message until the session ended.
       *
       * `useLineupData` now re-reads on focus when the collection has moved,
       * which is what stops this arising in the ordinary flow. This is the
       * backstop for the rest: a second device, or a sweep that burnt something
       * while this tab was the one in front.
       *
       * The edits go WITH the re-read here, and only here. Everywhere else they
       * are kept on purpose — losing them is the thing autosave exists to
       * prevent — but an edit naming a destroyed card can never be saved by
       * anyone, so keeping it only guarantees the next retry fails the same way.
       */
      if (err.code === '42501' || /does not belong to you/i.test(err.message)) {
        setSubmitError(
          'Some of those cards are no longer in your collection — sold, or added to a set. The board has been refreshed.',
        );
        setEdits({});
        await reload();
        setBlocked(false);
        setSaving(false);
        return;
      }

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
    /* Captured BEFORE the reload below flips it: `needsEntry` is derived from
       `contest.unentered`, and re-reading the lineups is exactly what makes it
       false. Read after, this would never be true and the handover would never
       fire. */
    const boughtEntry = needsEntry;

    await reloadLineup();
    /* The CARD is stale too, not just the board: `filled` and this contest's
       distribution both move with a submission, and on a carousel that is the
       thing the reader is looking straight at. Not awaited — the board is
       already correct and the card catching up a moment later is invisible,
       where blocking the button on it is not. */
    void reloadMyContests();
    setEdits({});
    setSaving(false);

    if (boughtEntry && contestCode) onEntered?.(contestCode);
  }, [slate, picks, contestCode, reloadLineup, reload, reloadMyContests, needsEntry, onEntered]);

  /* THE REF, REWRITTEN EVERY RENDER so a floated button never holds a stale
     `submit`. No dependency array on purpose: the whole job is to be current,
     and an effect that ran only on identity change would be the stale-closure
     bug written more carefully. */
  useEffect(() => {
    if (entryRef) entryRef.current = { submit: () => void submit(), autofill, clear: clearAll };
  });


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
    if (!dirty || saving || blocked || !slate || needsEntry) return;
    const t = setTimeout(() => void submit(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [dirty, saving, blocked, slate, submit, needsEntry]);

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
  const pendingRef = useRef<{
    season: number;
    season_type: number;
    week: number;
    slots: { slot: string; card_instance_id: string }[];
    /* Carried WITH the payload rather than read at flush time: the effect below
       runs on unmount, by which point the route param is gone — and flushing a
       lobby board's pending edit into the free contest would put the cards in
       the wrong lineup and charge nothing for it. */
    contestCode: string | undefined;
  } | null>(null);

  useEffect(() => {
    pendingRef.current =
      /* `needsEntry` guards this as hard as it guards the debounce, and this is
         the more dangerous of the two: the flush fires on UNMOUNT with no
         component left to report anything, so closing the sheet would have
         bought the entry on the way out and told nobody. */
      dirty && !blocked && slate && !needsEntry
        ? {
            season: slate.season,
            season_type: slate.season_type,
            week: slate.week,
            slots: Object.entries(picks).map(([slot, card_instance_id]) => ({
              slot,
              card_instance_id,
            })),
            contestCode,
          }
        : null;
  }, [dirty, blocked, slate, picks, contestCode, needsEntry]);

  useEffect(
    () => () => {
      const p = pendingRef.current;
      if (!p) return;
      void supabase.rpc('set_lineup', {
        p_season: p.season,
        p_season_type: p.season_type,
        p_week: p.week,
        p_slots: p.slots,
        p_contest_code: p.contestCode,
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

  /* `pinned && !current` is the moment before `my_contest_cards` has come
     back: the contest is named but not yet resolved, so `contestCode` is still
     undefined and the board below would draw the FREE contest's eight slots
     for a frame before settling to three. Held rather than shown — a board
     that changes shape under the reader looks like a bug, and in a sheet it is
     the first thing they see. */
  /**
   * THE OFFER, REPORTED ON ITS OWN FACTS.
   *
   * Every dependency here is a primitive, so this fires when the offer actually
   * changes rather than on every render — which matters because the caller's
   * handler is a `setState` and this is the component the reader is editing in.
   *
   * IT SITS ABOVE THE LOADING RETURN, like `useSettledResults` a few lines
   * down and for the same reason: hooks cannot be called conditionally and
   * there is an early exit below. `starters` rather than `filled`, which is
   * derived after that exit — the same number, read where it is legal.
   */
  useEffect(() => {
    if (!onEntryOffer) return;
    onEntryOffer(
      needsEntry && !allLocked
        ? {
            ready: starters.length === slots.length,
            fee: contest?.entryFeeCoins ?? 0,
            slots: slots.length,
            filled: starters.length,
            busy: saving,
            canAutofill,
            canClear: starters.length > 0,
          }
        : null,
    );
    /* AND WITHDRAWN ON THE WAY OUT. An offer is only good while the thing
       making it is on screen: this editor unmounts when the contest page moves
       to another tab, and without this the caller keeps the last offer it was
       handed — which put a live "Fill all 3 slots to enter" bar over the
       leaderboard, offering to spend coins from a face that has no lineup on
       it. Caught on a device; no test would have seen it, because the bug is
       entirely in what a second component does with state after the first one
       is gone. */
    return () => onEntryOffer(null);
  }, [
    onEntryOffer,
    needsEntry,
    allLocked,
    starters.length,
    slots.length,
    contest?.entryFeeCoins,
    saving,
    canAutofill,
  ]);

  /* ABOVE THE LOADING RETURN, because hooks cannot be called conditionally and
     there is an early exit a few lines down. It costs nothing there: the hook
     is off entirely when `pinned`, and its own reads are gated. */
  const results = useSettledResults(pinned);

  /* WHAT IS ACTUALLY NEEDED TO DRAW EMPTY SLOTS: the slot shapes, and the
     contest they belong to. Both can be in hand before any request — the
     shapes from `formatSlotCache`, the contest from `contestHint` — so a page
     that supplies a hint stops waiting on `loading`, which is the flag for
     everything ELSE this hook fetches: your collection, the field, the stats,
     the schedule. Those fill the rows in afterwards; they do not decide
     whether there are rows.
     `countsKnown` is the honest half of that bargain — see `SlotBoard`. */
  const canDrawSlots = slots.length > 0 && contest !== null;

  if ((loading && !canDrawSlots) || (pinned && !current && !contestHint)) {
    /* Skeleton rows where the caller told us how many to expect, so the page
       settles at its final height — see `placeholderSlots`. A spinner remains
       the honest answer everywhere the count is unknown. */
    const waiting =
      frame === 'plain' && placeholderSlots ? (
        <View style={styles.bleed}>
          {Array.from({ length: placeholderSlots }, (_, i) => (
            <RowSkeleton key={`slot-skeleton-${i}`} />
          ))}
        </View>
      ) : (
        <ActivityIndicator style={styles.pad} />
      );
    return frame === 'plain' ? (
      waiting
    ) : (
      <Screen title="Lineup" measure="table">
        {waiting}
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


  /* THE SAME PARTS IN BOTH FRAMES, and now the same scroll too — see the two
     returns below. The page draws the contest card above the boards; the sheet
     is already about one contest and draws no card. */

  /* AT THE TOP, NOT AT THE BOTTOM. This used to sit under the bench, which is
     sixteen rows down on a phone and further inside the contest sheet — so a
     submission the server refused looked exactly like one that worked, and the
     board simply stopped saving without saying so. A failure has to be visible
     from where the action was taken. */
  const notice =
    submitError ?? loadError ? (
      <Text style={[Type.fine, styles.centreText, { color: c.negative }]}>
        {submitError ?? loadError}
      </Text>
    ) : null;

  /**
   * "Here is how you did", for a player who was not watching on Sunday.
   *
   * IT IS ON THIS SCREEN because this is the one you land on, and it is not in
   * the sheet for the same reason the carousel is not: that surface is about
   * one contest, and a summary of a different week's would be noise on it.
   *
   * THE HISTORY READ IS THE BANNER'S, and it is the first page only — twenty
   * rows, once, on a screen already making several calls. Nothing unseen can be
   * older than that without the player having ignored twenty settlements.
   */
  const banner =
    pinned || results.unseen.length === 0 ? null : (
      <WelcomeBackBanner
        entries={results.unseen}
        onOpen={() => router.push('/contests')}
        /* Newest first, so the head of the list is the whole span. */
        onDismiss={() => results.acknowledge(results.unseen[0].finalizedAt)}
      />
    );

  /* NO CAROUSEL IN THE SHEET. That surface is already about one contest, and a
     row of cards for the others would be offering to leave it. MEASURED HERE
     otherwise, so the carousel pages on the width of the column it is actually
     in: `Screen` caps content at a ContentMeasure and the wide rail takes 236
     more, so a page sized from the window is wrong by hundreds of points on a
     desktop. */
  const card = pinned ? null : (
    <View onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
      <ContestCarousel
        contests={board}
        /* EVERY CARD ON THE BOARD IS THIS WEEK now that recaps are filtered
           out, so any of them can name it. Null while the list is loading,
           which the rail reads as "draw no back link". */
        week={board[0]?.weekTitle ?? null}
        index={cardIndex}
        onIndexChange={setSwiped}
        lockAt={nextLockAt ?? lockAt}
        locked={allLocked}
        now={now}
        run={run}
        /* The contests screen, over this board. It is a sheet rather than a page
           now, so this pushes and closing puts the reader back on the lineup
           they were filling — see `CONTESTS` in `sections.ts`.

           THE SHELF TRAVELS IN THE URL. Both ends of the rail arrive here and
           they want different faces of the same screen; the alternative was
           lifting `contests.tsx`'s view state up into a store so a board two
           routes away could set it, which is a lot of machinery for a string
           the router already carries. */
        onEnter={(view) =>
          router.push(
            view === 'history' ? { pathname: '/contests', params: { view } } : '/contests',
          )
        }
        width={cardWidth}
        onOpen={(ct) => router.push({ pathname: '/contest/[code]', params: { code: ct.code } })}
      />
    </View>
  );

  /**
   * Everything under the card.
   *
   * ONE BOARD, FINALLY. There were three, and both of the others existed to
   * describe a page of the carousel that was not a lineup.
   *
   * The first went with the lobby tile: swiping past the last contest used to
   * land on an invitation, which is a page with no contest and therefore no
   * slots, so the boards drew an empty state for it. The lobby is a button on
   * the rail now.
   *
   * The second was `RecapBoard`, for a card belonging to a finished WEEK — the
   * editor under one of those would have been the new week's empty slots
   * beneath last week's final score. Finished weeks are off the board entirely
   * now (see `board`), so there is no such card to draw and the branch has gone
   * with the reason for it.
   *
   * What is left is the board this screen exists to be.
   */
  const boards = (
    <>
      {/* THE WALL, WHERE IT CAN BE SEEN. Over the cap nothing on this board can
          be changed — see `overCap` — so the reason sits above the slots rather
          than arriving as a refusal after a pick.

          THE SAME NOTICE THE COLLECTION GRID DRAWS, which is the whole point of
          it being a component: a reader who has just met this wall on one screen
          meets the same sentence on the other, rather than wondering whether
          they have two problems. It was `RosterBar` for exactly that reason
          until the Collection stopped using the bar — see `RosterAlert`.

          It guards itself on `isOver`, so the `overCap` check here is belt and
          braces rather than the thing keeping a calm state off this board. */}
      {overCap ? <RosterAlert roster={roster} /> : null}

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
              countsKnown={!loading}
              openSlot={swap?.kind === 'slot' ? swap.slot : null}
              lockedIds={unavailableIds}
              savedPoints={savedPoints}
              scored={scoredAt !== null}
              onOpenSlot={openSlot}
              onOpenProfile={openProfile}
            />
          </View>

          {showBench ? (
            <>
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
                  lockedIds={unavailableIds}
                  onOpen={openBenchCard}
                  onOpenProfile={openProfile}
                  offSeasonCount={offSeasonCount}
                />
              </View>
            </>
          ) : null}
        </>
      )}

      {/* Where the save button was. It says what just happened rather than
          asking for permission to do it — and it is the only place a failed
          write can be retried from.

          IT RESERVES ITS HEIGHT WHETHER OR NOT IT HAS ANYTHING TO SAY, so a
          save cannot make the page twitch. That is right on the board, where
          every edit autosaves and this row is the only feedback there is.

          NOT ON A PAGE THAT HAS THE BAR. Where the caller takes an
          `onEntryOffer` it is drawing Enter with its own busy state, nothing
          autosaves (`needsEntry`), and this row has nothing to report — so
          reserving 32pt for it just leaves a hole between the last slot and
          whatever the page puts next. The retry stays: a failed write needs
          somewhere to be retried from wherever it happens. */}
      {onEntryOffer && !blocked ? null : (
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
        ) : needsEntry ? null : filled > 0 ? (
          <Text style={[Type.fine, { color: c.textTertiary }]}>Saved automatically.</Text>
        ) : null}
      </View>
      )}

      {/* THE ENTRY BUTTON. Only for a paid contest you are not in yet — see
          `needsEntry`. It says the price because pressing it is when the price
          is paid, which is the whole reason it exists instead of a timer.

          IT WANTS A FULL LINEUP. A partial one is legal and the caption below
          says so, but that is the rule for a free contest you are already in;
          paying forty coins for two of three slots is a mistake somebody makes
          once and cannot undo, and the server will not stop them. */}
      {needsEntry && !allLocked && !onEntryOffer ? (
        <Pressable
          onPress={filled === slots.length ? () => void submit() : undefined}
          disabled={filled !== slots.length || saving}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.enter,
            {
              backgroundColor: filled === slots.length ? c.text : c.surface,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <Text
            style={[
              Type.body,
              styles.enterLabel,
              { color: filled === slots.length ? c.background : c.textTertiary },
            ]}>
            {filled === slots.length
              ? `Enter for ${contest?.entryFeeCoins} coins`
              : `Fill all ${slots.length} slots to enter`}
          </Text>
        </Pressable>
      ) : null}

      {!allLocked && !needsEntry && filled < slots.length ? (
        <Text style={[Type.fine, styles.centreText, { color: c.textTertiary }]}>
          {slots.length - filled} slot{slots.length - filled === 1 ? '' : 's'} still empty. A partial
          lineup is allowed — an empty slot simply scores nothing.
        </Text>
      ) : null}
    </>
  );

  /* OUTSIDE THE SCROLL on the page: a sheet is not content, and a child of the
     box that scrolls under the card is exactly what it must not be. */
  const sheets = (
    <SwapSheet
      request={swapRequest}
      wide={wide}
      sort={sort}
      onSort={setSort}
      onPick={setPick}
      onClear={clearPick}
      onClose={closeSwap}
    />
  );

  /* The sheet supplies its own container, and draws no card. */
  if (frame === 'plain')
    return (
      <>
        {notice}
        {boards}
        {sheets}
      </>
    );

  /**
   * ONE SCROLL, CARD INCLUDED.
   *
   * The card was pinned above a scrolling board so the standing it is context
   * for could not leave the screen mid-swap. It costs more than it is worth on
   * a phone: a fixed 150pt of chrome over the boards means the bench is
   * permanently a flick away, and the reader who wants the card back is one
   * flick from it anyway.
   *
   * So `Screen` owns the scroll again — which is also where the gutter, the
   * 14pt rhythm and pull-to-refresh come from, and why none of them are
   * re-stated here. `bleed` still cancels exactly 16
   * because that gutter is unchanged.
   */
  return (
    <Screen
      title="Lineup"
      measure="table"
      context={context}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}>
      {notice}
      {banner}
      {card}
      {boards}
      {sheets}
    </Screen>
  );
}

/**
 * What has settled since the player last looked, and what to still announce.
 *
 * ONE SOURCE FOR TWO SURFACES. The banner and the rail's pips are the same
 * fact drawn twice — "this finished and you have not been told" — so they read
 * one hook. Held apart they would disagree the instant either was dismissed.
 *
 * OFF IN THE SHEET. `LineupEditor` also renders inside the contest sheet with
 * `frame="plain"`, which draws neither surface and has no business fetching a
 * season of results to do it.
 *
 * THE SEED IS AN EFFECT, and has to be: it must not run until the history has
 * landed, or a fresh install stamps an empty list and then announces its first
 * ever result as if it had already been seen. See `seedFor`.
 */
function useSettledResults(pinned: boolean) {
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const on = !pinned && Boolean(me);
  const history = useContestHistory(on);
  const { seenThrough, acknowledge } = useResultsSeen(on ? me : null);

  const unseen = useMemo(
    () => unseenResults(history.entries, seenThrough),
    [history.entries, seenThrough],
  );

  useEffect(() => {
    if (!on || history.loading) return;
    const seed = seedFor(history.entries, seenThrough);
    if (seed) acknowledge(seed);
  }, [on, history.loading, history.entries, seenThrough, acknowledge]);

  /**
   * THIS ALSO RETURNED `showResult`, a per-contest test for whether a settled
   * week's W/L/T badge was still worth drawing on the carousel's rack. Its one
   * consumer was a prop `ContestCarousel` accepted and never read, and the rack
   * it was meant to gate now draws no receipts at all: finished weeks are off
   * the board (see `board`), so every pip on it belongs to a contest that is
   * either live or waiting. The banner is what announces a result now.
   */
  return { unseen, acknowledge };
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
  enter: { paddingVertical: Spacing.two, borderRadius: 12, alignItems: 'center' },
  enterLabel: { fontWeight: '700' },
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
