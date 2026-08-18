/**
 * Collection — what you own (Inventory) and what you are chasing (Sets).
 *
 * Inventory is virtualised from the first render: a collection has no upper
 * bound, so mapping over an array here would be a cliff rather than a slowdown.
 * Sets is deliberately an empty state — see SetsPanel for why.
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
  View,
  useWindowDimensions,
} from 'react-native';

import {
  PositionFilterRow,
  SortRow,
  TierFilterRow,
} from '@/components/collection/CollectionFilters';
import { EmptyCollection, EmptyFilterResult } from '@/components/collection/EmptyInventory';
import { InventoryCard } from '@/components/collection/InventoryCard';
import {
  countByPosition,
  countByTier,
  matchesPosition,
  matchesTier,
  sortCards,
  type CollectionCard,
  type PositionFilter,
  type SortKey,
  type TierFilter,
} from '@/components/collection/types';
import { useCollection } from '@/components/collection/use-collection';
import { Screen } from '@/components/shell/Screen';
import { SubNav } from '@/components/shell/SubNav';
import { COLLECTION_SEGMENTS } from '@/components/shell/sections';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryWeight } from '@/lib/injury';


const GUTTER = Spacing.three;
const GAP = Spacing.two + 4;
/** Below this the card's stat row starts wrapping, so it is the hard floor. */
const MIN_CARD_WIDTH = 156;
const MAX_COLUMNS = 4;

export default function InventoryScreen() {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { width } = useWindowDimensions();

  const { cards, playerIds, error, loading, refreshing, refresh } = useCollection();
  const { cardCount, refresh: refreshPlayer } = usePlayer();

  const [position, setPosition] = useState<PositionFilter>('ALL');
  const [tier, setTier] = useState<TierFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('fp');

  /* ---- grid geometry ------------------------------------------------- *
   * Screen caps its content at MaxContentWidth, so columns are derived
   * from the width the list actually gets, not the window. Cards are given
   * an exact width rather than flex: 1 so a short final row does not
   * stretch its cards wider than the rows above it.                       */
  const contentWidth = Math.min(width, MaxContentWidth) - GUTTER * 2;
  const columns = Math.max(
    2,
    Math.min(MAX_COLUMNS, Math.floor((contentWidth + GAP) / (MIN_CARD_WIDTH + GAP))),
  );
  const itemWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);

  /* ---- faceting ------------------------------------------------------ *
   * Each row's counts are computed with its OWN filter lifted, which is
   * what makes the numbers mean "how many would I get if I pressed this".  */
  const all = cards ?? [];
  const forTierCounts = useMemo(
    () => all.filter((card) => matchesPosition(card, position)),
    [all, position],
  );
  const forPositionCounts = useMemo(
    () => all.filter((card) => matchesTier(card, tier)),
    [all, tier],
  );
  const tierCounts = useMemo(() => countByTier(forTierCounts), [forTierCounts]);
  const positionCounts = useMemo(() => countByPosition(forPositionCounts), [forPositionCounts]);

  const visible = useMemo(
    () =>
      sortCards(
        all.filter((card) => matchesPosition(card, position) && matchesTier(card, tier)),
        sort,
      ),
    [all, position, tier, sort],
  );

  const unavailable = useMemo(
    () => all.filter((card) => injuryWeight(card.injuryStatus) === 'blocking').length,
    [all],
  );

  const filtered = position !== 'ALL' || tier !== 'ALL';
  const clearFilters = useCallback(() => {
    setPosition('ALL');
    setTier('ALL');
  }, []);

  const onRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshPlayer()]);
  }, [refresh, refreshPlayer]);

  /* ---- navigation ------------------------------------------------------ *
   * `my_collection` exposes card_id, not player_id, so the id is resolved
   * through the `cards` catalogue (see use-collection.ts). If that lookup
   * has not landed the card simply is not pressable — better than a tap
   * that navigates nowhere.                                                */
  const openPlayer = useCallback(
    (card: CollectionCard) => {
      const playerId = card.cardId ? playerIds.get(card.cardId) : undefined;
      if (!playerId) return undefined;

      return () => router.push({ pathname: '/player/[id]', params: { id: playerId } });
    },
    [playerIds, router],
  );

  const total = cards?.length ?? cardCount;
  const context =
    `${total.toLocaleString()} card${total === 1 ? '' : 's'}` +
    (unavailable > 0 ? ` · ${unavailable} unavailable` : '');

  return (
    <Screen context={context} scroll={false}>
      <SubNav segments={COLLECTION_SEGMENTS} />

      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <Text style={[styles.errorTitle, { color: c.text }]}>Could not load your cards</Text>
          <Text style={[styles.errorBody, { color: c.textSecondary }]}>{error}</Text>
          <Pressable
            onPress={() => void onRefresh()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.retry,
              { backgroundColor: c.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.retryLabel, { color: c.text }]}>Try again</Text>
          </Pressable>
        </View>
      ) : all.length === 0 ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.emptyContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <EmptyCollection onGetCards={() => router.push('/cards')} />
        </ScrollView>
      ) : (
        <FlatList
          // numColumns cannot change on a live list, so a width change that
          // changes the column count remounts it.
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <TierFilterRow
                value={tier}
                onChange={setTier}
                total={forTierCounts.length}
                counts={tierCounts}
              />
              <PositionFilterRow
                value={position}
                onChange={setPosition}
                total={forPositionCounts.length}
                counts={positionCounts}
              />
              <SortRow value={sort} onChange={setSort} />
            </View>
          }
          ListEmptyComponent={<EmptyFilterResult onClear={clearFilters} hasFilters={filtered} />}
          renderItem={({ item }) => (
            <InventoryCard card={item} width={itemWidth} onPress={openPlayer(item)} />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  subnav: { paddingHorizontal: GUTTER, paddingTop: Spacing.two + 2, paddingBottom: Spacing.two },
  list: { paddingHorizontal: GUTTER, paddingBottom: Spacing.six, gap: GAP },
  row: { gap: GAP },
  header: { gap: Spacing.two + 2, paddingBottom: Spacing.one },
  emptyContent: { padding: GUTTER, paddingBottom: Spacing.six },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  errorTitle: { fontSize: 18, fontWeight: '700' },
  errorBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retry: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  retryLabel: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
