import { Stack } from 'expo-router';

import { SectionFrame } from '@/components/shell/SectionFrame';

/**
 * COLLECT: the cards you own.
 *
 * ---------------------------------------------------------------------------
 * TWO PAGES, AND THE BAR IS BACK: INVENTORY AND SETS
 * ---------------------------------------------------------------------------
 *
 * Sets were lifted out of Collection on 2026-08-21 to sit beside it, then
 * brought back under one board on the argument that a set is the EXIT for the
 * cards on the other screen — committing is the only exit that preserves board
 * value, and a tab you must deliberately open to discover an exit is a tab you
 * do not open.
 *
 * That argument was right about the loop and wrong about the shape. Keeping
 * them together as two tabs bought the connection with a permanent row of
 * chrome above a board whose whole subject is the cards underneath it — and it
 * still put the exit one deliberate tap away, just a shorter one.
 *
 * Sets spent a few days as a SHEET over the collection, opened by a chip on the
 * board's own toolbar. That move was right about the exit and wrong about the
 * address: putting the door where the intent forms does not require the
 * destination to be homeless. Sets is a page beside Inventory again, and the
 * toolbar chip still points at it — see `SETS` in `sections.ts`.
 *
 * THE PACKS BUTTON STAYS ON THE TOOLBAR, and does not come back up here. It was
 * this frame's `action` once, but Packs is genuinely a sheet — an errand you
 * open, spend in, and put down — so it is not a third tab and never was. It
 * keeps its `DoorChip` beside the one for Sets, which is now a shortcut sitting
 * next to a door.
 *
 * `SectionFrame` needed no change: it draws whatever `childrenOf` reports, drew
 * nothing while that was empty, and draws two items now. What it also supplies
 * is the frame state every page in here reads — that a masthead is already on
 * screen. Compete is in exactly this shape, one section over.
 */
export default function CollectLayout() {
  return (
    <SectionFrame section="/fantasy/collect">
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
