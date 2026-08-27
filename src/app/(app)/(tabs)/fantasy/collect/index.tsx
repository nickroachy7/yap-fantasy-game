/**
 * Collection · Inventory — the cards you own.
 *
 * Virtualised from the first render: a collection has no upper bound, so
 * mapping over an array here would be a cliff rather than a slowdown.
 *
 * NOTHING ABOVE THE GRID IS INSIDE THE GRID. The summary, the chips, the
 * controls and the search field are all siblings of the FlatList rather than
 * its header, and the search field is the one that had no choice: a TextInput
 * used as a `ListHeaderComponent` is remounted on every keystroke and loses
 * focus after one character. The rest followed it out so that a control could
 * not scroll away from the thing it controls.
 *
 * WHICH COST HEIGHT, so the top band of it collapses on a push up the page and
 * comes back at the top of the grid — see `CollapsingBlock`, and the note on
 * the block itself for the line between what may leave and what may not.
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
} from '@/components/collection/CollectionFilters';
import { BulkBar } from '@/components/collection/BulkBar';
import { SELECTION_MAX, sellTotal } from '@/components/collection/bulk';
import { CollectionSummary } from '@/components/collection/CollectionSummary';
import { RosterBar } from '@/components/collection/RosterBar';
import { useRoster } from '@/components/collection/use-roster';
import { useBulk } from '@/components/collection/use-bulk';
import { EmptyCollection, EmptyFilterResult } from '@/components/collection/EmptyInventory';
import { InventoryCard } from '@/components/collection/InventoryCard';
import {
  SortDefaultDir,
  countByTier,
  matchesPosition,
  matchesQuery,
  matchesTier,
  sortCards,
  summarise,
  type CollectionCard,
  type SortDir,
  type SortKey,
  type TierFilter,
} from '@/components/collection/types';
import { useCollection } from '@/components/collection/use-collection';
import { PositionFilter, type PosFilter } from '@/components/cards/PositionFilter';
import { SearchField } from '@/components/ui/Controls';
import { ToggleButton } from '@/components/ui/MenuButton';
import { CollapsingHeader, useChromeScroll } from '@/components/shell/collapse';
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
 * Clearance under the last row of cards, before the strip's own is added to it
 * — see the grid's `contentContainerStyle`.
 */
const LIST_TAIL = Spacing.six;
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
 * Below this a collection fits on a screen or two and the facets alone find
 * anything, so a search field is a permanent 40pt tax on the answer to a
 * question nobody has. A starter pack is 8 cards; this is roughly three packs.
 */
const SEARCH_FROM = 24;

/**
 * The last width this grid was laid out at, and the window width it was
 * measured under. Module scope on purpose: it has to outlive the screen, which
 * is unmounted every time you visit the Shop. See `listWidth`.
 */
let lastMeasured: { window: number; list: number } | null = null;

function measuredWidthFor(windowWidth: number): number {
  return lastMeasured && lastMeasured.window === windowWidth ? lastMeasured.list : 0;
}

