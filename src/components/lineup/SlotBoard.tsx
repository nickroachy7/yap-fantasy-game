/**
 * The eight starting slots.
 *
 * Just the slots now. The eligible list used to expand in place underneath the
 * row you tapped, which pushed the rest of the lineup off a phone screen at the
 * moment you most needed to compare against it; it lives in `SwapSheet` and
 * this board's job is to say what the lineup currently is and to hand the tap
 * upward.
 *
 * No frame around it. The rows carry their own separation — see `LineupRow` —
 * and a rounded border on top of that was a box inside the page's own box,
 * insetting every name by another 12pt on the width where names were already
 * being cut.
 */
import { memo } from 'react';
import { View } from 'react-native';

import { StarterRow } from './LineupRow';
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
  onOpenProfile,
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
  /** The badge opens the swap sheet for this slot. */
  onOpenSlot: (slot: string) => void;
  /** Everything else opens the player. Never called for an empty slot. */
  onOpenProfile: (card: LineupCard) => void;
}) {
  return (
    <View>
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
          onSwap={locked ? undefined : () => onOpenSlot(cfg.slot)}
          onOpenProfile={(() => {
            const card = picks[cfg.slot] ? byId.get(picks[cfg.slot]) : undefined;
            return card?.playerId ? () => onOpenProfile(card) : undefined;
          })()}
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
