/**
 * The sets sheet, opened on the collection.
 *
 * A DOOR, NOT A SCREEN — the same shape `contests.tsx` settled into, and it
 * arrives here for the same reason. Sets was `(tabs)/fantasy/collect/sets`, one
 * of two peers under a COLLECTION | SETS bar that cost a row of chrome on every
 * visit to a board whose own subject is the cards. See `SETS` in `sections.ts`
 * for the argument; what is left in this file is the route.
 *
 * Everything it used to draw is `SetsPanel`, which renders the sheet frame
 * itself — the rule `ContestSheet`'s header sets out: a view knows its own
 * title, subtitle and pinned controls, and a host that tried to hoist them
 * would have to call the view's data hooks to find them.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { SetsPanel } from '@/components/collection/SetsPanel';

export default function SetsRoute() {
  const router = useRouter();

  /* Guarded for the same reason as `packs` and `set/[code]`: `back()` on an
     empty stack does nothing, so a sheet opened from a link or a refreshed tab
     would have a close button that did not close. The collection is the board
     this one is a door on. */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/fantasy/collect');
  }, [router]);

  return (
    <SetsPanel
      onOpenSet={(code) => router.push({ pathname: '/set/[code]', params: { code } })}
      onClose={close}
    />
  );
}
