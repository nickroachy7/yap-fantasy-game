/**
 * The Cards player directory: a sortable, filterable table of every mintable
 * player in the current season.
 *
 * This is a research surface, not a feed — the job is to answer "who is the
 * fourth-best tight end" and "which rookie receivers have actually played"
 * before someone spends gems, so the design spends its budget on rows visible
 * at once and on column headers you can sort by, not on chrome.
 *
 * ~1,000 rows, so the list is virtualised from day one rather than "later",
 * and the read is paged and count-checked rather than trusted.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';

import { Tabs, type Tab } from '@/components/ui/Tabs';
import { BottomTabInset, Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import {
  CELL_GAP,
  COL,
  COLLEGE_FLEX,
  NAME_FLEX,
  PLAYER_ROW_HEIGHT,
  PlayerRow,
  ROW_GUTTER,
  layoutFor,
  type RowLayout,
} from './PlayerRow';
import {
  DEFAULT_SORT_DIR,
  POSITION_FILTERS,
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

  const [result, setResult] = useState<DirectoryFetch | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<PositionFilter>('ALL');
  const [sort, setSort] = useState<SortState>({ key: 'fp', dir: 'desc' });

  /**
   * How many columns fit is a property of the TABLE, not the window: on wide
   * web the sidebar and the 940pt table measure between them take ~300pt off
   * the window before this component sees any of it, so measuring the window
   * would promote a 620pt table to the full layout and clip the last column.
   * The window is only the first guess, replaced on the first layout pass.
   */
  const { width: windowWidth } = useWindowDimensions();
  const [tableWidth, setTableWidth] = useState(windowWidth);
  const onTableLayout = useCallback((e: LayoutChangeEvent) => {
    setTableWidth(e.nativeEvent.layout.width);
  }, []);
  const layout = layoutFor(tableWidth);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const next = await loadPlayerDirectory();
        setResult(next);
        onLoaded?.(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the player directory.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [onLoaded],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const players = result?.players;
  const visible = useMemo(
    () => (players ? filterAndSort(players, { position, query, sort }) : []),
    [players, position, query, sort],
  );

  // Counts come from the unfiltered set so the tab labels stay put while you
  // type — a filter whose own count changes as you use it cannot be trusted.
  const counts = useMemo(() => (players ? positionCounts(players) : null), [players]);
  const tabs = useMemo<Tab<PositionFilter>[]>(
    () =>
      POSITION_FILTERS.map((p) => ({
        value: p,
        label: p === 'ALL' ? 'All' : p,
        hint: counts ? String(counts[p]) : undefined,
      })),
    [counts],
  );

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

  const renderItem = useCallback(
    ({ item, index }: { item: DirectoryPlayer; index: number }) => (
      <PlayerRow player={item} index={index} layout={layout} onPress={open} />
    ),
    [layout, open],
  );

  return (
    <View style={styles.fill} onLayout={onTableLayout}>
      {/* Controls live OUTSIDE the FlatList. As a ListHeaderComponent the text
          input is remounted on every keystroke and loses focus. */}
      <View style={styles.controls}>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, team or college"
            placeholderTextColor={c.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search players by name, team or college"
            style={[
              styles.search,
              Type.body,
              { backgroundColor: c.backgroundElement, color: c.text, borderColor: c.border },
            ]}
          />
          <Text numberOfLines={1} style={[Type.fine, NUMERIC, styles.count, { color: c.textTertiary }]}>
            {result ? summarise(result, visible.length, filtering) : ' '}
          </Text>
        </View>

        <Tabs tabs={tabs} value={position} onChange={setPosition} />

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
        <Empty
          title="Could not load players"
          body={error}
          actionLabel="Try again"
          onAction={() => void load('initial')}
        />
      ) : (
        <>
          <TableHead layout={layout} sort={sort} onSort={pressSort} />
          {visible.length === 0 ? (
            <Empty
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
              extraData={layout}
              initialNumToRender={24}
              maxToRenderPerBatch={24}
              windowSize={11}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
              style={styles.fill}
              contentContainerStyle={styles.listContent}
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

/**
 * The header row, and the only sort control on the screen.
 *
 * It mirrors the row's geometry from the same exported constants, so a column
 * width can only ever be changed in one place.
 *
 * RK is deliberately not sortable: it is position rank derived from FP, so it
 * has no ordering of its own that FP does not already give you, and a header
 * that silently duplicates its neighbour is worse than one that does nothing.
 */
function TableHead({
  layout,
  sort,
  onSort,
}: {
  layout: RowLayout;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const detailed = layout !== 'compact';
  const cell = { sort, onSort };

  return (
    <View style={[styles.head, { borderBottomColor: c.borderStrong }]}>
      <Text
        numberOfLines={1}
        style={[Type.micro, styles.right, { width: COL.rank, color: c.textTertiary }]}>
        RK
      </Text>
      <Head {...cell} label="POS" sortKey="pos" width={COL.pos} describe="position" />
      <Head {...cell} label="PLAYER" sortKey="name" grow={NAME_FLEX} describe="player name" />
      <Head {...cell} label="TM" sortKey="team" width={COL.team} describe="team" />
      {layout === 'full' ? (
        <Head {...cell} label="COLLEGE" sortKey="college" grow={COLLEGE_FLEX} describe="college" />
      ) : null}
      {detailed ? (
        <>
          <Head {...cell} label="YR" sortKey="exp" width={COL.exp} right describe="seasons played" />
          <Head {...cell} label="AGE" sortKey="age" width={COL.age} right describe="age" />
          <Head {...cell} label="G" sortKey="games" width={COL.games} right describe="games played" />
        </>
      ) : null}
      <Head {...cell} label="FP" sortKey="fp" width={COL.fp} right describe="season fantasy points" />
      <Head
        {...cell}
        label="FP/G"
        sortKey="fpg"
        width={COL.fpg}
        right
        describe="fantasy points per game"
      />
    </View>
  );
}

function Head({
  label,
  sortKey,
  sort,
  onSort,
  width,
  grow,
  right,
  describe,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  width?: number;
  grow?: number;
  right?: boolean;
  describe: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const active = sort.key === sortKey;
  const ascending = sort.dir === 'asc';

  return (
    <Pressable
      onPress={() => onSort(sortKey)}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={
        active
          ? `Sorted by ${describe}, ${ascending ? 'ascending' : 'descending'}. Reverses the order.`
          : `Sort by ${describe}`
      }
      style={({ pressed }) => [
        styles.headCell,
        right && styles.headCellRight,
        width !== undefined && { width },
        grow !== undefined && { flexGrow: grow, flexShrink: 1, flexBasis: 0, minWidth: 0 },
        pressed && styles.pressed,
      ]}>
      <Text
        numberOfLines={1}
        style={[Type.micro, { color: active ? c.text : c.textTertiary }]}>
        {label}
      </Text>
      {/* The caret only ever appears on one column, so the ~7pt it adds spills
          into the inter-column gap rather than needing width reserved on nine
          headers that will never use it. */}
      {active ? (
        <Text style={[Type.micro, styles.caret, { color: c.text }]}>{ascending ? '↑' : '↓'}</Text>
      ) : null}
    </Pressable>
  );
}

function Empty({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.centre}>
      <Text style={[Type.section, styles.middle, { color: c.text }]}>{title}</Text>
      <Text style={[Type.bodyRelaxed, styles.middle, { color: c.textSecondary }]}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: c.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <Text style={[Type.strong, { color: c.text }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  controls: { paddingHorizontal: ROW_GUTTER, paddingBottom: Spacing.two, gap: Spacing.two },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  search: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
  },
  count: { flexShrink: 0 },
  warning: { padding: Spacing.two, borderRadius: 6, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: CELL_GAP,
    height: 22,
    paddingHorizontal: ROW_GUTTER,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headCell: { flexDirection: 'row', alignItems: 'center', gap: 1, flexShrink: 0 },
  headCellRight: { justifyContent: 'flex-end' },
  caret: { letterSpacing: 0 },
  listContent: { paddingBottom: BottomTabInset + Spacing.four },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  middle: { textAlign: 'center' },
  button: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderRadius: 8, marginTop: Spacing.two },
  right: { textAlign: 'right' },
  pressed: { opacity: 0.6 },
});
