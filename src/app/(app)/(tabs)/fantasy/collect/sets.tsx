/**
 * SETS — the second tab of the Collect strip.
 *
 * This was `(app)/sets`, a sheet over the collection reached by a chip on the
 * board's toolbar. It is a page under `/fantasy/collect` now, for the reason
 * given in `FANTASY_SECTIONS`: a one-item strip is decoration, and Inventory
 * and Sets are the two things this section is actually made of.
 *
 * It is a simpler move than Compete's, because `SetsPanel` never had an inner
 * stack to lose — a set's checklist has always been the separate `/set/[code]`
 * route, mounted above the tabs. So that drill-down still presents as a sheet
 * over this page, unchanged, and all this file does differently is ask for the
 * page frame instead of the sheet one.
 *
 * THE TOOLBAR CHIP STAYS. `SETS.href` moved with the route, so the collection's
 * door still points here — it is now a shortcut to a sibling tab rather than a
 * door onto a sheet, which is the same gesture arriving somewhere flatter. Two
 * ways into one page is not a duplication: the chip is where the intent forms,
 * on the board holding the cards a set is the exit for, and the strip is where
 * a reader looks when they already know where they are going.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { SetsPanel } from '@/components/collection/SetsPanel';

export default function SetsPage() {
  const router = useRouter();

  /* Never called under `frame="page"` — see the note in `contests.tsx`. The
     sibling tab is what leaving Sets means now that closing is not a thing this
     screen can do. */
  const close = useCallback(() => router.replace('/fantasy/collect'), [router]);

  return (
    <SetsPanel
      frame="page"
      onOpenSet={(code) => router.push({ pathname: '/set/[code]', params: { code } })}
      onClose={close}
    />
  );
}
