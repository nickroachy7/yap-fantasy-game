/**
 * The contest builder, as a sheet over whatever opened it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS ROUTE EXISTS AT ALL
 * ---------------------------------------------------------------------------
 *
 * It did not, until the lobby became a page. `CreateContestView` was reachable
 * only as a frame on `ContestSheet`'s internal stack, pushed from the lobby and
 * living inside the same modal — which worked precisely because the lobby was
 * itself a sheet. Now that the lobby is the Compete strip's second tab there is
 * no modal around it, and a builder pushed into that stack would render a
 * sheet's chrome flat across a tab.
 *
 * So the builder gets the same treatment every other drill-down out of the
 * lobby already had: a route above the tab navigator, presented over the page.
 * See `contests.tsx`.
 *
 * `create` IS A STATIC SEGMENT AND WINS OVER `[code]`. Expo Router matches a
 * literal path segment ahead of a dynamic one, so `/contest/create` reaches
 * this file rather than `contest/[code]` with a code of "create". Worth knowing
 * before adding a contest code that could collide — there is exactly one word
 * this directory can no longer use.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { CreateContestView } from '@/components/contests/CreateContestView';

export default function CreateContestRoute() {
  const router = useRouter();

  /* Guarded the way every sheet in this app guards it: `back()` on an empty
     stack does nothing, so a builder opened from a pasted link or a refreshed
     tab would have a close button that did not close. The lobby is the screen
     this one is a door on. */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/fantasy/compete/contests');
  }, [router]);

  return (
    <CreateContestView
      backLabel="Contests"
      onBack={close}
      onClose={close}
      /* REPLACES ITSELF rather than stacking, which is the rule `ContestSheet`
         established for this view and the reason matters more here than it did
         there: a builder left underneath its own result is a screen the reader
         can navigate back to and press "Build it" on a second time, and the
         draft is still perfectly valid, so the second press would build a
         second contest. */
      onBuilt={(code) => router.replace({ pathname: '/contest/[code]', params: { code } })}
    />
  );
}
