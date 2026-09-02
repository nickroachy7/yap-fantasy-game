import { Stack } from 'expo-router';

import { SectionFrame } from '@/components/shell/SectionFrame';

/**
 * COLLECT: the cards you own.
 *
 * ---------------------------------------------------------------------------
 * IT IS ONE PAGE NOW, AND THE BAR IS GONE
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
 * Sets is a SHEET over the collection now, opened by a chip at the end of the
 * board's own toolbar beside the shop. See `SETS` in `sections.ts`. The exit is
 * on the screen holding the cards it is an exit for, which is closer than the
 * tab ever was, and the board gets the row back.
 *
 * THE PACKS BUTTON WENT THE SAME WAY. It was this frame's `action` — chrome
 * rendered above the navigator, which was the right place for it while there
 * was a bar for it to sit beside. With no bar there is nothing to hang it on,
 * and it is one of the two doors on the toolbar now, drawn by `DoorChip`
 * exactly as the lineup's rail draws its pair.
 *
 * `SectionFrame` stays, and draws nothing: a section with no children has no
 * bar. What it still supplies is the frame state every page in here reads —
 * that a masthead is already on screen. Compete has been in exactly this shape
 * since its own lobby became a sheet.
 */
export default function CollectLayout() {
  return (
    <SectionFrame section="/fantasy/collect">
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
