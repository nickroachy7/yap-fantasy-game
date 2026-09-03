/**
 * One of the five boards that are not points.
 *
 * It owns its own read rather than being handed rows, because the boards are
 * mutually exclusive on screen: only the selected one is mounted, so only the
 * selected one should be in flight. Fetching all five up front would cost five
 * round trips to render one table, and four of them would be thrown away by the
 * first tab press.
 *
 * The five parts, top to bottom. The first four are PINNED and only the rows
 * scroll — the list has no header component at all now:
 *
 *   1. The board bar, and this board's own filter beside it.
 *   2. A line saying what slate the rows are counted over and how many there
 *      are — see `BoardControls`, which also explains why the field size moved
 *      here from the panel that used to carry it.
 *   3. `BoardTop`: your own row in a frame. Always visible, so the answer to
 *      the only question the reader actually came with cannot scroll away.
 *   4. Its caption — where you stand, and what it would take to move up one.
 *   5. `BoardColumns`, then the rows.
 *
 * WHAT USED TO BE HERE AND IS NOT. A sentence per board explaining what it
 * ranked, inside the list, scrolling away after four rows. It was the only
 * reason the list had a header at all, and it answered a question the reader
 * has stopped asking by the time they can read it. The measure now sits against
 * each board's name in the PICKER — `BOARD_META.ranks` — and the columns are
 * labelled where they are drawn.
 *
 * Every board's empty state says WHICH empty it is. "No rows" is
 * indistinguishable from a broken query, and this screen has shipped looking
 * broken once already — see the note on the points board's own empty state.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/shell/useTabBarSpace';
import { POS_FILTERS, type PosFilter } from '@/components/cards/PositionFilter';
import { MenuButton, MenuHeading, MenuItem } from '@/components/ui/MenuButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { quietScrollbar } from '@/components/ui/scroll-strip';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { BoardControls } from './BoardControls';
import { useOpenManager } from '@/components/friends/use-open-manager';
import { BOARD_ROW_HEIGHT, BoardRow } from './BoardRow';
import { BoardTop, hasBoardTop } from './BoardTop';
import {
  BOARD_FORMAT,
  BOARD_META,
  buildBoard,
  fetchCommunityBoard,
  findMine,
  standingNote,
  type BoardId,
  type CommunityBoardId,
  type BoardRowModel,
  type CommunityData,
} from './community';
import { BoardColumns } from './BoardColumns';

export function CommunityBoard({
  id,
  season,
  seasonType,
  /** "Preseason 2026" — the slate these rows are counted over. */
  slateContext,
  meId,
  /** Pull-to-refresh should re-read the slate too — a week can roll over. */
  onRefreshSlate,
  board,
  onBoardChange,
}: {
  id: CommunityBoardId;
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
  const list = useRef<FlatList<BoardRowModel>>(null);
  /* Every name on every board opens the same sheet — see `useOpenManager`. */
  const openManager = useOpenManager();

  const [position, setPosition] = useState<PosFilter>('ALL');
  const [data, setData] = useState<CommunityData | null>(null);

  /* ONE CALL PER BOARD. It was two: the board, and `board_top_tiers` for the
     best tier each manager held, which led every row's detail line with a
     letter. That mark is gone — see `buildBoard` — and the round trip that fed
     it went with it. */
  const load = useCallback<Load>(
    async (live) => {
      const next = await fetchCommunityBoard(id, {
        season,
        seasonType,
        // Only the cards board has a position, and passing one anywhere else
        // would be an argument the RPC does not take.
        position: id === 'cards' && position !== 'ALL' ? position : null,
      });
      if (!live()) return;
      setData(next);
    },
    [id, season, seasonType, position],
  );

  const { loading, refreshing, error, reload, refresh } = useLoader(load);

  const meta = BOARD_META[id];

  // Rows are only ever rendered for the board that asked for them: a response
  // that lands after the reader has switched tabs is tagged with the board it
  // came from, and is simply not the board on screen.
  const fresh = data?.id === id ? data : null;

  const rows = useMemo(
    () => (fresh ? buildBoard(fresh, seasonType, { scheme }) : null),
    [fresh, seasonType, scheme],
  );
  const mine = useMemo(() => (rows ? findMine(rows, meId) : null), [rows, meId]);

  /**
   * Your own row, with what it would take to move one place written onto the
   * end of its detail line — see `standingNote`.
   *
   * A COPY of the row rather than an edit to it: the same object is also in the
   * list below, where the note would be a second sentence nobody asked for. The
   * only row that carries a target is the one that is yours.
   *
   * The gaps are read out of the ROWS by rank rather than by array index, for
   * the reason the whole module keeps repeating: rank is the database's answer
   * and a position in an array is a guess that currently agrees with it.
   */
  const mineWithNote = useMemo(() => {
    if (!mine || !rows) return mine;
    const format = BOARD_FORMAT[id];
    const gapTo = (rank: number): string | null => {
      const target = rows.find((r) => r.rank === rank);
      if (!target) return null;
      const gap = Math.abs(target.value - mine.value);
      return gap > 0 ? format(gap) : null;
    };
    const note = standingNote({
      rank: mine.rank,
      toNext: gapTo(mine.rank - 1),
      leadingBy: gapTo(2),
    });
    return note ? { ...mine, note } : mine;
  }, [mine, rows, id]);

  /* The pinned band scrolls the list to the reader's real row — see `BoardTop`.
     `getItemLayout` below is what lets it reach a row that has never been
     rendered; these boards have no expansion, so every row is exactly one
     `BOARD_ROW_HEIGHT` and the arithmetic is not an estimate. */
  const jumpToMine =
    mine && rows
      ? () => {
          const index = rows.indexOf(mine);
          if (index >= 0) list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
        }
      : undefined;

  if (loading) return <ActivityIndicator style={styles.centred} />;

  if (error) {
    return (
      <View style={styles.centred}>
        <EmptyState
          title={`Could not load the ${meta.label.toLowerCase()} board`}
          body={error}
          actionLabel="Try again"
          onAction={reload}
        />
      </View>
    );
  }

  const controls = (
    <BoardControls
      board={board}
      onBoardChange={onBoardChange}
      /* The slate, what this board ranks, and how many rows are under it — the
         same sentence the picker showed against this board's name, so choosing
         and arriving say the same thing. See `BOARD_META.description`. */
      context={[slateContext, meta.description, rows ? fieldHint(id, rows.length) : null]
        .filter(Boolean)
        .join(' · ')}>
      {/* This board's own control, where the points board puts its week button.

          A round menu rather than a second row of chips: the board strip beside
          it is already chips, and seven more of them on the same line would read
          as thirteen equal choices rather than as a board and a filter on it.
          The circle carries the current position, so it still says what it is
          filtered to. */}
      {id === 'cards' ? (
        <MenuButton text={position} label="Position" active={position !== 'ALL'}>
          {(close) => (
            <>
              <MenuHeading>Position</MenuHeading>
              {POS_FILTERS.map((p) => (
                <MenuItem
                  key={p}
                  label={p === 'ALL' ? 'All positions' : p}
                  selected={p === position}
                  onPress={() => {
                    setPosition(p);
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
            unit={meta.unit}
            absent={meta.absent}
            onJumpToMine={jumpToMine}
            /* On the cards board this row is your best COPY, not you. */
            label={id === 'cards' ? 'Your best card' : 'Your team'}
          />
        </View>
      ) : null}
      {/* Pinned with everything above it: a heading that scrolls away is a
          decoration on the first screenful. See `BoardColumns`. */}
      <BoardColumns section="Rankings" figureLabel={rows?.[0]?.figureLabel ?? ''} />
      <FlatList
        {...quietScrollbar}
        ref={list}
        data={rows ?? []}
        style={styles.fill}
        /* One height on every board now — see `BOARD_ROW_HEIGHT`. These boards
           have no expansion, so the arithmetic is exact rather than an
           estimate, which is what lets the pinned row jump to row four
           hundred. */
        getItemLayout={(_, index) => ({
          length: BOARD_ROW_HEIGHT,
          offset: BOARD_ROW_HEIGHT * index,
          index,
        })}
        // The signed-in reader's tint and the column set are both outside `rows`.
        extraData={meId}
        keyExtractor={(row) => row.key}
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
        ListEmptyComponent={
          <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Text style={[Type.section, { color: c.text }]}>{meta.emptyTitle}</Text>
            <Text style={[Type.bodyRelaxed, styles.emptyBody, { color: c.textSecondary }]}>
              {meta.emptyBody}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <BoardRow
            row={item}
            isMe={item.userId === meId}
            unit={meta.unit}
            onOpenProfile={() => openManager(item.userId, item.name)}
            /* On the cards board line 1 is the footballer and the manager ends
               line 2 — "Held by dmb" — so the link goes there. See `profileOn`. */
            profileOn={id === 'cards' ? 'note' : 'name'}
          />
        )}
      />
    </>
  );
}

/**
 * "12 ranked" — except on the cards board, where the rows are cards and calling
 * them ranked managers would be wrong by a factor of however many copies people
 * hold.
 */
function fieldHint(id: CommunityBoardId, rows: number): string {
  if (id === 'cards') return `${rows} ${rows === 1 ? 'card' : 'cards'}`;
  return `${rows} ranked`;
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
  centred: { flex: 1, justifyContent: 'center', padding: Spacing.four },
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
