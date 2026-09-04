/**
 * CONTESTS — the second tab of the Compete strip.
 *
 * ---------------------------------------------------------------------------
 * IT IS A PAGE AGAIN, AND IT RENDERS `LobbyView` DIRECTLY
 * ---------------------------------------------------------------------------
 *
 * This was `(app)/contests` — a sheet mounted above the tab navigator, opened
 * over the lineup board from the last card of its carousel. It is a page under
 * `/fantasy/compete` now, because the strip needs two real destinations to be a
 * switcher rather than a decorated button. See `FANTASY_SECTIONS` in
 * `sections.ts`.
 *
 * WHAT CHANGED IS NOT THE ROUTE, IT IS WHO HOLDS THE STACK. As a sheet this
 * file rendered `ContestSheet`, which keeps its own array of frames — lobby,
 * contest, create, manager, entry — and swaps between them in React state
 * while the router sees one unchanging URL. That is the right design for a
 * surface presented over the app: the whole stack lives and dies inside one
 * modal, and closing it puts the reader back where they were.
 *
 * A page cannot use it. Those inner frames are sheets, and there is no modal
 * here for them to be presented in — pushing one would paint a bottom sheet's
 * chrome flat across a tab. So the page renders ONLY the lobby, and every
 * drill-down goes through the ROUTER to a sheet route that already exists:
 * `/contest/[code]` for a contest and `/contest/create` for the builder. Those
 * are mounted above the tabs, so they present over this page exactly as they
 * present over anything else, and `ContestSheet` still runs inside them with
 * its stack intact.
 *
 * The upshot is that nothing about the contest experience moved — only the
 * lobby did, and only up one level into the section that was already about
 * competing.
 *
 * `?view=history` is still read here and handed down: the board rail's second
 * door asks for the Weeks shelf rather than the lobby, and turning a route
 * param into an opening position is exactly a route file's job.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { LobbyView } from '@/components/contests/LobbyView';

export default function ContestsPage() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const router = useRouter();

  /* Never called while this is a page — `PlayerSheetFrame` draws no ✕ and binds
     no Escape under `frame="page"` — but the prop is required and a throw would
     be a worse answer than the honest one. If some future presentation does
     call it, the sibling tab is where "out of contests" means. */
  const close = useCallback(() => router.replace('/fantasy/compete'), [router]);

  return (
    <LobbyView
      frame="page"
      arrivedOn={view}
      onClose={close}
      onOpenContest={(code) => router.push({ pathname: '/contest/[code]', params: { code } })}
      onCreate={() => router.push('/contest/create')}
    />
  );
}
