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
 * THE SECTION IS ONE PAGE NOW. The lobby was the second, under a two-item bar
 * this frame drew above every visit; it is a sheet over the board instead, and
 * the way in is the last card of the lineup carousel — see `CONTESTS` in
 * `sections.ts` for what that bought and what it cost.
 *
 * `SectionFrame` stays. It draws no bar for a section with no children and
 * costs nothing, and it is what a second page under Compete would need on the
 * day there is one. What it still supplies is the frame state every page in
 * here reads — that a masthead is already on screen.
 */
export default function CompeteLayout() {
  return (
    <SectionFrame section="/fantasy/compete">
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