export default function InventoryScreen() {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const chromeScroll = useChromeScroll();
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

  /**
   * How far the summary travels before it has gone — see `CollapsingHeader`.
   *
   * CEILED, NOT ROUNDED, and that is a bug fix rather than a preference. A
   * strip measuring 50.33 rounded to 50, so the travel stopped a third of a
   * point short and what stayed on screen was the strip's own 1.5pt bottom
   * border, clipped to a hairline above the chips. Rounding up can only
   * over-travel, and over-travelling by a fraction of a point is invisible —
   * the header simply parks that much higher.
   *
   * COMPARED BEFORE IT IS SET, because `onLayout` fires on every pass that
   * touches the box and a sub-pixel difference between two of them would be a
   * state change, a re-render and a rebuilt worklet for a distance nobody can
   * see. The strip is one fixed row, so in practice this settles once.
   */
  const [summaryHeight, setSummaryHeight] = useState(0);
  const rememberSummary = useCallback((height: number) => {
    const h = Math.ceil(height);
    if (h > 0) setSummaryHeight((prev) => (prev === h ? prev : h));
  }, []);


  const { cards, error, loading, refreshing, refresh } = useCollection();
  const { cardCount, refresh: refreshPlayer } = usePlayer();

  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<PosFilter>('ALL');
  const [tier, setTier] = useState<TierFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('fp');
  const [dir, setDir] = useState<SortDir>(SortDefaultDir.fp);

  /* ONE flag, where there were three. `showTiers` and `showSort` each revealed
     a row of chips, so the grid began at four different heights depending on
     which you had left open; both are menus now and cost nothing when shut.
     Search keeps its row, because a `TextInput` in a menu that closes on an
     outside press is a field you cannot tap beside. */
  const [showSearch, setShowSearch] = useState(false);

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
  // Re-read on focus rather than derived from `all`: the cap counts held cards
  // server-side, and this screen's list is the same set of rows only until a
  // commit or a sale on another screen moves one of them.
  const roster = useRoster();

  // Hiding the field must also drop whatever was typed into it, or a collection
  // that shrinks past the threshold filters itself by an invisible control.
  const searchable = all.length >= SEARCH_FROM;
  const needle = searchable ? query.trim().toLowerCase() : '';

  /* ---- faceting ------------------------------------------------------ *
   * Each row's counts are computed with its OWN filter lifted, which is what
   * makes the numbers mean "how many would I get if I pressed this". The
   * search and availability filters are NOT lifted: they narrow the pool that
   * every facet counts against, so typing a team name reflows the tier and
   * position counts to that team.                                          */
  const pool = useMemo(
    () => all.filter((card) => matchesQuery(card, needle)),
    [all, needle],
  );
  const forTierCounts = useMemo(
    () => pool.filter((card) => matchesPosition(card, position)),
    [pool, position],
  );
  const tierCounts = useMemo(() => countByTier(forTierCounts), [forTierCounts]);

  const visible = useMemo(
    () =>
      sortCards(
        pool.filter((card) => matchesPosition(card, position) && matchesTier(card, tier)),
        sort,
        dir,
      ),
    [pool, position, tier, sort, dir],
  );

  const filtered =
    position !== 'ALL' || tier !== 'ALL' || needle.length > 0;

  const clearFilters = useCallback(() => {
    setPosition('ALL');
    setTier('ALL');
    setQuery('');
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
     from under the selection simply is not in here any more. */
  const selectedCards = useMemo(
    () => all.filter((card) => selected.has(card.id)),
    [all, selected],
  );
  const selectedGems = useMemo(() => sellTotal(selectedCards), [selectedCards]);

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
    [selected],
  );

  /* Leaving the mode drops the selection with it. A set of ticks you cannot see
     is a set of ticks that will surprise somebody the next time the mode opens.
     Blocked mid-run: the ids are what the call in flight is about. */
  const toggleSelecting = useCallback(() => {
    if (bulk.busy) return;
    /* Pressed the button, so the mode is the button's however it was opened —
       an empty selection is a state it is allowed to sit in. See `heldOpen`. */
    heldOpen.current = false;
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
   */
  const holdCard = useCallback(
    (id: string) => () => {
      if (selecting || bulk.busy) return;
      heldOpen.current = true;
      setSelecting(true);
      setSelected(new Set([id]));
    },
    [selecting, bulk.busy],
  );

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
            contentContainerStyle={styles.emptyContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            <EmptyCollection onGetCards={() => router.push('/packs')} />
          </ScrollView>
        ) : listWidth === 0 ? null : (
          <>
            {/* THE STRIP AND THE GRID SLIDE AS ONE BLOCK, and only the strip
                clears the top of it — see `CollapsingHeader`. Scroll past the
                strip's own height and it goes; return to the top of the grid
                and it comes back.

                ONLY THE SUMMARY LEAVES, and it is the order that makes it so:
                the block travels exactly `summaryHeight`, so the chips and the
                controls under it land flush against the top of the page rather
                than following it off. */}
            <CollapsingHeader retract={summaryHeight}>
              <View>
                {/* WHAT YOU OWN, ABOVE WHAT NARROWS IT. The summary is a
                    statement about the whole collection and the row below it is
                    the set of controls that cut the collection down, so it
                    reads in that order: here is everything, now here is how to
                    sieve it.

                    IT IS THE PART THAT LEAVES, and the order is what makes it
                    so — the block travels exactly this box, which takes it off
                    the top and lands everything below it flush. It can go where
                    the controls cannot for the reason `CollapsingHeader` sets
                    out: it answers nothing you can ask it, so it is not a
                    control you just pressed.

                    MEASURED RATHER THAN ASSUMED. The strip is ONE ROW at any
                    cell count — see `CollectionSummary`, where equal columns
                    are what guarantee it cannot grow a second — but the roster
                    bar below it is conditional, and the travel is over the
                    summary alone, so the number has to come from the box that
                    actually leaves.

                    THE GAP UNDER THE SECTION BAR IS NOT IN IT: `Screen` puts
                    that padding on the box this block sits inside, so it stays
                    put and the chips end up the same 14pt under the nav whether
                    the strip is there or not. */}
                <View
                  style={styles.summary}
                  onLayout={(e) => rememberSummary(e.nativeEvent.layout.height)}>
                  <CollectionSummary stats={stats} />
                </View>

                {/* Only once it is actionable — and it does NOT collapse, being
                    below where the stack stops travelling. A cap warning that got out
                    of the way of the cards it is a warning about would be reading
                    the room backwards. See RosterBar's own header for where the
                    always-visible count lives instead. */}
                {roster && (roster.isNear || roster.isOver) ? (
                  <View style={styles.summary}>
                    <RosterBar roster={roster} />
                  </View>
                ) : null}

                {/* ONE ROW, and it is the Players boards' row: the shared
                    position chips on the left, the page's own controls on the
                    right. Both are filters over the same grid, and side by side
                    they read as the two of them rather than as three bands of
                    chrome before the first card. See `CollectionFilters`.

                    The chips take the room that is left and SCROLL — `ChipRow` is
                    a horizontal ScrollView — while the buttons keep their size at
                    every width. Which is why the buttons are the side pinned and
                    the chips are the side that gives: a round button cannot be
                    narrowed, where chips you can push are merely narrower. Same
                    reasoning, same numbers, as the trend board. */}
                <View style={styles.toolbar}>
                  <View style={styles.chips}>
                    <PositionFilter value={position} onChange={setPosition} />
                  </View>
                  <InventoryControls
                    searchable={searchable}
                    searchOpen={showSearch}
                    onToggleSearch={() => setShowSearch((v) => !v)}
                    searching={needle.length > 0}
                    tier={tier}
                    onTier={setTier}
                    tierTotal={forTierCounts.length}
                    tierCounts={tierCounts}
                    sort={sort}
                    dir={dir}
                    onSort={pressSort}
                  />
                  {/* LAST ON THE ROW, and it is the odd one out that earns the
                      end: everything to its left NARROWS what you are looking
                      at, where this changes what a tap on a card DOES. Sitting
                      among the filters it read as another one of them. It keeps
                      their language — a round `ToggleButton`, lit while the
                      mode is on — because it is still a control on their row.

                      A hold on any card opens the same mode with that card
                      already picked, which is the shortcut this button is the
                      long way round of. See `holdCard`. */}
                  <ToggleButton
                    icon="select"
                    label={selecting ? 'Stop selecting cards' : 'Select several cards'}
                    on={selecting}
                    onPress={toggleSelecting}
                  />
                </View>

                {/* Pinned OUTSIDE the list, and it has to be: a TextInput in a
                    `ListHeaderComponent` is remounted on every keystroke and loses
                    focus after one character. */}
                {searchable && showSearch ? (
                  <View style={styles.searchRow}>
                    <SearchField
                      value={query}
                      onChange={setQuery}
                      placeholder="Search name, team or position"
                      hint={`${total} OWNED`}
                      accessibilityLabel="Search your collection"
                      autoFocus
                    />
                  </View>
                ) : null}

              </View>

              <FlatList
                /* The grid is the page's scroll, so it is what decides whether
                   the strip above it is up or down. Everything else on the
                   screen holds still — the masthead, the board strip, the
                   section bar and every control on this page. See
                   `collapse.tsx`. */
                {...chromeScroll}
                // numColumns cannot change on a live list, so a width change that
                // changes the column count remounts it. Holding the first render
                // until the measurement lands avoids one guaranteed remount.
                key={`cols-${columns}`}
                style={styles.fill}
                data={visible}
                keyExtractor={(card) => card.id}
                numColumns={columns}
                columnWrapperStyle={styles.row}
                /* CLEARANCE FOR THE STRIP'S WORTH OF PAGE THAT HANGS BELOW THE
                   SCREEN while the strip is up — `CollapsingHeader`'s one cost.
                   At the END of the content, never the top: the strip is in flow
                   above the grid and supplies the gap over it itself. */
                contentContainerStyle={[
                  styles.list,
                  { paddingBottom: LIST_TAIL + summaryHeight },
                ]}
                initialNumToRender={columns * 4}
                maxToRenderPerBatch={columns * 4}
                windowSize={7}
                removeClippedSubviews
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListHeaderComponent={
                  /* One line, and it is the only thing here that belongs to the
                     RESULT rather than to the collection: what the controls above
                     did to the pool. The summary went up with them — it describes
                     what you own, which does not change when a chip is pressed.

                     Everything pressable moved either onto the row above or into
                     the sheet behind it, which is what stopped this header
                     changing height as facets were opened and closed.

                     THE WRAPPER STAYS EVEN WHEN THE LINE DOES NOT. `ResultLine`
                     renders nothing while no filter is narrowing anything — the
                     count it printed then is the summary's CARDS cell — and the
                     8pt below is the gap between the controls and the first row
                     of cards. Dropping the wrapper with the line would close that
                     gap and reopen it the moment a chip was pressed. */
                  <View style={styles.header}>
                    <ResultLine shown={visible.length} total={all.length} />
                  </View>
                }
                ListEmptyComponent={<EmptyFilterResult onClear={clearFilters} hasFilters={filtered} />}
                extraData={selecting ? selected : null}
                renderItem={({ item }) => (
                  <InventoryCard
                    card={item}
                    width={itemWidth}
                    selecting={selecting}
                    selected={selected.has(item.id)}
                    onPress={selecting ? () => toggleCard(item.id) : openCard(item)}
                    onLongPress={holdCard(item.id)}
                  />
                )}
              />
            </CollapsingHeader>

            {/* PINNED UNDER THE GRID, not pushed into it. The bar appears the
                moment the mode opens rather than on the first tick, so the grid
                does not reflow under a thumb that has just started picking —
                and it sits outside the FlatList for the same reason the summary
                does: anything inside it scrolls away from the action it
                describes. OUTSIDE THE COLLAPSING BLOCK, too, which is the
                stronger constraint: that block hangs a strip's height below the
                screen while the strip is up, and a bar that went with it would
                be pinned to an edge nobody can see. */}
            {selecting ? (
              <BulkBar
                count={selected.size}
                max={SELECTION_MAX}
                sellGems={selectedGems}
                plan={bulk.plan}
                planning={bulk.planning}
                stage={bulk.stage}
                busy={bulk.busy}
                error={bulk.error}
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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: GUTTER,
    paddingBottom: Spacing.two,
  },
  /* `minWidth: 0` is load-bearing, and it is the trend board's note verbatim:
     without it the chips' ScrollView reports its full content width as its
     minimum and pushes the buttons off the row instead of scrolling inside what
     is left. */
  chips: { flex: 1, minWidth: 0 },
  searchRow: { paddingHorizontal: GUTTER, paddingBottom: Spacing.two },
  /* `paddingBottom` is not here: it depends on a measurement — see the grid's
     `contentContainerStyle`. */
  list: { paddingHorizontal: GUTTER, gap: GAP },
  row: { gap: GAP },
  /* The gutter the list's own content padding used to give it, now that it
     sits outside the list. Same GUTTER as the toolbar below, so the strip's
     frame and the chips line up on one left edge. */
  summary: { paddingHorizontal: GUTTER, paddingBottom: Spacing.two },
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
