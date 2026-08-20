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
 * it does not appear in any URL, so `/lineup`, `/collection/sets` and
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

  /**
   * Sheet presentation, shared by BOTH profile routes.
   *
   * `/player/<player_id>` and `/card/<card_instance_id>` are two different
   * screens answering two different questions — the footballer, and the copy of
   * him you own — but they are the same KIND of object: something you glance at
   * over the app and put down again. Declaring the presentation once is what
   * stops them drifting into feeling like different surfaces.
   *
   * TWO PRESENTATIONS, because "a sheet" means different things on a phone and
   * in a browser.
   *
   * iOS/Android get `modal`, which on iPhone is UIKit's page sheet: **full
   * width**, rounded top, the page behind scaling back, and drag-down to
   * dismiss.
   *
   * It was `formSheet` first, for its resting detents. That was the wrong
   * trade. On iOS 26 a formSheet is INSET on iPhone — a margin down each side
   * through which the list underneath stays visible — and it is the
   * presentation style that does that, not our layout, so no width on any View
   * inside can close it. A sheet you can see the page around reads as a card
   * dropped on the screen rather than as the screen. Losing the 0.55 detent is
   * the price; it was a nice extra, and edge-to-edge is the thing that makes it
   * feel native.
   *
   * Web gets `transparentModal`, which renders the route OVER the page painting
   * nothing — the screen then draws its own surface (see PlayerSheetFrame): a
   * centred dialog at >=900, a bottom sheet below it. A full-width bar sliding
   * up under a 1400pt browser window is a phone gesture wearing a desktop's
   * clothes, the same reasoning SwapSheet already follows at the same
   * breakpoint.
   *
   * A narrow BROWSER window gets the web treatment rather than a native sheet,
   * because react-native-screens has none to hand there, and `isWide` is what
   * the rest of the app switches on.
   */
  const sheetOptions = {
    presentation: Platform.OS === 'web' ? 'transparentModal' : 'modal',
    /* No card background on web — the screen paints its own dialog and dimmed
       backdrop, and a card here would show as a second panel behind it. Inert
       on native, where the page sheet is the surface. */
    contentStyle:
      isWide || Platform.OS === 'web' ? { backgroundColor: 'transparent' } : undefined,
    animation: Platform.OS === 'web' ? 'fade' : undefined,
  } as const;

  return (
    <PlayerProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* The man, and the copy of him you own. Same surface, different
            questions — see the note on sheetOptions. */}
        <Stack.Screen name="player/[id]" options={sheetOptions} />
        <Stack.Screen name="card/[id]" options={sheetOptions} />
        {/* A set's checklist. Same presentation as the two profiles, because
            it is the same kind of object: something you open off a row, read,
            and put down again. */}
        <Stack.Screen name="set/[code]" options={sheetOptions} />
        {/* Packs. Same presentation again, and for the same reason: you open
            it, spend, and put it down. It replaced `collection/shop`, which
            was a whole sub-page for a shelf of two rows — see there. */}
        <Stack.Screen name="packs" options={sheetOptions} />
        {/* Search is a TAKEOVER, not a sheet: it covers the header and the tab
            bar as well as the page, which is the whole point of it and the
            reason it cannot live under `(tabs)`. `fullScreenModal` is the one
            presentation that leaves nothing of the app visible behind it; the
            profile routes above deliberately stop short of that, because a
            profile is something you glance at over the app and this is
            something you use instead of it. Web has no such presentation, so it
            takes the ordinary push, which covers the screen there anyway. */}
        <Stack.Screen
          name="search"
          options={{
            presentation: Platform.OS === 'web' ? undefined : 'fullScreenModal',
            /* NAMED, not left to the presentation's default, and that is what
               makes it quick.
               
               `fullScreenModal` already slides up from the bottom, so this is
               the same movement — but `animationDuration` is documented to
               apply ONLY to slide_from_bottom, fade_from_bottom, fade and
               simple_push. Against the `default` this was set to, the duration
               was silently ignored and the modal took iOS's own 500ms.
               
               ONE DURATION COVERS BOTH DIRECTIONS. react-native-screens has no
               way to give a screen a different animation coming than going —
               checked, not assumed — so 200 is picked to read as a pop on the
               way in and as barely anything on the way out. What actually made
               closing feel slow was never the animation: it was `replace`
               rebuilding a board from scratch. See `search.tsx`.
               
               iOS only, per the same docs. Android keeps its own duration for
               this animation, which is already close to this. */
            animation: Platform.OS === 'web' ? 'fade' : 'slide_from_bottom',
            animationDuration: 200,
          }}
        />
      </Stack>
    </PlayerProvider>
  );
}
