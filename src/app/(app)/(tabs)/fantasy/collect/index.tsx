/**
 * Collection · Inventory — the cards you own.
 *
 * Virtualised from the first render: a collection has no upper bound, so
 * mapping over an array here would be a cliff rather than a slowdown.
 *
 * THE CONTROLS ARE OUTSIDE THE GRID; THE SUMMARY IS INSIDE IT. The chips and
 * the two round buttons are siblings of the FlatList rather than its header, so
 * that a control cannot scroll away from the thing it controls.
 *
 * THERE IS NO SEARCH FIELD ANY MORE, and it was the reason the controls first
 * moved out here: a `TextInput` used as a `ListHeaderComponent` is remounted on
 * every keystroke and loses focus after one character. The field is gone
 * because the question is — the roster caps at thirty, position and tier cut
 * that to a handful, and a shelf you can see all of does not need searching.
 * See `InventoryControls`. The rest stayed out here on their own merits.
 *
 * THE SUMMARY WENT THE OTHER WAY, and that is the change this note is about.
 * It used to sit ABOVE the controls and collapse on a push up the page — a
 * transform on a block one strip taller than the frame, a threshold, a measured
 * travel, and a matching pad on the bottom of every list inside it. All of that
 * machinery existed to buy back ~50pt of height that a summary does not need to
 * be holding once you are twenty rows in.
 *
 * Scrolling it away with the cards buys the same height for none of the
 * machinery, and it fixes what the collapse could not: the strip is a statement
 * about the whole collection, so it belongs where the collection is drawn, not
 * over the controls that cut the collection down. So the order is now controls
 * first, then the scroll — and the first thing in the scroll is what you own.
 *
 * The controls still do not move. They are the things you just pressed.
 *
 * THE ROSTER WARNING FOLLOWED IT IN, and sits directly under the strip. It is
 * the same kind of object — a statement about the collection, not a control
 * over it — and the two figures belong together: the strip counts what you
 * hold, the bar says what holding that many costs you. See the render.
 *
 * AND WHEN THE CAP IS BROKEN, A LINE ACROSS THE GRID AT IT. The bar says how
 * many you are over; the line says WHICH, in the order you are looking at them.
 * See `cutId` for the three conditions it insists on before drawing, and
 * `RosterCut` for what it is claiming.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  InventoryControls,
  ResultLine,
  SelectButton,
} from '@/components/collection/CollectionFilters';
import { useTabBarSpace } from '@/components/shell/useTabBarSpace';
import { CollectionValue } from '@/components/collection/CollectionValue';
import { RosterAlert } from '@/components/collection/RosterAlert';
import { RosterCount } from '@/components/collection/RosterCount';
import { BulkBar } from '@/components/collection/BulkBar';
import { SELECTION_MAX, sellTotal } from '@/components/collection/bulk';
import { RosterCut } from '@/components/collection/RosterCut';
import { useStarters } from '@/components/collection/use-starters';
import { useBulk } from '@/components/collection/use-bulk';
import { EmptyCollection, EmptyFilterResult } from '@/components/collection/EmptyInventory';
import { InventoryCard } from '@/components/collection/InventoryCard';
import {
  SortDefaultDir,
  countByJob,
  countByPosition,
  countByTier,
  matchesJob,
  matchesPosition,
  matchesTier,
  sortCards,
  spareIds,
  summarise,
  type CollectionCard,
  type JobFilter,
  type JobSets,
  type SortDir,
  type SortKey,
  type TierFilter,
} from '@/components/collection/types';
import { useCollection } from '@/components/collection/use-collection';
import { useOffers } from '@/components/collection/use-offers';
import type { PosFilter } from '@/components/cards/PositionFilter';
import { Screen } from '@/components/shell/Screen';
import { Colors, Spacing, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Whether the packs sheet has already been offered to an empty collection this
 * session. See the effect that reads it — it must survive a remount of this
 * screen, which is what rules out `useState`/`useRef`.
 */
let starterOffered = false;

const GUTTER = Spacing.three;
const GAP = Spacing.two + 4;
/**
 * Clearance under the last row of a full-height list.
 *
 * IT DOES NOT INCLUDE THE TAB BAR, and it used to. Every list on the app added
 * `useTabBarInset()` — 54pt of bar plus the home indicator's 34 — on the belief
 * that the bar floats over the page. It does not: `BottomTabView` renders the
 * scene and the bar as SIBLINGS in a column, and the bar is only positioned
 * absolutely when it is hidden, so the scene already ends where the bar begins.
 * What that inset bought was ~88pt of black between the last row and the bar on
 * every scrolling screen in the app.
 *
 * So the tail is just a tail now: enough that the last row is not jammed
 * against the bar, and nothing more.
 */
