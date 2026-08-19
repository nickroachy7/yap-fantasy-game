/**
 * The global board. One board, no leagues and no friend lists in the beta.
 *
 * The screen is built on one observation: `leaderboard()` takes a week, and
 * `lineups` is RLS-scoped to its owner, so a per-week RPC call is the ONLY way
 * a client can learn anything about anyone else's week. Paying for one call per
 * scored week turns four columns of nothing into average, best week, movement,
 * per-week rank and a week-by-week breakdown — with no new SQL.
 *
 * Loading is therefore two-phase. The season board renders as soon as it lands;
 * the week boards enrich it a moment later. Until they do, the derived columns
 * show an em dash rather than a wrong number, and movement shows unknown rather
 * than "new".
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import {
  BOARD_LIMIT,
  buildStandings,
  fetchWeekBoards,
  normaliseEntries,
  slateLabel,
  weekTabLabel,
  type Entry,
  type Scope,
  type Slate,
  type WeekBoards,
} from '@/components/leaderboard/board';
import { Podium } from '@/components/leaderboard/Podium';
import { StandingsHeader, StandingsRow, boardColumns } from '@/components/leaderboard/StandingsRow';
import { WeekBreakdown } from '@/components/leaderboard/WeekBreakdown';
import { YourStanding } from '@/components/leaderboard/YourStanding';
import { Screen } from '@/components/shell/Screen';
import { SectionNav } from '@/components/shell/SectionNav';
import { useIsWide, useTabBarInset } from '@/components/shell/useResponsive';
import { Panel } from '@/components/ui/Panel';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

// Fallback only — the live slate comes from current_slate().
const SEASON = 2026;

/** Stable identity so the memos below do not recompute on every render. */
const NO_WEEKS: WeekBoards = [];

