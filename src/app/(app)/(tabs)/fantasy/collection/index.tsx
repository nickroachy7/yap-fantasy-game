/**
 * Collection · Inventory — the cards you own.
 *
 * Virtualised from the first render: a collection has no upper bound, so
 * mapping over an array here would be a cliff rather than a slowdown.
 *
 * The screen is three bands: a search field that never scrolls away, a facet
 * block that does, and the grid. The split is not cosmetic — a TextInput used
 * as a ListHeaderComponent is remounted on every keystroke and loses focus
 * after one character, so the field has to live outside the list. The facets have no such constraint and
 * are worth ~120pt of screen once you have stopped using them.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { CollectionSummary } from '@/components/collection/CollectionSummary';
import { PacksButton } from '@/components/shell/PacksButton';
import { EmptyCollection, EmptyFilterResult } from '@/components/collection/EmptyInventory';
import { InventoryCard } from '@/components/collection/InventoryCard';
import {
  SortDefaultDir,
  countByTier,
  matchesAvailability,
  matchesPosition,
  matchesQuery,
  matchesTier,
  sortCards,
  summarise,
  type AvailabilityFilter,
  type CollectionCard,
  type SortDir,
  type SortKey,
  type TierFilter,
} from '@/components/collection/types';
import { useCollection } from '@/components/collection/use-collection';
import { PositionFilter, type PosFilter } from '@/components/cards/PositionFilter';
import { SearchField } from '@/components/ui/Controls';
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
  const { cardCount, refresh: refreshPlayer } = usePlayer();

  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<PosFilter>('ALL');
  const [tier, setTier] = useState<TierFilter>('ALL');
  const [availability, setAvailability] = useState<AvailabilityFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('fp');
  const [dir, setDir] = useState<SortDir>(SortDefaultDir.fp);

  /* ONE flag, where there were three. `showTiers` and `showSort` each revealed
     a row of chips, so the grid began at four different heights depending on
     which you had left open; both are menus now and cost nothing when shut.
     Search keeps its row, because a `TextInput` in a menu that closes on an
     outside press is a field you cannot tap beside. */
  const [showSearch, setShowSearch] = useState(false);

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
    () => all.filter((card) => matchesQuery(card, needle) && matchesAvailability(card, availability)),
    [all, needle, availability],
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
    position !== 'ALL' || tier !== 'ALL' || availability !== 'ALL' || needle.length > 0;

  const clearFilters = useCallback(() => {
    setPosition('ALL');
    setTier('ALL');
    setAvailability('ALL');
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
            {/* ONE ROW, and it is the Players boards' row: the shared position
                chips on the left, the page's own controls on the right. Both
                are filters over the same grid, and side by side they read as
                the two of them rather than as three bands of chrome before the
                first card. See `CollectionFilters`.

                The chips take the room that is left and SCROLL — `ChipRow` is a
                horizontal ScrollView — while the buttons keep their size at
                every width. Which is why the buttons are the side pinned and
                the chips are the side that gives: a round button cannot be
                narrowed, where chips you can push are merely narrower. Same
                reasoning, same numbers, as the trend board. */}
            {/* WHAT YOU OWN, ABOVE WHAT NARROWS IT. The summary is a statement
                about the whole collection and the row below it is the set of
                controls that cut the collection down, so it reads in that
                order: here is everything, now here is how to sieve it. It sat
                under the controls, inside the list, for as long as it was one
                more thing scrolling past the top of the grid.

                IT IS PINNED NOW, and that is the cost of the move rather than a
                bonus. Anything above the toolbar is outside the FlatList, so
                these ~50pt are spent on every screen of scrolling instead of
                being reclaimed after the first. It is affordable because the
                strip is ONE ROW at any cell count — see `CollectionSummary`,
                where equal columns are what guarantee it cannot grow a second —
                so the pinned block has a fixed height that no collection can
                change. If it ever gains a line, it goes back in the list. */}
            <View style={styles.summary}>
              <CollectionSummary stats={stats} action={<PacksButton />} />
            </View>

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
                availability={availability}
                onAvailability={setAvailability}
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
              contentContainerStyle={styles.list}
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
                  <ResultLine
                    shown={visible.length}
                    total={all.length}
                    // Counted over the whole collection, not the filtered pool:
                    // once they are hidden the pool contains none of them, and
                    // a chip that says "hide 0" cannot be pressed back off.
                    unavailable={stats.unavailable}
                    availability={availability}
                  />
                </View>
              }
              ListEmptyComponent={<EmptyFilterResult onClear={clearFilters} hasFilters={filtered} />}
              renderItem={({ item }) => (
                <InventoryCard
                  card={item}
                  width={itemWidth}
                  onPress={openCard(item)}
                />
              )}
            />
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
  list: { paddingHorizontal: GUTTER, paddingBottom: Spacing.six, gap: GAP },
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
