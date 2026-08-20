import { Stack } from 'expo-router';

import { SectionFrame } from '@/components/shell/SectionFrame';

/**
 * The directory and the trend board are two views of one pool.
 *
 * The frame draws the header and the section nav ONCE, above this navigator, so
 * flipping between Trend and Leaders replaces only the board underneath — see
 * `SectionFrame`. `Screen` supplies each page's remaining chrome and knows not
 * to draw the header a second time.
 */
export default function CardsLayout() {
  return (
    <SectionFrame section="/fantasy/players">
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
