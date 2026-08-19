import { Redirect, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useIsWide } from '@/components/shell/useResponsive';
import { useAuth } from '@/context/AuthContext';
import { PlayerProvider } from '@/context/PlayerContext';

/**
 * The signed-in shell: a Stack whose only ordinary screen is the tab navigator.
 *
 * WHY A STACK SITS ABOVE THE TABS
 *
 * The player profile used to be a hidden sixth tab (`href: null`). That worked,
 * but it meant opening a player REPLACED the whole screen — the directory you
 * were scanning vanished, and coming back was a navigation rather than a
 * dismissal. A profile is a thing you glance at and put down again, so it is
 * now presented over the tabs instead of instead of them.
 *
 * A modal presentation needs a Stack; a Tabs navigator has no concept of one.
 * Hence this layer. The tabs moved into the `(tabs)` group, which is a GROUP —
 * it does not appear in any URL, so `/lineup`, `/collection/shop` and
 * `/player/<id>` are all exactly the paths they were before. Nothing that links
 * to them changed.
 *
 * `PlayerProvider` stays HERE rather than in `(tabs)`, because the sheet is a
 * sibling of the tabs and not a child: the profile reads the collection and the
 * wallet (selling a card refreshes both), and a provider inside `(tabs)` would
 * be outside the sheet's tree.
 */
export default function AppLayout() {
  const { session, initialising } = useAuth();
  const isWide = useIsWide();

  useEffect(() => {
    if (!initialising) void SplashScreen.hideAsync();
  }, [initialising]);

  // Hold rather than flash the login screen at an already-signed-in user.
  if (initialising) return null;
  if (!session) return <Redirect href="/login" />;

  return (
    <PlayerProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="player/[id]"
          options={{
            /**
             * Two presentations, because "a sheet" means different things on a
             * phone and in a browser.
             *
             * iOS/Android get `modal`, which on iPhone is UIKit's page sheet:
             * **full width**, rounded top, the page behind scaling back, and
             * drag-down to dismiss.
             *
             * It was `formSheet` first, for its resting detents. That was the
             * wrong trade. On iOS 26 a formSheet is INSET on iPhone — a margin
             * down each side through which the list underneath stays visible —
             * and it is the presentation style that does that, not our layout,
             * so no width on any View inside can close it. A sheet you can see
             * the page around reads as a card dropped on the screen rather than
             * as the screen. Losing the 0.55 detent is the price; it was a nice
             * extra, and edge-to-edge is the thing that makes it feel native.
             *
             * Web gets `transparentModal`, which renders the route OVER the
             * page painting nothing — the screen then draws its own surface
             * (see PlayerSheetFrame): a centred dialog at >=900, a bottom sheet
             * below it. A full-width bar sliding up under a 1400pt browser
             * window is a phone gesture wearing a desktop's clothes, the same
             * reasoning SwapSheet already follows at the same breakpoint.
             *
             * A narrow BROWSER window gets the web treatment rather than a
             * native sheet, because react-native-screens has none to hand
             * there, and `isWide` is what the rest of the app switches on.
             */
            presentation: Platform.OS === 'web' ? 'transparentModal' : 'modal',

            /* No card background on web — the screen paints its own dialog and
               dimmed backdrop, and a card here would show as a second panel
               behind it. Inert on native, where the page sheet is the surface. */
            contentStyle: isWide || Platform.OS === 'web' ? { backgroundColor: 'transparent' } : undefined,
            animation: Platform.OS === 'web' ? 'fade' : undefined,
          }}
        />
      </Stack>
    </PlayerProvider>
  );
}
