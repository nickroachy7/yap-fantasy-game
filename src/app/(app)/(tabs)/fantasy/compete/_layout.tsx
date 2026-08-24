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
 * `SectionFrame` draws the sub-page bar once above this navigator, so flipping
 * between the lineup and the lobby leaves the bar untouched.
 */
export default function CompeteLayout() {
  return (
    <SectionFrame section="/fantasy/compete">
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
