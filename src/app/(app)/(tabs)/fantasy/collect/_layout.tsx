import { Stack } from 'expo-router';

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
 * The frame also carries the Packs button, and for the reason it always did:
 * chrome rendered above the navigator survives a navigation, so opening Packs
 * and closing it again does not rebuild the bar you pressed.
 */
export default function CollectLayout() {
  return (
    <SectionFrame section="/fantasy/collect">
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