const LIST_TAIL = Spacing.four;
/**
 * Below this the card's nameplate stops working: the position and club are
 * pushed to opposite corners under a centred name, and at much under 100pt
 * those three runs start colliding rather than truncating.
 */
const MIN_CARD_WIDTH = 100;
const MIN_COLUMNS = 3;
/**
 * Seven puts a card at ~153pt in the widest content box, which is close to the
 * 168pt the grid card is drawn for. Five capped it at 220pt — wider than the
 * card was ever designed to be, and the compact type scale looks lost at that
 * size.
 */
const MAX_COLUMNS = 7;
/**
 * The last width this grid was laid out at, and the window width it was
 * measured under. Module scope on purpose: it has to outlive the screen, which
 * is unmounted every time you visit the Shop. See `listWidth`.
 */
let lastMeasured: { window: number; list: number } | null = null;

function measuredWidthFor(windowWidth: number): number {
  return lastMeasured && lastMeasured.window === windowWidth ? lastMeasured.list : 0;
}

/**
 * What the bar says when a starter is pressed in multi-select.
 *
 * IT NAMES THE CARD, and that is the whole of what changed about it. The first
 * version was a rule — "Cards in your lineup cannot be sold or added to sets" —
 * which is true, general, and answers a question nobody asked: the reader
 * pressed ONE card and wants to know what happened to THAT press. A rule
 * floating over a grid of thirty reads as a policy notice, and leaves them to
 * work out which of the thirty it is about.
 *
 * SO IT IS THREE CLAUSES IN THE ORDER SOMEBODY WOULD ASK THEM. What did not
 * happen (this card was not selected), why (it is in a lineup you have not
 * played), and what to do about it (bench it). The rule is still in there — it
 * is the second clause — but it arrives as the reason for a specific refusal
 * rather than as a sign on the wall.
 *
 * "A LINEUP YOU HAVE NOT PLAYED YET" rather than "this week's lineup", because
 * a card can be standing in a contest's lineup as well as the free one, and
 * because the predicate behind this is `lineup_slots` joined on `scored_at is
 * null` — which is exactly "not played yet" and is not exactly "this week".
 * See `use-starters`.
 *
 * THE NAME IS OPTIONAL because the lookup is against the rows currently loaded
 * and a press can in principle land on a card the grid has since replaced. The
 * sentence still has to work, so it falls back to naming the card as a card.
 */
function cannotSelect(playerName: string | undefined): string {
  const who = playerName ?? 'That card';
  return `${who} cannot be selected — that copy is in a lineup you have not played yet. Bench it first to sell it or add it to a set.`;
}

