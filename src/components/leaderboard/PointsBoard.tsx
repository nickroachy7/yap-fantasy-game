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
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';
import { BoardControls } from './BoardControls';
import { useOpenManager } from '@/components/friends/use-open-manager';
import { BoardRow } from './BoardRow';
import { BoardTop, hasBoardTop } from './BoardTop';
import {
  BOARD_FORMAT,
  BOARD_META,
  standingNote,
  type BoardId,
  type BoardRowModel,
} from './community';
import { BoardColumns } from './BoardColumns';
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

/** A stable identity so the memos below do not recompute on every render. */
const NO_WEEKS: WeekBoards = [];

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

      // Phase two: the week boards that fill in the derived columns. Pure
      // enrichment — it cannot fail the board, which has already rendered.
      const boards = await fetchWeekBoards(season, seasonType, slate?.week ?? 0);
      if (!live()) return;
      setWeeks(boards);
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
    () => standingRows(rows, activeScope, seasonType, detailKnown),
    [rows, activeScope, seasonType, detailKnown],
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

  /* THE SAME SKELETON AS EVERY OTHER BOARD, in the same order: the board bar
     and this board's own control, a line saying what the rows are counted over,
     your own row with its caption, the column header, then the rows. ALL of it
     is pinned now — see `BoardColumns` for why the one thing that used to
     scroll, the blurb, is gone rather than moved. */

  /**
   * Your own row, with what it would take to move one place written onto the
   * end of its detail line — see `standingNote`.
   *
   * A COPY of the row rather than an edit to it: the same object is also in the
   * list below, where the note would be a second sentence nobody asked for.
   *
   * Guarded on `detailKnown` for the same reason every other derived number on
   * this board is: until the week boards land the ranks around yours are not
   * settled, and a target computed against them would be a wrong statement
   * where a missing one costs nothing.
   */
  const mineWithNote = (() => {
    if (!mine || !detailKnown) return mine;
    const note = standingNote({
      rank: mine.rank,
      toNext: gapTo(boardRows, mine.rank - 1, mine.value),
      leadingBy: gapTo(boardRows, 2, mine.value),
    });
    return note ? { ...mine, note } : mine;
  })();

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
      /* The slate, the slice of it on screen, what the board ranks, and how
         many rows that slice holds. The description is the same sentence the
         picker showed against this board's name — see `BOARD_META.description`.
         "Loading week detail…" while phase two is in flight, because the count
         is the one part of the line that changes when it lands. */
      context={[
        slateContext,
        scopeContext,
        BOARD_META.points.description,
        detailKnown ? `${rows.length} ranked` : 'loading week detail…',
      ].join(' · ')}>
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
            mine={mineWithNote}
            meId={meId}
            unit="fantasy points"
            absent={absentReason}
            onJumpToMine={jumpToMine}
            label="Your team"
          />
        </View>
      ) : null}
      {/* Pinned with everything above it: a heading that scrolls away is a
          decoration on the first screenful. See `BoardColumns`. */}
      <BoardColumns
        section="Rankings"
        figureLabel={activeScope === 'season' ? 'TFP' : 'PTS'}
      />
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
        ListEmptyComponent={<EmptyBoard slate={slate} />}
        renderItem={({ item }) => (
          <BoardRow
            row={item}
            isMe={item.userId === meId}
            unit="fantasy points"
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

/**
 * The distance from one row to the figure at a given rank, formatted.
 *
 * Reads the rank off the ROWS rather than trusting an index: `rank` is the
 * database's own answer and an array position is only ever a guess that agrees
 * with it — which is the same distinction `community.ts` makes about never
 * sorting on the client. Null when there is no such rank, which is the normal
 * case for `leadingBy` on a board of one.
 */
function gapTo(rows: BoardRowModel[], rank: number, mine: number): string | null {
  const target = rows.find((r) => r.rank === rank);
  if (!target) return null;
  const gap = Math.abs(target.value - mine);
  return gap > 0 ? BOARD_FORMAT.points(gap) : null;
}

/**
 * A standing, in the shape every other board's rows are already in.
 *
 * The points board kept its own row component while it was a column table,
 * because it needed three things no other board did — a movement mark, a
 * pressable row and a per-row expansion. Only the last two are still special,
 * and `BoardRow` takes both as props, so what is left is a mapping.
 *
 * WHAT GOES ON THE DETAIL LINE, AND WHY IT CHANGES WITH THE SCOPE — see the
 * note in the mapping below.
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

  return rows.map((s) => {
    const avg = s.avg === null ? DASH : oneDp(s.avg);
    return {
      key: s.userId,
      rank: s.rank,
      userId: s.userId,
      name: s.name,
      movement: { places: s.movement, known: detailKnown },
      /* ONE LINE, and what is on it still changes with the scope — that part of
         the old sentence was right. On the season board the question behind a
         row is "how good are they", which an average and a count of weeks
         answer. On a WEEK board the row is one Sunday, and the useful context
         is where that Sunday's performer sits over the season — the column the
         table used to call SZN.
   
         What went is `Best week 0.0 in Pre 3`. It is the BEST WEEK board's
         whole subject, restated on a board that ranks by season total. */
      detail: [
        { key: 'avg', value: avg, unit: 'AVG' },
        {
          key: 'weeks',
          value: String(s.weeksPlayed),
          unit: s.weeksPlayed === 1 ? 'WEEK' : 'WEEKS',
        },
        ...(scope === 'season'
          ? []
          : [{ key: 'szn', value: String(s.seasonRank ?? DASH), unit: 'SZN RANK' }]),
      ],
      // The `14.3 behind` that used to end this line is the BEHIND column now,
      // stated the same way it is on the other five boards — see `withBehind`.
      figure: oneDp(s.points),
      /* `TFP` on the season board because that is what the figure IS — every
         point scored, which is the abbreviation the lineup row and the card
         profile already use. On a WEEK board the same column holds one week's
         score, and calling that a career total would be wrong rather than
         short. */
      figureLabel: scope === 'season' ? 'TFP' : 'PTS',
      value: s.points,
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
  /* No horizontal padding: the row inside bleeds to the page edges exactly as
     the list's rows do, which is the property that lines their columns up. The
     heading and caption around it take the gutter back for themselves — see
     `BoardTop`. */
  top: { paddingBottom: Spacing.two },
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
