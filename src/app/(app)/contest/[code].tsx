/**
 * A contest, opened straight onto it.
 *
 * A DOOR, NOT A SCREEN — the page itself is `ContestView`, and this is the path
 * that opens the contests sheet with that view at the bottom of its stack. See
 * the header on `ContestSheet`.
 *
 * THE BOARD'S TAKEOVER IS WHY THIS ROUTE STILL EXISTS. `LineupEditor` opens a
 * contest from the card over your lineup, and what that reader wants is the
 * contest — not a lobby with the contest one tap further in. Seeded as the
 * bottom frame it draws no back row, because there is genuinely nothing under
 * it; the ✕ goes back to the board, which is where they came from.
 */
import { useLocalSearchParams } from 'expo-router';

import { ContestSheet } from '@/components/contests/ContestSheet';

export default function ContestRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  /**
   * THE LOBBY UNDERNEATH IT, so this is a subpage rather than a root.
   *
   * Opened from the board's carousel, this used to be the sheet's only frame:
   * no back button, and — because `dismissible` is `!nested` — a pull-down was
   * the only way out of it. The same contest reached from the lobby behaves the
   * opposite way, so one screen had two behaviours depending on which door you
   * came through, and the draggable one was the door with no back button on it.
   *
   * Opening with the lobby beneath gives it both halves of the rule every other
   * subpage follows: a `‹ Contests` row that goes somewhere useful, and a sheet
   * that stays where it is when a thumb drags across it. Popping back lands on
   * the lobby, which is where a reader looking for another contest was going
   * anyway.
   */
  return (
    <ContestSheet
      initial={[
        { view: 'lobby' },
        { view: 'contest', code: typeof code === 'string' ? code : '', backLabel: 'Contests' },
      ]}
    />
  );
}
