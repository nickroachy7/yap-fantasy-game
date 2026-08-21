/**
 * One of the five boards that are not points.
 *
 * It owns its own read rather than being handed rows, because the boards are
 * mutually exclusive on screen: only the selected one is mounted, so only the
 * selected one should be in flight. Fetching all five up front would cost five
 * round trips to render one table, and four of them would be thrown away by the
 * first tab press.
 *
 * The three parts, top to bottom, are the same on every board:
 *
 *   1. A title and one line saying what this board ranks and on what. Without
 *      it "GEMS" and "RUNGS" are column headers with no referent — the reader
 *      has to infer the game's rules from four letters.
 *   2. WHERE YOU STAND, always visible, so the answer to the only question the
 *      reader actually came with is above the fold rather than somewhere in a
 *      list of two hundred. It also has room the 34pt row does not, so the
 *      columns a phone drops are all readable here.
 *   3. The table.
 *
 * Every board's empty state says WHICH empty it is. "No rows" is
 * indistinguishable from a broken query, and this screen has shipped looking
 * broken once already — see the note on the points board's own empty state.
 */
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { POS_FILTERS, type PosFilter } from '@/components/cards/PositionFilter';
import { MenuButton, MenuHeading, MenuItem } from '@/components/ui/MenuButton';
import { useTabBarInset } from '@/components/shell/useResponsive';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { BoardControls } from './BoardControls';
import { BoardRow } from './BoardRow';
import { Podium } from './Podium';
import { YourRow } from './YourRow';
import {
  BOARD_META,
  buildBoard,
  fetchCommunityBoard,
  fetchTopTiers,
  findMine,
  type BoardId,
  type CommunityBoardId,
  type CommunityData,
} from './community';
import type { CardTier } from '@/constants/theme';

/** Stable identity so the memo below does not recompute on every render. */
const NO_TIERS = new Map<string, CardTier>();

export function CommunityBoard({
  id,
  season,
  seasonType,
  meId,
  /** Pull-to-refresh should re-read the slate too — a week can roll over. */
  onRefreshSlate,
  board,
  onBoardChange,
}: {
  id: CommunityBoardId;
  season: number;
  seasonType: number;
  meId: string | null;
  onRefreshSlate: () => Promise<void>;
  /** Owned by the screen; drawn here — see `BoardControls`. */
  board: BoardId;
  onBoardChange: (next: BoardId) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const tabInset = useTabBarInset();

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

  const header = (
    <View style={styles.head}>
      {/* The blurb alone. The heading that used to sit over it repeated the
          word already on the chip directly above, in a larger font. */}
      <Text style={[Type.bodyRelaxed, styles.blurb, { color: c.textSecondary }]}>{meta.blurb}</Text>

      <Podium rows={rows ?? []} meId={meId} />

      <YourRow
        row={mine}
        field={rows?.length ?? 0}
        absent={meta.absent}
        unit={meta.unit}
        title={id === 'cards' ? 'Your best card' : 'Where you stand'}
      />

      {/* Between the pinned row and the list, and load-bearing: the reader is
          in the list as well as pinned above it, so without a heading their
          row appears twice in succession and reads as a duplicate. */}
      {rows && rows.length > 0 ? (
        <Panel title="Standings" hint={fieldHint(id, rows.length)} />
      ) : null}
    </View>
  );

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
    <BoardControls board={board} onBoardChange={onBoardChange}>
      {/* This board's own control, where the points board puts its week button.

          A round menu rather than the Players section's chip row: the board bar
          beside it takes the width, and six pills cannot share a line with it.
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
      <FlatList
        data={rows ?? []}
        style={styles.fill}
        // The signed-in reader's tint and the column set are both outside `rows`.
        extraData={meId}
        keyExtractor={(row) => row.key}
        contentContainerStyle={[styles.list, { paddingBottom: tabInset + Spacing.four }]}
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
    gap: 14,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  intro: { gap: 2 },
  blurb: { maxWidth: 560 },
  fill: { flex: 1 },
  /* VERTICAL ONLY. The rows are bled to the edges of the page, exactly as the
     lineup board bleeds its cards, so the horizontal inset belongs to whatever
     is inside a row rather than to the list around it. Everything that is NOT
     a row — the heading, the blurb, the panels — takes the gutter back through
     `head` below. */
  list: { paddingVertical: Spacing.three },
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
