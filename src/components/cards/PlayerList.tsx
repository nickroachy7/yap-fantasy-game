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
import { FlatList, StyleSheet } from 'react-native';

import { useChromeScroll } from '@/components/shell/collapse';
import { useTabBarInset } from '@/components/shell/useResponsive';
import { Spacing } from '@/constants/theme';

import { PLAYER_ROW_HEIGHT, PlayerRow, type RowFigure } from './PlayerRow';
import type { DirectoryPlayer } from './player-directory';

export type ListedPlayer = {
  player: DirectoryPlayer;
  /** Overrides the row's right-hand number. Omit for season points. */
  figure?: RowFigure;
};

export function PlayerList({
  players,
  fixtureFor,
  onOpen,
  refreshing,
  onRefresh,
}: {
  players: ListedPlayer[];
  /** Team abbreviation -> "Sun 1:05p vs BUF". Absent while the schedule loads. */
  fixtureFor?: (team: string | null) => string | undefined;
  onOpen: (player: DirectoryPlayer) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const tabInset = useTabBarInset();
  /* Fifty rows under a bar naming three boards is the case the collapse was
     built for: the bar goes up as you read down and comes back the moment you
     pull the other way. See `collapse.tsx`. */
  const chromeScroll = useChromeScroll();

  return (
    <FlatList
      {...chromeScroll}
      data={players}
      keyExtractor={keyExtractor}
      renderItem={({ item }) => (
        <PlayerRow
          player={item.player}
          figure={item.figure}
          onPress={onOpen}
          fixture={fixtureFor?.(item.player.team)}
        />
      )}
      // Every row is exactly PLAYER_ROW_HEIGHT tall, so the list can skip
      // measurement entirely.
      getItemLayout={getItemLayout}
      /* Fifty rows, not a thousand — but the same settings, because the whole
         reason these screens share a row component is that a reader should not
         be able to feel which list they are on. */
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={9}
      refreshing={refreshing}
      onRefresh={onRefresh}
      style={styles.fill}
      contentContainerStyle={{ paddingBottom: tabInset + Spacing.four }}
    />
  );
}

const keyExtractor = (item: ListedPlayer) => item.player.cardId;

const getItemLayout = (_data: ArrayLike<ListedPlayer> | null | undefined, index: number) => ({
  length: PLAYER_ROW_HEIGHT,
  offset: PLAYER_ROW_HEIGHT * index,
  index,
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
