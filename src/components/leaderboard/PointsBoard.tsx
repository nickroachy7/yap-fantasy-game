/**
 * The points board — who has scored the most fantasy points.
 *
 * This was the whole Leaderboard screen until the screen grew five more boards,
 * and it moved into a component unchanged in behaviour. It stays separate from
 * the other five rather than being folded in with them, because it is the only
 * one with a WEEK SCOPE, and everything below follows from that.
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
 *
 * The slate is a PROP rather than a read: every board on the screen needs the
 * same season and season type, and fetching `current_slate()` once per board
 * would have meant six calls for one answer, plus the chance of two boards
 * disagreeing about which week it is mid-rollover.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/shell/useTabBarSpace';
import { MenuButton, MenuHeading, MenuItem } from '@/components/ui/MenuButton';
import { DASH } from '@/components/ui/DataTable';
import { quietScrollbar } from '@/components/ui/scroll-strip';
import { Colors, Spacing, Type, type CardTier } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';
import { BoardControls } from './BoardControls';
import { useOpenManager } from '@/components/friends/use-open-manager';
import { BoardRow } from './BoardRow';
import { BoardTop, hasBoardTop } from './BoardTop';
import {
  BOARD_META,
  fetchTopTiers,
  withTopTier,
  type BoardId,
  type BoardRowModel,
} from './community';
import { WeekBreakdown } from './WeekBreakdown';
import {
  BOARD_LIMIT,
  buildStandings,
  fetchWeekBoards,
  normaliseEntries,
  slateLabel,
  weekShortLabel,
  weekTabLabel,
  type Entry,
  type Scope,
  type Standing,
  type Slate,
  type WeekBoards,
} from './board';

/** Stable identities so the memos below do not recompute on every render. */
const NO_WEEKS: WeekBoards = [];
const NO_TIERS = new Map<string, CardTier>();

