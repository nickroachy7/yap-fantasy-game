import { Stack } from 'expo-router';

import { SectionFrame } from '@/components/shell/SectionFrame';

/**
 * The directory and the trend board are two views of one pool.
 *
 * A BOTTOM TAB NOW, not a board inside Fantasy — the pool of every player in
 * the league is not a view of your own team the way your lineup and your cards
 * are. Nothing about this layout changed with the move: the frame draws the
 * same bar over the same two pages, and `Screen` draws the masthead itself now
 * that there is no `FantasyFrame` above it claiming that job.
 *
 * The frame draws the header and the section nav ONCE, above this navigator, so
 * flipping between Trend and Leaders replaces only the board underneath — see
 * `SectionFrame`. `Screen` supplies each page's remaining chrome and knows not
 * to draw the header a second time.
 */
export default function PlayersLayout() {
  return (
    <SectionFrame section="/players" masthead>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
