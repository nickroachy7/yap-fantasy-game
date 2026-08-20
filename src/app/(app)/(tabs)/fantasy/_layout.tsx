import { Stack } from 'expo-router';

import { FantasyFrame } from '@/components/shell/FantasyFrame';

/**
 * The fantasy game: four boards, and no landing page in front of them.
 *
 * THE STACK IS ONE SCREEN DEEP AND STAYS THERE. `FantasyTopNav` moves between
 * the boards with `replace`, so this navigator behaves like a second set of
 * tabs rather than like a history — which is exactly what it is standing in
 * for. Nothing here builds a back stack, so nothing has to unwind one.
 *
 * NO `unstable_settings` ANCHOR, deliberately. An anchor pins a route to the
 * bottom of the stack so a deep link has something beneath it, and it was here
 * while `/fantasy` was a hub. With the hub gone, an anchor would mount and
 * FETCH the lineup underneath every deep link into Collection or Players —
 * two round trips for a screen nobody asked for and nothing can navigate to.
 *
 * What is left is the default: `index` sorts first, so it is the route the tab
 * opens on and the route react-navigation resets to when you press the Fantasy
 * tab while already inside it. That file is a redirect to the lineup, which
 * makes both of those mean "take me to my lineup".
 *
 * `animation: 'none'` for the same reason every other navigator in this app
 * uses it: an animated `replace` plays a push transition for what the reader
 * experiences as a tab change.
 *
 * `FantasyFrame` supplies the masthead and the top nav, drawn once above this
 * navigator so neither moves when you flip between the four.
 */
export default function FantasyLayout() {
  return (
    <FantasyFrame>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </FantasyFrame>
  );
}