export function PointsBoard({
  slate,
  season,
  seasonType,
  /** "Preseason 2026" — the slate these points were scored in. */
  slateContext,
  meId,
  onRefreshSlate,
  board,
  onBoardChange,
}: {
  /** Null when no slate is in play — the board says so rather than guessing. */
  slate: Slate | null;
  season: number;
  seasonType: number;
  slateContext: string;
  meId: string | null;
  onRefreshSlate: () => Promise<void>;
  /** Owned by the screen; drawn here — see `BoardControls`. */
  board: BoardId;
  onBoardChange: (next: BoardId) => void;
}) {
  const tabSpace = useTabBarSpace();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const [entries, setEntries] = useState<Entry[] | null>(null);
  /** Null means "not fetched yet", which is not the same as "no scored weeks". */
  const [weeks, setWeeks] = useState<WeekBoards | null>(null);
  const [scope, setScope] = useState('season');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** The tier mark each row wears — see `board_top_tiers`. */
  const [topTiers, setTopTiers] = useState<Map<string, CardTier>>(NO_TIERS);

  const loadedSlate = useRef<string | null>(null);
  const list = useRef<FlatList<BoardRowModel>>(null);
  const openManager = useOpenManager();

  // Loading is two-phase, so a slow pull-to-refresh can land after a fast one.
  // `live()` is the token that keeps the older response from winning.
  const load = useCallback<Load>(
    async (live) => {
      const boardRes = await supabase.rpc('leaderboard', {
        p_season: season,
        p_season_type: seasonType,
        p_week: undefined, // omitted -> SQL default null -> season to date
        p_limit: BOARD_LIMIT,
      });
      if (!live()) return;
      if (boardRes.error) return boardRes.error.message;

      setEntries(normaliseEntries(boardRes.data as Entry[] | null));

      // Discard the week detail only when the SLATE itself moved. A pull to
      // refresh should not blank every derived column for a round trip.
      const key = `${season}:${seasonType}`;
      if (loadedSlate.current !== key) {
        loadedSlate.current = key;
        setWeeks(null);
      }

      // Phase two, in parallel: the week boards that fill in the derived
      // columns, and the tier marks. Both are enrichment — neither can fail
      // the board, and `fetchTopTiers` swallows its own error to an empty map.
      const [boards, tiers] = await Promise.all([
        fetchWeekBoards(season, seasonType, slate?.week ?? 0),
        fetchTopTiers(),
      ]);
      if (!live()) return;
      setWeeks(boards);
      setTopTiers(tiers);
    },
    [season, seasonType, slate?.week],
  );

  const { refreshing, error, refresh } = useLoader(load);

  const boards = weeks ?? NO_WEEKS;
  /** False until the week boards land — the difference between "—" and "NEW". */
  const detailKnown = weeks !== null;

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
  const boardRows = useMemo(
    () => withTopTier(standingRows(rows, activeScope, seasonType, detailKnown), topTiers),
    [rows, activeScope, seasonType, detailKnown, topTiers],
  );
  /* The expansion needs the week lines, which are a property of the STANDING
     rather than of the row drawn from it. A map rather than a find, so opening
     a row near the bottom of a 500-entry board is not a scan. */
  const weeklyByUser = useMemo(
    () => new Map(rows.map((r) => [r.userId, r.weekly] as const)),
    [rows],
  );
  const fieldByWeek = useMemo(
    () => new Map(boards.map((b) => [b.week, b.entries.length] as const)),
    [boards],
  );
  const mine = useMemo(() => boardRows.find((r) => r.userId === meId) ?? null, [boardRows, meId]);

  /* The same control the Scores page picks a week with, for the same reason —
     see `DropdownChip`. It was an underlined strip, which made this the third
     lookalike navigation row on the page. */
  const scopeOptions = useMemo<{ value: string; label: string }[]>(
    () => [
      { value: 'season', label: 'Season' },
      // Newest first: the week you want is almost always the last one played.
      ...[...boards].reverse().map((b) => ({
        value: String(b.week),
        label: weekTabLabel(seasonType, b.week),
      })),
    ],
    [boards, seasonType],
  );

  /* Why they are not on the board, which is never "no reason". A lineup counts
     once its week has been played AND scored, so the sentence names the week
     they should be setting one for. */
  const absentReason =
    `You have no scored lineup for the ` +
    `${slate ? `${slateLabel(slate.season_type)} ${slate.season}`.toLowerCase() : 'season'} yet. ` +
    `A lineup counts once its week has been played and scored` +
    `${slate?.week ? `, so set one before Week ${slate.week} kicks off` : ''} and you will appear here.`;

  // Everything that changes a row's appearance without changing `boardRows`.
  const listExtra = useMemo(() => ({ expandedId, meId }), [expandedId, meId]);

  const meta = BOARD_META.points;

  /* THE SAME SKELETON AS EVERY OTHER BOARD, in the same order: the board strip
     and this board's own control, a line saying what the rows are counted over,
     the top three with your row under them, then the list under one sentence
     saying what it ranks. Only the last of those is inside the list — see
     `BoardTop` for why the rest is pinned.

     This board used to open on its week tabs with no heading at all — the only
     board that never said what it ranked — because its tabs and the other
     five's headings were built from two different lists. See `BOARD_IDS`. */
  const listHeader = (
    <View style={styles.head}>
      <Text style={[Type.bodyRelaxed, styles.blurb, { color: c.textSecondary }]}>{meta.blurb}</Text>
    </View>
  );

  /**
   * The scope, spelled out for the line under the chips.
   *
   * "Season to date" rather than the slate's own week, because those are two
   * different facts and printing the second where the first belongs is how a
   * reader ends up believing a week board is the whole season. When a week IS
   * picked, this says that week and the slate's current one is simply not what
   * the board is showing.
   */
  const scopeContext =
    activeScope === 'season' ? 'Season to date' : weekTabLabel(seasonType, activeScope);

  /* Jump to the reader's real row from the pinned band — see `BoardTop`.

     No `getItemLayout` on this board and there cannot be one: a points row
     expands into its week breakdown, so a row's height is not a constant. The
     failure handler is the price — `scrollToIndex` cannot reach an unrendered
     row without the arithmetic, so it lands on an estimate first and lets the
     list settle before asking again. */
  const jumpToMine = mine
    ? () => {
        const index = boardRows.indexOf(mine);
        if (index >= 0) list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      }
    : undefined;

  if (entries === null && !error) return <ActivityIndicator style={styles.centred} />;
  if (error) return <Text style={[Type.body, styles.centred, { color: c.negative }]}>{error}</Text>;

  const controls = (
    <BoardControls
      board={board}
      onBoardChange={onBoardChange}
      /* The slate, the slice of it on screen, and how many rows that slice
         holds. "Loading week detail…" while phase two is in flight, because
         the count is the one part of the line that changes when it lands. */
      context={`${slateContext} · ${scopeContext} · ${
        detailKnown ? `${rows.length} ranked` : 'loading week detail…'
      }`}>
      {/* A lone "Season" option is chrome, not a choice.

          The circle carries the VALUE — `SZN`, `W3` — rather than a glyph for
          the idea of a week, so the control says which slice you are on without
          a label beside it. */}
      {boards.length > 0 ? (
        <MenuButton
          text={activeScope === 'season' ? 'SZN' : weekShortLabel(seasonType, activeScope)}
          label="Week"
          active={activeScope !== 'season'}>
          {(close) => (
            <>
              <MenuHeading>Week</MenuHeading>
              {scopeOptions.map((o) => (
                <MenuItem
                  key={o.value}
                  label={o.label}
                  selected={
                    o.value === (activeScope === 'season' ? 'season' : String(activeScope))
                  }
                  onPress={() => {
                    setScope(o.value);
                    close();
                  }}
                />
              ))}
            </>
          )}
        </MenuButton>
      ) : null}
    </BoardControls>
  );

  return (
    <>
      {controls}
      {/* Pinned, not in the list header — the whole point of the change. See
          `BoardTop`. The wrapper is skipped rather than left empty when there
          is no frame to draw, so its gutter would otherwise be a gap above the
          empty state. */}
      {hasBoardTop(meId) ? (
        <View style={styles.top}>
          <BoardTop
            mine={mine}
            meId={meId}
            unit="points"
            absent={absentReason}
            onJumpToMine={jumpToMine}
          />
        </View>
      ) : null}
      <FlatList
        {...quietScrollbar}
        ref={list}
        data={boardRows}
        style={styles.fill}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          list.current?.scrollToOffset({ offset: index * averageItemLength, animated: true });
          setTimeout(
            () => list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }),
            120,
          );
        }}
        extraData={listExtra}
        keyExtractor={(r) => r.key}
        contentContainerStyle={[styles.list, { paddingBottom: Spacing.four + tabSpace }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void onRefreshSlate();
              void refresh();
            }}
          />
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<EmptyBoard slate={slate} />}
        renderItem={({ item }) => (
          <BoardRow
            row={item}
            isMe={item.userId === meId}
            unit="points"
            /* The row's own press is the week-by-week breakdown, so the profile
               is a link on the name — see `onOpenProfile`. */
            onOpenProfile={() => openManager(item.userId, item.name)}
            expanded={expandedId === item.userId}
            onToggle={() =>
              setExpandedId((current) => (current === item.userId ? null : item.userId))
            }
          >
            <WeekBreakdown
              weekly={weeklyByUser.get(item.userId) ?? []}
              seasonType={seasonType}
              fieldByWeek={fieldByWeek}
            />
          </BoardRow>
        )}
      />
    </>
  );
}

