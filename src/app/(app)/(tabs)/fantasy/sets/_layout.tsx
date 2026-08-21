import { Stack } from 'expo-router';

import { SectionFrame } from '@/components/shell/SectionFrame';

/**
 * Sets, which was a sub-page of Collection and is now a board beside it.
 *
 * Same shape as Collection's layout and for the same reason: one page, and a
 * frame above it holding the Packs button. A set you are two cards short of is
 * the strongest argument the app ever makes for opening a pack, so the shop is
 * reachable from here as well as from the inventory — one sheet, two doors.
 */
export default function SetsLayout() {
  return (
    <SectionFrame section="/fantasy/sets">
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
