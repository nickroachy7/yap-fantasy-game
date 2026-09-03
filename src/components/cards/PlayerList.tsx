/**
 * A list of directory players, drawn as `PlayerRow`s.
 *
 * Extracted when the Players section grew from two pages to three. Trend and
 * Leaders are both "here are fifty players in a particular order", and the only
 * thing that differs between them — and between either and the directory — is
 * WHICH fifty and what number they lead with. Everything else is identical:
 * the same row, the same fixed height, the same fixture lookup, the same
 * virtualisation settings, the same tab inset at the bottom.
 *
 * All three Players pages use this. It replaced a single combined directory
 * that carried its search field, sort strip and position chips in one scroll
 * container; see the note in `search.tsx` for why that split into three and
 * what had to be carried across.
 *
 * FIXED ROW HEIGHT IS THE WHOLE POINT of `getItemLayout`, and it is the reason
 * a screen may not conditionally hide part of a row. See `PlayerRow`.
 */
import type { ReactNode } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { useTabBarSpace } from '@/components/shell/useTabBarSpace';
import { quietScrollbar } from '@/components/ui/scroll-strip';
import { Spacing } from '@/constants/theme';

import { PLAYER_ROW_HEIGHT, PlayerRow, type RowFigure } from './PlayerRow';
import type { DirectoryPlayer } from './player-directory';

/**
 * THE LIST TAKES PLAYERS AND FUNCTIONS, NOT PRE-BUILT ROWS.
 *
 * It used to take a `ListedPlayer[]` — each entry a player plus the figure,
 * detail and strip already constructed — and the screen built that array in a
 * `useMemo` keyed on the sort. Which meant that changing the order rebuilt the
 * presentation of every player in the game: ~968 figure objects, ~968 JSX
 * elements, and ~968 `toLocaleString` calls, to draw the twelve rows that are
 * actually on screen.
 *
 * That was the lag on the sort menu. `Number.prototype.toLocaleString` is not
 * cheap on Hermes and a thousand of them is a visible pause, and it was being
 * paid on the main thread between the press and the menu closing. None of the
 * work was wrong; it was just being done 80× more often than anything looked
 * at it.
 *
 * So the callbacks are invoked in `renderItem` instead, where the virtualiser
 * has already decided which rows exist. Sorting a thousand players is now a
 * sort and nothing else — the presentation follows the viewport, which is the
 * whole point of having a virtualised list.
 *
 * THE ARRAY IS PLAIN `DirectoryPlayer[]`, straight out of `buildBoard`. Even
 * the one-field wrapper objects are gone: they were another thousand
 * allocations per keystroke to carry a number the row could ask for itself.
 */
export type PlayerListProps = {
  players: DirectoryPlayer[];
  /**
   * Where he ranks, for the column left of the portrait. `null` draws a dash
   * and keeps the column; omit the callback entirely for no column. See
   * `PlayerRow.rank`.
   */
  rankFor?: (player: DirectoryPlayer) => number | null;
  /** The right-hand figure. Omit for the row's own season points. */
  figureFor?: (player: DirectoryPlayer) => RowFigure;
  /** The row's third line. Omit for its three ranks. */
  renderDetail?: (player: DirectoryPlayer) => ReactNode;
  /** Team abbreviation -> "Sun 1:05p vs BUF". Absent while the schedule loads. */
  fixtureFor?: (team: string | null) => string | undefined;
  onOpen: (player: DirectoryPlayer) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function PlayerList({
  players,
  rankFor,
  figureFor,
  renderDetail,
  fixtureFor,
  onOpen,
  refreshing,
  onRefresh,
}: PlayerListProps) {
  const tabSpace = useTabBarSpace();

  return (
    <FlatList
      {...quietScrollbar}
      data={players}
      keyExtractor={keyExtractor}
      renderItem={({ item }) => (
        <PlayerRow
          player={item}
          rank={rankFor?.(item)}
          figure={figureFor?.(item)}
          detail={renderDetail?.(item)}
          onPress={onOpen}
          fixture={fixtureFor?.(item.team)}
        />
      )}
      // Every row is exactly PLAYER_ROW_HEIGHT tall, so the list can skip
      // measurement entirely.
      getItemLayout={getItemLayout}
      /* Twelve rows, not a thousand — but the same settings on every screen
         that draws this, because the whole reason they share a row component is
         that a reader should not be able to feel which list they are on. */
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={9}
      refreshing={refreshing}
      onRefresh={onRefresh}
      style={styles.fill}
      contentContainerStyle={[styles.list, { paddingBottom: Spacing.four + tabSpace }]}
    />
  );
}

const keyExtractor = (item: DirectoryPlayer) => item.cardId;

const getItemLayout = (_data: ArrayLike<DirectoryPlayer> | null | undefined, index: number) => ({
  length: PLAYER_ROW_HEIGHT,
  offset: PLAYER_ROW_HEIGHT * index,
  index,
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /* Clearance under the last row, and NOT a tab bar's worth of it: the scene
     already ends where the bar begins. See the inventory's `LIST_TAIL`. */
  list: { paddingBottom: Spacing.four },
});