/** The distance to the top, or null when there is no meaningful gap to state. */
function gapNote(s: Standing, rows: Standing[], leader: number): string | undefined {
  if (rows.length < 2) return undefined;
  const gap = s.rank === 1 ? s.points - rows[1].points : leader - s.points;
  if (!(gap > 0)) return undefined;
  return s.rank === 1 ? `Leading by ${gap.toFixed(1)}` : `${gap.toFixed(1)} behind`;
}

/**
 * A standing, in the shape every other board's rows are already in.
 *
 * The points board kept its own row component while it was a column table,
 * because it needed three things no other board did — a movement mark, a
 * pressable row and a per-row expansion. Only the last two are still special,
 * and `BoardRow` takes both as props, so what is left is a mapping.
 *
 * WHAT GOES ON EACH LINE, AND WHY IT CHANGES WITH THE SCOPE. On the season
 * board the question behind a row is "how good are they" — an average and a
 * best week answer it. On a WEEK board the row is one Sunday, and the useful
 * context is the opposite: where that Sunday's performer sits over the season,
 * which is the column the table used to call SZN.
 *
 * Em dashes, not zeroes, until the week boards land: `detailKnown` is false for
 * a round trip after the season board renders, and an average of 0.0 is a claim
 * where a dash is an absence.
 */
