/**
 * Everything you own that is not starting, drawn by the same row as the slots
 * above it — so a bench player can be read against a starter without switching
 * units, densities or column orders.
 *
 * It sits directly beneath the starters rather than behind a tab. The tab pair
 * was hiding the comparison the screen exists to support: you cannot weigh a
 * bench receiver against the one starting if looking at either means the other
 * is gone.
 *
 * It used to be drawn by a compact table row inside a bordered
 * board. Both are gone. See `LineupRow` for why the row changed, and
 * `SlotBoard` for why the border did.
 */
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { BenchRow } from './LineupRow';
import { SortBar } from './SortBar';
import { type LineupCard, type SortKey } from './model';

function BenchBoardImpl({
  cards,
  targetSlotFor,
  startableFor,
  locked,
  sort,
  onSort,
  onOpen,
  onOpenProfile,
  offSeasonCount,
}: {
  cards: LineupCard[];
  /** The first EMPTY slot this player is legal for, or null when all are taken. */
  targetSlotFor: (card: LineupCard) => string | null;
  /** Whether any slot at all accepts him — a taken slot still counts. */
  startableFor: (card: LineupCard) => boolean;
  locked: boolean;
  sort: SortKey;
  onSort: (next: SortKey) => void;
  /** The badge opens the swap sheet for this card. */
  onOpen: (card: LineupCard) => void;
  /** Everything else opens the player. */
  onOpenProfile: (card: LineupCard) => void;
  /** Cards for a different season. `set_lineup` rejects them, so they are hidden. */
  offSeasonCount: number;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View>
      <SortBar value={sort} onChange={onSort} hint={`${cards.length} ON THE BENCH`} />
      {cards.length === 0 ? (
        <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>
          Every card you own is in the lineup.
        </Text>
      ) : (
        cards.map((card) => (
          <BenchRow
            key={card.id}
            card={card}
            destination={targetSlotFor(card)}
            disabled={locked || !startableFor(card)}
            onSwap={!locked && startableFor(card) ? () => onOpen(card) : undefined}
            onOpenProfile={card.playerId ? () => onOpenProfile(card) : undefined}
          />
        ))
      )}
      {offSeasonCount > 0 ? (
        <Text style={[Type.fine, styles.note, { color: c.textTertiary }]}>
          {offSeasonCount} card{offSeasonCount === 1 ? '' : 's'} from another season are not
          eligible this week and are hidden.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Memoised for the same reason as SlotBoard, and it matters more here: a large
 * collection puts hundreds of rows on the bench, and the lock countdown would
 * otherwise rebuild all of them every second.
 */
export const BenchBoard = memo(BenchBoardImpl);

const styles = StyleSheet.create({
  note: { paddingHorizontal: Spacing.two + 2, paddingTop: Spacing.two },
  empty: { padding: Spacing.three },
});
