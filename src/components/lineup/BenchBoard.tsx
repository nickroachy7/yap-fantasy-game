/**
 * Everything you own that is not starting, in the same columns as the slots
 * above it, so a bench player can be read against a starter without switching
 * units or re-learning the layout.
 *
 * The leftmost column is the destination slot rather than a decoration: tapping
 * a bench row starts that player, and the row says up front exactly where he
 * would land. A tap that silently chose one of RB1/RB2/FLEX for you is how
 * people end up submitting a lineup they did not intend.
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
  locked,
  wide,
  sort,
  onSort,
  onPlace,
  offSeasonCount,
}: {
  cards: LineupCard[];
  /** Null when every slot this player is legal for is already taken. */
  targetSlotFor: (card: LineupCard) => string | null;
  locked: boolean;
  wide: boolean;
  sort: SortKey;
  onSort: (next: SortKey) => void;
  onPlace: (slot: string, cardId: string) => void;
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
            const canPlace = !locked && target !== null;
            return (
              <CardRow
                key={card.id}
                wide={wide}
                card={card}
                disabled={!canPlace}
                onPress={canPlace ? () => onPlace(target, card.id) : undefined}
                accessibilityLabel={
                  canPlace
                    ? `Start ${card.name} at ${target}. ${card.team ?? 'No team'} ${matchupLabel(card.game)}.`
                    : `${card.name} has no open slot. ${card.team ?? 'No team'} ${matchupLabel(card.game)}.`
                }
                lead={
                  <Text
                    numberOfLines={1}
                    style={[Type.micro, { color: target ? c.text : c.textTertiary }]}>
                    {target ?? 'FULL'}
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