export function standingRows(
  rows: Standing[],
  scope: Scope,
  seasonType: number,
  detailKnown: boolean,
): BoardRowModel[] {
  const oneDp = (n: number) => n.toFixed(1);
  /* The gap to the top, which is the leaderboard's version of the distance the
     lineup row prints at the end of its third line — `0/200 to Silver Tier`.
     A column of totals with no gaps marked on it is a list, not a race. */
  const leader = rows[0]?.points ?? 0;

  return rows.map((s) => {
    const avg = s.avg === null ? DASH : oneDp(s.avg);
    const best =
      s.best === null
        ? null
        : `${oneDp(s.best.points)} in ${weekTabLabel(seasonType, s.best.week)}`;

    return {
      key: s.userId,
      rank: s.rank,
      userId: s.userId,
      name: s.name,
      movement: { places: s.movement, known: detailKnown },
      // The occasion behind the total: on the season board the best week they
      // have posted, on a week board where that week's performer stands overall.
      secondary:
        scope === 'season'
          ? best
            ? `Best week ${best}`
            : 'No scored week yet'
          : `Season rank ${s.seasonRank ?? DASH}`,
      detail: [
        { key: 'avg', value: avg, unit: 'AVG' },
        {
          key: 'weeks',
          value: String(s.weeksPlayed),
          unit: s.weeksPlayed === 1 ? 'WEEK' : 'WEEKS',
        },
      ],
      // Guarded rather than trusted. `leaderboard()` ranks by points descending
      // so the gap is always positive — but a board whose rank and points ever
      // disagreed would print "Leading by -14.3", which is worse than silence.
      note: gapNote(s, rows, leader),
      figure: oneDp(s.points),
      figureLabel: 'PTS',
    };
  });
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
  head: {
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  /* The pinned frame's own gutter, matching the chips above it and the rows'
     content below it. */
  top: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  blurb: { maxWidth: 560 },
  fill: { flex: 1 },
  /* VERTICAL ONLY. The rows are bled to the edges of the page, exactly as the
     lineup board bleeds its cards, so the horizontal inset belongs to whatever
     is inside a row rather than to the list around it. Everything that is NOT
     a row — the heading, the blurb, the panels — takes the gutter back through
     `head` below. */
  /* Vertically tighter at the top than it was: the frame directly above
     already spaces the list off the chrome, so a third gap here read as a
     hole between the pinned block and the rows it belongs to. */
  /* `paddingBottom` is the whole tail now. It used to be overridden at the
     call site with a tab bar's height added on top, which reserved ~88pt for a
     bar the scene already sits above — see the inventory's `LIST_TAIL`. */
  list: { paddingTop: Spacing.one, paddingBottom: Spacing.four },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  empty: {
    gap: Spacing.one,
    padding: Spacing.three,
    /* The rows bleed; this does not. An empty state is a bordered card, and a
       card whose border runs off both edges of the screen is a band. */
    marginHorizontal: Spacing.three,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyBody: { maxWidth: 460 },
});
