import { Stack } from 'expo-router';

import { SectionFrame } from '@/components/shell/SectionFrame';

/**
 * ONE PAGE UNDER A ROUND BUTTON.
 *
 * This used to hold Inventory, Sets and Shop as peers, with the frame drawing a
 * tray to switch between the first two. Sets is a section of its own now and
 * Collection simply IS the inventory, so the only child left is Packs — which
 * is `detached`, and therefore draws as the round button beside an empty tray
 * rather than as a cell in one. See `sections.ts`.
 *
 * The frame stays for that button, and for the reason it always existed: chrome
 * rendered above the navigator survives a navigation, so opening Packs and
 * closing it again does not rebuild the bar you pressed.
 */
export default function CollectionLayout() {
  return (
    <SectionFrame section="/fantasy/collection">
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
