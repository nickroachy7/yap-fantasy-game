/**
 * The eight starting slots, and the picker that opens under the one you tapped.
 *
 * The picker expands in place rather than pushing you to another screen: the
 * comparison you are making is "is this bench player better than the one in the
 * slot", and a screen transition puts the incumbent out of sight at exactly the
 * moment you need him.
 *
 * Empty slots are rows, not gaps. A blank space reads as decoration; a row that
 * says "Choose a RB — 6 eligible" reads as work outstanding, which it is.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { CardRow } from './CardRow';
import { SortBar } from './SortBar';
import { StarterRow } from './StarterRow';
import { type LineupCard, type SlotConfig, type SortKey } from './model';

function SlotBoardImpl({
  slots,
  byId,
  picks,
  eligibleBySlot,
  openSlot,
  locked,
  savedPoints,
  scored,
  wide,
  sort,
  onSort,
  onToggleSlot,
  onPick,
  onClear,
}: {
  slots: SlotConfig[];
  byId: Map<string, LineupCard>;
  picks: Record<string, string>;
  /** Already filtered for position, season and cards used elsewhere. */
  eligibleBySlot: Map<string, LineupCard[]>;
  openSlot: string | null;
  locked: boolean;
  /** Per-slot scored points, and whether the week has been swept at all. */
  savedPoints: Record<string, number | null>;
  scored: boolean;
  wide: boolean;
  sort: SortKey;
  onSort: (next: SortKey) => void;
  onToggleSlot: (slot: string) => void;
  onPick: (slot: string, cardId: string) => void;
  onClear: (slot: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.board, { backgroundColor: c.surface, borderColor: c.border }]}>
      {slots.map((cfg) => {
        const pickedId = picks[cfg.slot];
        const card = pickedId ? byId.get(pickedId) : undefined;
        const isOpen = openSlot === cfg.slot;
        const eligible = eligibleBySlot.get(cfg.slot) ?? [];
        const positions = cfg.eligible_positions.join('/');

        return (
          <View key={cfg.slot}>
            <StarterRow
              slot={cfg.slot}
              card={card ?? null}
              points={savedPoints[cfg.slot] ?? null}
              scored={scored}
              selected={isOpen}
              disabled={locked}
              eligibleCount={eligible.length}
              eligiblePositions={positions}
              onPress={locked ? undefined : () => onToggleSlot(cfg.slot)}
            />

            {isOpen && !locked ? (
              <View style={[styles.picker, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
                <SortBar
                  value={sort}
                  onChange={onSort}
                  hint={`${eligible.length} ELIGIBLE FOR ${cfg.slot}`}
                />
                {pickedId ? (
                  <Pressable
                    onPress={() => onClear(cfg.slot)}
                    accessibilityRole="button"
                    accessibilityLabel={`Clear the ${cfg.slot} slot`}
                    style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
                    <Text style={[Type.fine, { color: c.negative }]}>Clear this slot</Text>
                  </Pressable>
                ) : null}
                {eligible.length === 0 ? (
                  <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>
                    Nothing in your collection can start at {cfg.slot}.
                  </Text>
                ) : (
                  eligible.map((card) => (
                    <CardRow
                      key={card.id}
                      wide={wide}
                      card={card}
                      selected={card.id === pickedId}
                      onPress={() => onPick(cfg.slot, card.id)}
                      accessibilityLabel={`Start ${card.name} at ${cfg.slot}`}
                      lead={
                        card.id === pickedId ? (
                          <Text style={[Type.micro, { color: c.positive }]}>IN</Text>
                        ) : null
                      }
                    />
                  ))
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Memoised because the lock countdown re-renders the screen once a second, and
 * without this every slot row and every open picker row is rebuilt on each
 * tick. All of this component's props are memoised or stable by construction,
 * so the comparison actually holds.
 */
export const SlotBoard = memo(SlotBoardImpl);

const styles = StyleSheet.create({
  board: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  picker: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  clear: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.one + 2 },
  empty: { padding: Spacing.three },
  pressed: { opacity: 0.6 },
});
