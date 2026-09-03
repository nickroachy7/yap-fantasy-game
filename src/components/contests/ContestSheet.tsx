/**
 * ONE SHEET, A STACK OF VIEWS, AND THREE DOORS INTO IT.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACES
 * ---------------------------------------------------------------------------
 *
 * Contests, a contest, and somebody else's team were three presented routes,
 * and every step between them put a modal on top of a modal. Opening a contest
 * from the lobby gave you two grabbers and two ✕s; opening a rival's team off
 * its field gave you three. Nothing about that stack was legible from the
 * outside: the ✕ nearest your thumb closed the newest layer, a swipe-down took
 * whichever layer the gesture landed on, and the layer underneath was a screen
 * the reader had not asked to keep.
 *
 * `contests.tsx` had already learned this once, in the small. The archive was a
 * presented route for about an hour before becoming a second FACE of the same
 * sheet, and the note it left behind — "two ✕s, and a back gesture nobody
 * expects" — is the whole argument, applied now to the other three doors.
 *
 * So: ONE presented sheet, and a stack of frames inside it. Going deeper swaps
 * what the sheet is showing and leaves a back row naming what it came from.
 * The ✕ means the same thing at every depth — put the whole thing down — which
 * is the property a stack of sheets cannot have.
 *
 * ---------------------------------------------------------------------------
 * THE ROUTES STAY, AS ENTRY POINTS
 * ---------------------------------------------------------------------------
 *
 *   /contests                     the lobby, or the archive with ?view=history
 *   /contest/<code>               straight to a contest — the board's carousel
 *   /entry/<contest>/<user>       straight to a team — deep links only
 *
 * Each is three lines that seed this component's stack with one frame. They are
 * not layers any more; they are starting positions. That is what keeps the
 * board's takeover working (`LineupEditor` pushes `/contest/[code]` and expects
 * a sheet over the board, not a lobby the reader has to back out of) while
 * making every step INSIDE the sheet a frame rather than a presentation.
 *
 * ---------------------------------------------------------------------------
 * EACH VIEW OWNS ITS OWN FRAME
 * ---------------------------------------------------------------------------
 *
 * `PlayerSheetFrame` is rendered by the VIEW, not by this component, and that
 * is deliberate rather than accidental. A contest's frame has a footer — the
 * actions bar, pinned so that "edit lineup" is reachable without scrolling past
 * a leaderboard — and the lobby's has none; the title is a contest's name here
 * and a manager's handle there. Hoisting all of that into one host meant either
 * a host that calls every view's data hooks whether or not that view is on
 * screen, or a callback that pushes frame props upward from inside an effect.
 * Both are worse than letting each view render the frame it already knows how
 * to render, which is exactly what these three files did as routes.
 *
 * What this component owns is therefore small and entirely about NAVIGATION:
 * the stack, the back labels, and the one guarded close.
 *
 * ---------------------------------------------------------------------------
 * THE LOBBY KEEPS ITS OWN THREE FACES
 * ---------------------------------------------------------------------------
 *
 * Open, the archive and a recap are NOT frames on this stack. They are still
 * `LobbyView`'s internal state, for one concrete reason: `useContestHistory`
 * paginates, and a frame that unmounts on the way down loses every page it has
 * loaded. Reading week nine, opening its recap and coming back would land on
 * week one. A view that is cheap to rebuild belongs on the stack; one holding a
 * scroll position through the season does not.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigation, useRouter } from 'expo-router';

import { ManagerView } from '@/components/friends/ManagerView';
import { ContestView } from './ContestView';
import { CreateContestView } from './CreateContestView';
import { EntryView } from './EntryView';
import { LobbyView } from './LobbyView';

/**
 * One view of the sheet, with everything it needs to draw itself.
 *
 * THE LABELS TRAVEL WITH THE FRAME rather than being derived on the way back.
 * A rival's team is reachable from a live contest and from a settled recap, and
 * the row that returns you should name the one you actually came from — which
 * the frame underneath knows at PUSH time and nothing knows afterwards without
 * asking the network for a name it already had.
 */
export type SheetFrame =
  | { view: 'lobby'; arrivedOn?: string }
  | { view: 'contest'; code: string; backLabel?: string }
  | {
      view: 'entry';
      contestId: string;
      userId: string;
      /** The contest this team was filed in, for the subtitle. */
      name?: string;
      /** Whose team it is, for the title while the field loads. */
      manager?: string;
      backLabel?: string;
    }
  /**
   * A MANAGER'S ACCOUNT, as a frame rather than a route.
   *
   * `/manager/<id>` exists and is the door from everywhere else in the app —
   * but pushing it from in here would put a presented sheet on top of a
   * presented sheet, which is the exact stacking this file was written to
   * abolish. So the same `ManagerView` renders as the next frame instead: ‹
   * goes back to the field you tapped, and ✕ still means put the whole thing
   * down.
   */
  | { view: 'manager'; userId: string; manager?: string; backLabel?: string }
  /**
   * THE BUILDER, as a frame on this stack rather than a route.
   *
   * It has no deep link and deliberately none: `/contests` is a place, and a
   * half-filled builder is not — a URL that reopens an empty form is a promise
   * the app cannot keep. It is reached from the Friendly shelf and it leaves by
   * PUSHING the contest it made, so ‹ from a new contest goes back to the lobby
   * and not into the form that built it.
   */
  | { view: 'create'; backLabel?: string };