export default function InventoryScreen() {
  const tabSpace = useTabBarSpace();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  /**
   * 0 until the list has been laid out; the grid waits rather than guess.
   *
   * Seeded from the last measurement THIS SESSION, because the grid renders
   * nothing at all while this is 0 and `onLayout` does not fire until after the
   * mount — so every return to this page had a blank frame between the header
   * and the cards even once the collection itself came back instantly.
   *
   * The seed is only taken when the window is still the width it was measured
   * at, so a rotation or a resize while the page was away falls back to
   * measuring rather than drawing one frame at the wrong column count. Any
   * change is corrected by the `onLayout` below in the same pass regardless;
   * the guard is about which single frame is wrong, not about correctness.
   */
  const windowWidth = useWindowDimensions().width;
  const [listWidth, setListWidth] = useState(() => measuredWidthFor(windowWidth));

  const rememberWidth = useCallback(
    (width: number) => {
      lastMeasured = { window: windowWidth, list: width };
      setListWidth(width);
    },
    [windowWidth],
  );


  const { cards, error, loading, refreshing, refresh } = useCollection();
  /* The roster comes off the SAME context as the header's count, which is what
     makes it move the instant a sale lands rather than on the next focus — see
     `PlayerContext`. It used to be a hook of its own that re-read on focus and
     on nothing else. */
  const { cardCount, roster, refresh: refreshPlayer } = usePlayer();

  const [position, setPosition] = useState<PosFilter>('ALL');
  const [tier, setTier] = useState<TierFilter>('ALL');
  /* WHAT YOU ARE TRYING TO DECIDE — spares, cards a set would take, cards you
     are starting. The headline filter, and the only one on this screen that
     narrows by anything other than an attribute of the card. See `JobFilter`. */
  const [job, setJob] = useState<JobFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('fp');
  const [dir, setDir] = useState<SortDir>(SortDefaultDir.fp);


  /**
   * MULTI-SELECT, and it is a MODE rather than a long-press.
   *
   * A cell in this grid opens the card, and that is the tap people already know.
   * Overloading it — long-press to start selecting, tap to select once you are —
   * gives one gesture two meanings depending on a state with nothing on screen
   * to announce it, and there is no long-press on the web build at all. So the
   * mode is a button, and while it is on a tap ticks instead of opening.
   *
   * IDS, NOT CARDS. The rows are replaced wholesale every time the collection is
   * re-read — after a sale, after a commit — so holding the objects would hold a
   * copy of a card that no longer exists. Ids survive that, and anything the
   * selection needs is looked up against the current rows. See `selectedCards`.
   */
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  /* ---- grid geometry ------------------------------------------------- *
   * MEASURED, not recomputed. This used to derive the column width from the
   * window, which meant restating the frame's own arithmetic — the content
   * cap, the gutters, and (once the sidebar existed) the rail width. It got
   * the rail wrong, so on any wide window narrower than the cap the last card
   * in every row pushed past the right edge.
   *
   * onLayout reports what the list actually got, so the grid cannot disagree
   * with the frame no matter what the frame later decides to do. Cards are
   * given an exact width rather than flex: 1 so a short final row does not
   * stretch its cards wider than the rows above it.
   *
   * The measured box is UNPADDED because Screen renders `scroll={false}` as a
   * bare flex container — the FlatList applies the gutter itself, so it has to
   * come off here. Under a scrolling Screen the box already includes it.     */
  const contentWidth = listWidth - GUTTER * 2;
  // Three across is the floor, not a derived result: at two columns the cards
  // read as a list rather than a collection, and browsing what you own is the
  // whole point of this screen. Wider windows may fit more, never fewer.
  const columns = Math.max(
    MIN_COLUMNS,
    Math.min(MAX_COLUMNS, Math.floor((contentWidth + GAP) / (MIN_CARD_WIDTH + GAP))),
  );
  const itemWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);

  const all = useMemo(() => cards ?? [], [cards]);
  const stats = useMemo(() => summarise(all), [all]);
  /* The copies you are STARTING this week. They cannot be ticked — see
     `use-starters` for why a commit is the dangerous half of that. */
  const starters = useStarters();
  /**
   * The other two decision sets, and they come from opposite places.
   *
   * `spares` is pure and free — it is the ids, grouped and ranked in the
   * server's own burn order. `commitable` is one RPC over the whole collection,
   * which is affordable for the reason `use-offers` spends a page on: the roster
   * caps at thirty and `card_actions` takes an array.
   *
   * Bundled into one object because three sets threaded through `matchesJob`
   * and `countByJob` separately is three chances to pass them in the wrong
   * order — they are all `Set<string>` and the compiler could not tell.
   */
  const spares = useMemo(() => spareIds(all), [all]);
  const offers = useOffers(cards);
  const jobSets = useMemo<JobSets>(
    () => ({ spares, commitable: offers.commitable, starters }),
    [spares, offers.commitable, starters],
  );
  /**
   * Why the last blocked tap did nothing, shown on the selection bar.
   *
   * ON THE BAR RATHER THAN ON THE CELL, because a 100pt square already carries
   * a tick, a tier, a nameplate and sometimes an IN SET pill, and the sentence
   * is longer than any of them. The cell says THAT it is blocked — it is dimmed
   * and marked STARTING; this says why, once, in the one place on the screen
   * that is about the selection.
   *
   * Cleared by the next successful tick, so it is about the tap you just made
   * rather than a state the bar sits in.
   */
  const [blockedNote, setBlockedNote] = useState<string | null>(null);

  /* ---- faceting ------------------------------------------------------ *
   * Each row's counts are computed with its OWN filter lifted, which is what
   * makes the numbers mean "how many would I get if I pressed this". There are
   * two facets left, so the tier counts are taken over whatever the position
   * chips have left and vice versa.                                        */
  const forTierCounts = useMemo(
    () => all.filter((card) => matchesPosition(card, position) && matchesJob(card, job, jobSets)),
    [all, position, job, jobSets],
  );
  const tierCounts = useMemo(() => countByTier(forTierCounts), [forTierCounts]);

  /* The decision chips' own counts, with THEIR filter lifted and the other two
     applied — same rule as the tier row above, so every number on both rows
     answers "how many would I get if I pressed this". */
  const forJobCounts = useMemo(
    () => all.filter((card) => matchesPosition(card, position) && matchesTier(card, tier)),
    [all, position, tier],
  );
  const jobCounts = useMemo(() => countByJob(forJobCounts, jobSets), [forJobCounts, jobSets]);

  /* Position's own counts, its filter lifted and the other two applied — the
     same faceting rule as the tier and pile rows, so every number in the menu
     answers "how many would I get if I pressed this". */
  const positionCounts = useMemo(
    () =>
      countByPosition(
        all.filter((card) => matchesTier(card, tier) && matchesJob(card, job, jobSets)),
      ),
    [all, tier, job, jobSets],
  );

  const visible = useMemo(
    () =>
      sortCards(
        all.filter(
          (card) =>
            matchesPosition(card, position) &&
            matchesTier(card, tier) &&
            matchesJob(card, job, jobSets),
        ),
        sort,
        dir,
      ),
    [all, position, tier, job, jobSets, sort, dir],
  );

  const filtered = position !== 'ALL' || tier !== 'ALL' || job !== 'ALL';

  /**
   * The copy the roster cap falls on, or null when there is no line to draw.
   *
   * THREE CONDITIONS, AND EACH ONE IS THE LINE REFUSING TO LIE:
   *
   *   OVER THE CAP. Under it every card you hold is on the right side of the
   *     line, so there is nothing to divide. Same threshold the roster bar uses
   *     to turn red, from the same figure, so the two cannot disagree about
   *     whether there is a problem.
   *
   *   NOTHING FILTERED. The thirtieth QB on screen is not the thirtieth card
   *     you hold. Under a filter the count the line is drawn from is a count of
   *     a subset, and the line would be pointing at nothing.
   *
   *   MORE CARDS THAN THE CAP ON SCREEN. Belt and braces against the two above
   *     drifting apart — `roster.held` is the server's count and `visible` is
   *     the rows that have arrived, and for one render after a refresh they can
   *     be different numbers.
   *
   * It is an ID rather than an index because the separator is handed the ROW it
   * follows and not the position of it — see the grid's `ItemSeparatorComponent`.
   */
  const cutId = useMemo(() => {
    if (!roster?.isOver || filtered) return null;
    if (visible.length <= roster.cap) return null;
    return visible[roster.cap - 1]?.id ?? null;
  }, [roster, filtered, visible]);

  /**
   * The separator, built only when there is a cut to draw.
   *
   * `undefined` otherwise, so a grid with nothing to divide renders no
   * separator component at all rather than one that returns null between every
   * pair of rows.
   *
   * AFTER THE ROW HOLDING THE CAP'S CARD, which is exactly the guarantee worth
   * having: everything below the line is past the limit. On a phone it is also
   * exact — three columns into thirty is ten whole rows — and on a wider window
   * the straddling row sits above, so the line never claims a card is over when
   * it is not.
   */
  const cut = useMemo(() => {
    const cap = roster?.cap;
    if (!cutId || !cap) return undefined;
    return function Cut({ leadingItem }: { leadingItem?: CollectionCard | CollectionCard[] }) {
      // One row per virtualised item once `numColumns > 1`, so what arrives here
      // is the array. The single-card form is handled for safety, not for a case
      // this screen can reach — `columns` has a floor of three.
      const row = Array.isArray(leadingItem) ? leadingItem : leadingItem ? [leadingItem] : [];
      if (!row.some((card) => card.id === cutId)) return null;
      return <RosterCut cap={cap} />;
    };
  }, [cutId, roster?.cap]);

  const clearFilters = useCallback(() => {
    setPosition('ALL');
    setTier('ALL');
    setJob('ALL');
  }, []);

  // Changing the key resets the direction to that key's natural one. Carrying
  // the previous direction across means pressing "Name" after "Career FP"
  // silently answers Z–A, which reads as a bug rather than a choice.
  const changeSort = useCallback((next: SortKey) => {
    setSort(next);
    setDir(SortDefaultDir[next]);
  }, []);
  const toggleDir = useCallback(() => setDir((d) => (d === 'desc' ? 'asc' : 'desc')), []);

  /** A new key takes its own natural direction; the active key reverses. */
  const pressSort = useCallback(
    (next: SortKey) => (next === sort ? toggleDir() : changeSort(next)),
    [sort, toggleDir, changeSort],
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshPlayer()]);
  }, [refresh, refreshPlayer]);

  /* Resolved against the CURRENT rows, so a card that has just been sold out
     from under the selection simply is not in here any more.

     STARTERS ARE FILTERED HERE AS WELL AS AT THE TICK, and the second guard is
     not belt and braces: the tick refuses what `starters` held AT THE TIME, and
     that set is re-read on focus — so a card ticked on Monday and started on
     Tuesday is in `selected` and must not reach either action. Filtering at the
     point the payload is built is the only place that catches it. */
  const selectedCards = useMemo(
    () => all.filter((card) => selected.has(card.id) && !starters.has(card.id)),
    [all, selected, starters],
  );
  const selectedCoins = useMemo(() => sellTotal(selectedCards), [selectedCards]);

  /* Everything a CELL draws differently from one render to the next, in one
     object, because `extraData` is compared by identity and a fresh literal
     would redraw every row on every render. Both halves matter: the ticks
     change on a tap, and which cells are blocked changes when a lineup is
     edited on another tab. */
  const cellState = useMemo(() => ({ selected, starters }), [selected, starters]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const bulk = useBulk(clearSelection);

  /**
   * HOW THE MODE WAS OPENED, because it decides how it closes.
   *
   * A mode opened by HOLDING a card was opened *about that card*: untick it and
   * the mode has nothing left to be about, so emptying the selection closes it
   * and one tap undoes the hold. A mode opened by the BUTTON starts empty by
   * definition — closing it at zero would make the button unpressable.
   *
   * A ref rather than state: nothing renders differently for it, and it is read
   * inside the tick handler that sets the selection.
   */
  const heldOpen = useRef(false);

  const toggleCard = useCallback(
    (id: string) => {
      /* A CARD YOU ARE STARTING CANNOT BE PICKED. Selling one is refused by the
         server and committing one would burn it out of the lineup it is
         standing in — see `use-starters`. The tap says so rather than doing
         nothing, because a cell that ignores a press reads as a broken cell. */
      if (starters.has(id)) {
        setBlockedNote(cannotSelect(all.find((card) => card.id === id)?.playerName));
        return;
      }
      setBlockedNote(null);

      /* THE LAST TICK TAKES THE MODE WITH IT — see `heldOpen`. Decided out here
         from the CURRENT selection rather than inside the updater below: an
         updater has to be pure, and React may run it more than once. */
      const emptying = selected.size === 1 && selected.has(id);

      setSelected((held) => {
        const next = new Set(held);
        if (next.has(id)) next.delete(id);
        // The ceiling is the SERVER's — both bulk functions refuse past 64 — so
        // the tick simply does not take rather than the run failing later. The
        // bar says the number when it is reached.
        else if (next.size < SELECTION_MAX) next.add(id);
        return next;
      });

      if (emptying && heldOpen.current) {
        heldOpen.current = false;
        setSelecting(false);
      }
    },
    [selected, starters, all],
  );

  /* Leaving the mode drops the selection with it. A set of ticks you cannot see
     is a set of ticks that will surprise somebody the next time the mode opens.
     Blocked mid-run: the ids are what the call in flight is about. */
  const toggleSelecting = useCallback(() => {
    if (bulk.busy) return;
    /* Pressed the button, so the mode is the button's however it was opened —
       an empty selection is a state it is allowed to sit in. See `heldOpen`. */
    heldOpen.current = false;
    setBlockedNote(null);
    setSelecting((on) => {
      if (on) setSelected(new Set());
      return !on;
    });
  }, [bulk.busy]);

  /**
   * HOLDING A CARD OPENS THE MODE, with that card already ticked.
   *
   * The button on the toolbar opens an EMPTY mode, which is the right thing
   * when you know you are about to pick several and have not decided which.
   * It is the wrong thing in the far more common case: you are looking at a
   * card, you want it and three others gone, and the button makes you leave
   * the card, press, come back and find it again. The hold is the same
   * gesture every phone photo library uses for exactly this, and it arrives
   * where the intent already is.
   *
   * NOT A TOGGLE. Holding a card while the mode is already open does nothing
   * here — the cell's ordinary press is the toggle by then, and a hold that
   * also toggled would fire on the way to a tap that had already fired.
   *
   * The bulk guard is `toggleSelecting`'s, for its reason: the ids are what a
   * call in flight is about, so the mode cannot be opened out from under one.
   *
   * A STARTER OPENS THE MODE WITH NOTHING TICKED rather than refusing to open
   * it. The hold is a request for the mode, and the card it was made on is
   * merely the obvious first pick; denying the whole gesture over one
   * ineligible card would leave the reader holding a cell that does nothing at
   * all. The mode opens, the cell is drawn blocked, and the bar says why.
   */
  const holdCard = useCallback(
    (id: string) => () => {
      if (selecting || bulk.busy) return;
      const blocked = starters.has(id);
      heldOpen.current = !blocked;
      setSelecting(true);
      setSelected(blocked ? new Set() : new Set([id]));
      setBlockedNote(
        blocked ? cannotSelect(all.find((card) => card.id === id)?.playerName) : null,
      );
    },
    [selecting, bulk.busy, starters, all],
  );

  /**
   * The cards a "Select all" would actually add, in the order the grid shows.
   *
   * TWO SUBTRACTIONS, AND NEITHER IS OPTIONAL IF THE BUTTON IS TO PRINT A
   * NUMBER. Starters cannot be ticked at all — `toggleCard` refuses them — so
   * counting them would have the button promise twelve and deliver ten, which
   * is the same silent shortfall the bulk confirmations were written to stop.
   * And anything ALREADY ticked is not something this would add, so a button
   * pressed twice cannot claim to do the same work twice.
   *
   * TRUNCATED AT THE SERVER'S CEILING rather than at nothing, because both bulk
   * functions refuse past `SELECTION_MAX` and a tick that does not take is a
   * button that lied. It is unreachable today — the roster caps at thirty and
   * the ceiling is sixty-four — and it is a guard against the cap moving, not
   * against a collection that exists.
   */
  const addable = useMemo(() => {
    const room = SELECTION_MAX - selected.size;
    if (room <= 0) return [];

    return visible
      .filter((card) => !starters.has(card.id) && !selected.has(card.id))
      .slice(0, room);
  }, [visible, starters, selected]);

  /**
   * Pressing Select, which does one of two things depending on the row.
   *
   * NOTHING FILTERED: opens an empty mode, exactly as the old square did.
   * A PILE FILTERED: opens the mode with that whole pile already ticked, which
   * is the move `SelectButton`'s count is promising. Twenty taps become one,
   * and a player who came to the row only to narrow the grid is handed bulk
   * selection rather than having to go looking for it.
   *
   * `heldOpen` is cleared for `toggleSelecting`'s reason: a mode opened this
   * way is not about one card, so emptying the selection must not close it out
   * from under someone who is re-picking.
   */
  const startSelecting = useCallback(() => {
    if (bulk.busy) return;
    heldOpen.current = false;
    setBlockedNote(null);
    setSelecting(true);
    /* ARMED ONLY FROM A NARROWED GRID. Unfiltered, `addable` is the whole
       roster, and opening the mode with every card you own already ticked —
       including the ones you are playing on Sunday — is one press from a
       confirmation to sell them. A selection you have not narrowed is one you
       have not thought about, so the bare press opens an empty mode. */
    if (!filtered || addable.length === 0) return;
    setSelected((held) => {
      const next = new Set(held);
      for (const card of addable) next.add(card.id);
      return next;
    });
  }, [bulk.busy, filtered, addable]);

  /**
   * A player who owns nothing gets the packs sheet opened FOR them, once.
   *
   * The free Starter Pack is eight cards and a legal lineup — it is the whole
   * first session — and making it depend on noticing a button is how a new
   * account ends up staring at an empty grid. Owning zero cards is a sound
   * enough proxy for "the starter is unclaimed" to skip a query for it: the
   * pack deals eight, so nobody has opened it and has none.
   *
   * ONCE PER APP SESSION, and the flag is module-level rather than state for
   * exactly that reason. Closing the sheet puts you back on this screen, which
   * is still empty — so a re-runnable effect would push it straight back up and
   * the player could not get out. Deciding not to claim has to stick.
   */
  useEffect(() => {
    if (loading || error || all.length > 0 || starterOffered) return;
    starterOffered = true;
    router.push('/packs');
  }, [loading, error, all.length, router]);

  /* ---- navigation ------------------------------------------------------ *
   * A cell in this grid is a COPY you own, not a player, so it opens
   * `/card/<card_instance_id>` — the copy's own tier, what it has earned, the
   * weeks it started, and where it ranks against every other copy of him. The
   * footballer is one more tap from there, and is the same page for everyone.
   *
   * This used to resolve card_id -> player_id and open the player instead,
   * which threw away the one thing the tap actually identified: WHICH of your
   * copies was pressed. Someone holding three Caleb Williams cards got the same
   * screen from all three.
   *
   * `card.id` is the instance id and is always present, so unlike the old
   * player lookup there is nothing to wait on and no unpressable cell.        */
  const openCard = useCallback(
    (card: CollectionCard) => () =>
      router.push({ pathname: '/card/[id]', params: { id: card.id } }),
    [router],
  );

  // cardCount is the header's count and lands before the grid does, so it is
  // the right stand-in only until the rows themselves arrive.
  const total = cards?.length ?? cardCount;
  const context = filtered ? `${visible.length} of ${total} cards` : `${total} cards`;

  return (
    <Screen title="Inventory" context={context} scroll={false}>

      <View style={styles.fill} onLayout={(e) => rememberWidth(e.nativeEvent.layout.width)}>
        {loading ? (
          <View style={styles.centred}>
            <ActivityIndicator />
          </View>
        ) : error ? (
          <View style={styles.centred}>
            <Text style={[Type.section, { color: c.text }]}>Could not load your cards</Text>
            <Text style={[Type.body, styles.centredText, { color: c.textSecondary }]}>{error}</Text>
            <Pressable
              onPress={() => void onRefresh()}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.retry,
                { backgroundColor: c.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <Text style={[Type.strong, { color: c.text }]}>Try again</Text>
            </Pressable>
          </View>
        ) : all.length === 0 ? (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={[styles.emptyContent, { paddingBottom: Spacing.six + tabSpace }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            <EmptyCollection onGetCards={() => router.push('/packs')} />
          </ScrollView>
        ) : listWidth === 0 ? null : (
          <>
            {/* ONE ROW, AND IT IS EVERYTHING THAT USED TO BE FOUR.

                Left, what the collection is worth. Right, two round menus that
                narrow and order, one labelled button that changes what a tap
                DOES, and the cap at the end. Nothing on the information side
                has a border, so the controls are the only bordered objects on
                the row and the reader sorts it without a caption.

                WHAT IS NOT HERE ANY MORE: the tier counts, the CARDS total and
                the roster band. `Screen`'s context line already prints the
                total; `TierBreakdown` on the account screen draws the spread as
                a proportional bar with a legend, which is a better answer than
                four digits in a toolbar; and the band spent 41pt on two numbers
                that now cost 30 at the end of this row. Four bands became one.

                THE SELECT BUTTON IS THE POINT OF THE ROW. See `SelectButton`:
                the unlabelled square nobody found is now a word, and it picks
                up the filtered count so bulk selection is handed to a player
                who only came here to filter. */}
            <View style={styles.toolbar}>
              <CollectionValue sellValue={stats.sellValue} />
              <View style={styles.spacer} />
              <InventoryControls
                job={job}
                onJob={setJob}
                jobCounts={jobCounts}
                offersReady={offers.ready}
                position={position}
                onPosition={setPosition}
                positionCounts={positionCounts}
                tier={tier}
                onTier={setTier}
                tierTotal={forTierCounts.length}
                tierCounts={tierCounts}
                sort={sort}
                dir={dir}
                onSort={pressSort}
              />
              <SelectButton
                on={selecting}
                disabled={bulk.busy}
                onPress={selecting ? toggleSelecting : startSelecting}
              />
              {/* AFTER the button, at the row's end — see `RosterCount` for why
                  the margin between them is load-bearing. */}
              <RosterCount roster={roster} />
            </View>

            <FlatList
              // numColumns cannot change on a live list, so a width change that
              // changes the column count remounts it. Holding the first render
              // until the measurement lands avoids one guaranteed remount.
              key={`cols-${columns}`}
              style={styles.fill}
              data={visible}
              keyExtractor={(card) => card.id}
              numColumns={columns}
              columnWrapperStyle={styles.row}
              contentContainerStyle={[styles.list, { paddingBottom: LIST_TAIL + tabSpace }]}
              /* The roster line, drawn after one particular row. See `cut`. */
              ItemSeparatorComponent={cut}
              initialNumToRender={columns * 4}
              maxToRenderPerBatch={columns * 4}
              windowSize={7}
              removeClippedSubviews
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListHeaderComponent={
                /* TWO STATEMENTS, NEITHER OF THEM A CONTROL, which is exactly
                   why they are in here rather than pinned above with the
                   chips: the header of a list is the one place a fact about
                   the list is allowed to scroll away with it.

                   WHAT YOU OWN, THEN WHAT THE FILTERS LEFT. The strip is over
                   the WHOLE collection and never the current filter — see
                   `CollectionSummary` — and the line under it is the opposite,
                   the only thing on the page that belongs to the RESULT. Read
                   together they are "here is everything, and here is how much
                   of it you are looking at", which is the pair the old
                   arrangement split across a collapsing block.

                   NOTHING PRESSABLE IS IN HERE. Every control moved onto the
                   row above or into the sheet behind it, which is what stops
                   this header changing height as facets are opened and closed
                   — and what makes it safe to scroll: a `TextInput` here is
                   remounted on every keystroke, but a strip and a line are
                   not.

                   THE WRAPPER STAYS EVEN WHEN THE LINE DOES NOT. `ResultLine`
                   renders nothing while no filter is narrowing anything — the
                   count it printed then is the summary's CARDS cell — and the
                   8pt below is the gap before the first row of cards. Dropping
                   the wrapper with the line would close that gap and reopen it
                   the moment a chip was pressed. */
                <View>
                  {/* SITS ON THE GRID AND SCROLLS WITH IT. Pinned under the
                      toolbar it was a third band of chrome the eye had to pass
                      on every visit — and it is a STATEMENT, which this file's
                      own rule puts inside the list rather than above it.

                      Scrolling away is the right behaviour here even though the
                      state is urgent: you are over the cap for as long as it
                      takes to sell or commit, and the cards you would act on are
                      what you scrolled down to reach. A notice that follows you
                      down a grid you are fixing is nagging, not helping.

                      NOTHING UNTIL THE CAP IS BROKEN — `RosterAlert` renders
                      null under it, so this costs no height on an ordinary
                      visit. */}
                  <RosterAlert roster={roster} />
                  <View style={styles.header}>
                    <ResultLine shown={visible.length} total={all.length} />
                  </View>
                </View>
              }
              ListEmptyComponent={<EmptyFilterResult onClear={clearFilters} hasFilters={filtered} />}
              extraData={selecting ? cellState : null}
              renderItem={({ item }) => (
                <InventoryCard
                  card={item}
                  width={itemWidth}
                  selecting={selecting}
                  selected={selected.has(item.id)}
                  /* Only inside the mode. Outside it a starter is an ordinary
                     cell that opens its own profile. */
                  blocked={selecting && starters.has(item.id)}
                  onPress={selecting ? () => toggleCard(item.id) : openCard(item)}
                  onLongPress={holdCard(item.id)}
                />
              )}
            />

            {/* PINNED UNDER THE GRID, not pushed into it. The bar appears the
                moment the mode opens rather than on the first tick, so the grid
                does not reflow under a thumb that has just started picking —
                and it sits outside the FlatList because anything inside it
                scrolls away from the action it describes. */}
            {selecting ? (
              <BulkBar
                count={selected.size}
                max={SELECTION_MAX}
                sellCoins={selectedCoins}
                plan={bulk.plan}
                planning={bulk.planning}
                stage={bulk.stage}
                busy={bulk.busy}
                error={bulk.error}
                notice={blockedNote}
                result={bulk.result}
                onSell={bulk.askSell}
                onAdd={() => bulk.askAdd(selectedCards)}
                onConfirmSell={() => bulk.runSell(selectedCards)}
                onConfirmAdd={bulk.runAdd}
                onConfirmSellLeftovers={bulk.runSellLeftovers}
                onCancelStage={bulk.cancel}
                onClear={clearSelection}
                onDismissResult={bulk.dismissResult}
              />
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /* The same block as the Players boards' `filters`, down to the numbers: one
     gutter, one gap between the two controls, one gap before the list. Two
     screens with the same controls at different rhythms is what this was
     written to stop. */
  /* `Spacing.one + 2` below rather than `Spacing.two`: with every control at
     `ControlDiameter` the strip is 32pt tall, and 8pt under a 32pt strip made
     the band read as taller than the thing in it. */
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: GUTTER,
    paddingBottom: Spacing.one + 2,
  },
  /* The give in the row, and the ONLY give: the stats box shrinks into it
     before anything is pushed off. See `InventoryStats`. */
  spacer: { flex: 1, minWidth: 0 },
  /* `minWidth: 0` is load-bearing, and it is the trend board's note verbatim:
     without it the chips' ScrollView reports its full content width as its
     minimum and pushes the buttons off the row instead of scrolling inside what
     is left. */
  chips: { flex: 1, minWidth: 0 },
  list: { paddingHorizontal: GUTTER, paddingBottom: LIST_TAIL, gap: GAP },
  row: { gap: GAP },
  /* NO horizontal padding on the header boxes: they are inside the list, and
     the content container already carries the gutter. Adding it again is a
     double indent that only shows up once the strip is drawn against the cards
     under it — which was the whole point of moving it in. */
  headerStrip: { paddingBottom: Spacing.two },
  header: { paddingBottom: Spacing.two },
  emptyContent: { padding: GUTTER, paddingBottom: Spacing.six },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  centredText: { textAlign: 'center' },
  retry: { borderRadius: 8, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  pressed: { opacity: 0.75 },
});
