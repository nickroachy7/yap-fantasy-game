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
import { useCallback, useMemo, useState } from 'react';
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
  PositionFilterRow,
  ResultLine,
  TierFilterRow,
} from '@/components/collection/CollectionFilters';
import { CollectionSummary } from '@/components/collection/CollectionSummary';
import { EmptyCollection, EmptyFilterResult } from '@/components/collection/EmptyInventory';
import { InventoryCard } from '@/components/collection/InventoryCard';
import {
  SORT_OPTIONS,
  SortDefaultDir,
  countByPosition,
  countByTier,
  matchesAvailability,
  matchesPosition,
  matchesQuery,
  matchesTier,
  sortCards,
  summarise,
  type AvailabilityFilter,
  type CollectionCard,
  type PositionFilter,
  type SortDir,
  type SortKey,
  type TierFilter,
} from '@/components/collection/types';
import { useCollection } from '@/components/collection/use-collection';
import { ChipRow, FilterChips, type FilterChip } from '@/components/ui/Chip';
import { SearchField, SortChips } from '@/components/ui/Controls';
import { Screen } from '@/components/shell/Screen';
import { Colors, Spacing, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

const GUTTER = Spacing.three;
const GAP = Spacing.two + 4;
/** Below this the card's stat row starts wrapping, so it is the hard floor. */
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
  const [position, setPosition] = useState<PositionFilter>('ALL');
  const [tier, setTier] = useState<TierFilter>('ALL');
  const [availability, setAvailability] = useState<AvailabilityFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('fp');
  const [dir, setDir] = useState<SortDir>(SortDefaultDir.fp);

  /* Search, tiers and sort fold away behind the action bar; positions do not.
     Four permanent control rows plus the summary put the first card ~260pt down
     a phone screen, and the one facet people reach for every visit is position.
     The rest are a tap away and say so. */
  const [showSearch, setShowSearch] = useState(false);
  const [showTiers, setShowTiers] = useState(false);
  const [showSort, setShowSort] = useState(false);

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
  const forPositionCounts = useMemo(
    () => pool.filter((card) => matchesTier(card, tier)),
    [pool, tier],
  );
  const tierCounts = useMemo(() => countByTier(forTierCounts), [forTierCounts]);
  const positionCounts = useMemo(() => countByPosition(forPositionCounts), [forPositionCounts]);

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

  const facets = useMemo<FilterChip[]>(
    () => [
      // Search only appears above the size where scanning stops working — the
      // same threshold that used to gate the field itself.
      ...(searchable
        ? [
            {
              key: 'search',
              label: 'Search',
              active: showSearch || needle.length > 0,
              onPress: () => setShowSearch((v) => !v),
            },
          ]
        : []),
      {
        key: 'tiers',
        label: 'Tiers',
        active: showTiers || tier !== 'ALL',
        onPress: () => setShowTiers((v) => !v),
      },
      {
        key: 'available',
        label: 'Available',
        // Not a disclosure — this one IS the filter. Pressing it hides the
        // cards that are already in a lineup.
        active: availability === 'AVAILABLE',
        onPress: () => setAvailability((a) => (a === 'ALL' ? 'AVAILABLE' : 'ALL')),
      },
      { key: 'sort', label: 'Sort', active: showSort, onPress: () => setShowSort((v) => !v) },
    ],
    [searchable, showSearch, needle, showTiers, tier, availability, showSort],
  );

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
            <EmptyCollection onGetCards={() => router.push('/collection/shop')} />
          </ScrollView>
        ) : listWidth === 0 ? null : (
          <>
            {/* Pinned: what you are filtering by. Where you ARE is the section
                nav, which now sits above this whole navigator — see
                `SectionFrame`. The facets themselves — tiers, positions, sort —
                stay in the list's header, where they scroll away once you have
                stopped using them. The search FIELD cannot: a TextInput in a
                ListHeaderComponent is remounted on every keystroke and loses
                focus after one character, which is why it lives up here beside
                its chip. */}
            <View style={styles.toolbar}>
              <ChipRow>
                <FilterChips items={facets} />
              </ChipRow>
              {searchable && showSearch ? (
                <SearchField
                  value={query}
                  onChange={setQuery}
                  placeholder="Search name, team or position"
                  hint={`${total} OWNED`}
                  accessibilityLabel="Search your collection"
                  autoFocus
                />
              ) : null}
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
              contentContainerStyle={styles.list}
              initialNumToRender={columns * 4}
              maxToRenderPerBatch={columns * 4}
              windowSize={7}
              removeClippedSubviews
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListHeaderComponent={
                <View style={styles.header}>
                  <CollectionSummary stats={stats} />
                  {showTiers ? (
                    <TierFilterRow
                      value={tier}
                      onChange={setTier}
                      total={forTierCounts.length}
                      counts={tierCounts}
                    />
                  ) : null}
                  <PositionFilterRow
                    value={position}
                    onChange={setPosition}
                    total={forPositionCounts.length}
                    counts={positionCounts}
                  />
                  {showSort ? (
                    <SortChips options={SORT_OPTIONS} value={sort} dir={dir} onPress={pressSort} />
                  ) : null}
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
  /* The same block as the Players boards' `controls`, down to the numbers: one
     gutter, one gap between controls, one gap before the list. Two screens with
     the same controls at different rhythms is what this was written to stop. */
  toolbar: { paddingHorizontal: GUTTER, paddingBottom: Spacing.two, gap: Spacing.two },
  list: { paddingHorizontal: GUTTER, paddingBottom: Spacing.six, gap: GAP },
  row: { gap: GAP },
  header: { gap: Spacing.two, paddingBottom: Spacing.two },
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
