/**
 * The player directory: a sortable, filterable table of every mintable player
 * in the current season.
 *
 * This is a research surface, not a feed — the job is to answer "who is the
 * fourth-best tight end" and "which rookie receivers have actually played"
 * before someone spends gems.
 *
 * It used to spend its whole budget on density: a nine-column table at 34pt a
 * row. That optimised the wrong thing. The columns that justified a table were
 * bio — college, age, years — and a phone dropped them anyway, leaving a name,
 * a club and two fantasy figures. The row is now twice as tall and carries the
 * five stats that actually decide a start, which is what the question was about
 * all along. See PlayerRow.
 *
 * Sorting moved with it. Column headers were the sort control, and a list with
 * no columns needs an explicit one — hence SortBar.
 *
 * ~1,000 rows, so the list is virtualised from day one rather than "later",
 * and the read is paged and count-checked rather than trusted.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { SectionNav } from '@/components/shell/SectionNav';
import { useTabBarInset } from '@/components/shell/useResponsive';
import { Chip, ChipRow, FilterChips, type FilterChip } from '@/components/ui/Chip';
import { SearchField, SortChips } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { PLAYER_ROW_HEIGHT, PlayerRow, ROW_GUTTER } from './PlayerRow';
import { useUpcomingFixtures } from './use-fixtures';
import {
  DEFAULT_SORT_DIR,
  POSITION_FILTERS,
  SORT_OPTIONS,
  filterAndSort,
  loadPlayerDirectory,
  positionCounts,
  type DirectoryFetch,
  type DirectoryPlayer,
  type PositionFilter,
  type SortKey,
  type SortState,
} from './player-directory';

export function PlayersPanel({
  onOpenPlayer,
  onLoaded,
}: {
  onOpenPlayer: (playerId: string) => void;
  /** Lets the screen title the tab without issuing the query a second time. */
  onLoaded?: (result: DirectoryFetch) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const tabInset = useTabBarInset();

  const [result, setResult] = useState<DirectoryFetch | null>(null);

  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<PositionFilter>('ALL');
  const [sort, setSort] = useState<SortState>({ key: 'fp', dir: 'desc' });

  /* Search and sort are folded away behind the action bar. They were both
     permanently on screen, which cost ~72pt above the first player on a phone
     for two controls most visits never touch — and the search field kept the
     keyboard one tap away from a list you scroll with your thumb. The position
     chips stay out, because narrowing to one position is the thing people
     actually do here. */
  const [showSearch, setShowSearch] = useState(false);
  const [showSort, setShowSort] = useState(false);

  /* The row is fluid at every width now — five equal stat cells and one
     flexible name — so nothing here needs to know how wide it is. */
  const fixtures = useUpcomingFixtures();

  const load = useCallback<Load>(
    async (live) => {
      try {
        const next = await loadPlayerDirectory();
        if (!live()) return;
        setResult(next);
        onLoaded?.(next);
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not load the player directory.';
      }
    },
    [onLoaded],
  );

  const { loading, refreshing, error, reload, refresh } = useLoader(load);

  const players = result?.players;
  const visible = useMemo(
    () => (players ? filterAndSort(players, { position, query, sort }) : []),
    [players, position, query, sort],
  );

  // Counts come from the unfiltered set so the tab labels stay put while you
  // type — a filter whose own count changes as you use it cannot be trusted.
  const counts = useMemo(() => (players ? positionCounts(players) : null), [players]);


  const open = useCallback((p: DirectoryPlayer) => onOpenPlayer(p.playerId), [onOpenPlayer]);

  const pressSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : // First press on a new column uses that column's natural direction
          // rather than inheriting the last one, so pressing FP after NAME
          // does not silently give you the worst players first.
          { key, dir: DEFAULT_SORT_DIR[key] },
    );
  }, []);

  const clearFilters = useCallback(() => {
    setQuery('');
    setPosition('ALL');
  }, []);

  const filtering = query.trim().length > 0 || position !== 'ALL';

  const facets = useMemo<FilterChip[]>(
    () => [
      {
        key: 'search',
        label: 'Search',
        // Active when the field is open OR when a query is narrowing the list
        // from behind a closed one — a filter you cannot see is the one that
        // most needs saying.
        active: showSearch || query.trim().length > 0,
        onPress: () => setShowSearch((v) => !v),
      },
      { key: 'sort', label: 'Sort', active: showSort, onPress: () => setShowSort((v) => !v) },
    ],
    [showSearch, showSort, query],
  );

  const renderItem = useCallback(
    ({ item }: { item: DirectoryPlayer }) => (
      <PlayerRow
        player={item}
        onPress={open}
        fixture={item.team ? fixtures.get(item.team.toUpperCase()) : undefined}
      />
    ),
    [open, fixtures],
  );

  return (
    <View style={styles.fill}>
      {/* Controls live OUTSIDE the FlatList. As a ListHeaderComponent the text
          input is remounted on every keystroke and loses focus. */}
      <View style={styles.controls}>
        <SectionNav section="/players" />

        {showSearch ? (
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search name, team or college"
            accessibilityLabel="Search players by name, team or college"
            autoFocus
          />
        ) : null}

        {/* One line: the position facets, then this page's own toggles behind
            a divider. Two chip rows would have been tidier to write and would
            have cost another 32pt above the first player. */}
        <ChipRow>
          {POSITION_FILTERS.map((p) => (
            <Chip
              key={p}
              selected={position === p}
              label={p === 'ALL' ? 'ALL' : p}
              count={counts ? counts[p] : undefined}
              onPress={() => setPosition(p)}
              accessibilityLabel={`${p === 'ALL' ? 'All positions' : p}${counts ? `, ${counts[p]} players` : ''}`}
            />
          ))}
          <FilterChips items={facets} divided />
        </ChipRow>

        {showSort ? (
          <SortChips options={SORT_OPTIONS} value={sort.key} dir={sort.dir} onPress={pressSort} />
        ) : null}

        {/* The count line always shows, open field or not: it is the answer to
            "am I looking at everything", and hiding it with the search box made
            a narrowed list look like the whole directory. */}
        {/* Same weight and colour as the collection's result line — they are
            the same sentence about two different lists. */}
        <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: c.textSecondary }]}>
          {result ? summarise(result, visible.length, filtering) : ' '}
        </Text>

        {result && !result.complete ? (
          <Text
            style={[
              Type.fine,
              styles.warning,
              { color: c.text, backgroundColor: c.backgroundSelected },
            ]}>
            {`Only ${result.players.length} of ${result.expected} players loaded. Pull to retry.`}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <EmptyState
          title="Could not load players"
          body={error}
          actionLabel="Try again"
          onAction={reload}
        />
      ) : (
        <>
          {visible.length === 0 ? (
            <EmptyState
              title={filtering ? 'No players match' : 'No players yet'}
              body={
                filtering
                  ? 'Try a different name, or widen the position filter.'
                  : 'The directory is empty for this season.'
              }
              actionLabel={filtering ? 'Clear filters' : undefined}
              onAction={filtering ? clearFilters : undefined}
            />
          ) : (
            <FlatList
              data={visible}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              // Every row is exactly PLAYER_ROW_HEIGHT tall, so the list can
              // skip measurement entirely — the single biggest win at this row
              // count.
              getItemLayout={getItemLayout}
              extraData={fixtures}
              initialNumToRender={24}
              maxToRenderPerBatch={24}
              windowSize={11}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              style={styles.fill}
              contentContainerStyle={{ paddingBottom: tabInset + Spacing.four }}
            />
          )}
        </>
      )}
    </View>
  );
}

