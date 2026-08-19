/**
 * Everything you own that is not starting, in the same columns as the slots
 * above it, so a bench player can be read against a starter without switching
 * units or re-learning the layout.
 *
 * It now sits directly beneath the starters rather than behind a tab. The tab
 * pair was hiding the comparison the screen exists to support: you cannot weigh
 * a bench receiver against the one starting if looking at either means the
 * other is gone. Two boards in one scroll costs a swipe and answers the
 * question.
 *
 * The leftmost column is the destination slot rather than a decoration: it says
 * up front where a tap would land this player. Where every slot he is legal for
 * is taken, it says SWAP instead of FULL, because the sheet a tap opens now
 * offers to replace whoever is in one — a tap used to be a dead end there.
 */
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { CardRow, CardRowHeader } from './CardRow';
import { SortBar } from './SortBar';
import { matchupLabel, type LineupCard, type SortKey } from './model';

function BenchBoardImpl({
  cards,
  targetSlotFor,
  startableFor,
  locked,
  wide,
  sort,
  onSort,
  onOpen,
  offSeasonCount,
}: {
  cards: LineupCard[];
  /** The first EMPTY slot this player is legal for, or null when all are taken. */
  targetSlotFor: (card: LineupCard) => string | null;
  /** Whether any slot at all accepts him — a taken slot still counts. */
  startableFor: (card: LineupCard) => boolean;
  locked: boolean;
  wide: boolean;
  sort: SortKey;
  onSort: (next: SortKey) => void;
  /** Opens the swap sheet for this card. */
  onOpen: (card: LineupCard) => void;
  /** Cards for a different season. `set_lineup` rejects them, so they are hidden. */
  offSeasonCount: number;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.wrap}>
      {offSeasonCount > 0 ? (
        <Text style={[Type.fine, styles.note, { color: c.textTertiary }]}>
          {offSeasonCount} card{offSeasonCount === 1 ? '' : 's'} from another season are not
          eligible this week and are hidden.
        </Text>
      ) : null}
      <View style={[styles.board, { backgroundColor: c.surface, borderColor: c.border }]}>
        <SortBar value={sort} onChange={onSort} hint={`${cards.length} ON THE BENCH`} />
        <CardRowHeader wide={wide} leadLabel="GOES TO" />
        {cards.length === 0 ? (
          <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>
            Every card you own is in the lineup.
          </Text>
        ) : (
          cards.map((card) => {
            const target = targetSlotFor(card);
            const startable = startableFor(card);
            return (
              <CardRow
                key={card.id}
                wide={wide}
                card={card}
                disabled={locked || !startable}
                onPress={!locked && startable ? () => onOpen(card) : undefined}
                accessibilityLabel={
                  startable
                    ? `${card.name}, ${card.team ?? 'no team'} ${matchupLabel(card.game)}. Tap to choose a slot.`
                    : `${card.name} cannot start in this lineup. ${card.team ?? 'No team'} ${matchupLabel(card.game)}.`
                }
                lead={
                  <Text
                    numberOfLines={1}
                    style={[Type.micro, { color: target ? c.text : c.textTertiary }]}>
                    {target ?? (startable ? 'SWAP' : '—')}
                  </Text>
                }
              />
            );
          })
        )}
      </View>
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
  wrap: { gap: Spacing.two },
  board: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  note: { paddingHorizontal: Spacing.one },
  empty: { padding: Spacing.three },
});
