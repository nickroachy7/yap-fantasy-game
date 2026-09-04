import { Stack } from 'expo-router';

import { SectionFrame } from '@/components/shell/SectionFrame';

/**
 * COMPETE: this week's lineup, and the contests it can be entered into.
 *
 * The section exists because "Lineup" stopped being a place. It worked as a
 * board name for exactly as long as there was one contest — then your lineup
 * WAS the contest, and naming the screen after the object was the same as
 * naming it after the location. With a lobby you do not have *a* lineup, you
 * have one per contest, and a tab named after the singular is naming something
 * that no longer exists. See `20260825010000_contest_spine.sql`.
 *
 * THE FREE CONTEST IS THE INDEX, not a row in a list. Every account is entered
 * into it automatically and nobody chose it, so presenting it as something you
 * pick through would put a menu in front of the one screen in this game with a
 * deadline on it — and cost the week's actual decision a tap it never used to
 * need. Contests are what you scroll to; your lineup is what you land on.
 *
 * TWO PAGES, UNDER A TWO-ITEM BAR — Lineups and Contests. The lobby spent a
 * few days as a sheet over the board, reached from the last card of the lineup
 * carousel, and the bar came off with it because one destination is not
 * something to switch between. It is a page again and the bar is back; see
 * `FANTASY_SECTIONS` in `sections.ts` for what turned that argument around.
 *
 * The carousel's last card still opens it — a shortcut to a sibling tab now
 * rather than a door onto a sheet, which is why `LineupEditor` replaces where
 * it used to push.
 *
 * `SectionFrame` needed no change for any of this. It draws whatever
 * `childrenOf` reports and drew nothing while that was empty, which is exactly
 * what it was left in place for. What it also supplies is the frame state every
 * page in here reads — that a masthead is already on screen.
 */
export default function CompeteLayout() {
  return (
    <SectionFrame section="/fantasy/compete">
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