const keyExtractor = (p: DirectoryPlayer) => p.cardId;

const getItemLayout = (_data: ArrayLike<DirectoryPlayer> | null | undefined, index: number) => ({
  length: PLAYER_ROW_HEIGHT,
  offset: PLAYER_ROW_HEIGHT * index,
  index,
});

/**
 * Doubles as the visible proof that the read was not silently truncated, which
 * is the one failure mode this data source has that looks like success.
 */
function summarise(result: DirectoryFetch, shown: number, filtering: boolean): string {
  const loaded = result.players.length;
  if (!result.complete) return `${loaded} of ${result.expected} loaded`;
  const base = filtering ? `${shown} of ${loaded}` : `${loaded} players`;
  // Bios are a separate read that is allowed to fail on its own; say so rather
  // than let two columns of em dashes read as missing data.
  return result.bios ? base : `${base} · no bios`;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /* Same block as the inventory's toolbar, down to the numbers: one gutter,
     one gap between controls, one gap before the list. Two screens with the
     same controls at different rhythms is the thing this pass was for. */
  controls: { paddingHorizontal: ROW_GUTTER, paddingBottom: Spacing.two, gap: Spacing.two },
  count: { flexShrink: 0 },
  warning: { padding: Spacing.two, borderRadius: 6, overflow: 'hidden' },
  headCell: { flexDirection: 'row', alignItems: 'center', gap: 1, flexShrink: 0 },
  headCellRight: { justifyContent: 'flex-end' },
  caret: { letterSpacing: 0 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  middle: { textAlign: 'center' },
  button: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderRadius: 8, marginTop: Spacing.two },
  right: { textAlign: 'right' },
  pressed: { opacity: 0.6 },
});
