import { Stack } from 'expo-router';

import { SectionFrame } from '@/components/shell/SectionFrame';

/**
 * Standings and the scoring rules that produce them are peers.
 * `Screen` supplies each page's chrome; the frame supplies the section's header
 * and nav, drawn once above this navigator so they survive the swap between the
 * two — see `SectionFrame`.
 */
export default function LeaderboardLayout() {
  return (
    <SectionFrame section="/leaderboard">
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
