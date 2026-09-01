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
  return <ContestSheet initial={{ view: 'contest', code: typeof code === 'string' ? code : '' }} />;
}
