/**
 * The eight starting slots.
 *
 * Just the slots now. The eligible list used to expand in place underneath the
 * row you tapped, which pushed the rest of the lineup off a phone screen at the
 * moment you most needed to compare against it; it lives in `SwapSheet` and
 * this board's job is to say what the lineup currently is and to hand the tap
 * upward.
 *
 * Empty slots are rows, not gaps. A blank space reads as decoration; a row that
 * says "Choose a RB — 6 eligible" reads as work outstanding, which it is.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { StarterRow } from './StarterRow';
import { type LineupCard, type SlotConfig } from './model';

function SlotBoardImpl({
  slots,
  byId,
  picks,
  eligibleCounts,
  openSlot,
  locked,
  savedPoints,
  scored,
  onOpenSlot,
}: {
  slots: SlotConfig[];
  byId: Map<string, LineupCard>;
  picks: Record<string, string>;
  /** How many cards could start in each slot. Drawn on the empty rows. */
  eligibleCounts: Map<string, number>;
  /** The slot whose sheet is open, so its row stays visibly the subject. */
  openSlot: string | null;
  locked: boolean;
  /** Per-slot scored points, and whether the week has been swept at all. */
  savedPoints: Record<string, number | null>;
  scored: boolean;
  onOpenSlot: (slot: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={[styles.board, { backgroundColor: c.surface, borderColor: c.border }]}>
      {slots.map((cfg) => (
        <StarterRow
          key={cfg.slot}
          slot={cfg.slot}
          card={picks[cfg.slot] ? (byId.get(picks[cfg.slot]) ?? null) : null}
          points={savedPoints[cfg.slot] ?? null}
          scored={scored}
          selected={openSlot === cfg.slot}
          disabled={locked}
          eligibleCount={eligibleCounts.get(cfg.slot) ?? 0}
          eligiblePositions={cfg.eligible_positions.join('/')}
          onPress={locked ? undefined : () => onOpenSlot(cfg.slot)}
        />
      ))}
    </View>
  );
}

/**
 * Memoised because the lock countdown re-renders the screen once a second, and
 * without this every slot row is rebuilt on each tick. All of this component's
 * props are memoised or stable by construction, so the comparison actually
 * holds.
 */
export const SlotBoard = memo(SlotBoardImpl);

const styles = StyleSheet.create({
  board: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
});
