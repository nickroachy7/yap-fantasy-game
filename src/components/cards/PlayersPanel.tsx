/**
 * Cards > Players: the scouting browser over `player_directory`.
 *
 * ~1,000 rows, so the list is virtualised from day one rather than "later",
 * and the read is paged and count-checked rather than trusted.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import { BottomTabInset, Colors, Spacing } from '@/constants/theme';
import { PLAYER_ROW_HEIGHT, PlayerRow } from './PlayerRow';
import {
  POSITION_FILTERS,
  filterAndSort,
  fetchPlayerDirectory,
  type DirectoryFetch,
  type DirectoryPlayer,
  type PositionFilter,
  type SortKey,
} from './player-directory';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'fp', label: 'Points' },
  { key: 'name', label: 'Name' },
];

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
  const [sort, setSort] = useState<SortKey>('fp');

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const next = await fetchPlayerDirectory();
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

  const open = useCallback((p: DirectoryPlayer) => onOpenPlayer(p.playerId), [onOpenPlayer]);

  const clearFilters = useCallback(() => {
    setQuery('');
    setPosition('ALL');
  }, []);

  const filtering = query.trim().length > 0 || position !== 'ALL';

  return (
    <View style={styles.fill}>
      {/* Controls live OUTSIDE the FlatList. As a ListHeaderComponent the text
          input is remounted on every keystroke and loses focus. */}
      <View style={styles.controls}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search players or teams"
          placeholderTextColor={c.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search players"
          style={[
            styles.search,
            { backgroundColor: c.backgroundElement, color: c.text, borderColor: c.backgroundSelected },
          ]}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chipRow}>
          {POSITION_FILTERS.map((p) => (
            <Chip
              key={p}
              label={p === 'ALL' ? 'All' : p}
              active={position === p}
              onPress={() => setPosition(p)}
            />
          ))}
        </ScrollView>

        <View style={styles.sortRow}>
          <Text numberOfLines={1} style={[styles.countLine, { color: c.textSecondary }]}>
            {result ? summarise(result, visible.length, filtering) : ' '}
          </Text>
          <View style={styles.sortChips}>
            {SORTS.map((s) => (
              <Chip key={s.key} label={s.label} active={sort === s.key} onPress={() => setSort(s.key)} />
            ))}
          </View>
        </View>

        {result && !result.complete ? (
          <Text style={[styles.warning, { color: c.text, backgroundColor: c.backgroundSelected }]}>
            {`Only ${result.players.length} of ${result.expected} players loaded. Pull to retry.`}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.centre}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>Could not load players</Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>{error}</Text>
          <Pressable
            onPress={() => void load('initial')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: c.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.buttonText, { color: c.text }]}>Try again</Text>
          </Pressable>
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.centre}>
          <Text style={[styles.emptyTitle, { color: c.text }]}>
            {filtering ? 'No players match' : 'No players yet'}
          </Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
            {filtering
              ? 'Try a different name, or widen the position filter.'
              : 'The directory is empty for this season.'}
          </Text>
          {filtering ? (
            <Pressable
              onPress={clearFilters}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: c.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.buttonText, { color: c.text }]}>Clear filters</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => <PlayerRow player={item} onPress={open} />}
          // Every row is exactly PLAYER_ROW_HEIGHT tall, so the list can skip
          // measurement entirely — the single biggest win at this row count.
          getItemLayout={getItemLayout}
          initialNumToRender={12}
          maxToRenderPerBatch={16}
          windowSize={11}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshing={refreshing}
          onRefresh={() => void load('refresh')}
          contentContainerStyle={styles.listContent}
        />
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

/** Doubles as the visible proof that the read was not silently truncated. */
function summarise(result: DirectoryFetch, shown: number, filtering: boolean): string {
  const loaded = result.players.length;
  if (!result.complete) return `${loaded} of ${result.expected} loaded`;
  if (filtering) return `${shown} of ${loaded} players`;
  return `${loaded} players`;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? c.backgroundSelected : c.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.chipText, { color: active ? c.text : c.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  controls: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.two },
  search: {
    height: 40,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
  },
  chipRow: { gap: Spacing.two, paddingRight: Spacing.three },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, minHeight: 30, justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  sortChips: { flexDirection: 'row', gap: Spacing.two, flexShrink: 0 },
  countLine: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  warning: { fontSize: 12, fontWeight: '600', padding: Spacing.two, borderRadius: 8, overflow: 'hidden' },
  listContent: { paddingBottom: BottomTabInset + Spacing.four },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  button: { paddingHorizontal: Spacing.four, paddingVertical: 10, borderRadius: 10, marginTop: Spacing.two },
  buttonText: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
