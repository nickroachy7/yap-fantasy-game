import { Stack } from 'expo-router';

import { PacksButton } from '@/components/shell/PacksButton';
import { SectionFrame } from '@/components/shell/SectionFrame';

/**
 * COLLECT: the cards you own, and the sets they can go into.
 *
 * Sets were lifted out of Collection on 2026-08-21 to sit beside it, on the
 * argument that a set is a thing you work towards rather than a view of your
 * inventory. That argument still holds — but the split cost more than it paid,
 * because a set is also the EXIT for the cards on the other screen. Committing
 * is the only exit that preserves board value, `my_collection_in_set` puts set
 * membership on the inventory cell, and `card_actions` already offers the
 * commit from there. One loop, and it was living in two tabs.
 *
 * A tab you must deliberately open to discover an exit is a tab you do not
 * open. The Sets tab sitting unused was mostly economics — see
 * `20260824235000_weekly_sets.sql` — but not only.
 *
 * They are two pages under one board now, which is the shape Collection had
 * before it stopped being a folder. What is different this time is that the
 * pair is no longer Inventory-and-Sets-as-peers with a redirect in front of
 * them: Collection IS the index, and Sets is the page beside it.
 *
 * THE FRAME CARRIES THE PACKS BUTTON, beside the two tabs, and it is back here
 * after a spell on each page's summary strip. Two reasons, and the second is
 * the one that moved it:
 *
 *   chrome rendered above the navigator survives a navigation, so opening Packs
 *     and closing it again does not rebuild the bar you pressed — and drawn by
 *     each page instead, the button blinks on every flip between them;
 *   the summary strip COLLAPSES as you scroll (see `collapse.tsx`), and the way
 *     out to the shop is not a statement about your collection. It must not
 *     leave with one.
 */
export default function CollectLayout() {
  return (
    <SectionFrame section="/fantasy/collect" action={<PacksButton />}>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
