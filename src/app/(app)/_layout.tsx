import { Redirect, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useIsWide } from '@/components/shell/useResponsive';
import { SheetCorner, SheetDetents } from '@/constants/theme';
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
             * Three presentations, because "a sheet" means three different
             * things on three platforms.
             *
             * iOS/Android get `formSheet`, which is the real thing: a native
             * sheet that rises from the bottom edge, rests at a detent, and is
             * dismissed by dragging down. The gesture is the platform's, not
             * ours, so it behaves exactly like every other sheet on the device.
             *
             * Web gets `transparentModal`, which renders the route OVER the
             * page without a card background of its own — the screen then draws
             * its own centred dialog and backdrop (see PlayerSheetFrame). A
             * full-width bar sliding up under a 1400pt browser window is a
             * phone gesture wearing a desktop's clothes, which is the same
             * reasoning SwapSheet already follows at the same breakpoint.
             *
             * A narrow BROWSER window still gets the web treatment rather than
             * formSheet: react-native-screens has no native sheet to hand there,
             * and `isWide` is what the rest of the app switches on.
             */
            presentation: Platform.OS === 'web' ? 'transparentModal' : 'formSheet',

            /* Two rests: a large one that shows the profile, and a smaller one
               to drag down to when you only wanted the name and the numbers at
               the top. Opening at the LARGER one (index 1) is deliberate — the
               profile is tabbed, and opening at a peek would mean every visit
               started with a drag. Android caps at three detents; we use two. */
            sheetAllowedDetents: SheetDetents,
            sheetInitialDetentIndex: 1,
            sheetGrabberVisible: true,
            sheetCornerRadius: SheetCorner,

            /* The tab bar and rail stay visible behind the sheet, which is the
               point: you can see where you will land when you flick it away. */
            sheetExpandsWhenScrolledToEdge: false,

            /* No card background on web — the screen paints its own dialog and
               dimmed backdrop, and a card here would show as a second panel
               behind it. Inert on native, where formSheet draws the surface. */
            contentStyle: isWide || Platform.OS === 'web' ? { backgroundColor: 'transparent' } : undefined,
            animation: Platform.OS === 'web' ? 'fade' : undefined,
          }}
        />
      </Stack>
    </PlayerProvider>
  );
}