export default function LeaderboardScreen() {
  const { session } = useAuth();
  const meId = session?.user.id ?? null;
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const isWide = useIsWide();
  const tabInset = useTabBarInset();

  const [slate, setSlate] = useState<Slate | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  /** Null means "not fetched yet", which is not the same as "no scored weeks". */
  const [weeks, setWeeks] = useState<WeekBoards | null>(null);
  const [scope, setScope] = useState('season');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadedSlate = useRef<string | null>(null);

  // Loading is two-phase, so a slow pull-to-refresh can land after a fast one.
  // `live()` is the token that keeps the older response from winning.
  const load = useCallback<Load>(async (live) => {
    // Follow whatever slate is actually being played. Hardcoding season_type 2
    // (regular season) made the board render empty for the whole preseason
    // validation window, which reads as "the leaderboard is broken".
    const slateRes = await supabase.rpc('current_slate');
    if (!live()) return;
    if (slateRes.error) return slateRes.error.message;
    const current = (slateRes.data as Slate[] | null)?.[0] ?? null;
    const season = current?.season ?? SEASON;
    const seasonType = current?.season_type ?? 2;

    const boardRes = await supabase.rpc('leaderboard', {
      p_season: season,
      p_season_type: seasonType,
      p_week: undefined, // omitted -> SQL default null -> season to date
      p_limit: BOARD_LIMIT,
    });
    if (!live()) return;
    if (boardRes.error) return boardRes.error.message;

    setSlate(current);
    setEntries(normaliseEntries(boardRes.data as Entry[] | null));

    // Discard the week detail only when the SLATE itself moved. A pull to
    // refresh should not blank every derived column for a round trip.
    const key = `${season}:${seasonType}`;
    if (loadedSlate.current !== key) {
      loadedSlate.current = key;
      setWeeks(null);
    }

    const boards = await fetchWeekBoards(season, seasonType, current?.week ?? 0);
    if (!live()) return;
    setWeeks(boards);
  }, []);

  const { refreshing, error, refresh } = useLoader(load);

  const seasonType = slate?.season_type ?? 2;
  const boards = weeks ?? NO_WEEKS;
  /** False until the week boards land — the difference between "—" and "NEW". */
  const detailKnown = weeks !== null;
  const latestWeek = boards.length > 0 ? boards[boards.length - 1].week : null;

  // Derived rather than corrected in state: a refresh that briefly empties the
  // week boards must not silently throw away the tab the user chose.
  const activeScope: Scope = useMemo(() => {
    if (scope === 'season') return 'season';
    const week = Number(scope);
    return boards.some((b) => b.week === week) ? week : 'season';
  }, [scope, boards]);

  const rows = useMemo(
    () => buildStandings(activeScope, entries ?? [], boards),
    [activeScope, entries, boards],
  );
  const columns = useMemo(
    () => boardColumns(activeScope, isWide, seasonType, latestWeek),
    [activeScope, isWide, seasonType, latestWeek],
  );
  const fieldByWeek = useMemo(
    () => new Map(boards.map((b) => [b.week, b.entries.length] as const)),
    [boards],
  );
  const me = useMemo(() => rows.find((r) => r.userId === meId) ?? null, [rows, meId]);

  const tabs = useMemo<Tab<string>[]>(
    () => [
      { value: 'season', label: 'Season', hint: entries ? String(entries.length) : undefined },
      // Newest first: the week you want is almost always the last one played.
      ...[...boards].reverse().map((b) => ({
        value: String(b.week),
        label: weekTabLabel(seasonType, b.week),
        hint: String(b.entries.length),
      })),
    ],
    [entries, boards, seasonType],
  );

  const scopeLabel =
    activeScope === 'season' ? 'Season to date' : weekTabLabel(seasonType, activeScope);

  const headerContext = [
    slate ? `${slateLabel(slate.season_type)} ${slate.season}` : `${SEASON} season`,
    slate?.week ? `Week ${slate.week}` : null,
    entries ? `${entries.length} ranked` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Everything that changes a row's appearance without changing `rows`.
  const listExtra = useMemo(
    () => ({ expandedId, columns, detailKnown, meId }),
    [expandedId, columns, detailKnown, meId],
  );

  const listHeader = (
    <View style={styles.head}>
      {/* One lone "Season" tab is chrome, not a choice. */}
      {boards.length > 0 ? (
        <Tabs
          tabs={tabs}
          value={activeScope === 'season' ? 'season' : String(activeScope)}
          onChange={setScope}
        />
      ) : null}

      <Podium rows={rows} meId={meId} detailKnown={detailKnown} />

      <YourStanding
        standing={me}
        field={rows.length}
        scopeLabel={scopeLabel}
        seasonType={seasonType}
        slateLabelText={slate ? `${slateLabel(slate.season_type)} ${slate.season}` : 'season'}
        weekLabelText={slate?.week ? `Week ${slate.week}` : null}
        detailKnown={detailKnown}
      />

      {rows.length > 0 ? (
        <Panel
          title="Standings"
          hint={detailKnown ? undefined : 'Loading week detail…'}
          inset={false}>
          <StandingsHeader columns={columns} />
        </Panel>
      ) : null}
    </View>
  );

  return (
    // scroll={false}: the FlatList below owns the scroll container, and nesting
    // a virtualised list inside a ScrollView defeats the virtualisation.
    <Screen title="Leaderboard" measure="table" context={headerContext} scroll={false}>
      <SectionNav section="/leaderboard" />
      {entries === null && !error ? (
        <ActivityIndicator style={styles.centred} />
      ) : error ? (
        <Text style={[Type.body, styles.centred, { color: c.negative }]}>{error}</Text>
      ) : (
        <FlatList
          data={rows}
          extraData={listExtra}
          keyExtractor={(r) => r.userId}
          contentContainerStyle={[styles.list, { paddingBottom: tabInset + Spacing.four }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
          ListHeaderComponent={listHeader}
          ListEmptyComponent={<EmptyBoard slate={slate} />}
          renderItem={({ item }) => (
            <StandingsRow
              standing={item}
              columns={columns}
              isMe={item.userId === meId}
              detailKnown={detailKnown}
              expanded={expandedId === item.userId}
              onToggle={() =>
                setExpandedId((current) => (current === item.userId ? null : item.userId))
              }>
              <WeekBreakdown
                weekly={item.weekly}
                seasonType={seasonType}
                fieldByWeek={fieldByWeek}
              />
            </StandingsRow>
          )}
        />
      )}
    </Screen>
  );
}

/**
 * An empty board is the NORMAL state through preseason, and it has two quite
 * different causes. Saying which one applies is the whole job here: "No scores
 * yet" on its own is indistinguishable from a broken query, and this screen has
 * already shipped looking broken once.
 */
function EmptyBoard({ slate }: { slate: Slate | null }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const body = slate
    ? `No lineup has been scored for the ${slateLabel(slate.season_type).toLowerCase()} ` +
      `${slate.season} yet. Scores land after a week's games finish, and Week ${slate.week} ` +
      `is the slate in play — so the board fills in as soon as it is scored.`
    : `No week has kicked off yet, so there is nothing to rank. The board opens with the first ` +
      `game of the season.`;

  return (
    <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.surface }]}>
      <Text style={[Type.section, { color: c.text }]}>Nothing scored yet</Text>
      <Text style={[Type.bodyRelaxed, styles.emptyBody, { color: c.textSecondary }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: 14, paddingBottom: Spacing.two },
  list: { padding: Spacing.three },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  empty: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyBody: { maxWidth: 460 },
});