export function ContestSheet({ initial }: { initial: SheetFrame }) {
  const router = useRouter();
  /* SEEDED ONCE. The route's params are an opening position, not a controlled
     prop — the same call `LobbyView` makes about `?view=history`, for the same
     reason: navigating inside the sheet must not have to write back to the URL,
     and a re-render must not snap the reader to the frame they arrived on. */
  const [stack, setStack] = useState<SheetFrame[]>([initial]);
  const here = stack[stack.length - 1];

  const push = useCallback((frame: SheetFrame) => setStack((s) => [...s, frame]), []);
  const pop = useCallback(
    () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    [],
  );

  /**
   * ---------------------------------------------------------------------------
   * ONE WAY OUT AT A TIME: THE DRAG IS OFF WHILE THERE IS SOMETHING UNDERNEATH
   * ---------------------------------------------------------------------------
   *
   * A presented sheet can be pulled down to dismiss, and that gesture was the
   * cost of folding three routes into one. On the lobby it is right — the sheet
   * IS the lobby, and throwing it away is the only thing "down" could mean. One
   * view deeper it is two gestures pointing at different places: ‹ goes back to
   * the lobby, and a pull throws the lobby away as well. A reader dragging to
   * get out of a contest lost the screen they were dragging back to.
   *
   * So on any frame but the first, down does nothing and you leave the way you
   * came in. That is the rule an iOS reader already knows from a form they have
   * half filled in, which is the same shape of thing: a sheet that has state
   * under it does not fall out of the window.
   *
   * IT TAKES TWO SWITCHES, because the gesture has two owners. On iOS the
   * PLATFORM runs it — the page sheet's own interactive dismiss — and nothing
   * inside the sheet can see it, so it is turned off through the navigator
   * (`gestureEnabled` maps to the modal's `preventNativeDismiss`). On narrow web
   * there is no platform gesture and `PlayerSheetFrame` rolls its own, which the
   * `dismissible` prop below switches off. Miss either and the conflict survives
   * on one of the two platforms that has it.
   *
   * THE ✕ COMES BACK IN THE GRABBER'S PLACE, which is what keeps this from
   * being a trap: `PlayerSheetFrame` swaps the bar for the button whenever a
   * drag cannot close it, so a nested view always has one unambiguous way out
   * as well as a way back.
   */
  const nested = stack.length > 1;
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !nested });
  }, [navigation, nested]);

  /**
   * Out of the sheet entirely, from any depth.
   *
   * Guarded for the same reason every sheet in this app guards it: `back()` on
   * an empty stack does nothing, so a sheet opened from a link or a refreshed
   * browser tab had a close button that did not close.
   *
   * THE BOARD IS THE LANDING. Compete is the page underneath every door into
   * this sheet, and it is where a reader who has closed it expects to be.
   */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/fantasy/compete');
  }, [router]);

  if (here.view === 'contest') {
    return (
      <ContestView
        code={here.code}
        backLabel={here.backLabel}
        onBack={pop}
        onClose={close}
        dismissible={!nested}
        /* A name on a row of the field. The row itself still opens that
           manager's LINEUP in place — two different questions about the same
           person, and the field row answers both. */
        onOpenManager={(userId, manager) =>
          push({ view: 'manager', userId, manager, backLabel: 'Contest' })
        }
      />
    );
  }

  if (here.view === 'create') {
    return (
      <CreateContestView
        backLabel={here.backLabel}
        onBack={pop}
        onClose={close}
        dismissible={!nested}
        /* REPLACES ITSELF rather than stacking on. A builder left underneath
           its own result is a screen the reader can return to and press
           "Build it" on a second time — and the second press would build a
           second contest, since the draft is still perfectly valid. */
        onBuilt={(code) =>
          setStack((st) => [
            ...st.slice(0, -1),
            { view: 'contest', code, backLabel: 'Contests' },
          ])
        }
      />
    );
  }

  if (here.view === 'manager') {
    return (
      <ManagerView
        userId={here.userId}
        name={here.manager}
        backLabel={here.backLabel}
        onBack={pop}
        onClose={close}
        dismissible={!nested}
      />
    );
  }

  if (here.view === 'entry') {
    return (
      <EntryView
        contestId={here.contestId}
        userId={here.userId}
        name={here.name}
        manager={here.manager}
        backLabel={here.backLabel}
        onBack={pop}
        onClose={close}
        dismissible={!nested}
        /* Whose team this is, as a person rather than as a lineup. The back
           label names THIS frame, which is the one the reader came from. */
        onOpenManager={(userId, manager) =>
          push({ view: 'manager', userId, manager, backLabel: manager ?? 'Team' })
        }
      />
    );
  }

  return (
    <LobbyView
      arrivedOn={here.arrivedOn}
      onClose={close}
      onOpenContest={(code) => push({ view: 'contest', code, backLabel: 'Contests' })}
      onCreate={() => push({ view: 'create', backLabel: 'Contests' })}
    />
  );
}
