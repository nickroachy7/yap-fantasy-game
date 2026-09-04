import { Redirect, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useIsWide } from '@/components/shell/useResponsive';
import { useAuth } from '@/context/AuthContext';
import { PlayerProvider } from '@/context/PlayerContext';

/**
 * KEEP THE TABS UNDERNEATH A DEEP-LINKED SHEET.
 *
 * Every sheet in this Stack — the two profiles, the set checklist, packs — is
 * presented OVER the tabs, and that presentation assumes the tabs are there. On
 * a cold arrival they are not: loading /packs straight from a link or a
 * refreshed browser tab builds a stack whose only entry is the sheet, so there
 * is nothing behind it and nothing to dismiss to. The sheet floated over a void
 * and its close button did nothing at all.
 *
 * `anchor` is Expo Router's answer: the named route is kept in the background
 * as the stack's initial entry whenever a modal is presented into it, so the
 * app is always behind the sheet and `back()` is always a real dismissal.
 *
 * This is the FIX; the `canGoBack()` fallbacks in the sheets themselves are the
 * belt to its braces. Those were written first, and on their own they could not
 * work: with no anchor there was no screen to go back TO, and both `replace`
 * and `dismissTo` slid a page in underneath while leaving the sheet on top —
 * the inventory appeared behind the packs panel and the URL stayed at /packs.
 * The stack has to be right before dismissal has anything to mean.
 */
export const unstable_settings = {
  anchor: '(tabs)',
};

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
 * it does not appear in any URL, so `/lineup`, `/fantasy/collect/sets` and
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
        {/* A contest, opened off a lobby row: what it asks of you, what it
            costs, and the button that enters it. Same presentation as the set
            checklist above, and for the same reason — you open it, read it,
            act once, and put it down.

            THE LINEUP IS NOT IN HERE, deliberately. Filling one is not a
            sheet-sized task (a bench of twenty, per-slot swapping, locks,
            autosave) and `SwapSheet` is itself a bottom sheet under 900px, so
            editing in here would stack two of them on a phone. Entering
            dismisses onto that contest's card in the lineup carousel, which is
            the one editor. */}
        <Stack.Screen name="contest/[code]" options={sheetOptions} />
        {/* One entrant's lineup in one contest, opened off a row of the field.
            The same presentation again — a rival's team is exactly the kind of
            thing you glance at over the app and put down — and it is pushed
            OVER the contest sheet rather than replacing it, so closing lands
            you back on the row you tapped. Two stacked sheets is the same shape
            `pull` already takes over `packs`. */}
        <Stack.Screen name="entry/[contest]/[user]" options={sheetOptions} />
        {/* Another manager's account, opened off their name — a row of any of
            the six boards, your friends list, the directory. Same presentation
            as the two profiles above, because it is the same kind of object:
            something you glance at over the app and put down again.

            The param is a USER id, never a player id. Inside the contests sheet
            the same view is a FRAME rather than a route, so a manager opened
            off a contest's field does not stack a sheet on a sheet — see
            `ContestSheet`. This route is every door outside that sheet, plus
            deep links and a refreshed browser tab. */}
        <Stack.Screen name="manager/[id]" options={sheetOptions} />
        {/* Packs. Same presentation again, and for the same reason: you open
            it, spend, and put it down. It replaced `collection/shop`, which
            was a whole sub-page for a shelf of two rows — see there. */}
        <Stack.Screen name="packs" options={sheetOptions} />
        {/* Opening a pack, which is NOT a sheet and is the one route here that
            argues with the rule above.

            A sheet is something you glance at over the app and put down. A pack
            opening is five to fifty cards, a decision on each, and the most
            repeated moment in the game — it is not something you do over the
            app, it is the thing you are doing. In a sheet the card had to be
            capped at 264pt to leave room for a title, a hero and a paragraph
            describing it; here it takes the screen. See `pull.tsx`.

            So it takes SEARCH's presentation, not the profiles': a full-screen
            modal, which is the one that leaves nothing of the app visible
            behind it. It is pushed over `/packs` rather than replacing it, so
            the shelf is still mounted — it is what runs the `open_pack` loop
            and publishes each pack as it lands — and closing lands you back on
            the button you just pressed.

            The duration and its `slide_from_bottom` are load-bearing for the
            same documented reason as search: `animationDuration` applies only
            to a named set of animations, and against the default it is silently
            ignored in favour of iOS's own 500ms. 240 reads as a pack coming up
            to meet you. */}
        <Stack.Screen
          name="pull"
          options={{
            presentation: Platform.OS === 'web' ? undefined : 'fullScreenModal',
            animation: Platform.OS === 'web' ? 'fade' : 'slide_from_bottom',
            animationDuration: 240,
          }}
        />
        {/* The contest lobby, which was a page beside the lineup under a
            two-item bar. It is the same kind of object as the three above —
            open it, enter something, put it down — and the bar it cost was two
            thirds of the chrome on the game's main screen. Reached from the
            last card of the lineup carousel; see `CONTESTS` in `sections.ts`. */}
        {/* The lobby, which is also the archive: `contests` swaps its own
            content rather than presenting a second sheet over itself. See the
            note on `view` there — a sheet stacked on a sheet is the layering
            `pull.tsx` was already burned by once. */}
        <Stack.Screen name="contests" options={sheetOptions} />
        {/* Sets, over the collection. Same presentation as packs and the lobby,
            and it arrived here from the same direction: it was a tab beside the
            board and is a door on it. See `SETS` in `sections.ts`. */}
        <Stack.Screen name="sets" options={sheetOptions} />
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
