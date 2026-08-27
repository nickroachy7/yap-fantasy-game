/**
 * One of the five boards that are not points.
 *
 * It owns its own read rather than being handed rows, because the boards are
 * mutually exclusive on screen: only the selected one is mounted, so only the
 * selected one should be in flight. Fetching all five up front would cost five
 * round trips to render one table, and four of them would be thrown away by the
 * first tab press.
 *
 * The four parts, top to bottom, are the same on every board. The first three
 * are PINNED and the last one scrolls:
 *
 *   1. The board strip, and this board's own filter beside it.
 *   2. A line saying what slate the rows are counted over and how many there
 *      are — see `BoardControls`, which also explains why the field size moved
 *      here from the panel that used to carry it.
 *   3. `BoardTop`: the leading three and your own row, in one frame. Always
 *      visible, so the answer to the only question the reader actually came
 *      with cannot scroll away — which is what it used to do.
 *   4. The table, under one line saying what this board ranks. Without that
 *      line "GEMS" and "RUNGS" are column headers with no referent and the
 *      reader has to infer the game's rules from four letters.
 *
 * Every board's empty state says WHICH empty it is. "No rows" is
 * indistinguishable from a broken query, and this screen has shipped looking
 * broken once already — see the note on the points board's own empty state.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { POS_FILTERS, type PosFilter } from '@/components/cards/PositionFilter';
import { MenuButton, MenuHeading, MenuItem } from '@/components/ui/MenuButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { BoardControls } from './BoardControls';
import { BOARD_ROW_HEIGHT, BoardRow } from './BoardRow';
import { BoardTop, hasBoardTop } from './BoardTop';
import {
  BOARD_META,
  buildBoard,
  fetchCommunityBoard,
  fetchTopTiers,
  findMine,
  type BoardId,
  type CommunityBoardId,
  type BoardRowModel,
  type CommunityData,
} from './community';
import type { CardTier } from '@/constants/theme';

/** Stable identity so the memo below does not recompute on every render. */
const NO_TIERS = new Map<string, CardTier>();

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
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const list = useRef<FlatList<BoardRowModel>>(null);

  const [position, setPosition] = useState<PosFilter>('ALL');
  const [data, setData] = useState<CommunityData | null>(null);
  const [topTiers, setTopTiers] = useState<Map<string, CardTier>>(NO_TIERS);

  const load = useCallback<Load>(
    async (live) => {
      // In parallel: the board, and the tier mark each manager's row wears.
      // The marks never fail the load — `fetchTopTiers` swallows its own error
      // — so a board still renders if only the decoration is missing.
      const [next, tiers] = await Promise.all([
        fetchCommunityBoard(id, {
          season,
          seasonType,
          // Only the cards board has a position, and passing one anywhere else
          // would be an argument the RPC does not take.
          position: id === 'cards' && position !== 'ALL' ? position : null,
        }),
        fetchTopTiers(),
      ]);
      if (!live()) return;
      setData(next);
      setTopTiers(tiers);
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
    () => (fresh ? buildBoard(fresh, seasonType, { scheme, topTiers }) : null),
    [fresh, seasonType, scheme, topTiers],
  );
  const mine = useMemo(() => (rows ? findMine(rows, meId) : null), [rows, meId]);

  /**
   * What the list holds, above the rows and nothing else.
   *
   * Everything that used to be in here — the podium, "Where you stand", the
   * "Standings" heading — is now pinned outside the list, so the ONE thing
   * left is the one thing that should scroll away: a sentence you read once
   * per board. It sits directly over the rows it describes, which is where a
   * caption belongs; without it "GEMS" and "RUNGS" are four letters with no
   * referent and the reader has to infer the game's rules from a column.
   */
  const header = (
    <View style={styles.head}>
      <Text style={[Type.bodyRelaxed, styles.blurb, { color: c.textSecondary }]}>{meta.blurb}</Text>
    </View>
  );

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
      /* The slate, then how many rows are under it. The old "Where you stand"
         panel carried the field size as its hint; it is a fact about the BOARD
         rather than about the reader, so it belongs on the board's own line. */
      context={rows ? `${slateContext} · ${fieldHint(id, rows.length)}` : slateContext}>
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
            mine={mine}
            meId={meId}
            unit={meta.unit}
            absent={meta.absent}
            onJumpToMine={jumpToMine}
          />
        </View>
      ) : null}
      <FlatList
        ref={list}
        data={rows ?? []}
        style={styles.fill}
        getItemLayout={(_, index) => ({
          length: BOARD_ROW_HEIGHT,
          offset: BOARD_ROW_HEIGHT * index,
          index,
        })}
        // The signed-in reader's tint and the column set are both outside `rows`.
        extraData={meId}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void onRefreshSlate();
              void refresh();
            }}
          />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Text style={[Type.section, { color: c.text }]}>{meta.emptyTitle}</Text>
            <Text style={[Type.bodyRelaxed, styles.emptyBody, { color: c.textSecondary }]}>
              {meta.emptyBody}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <BoardRow row={item} isMe={item.userId === meId} unit={meta.unit} />
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
