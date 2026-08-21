import { Stack } from 'expo-router';

/**
 * One page: the boards.
 *
 * No `SectionFrame` any more. That frame exists to draw a section's sub-page
 * nav once, above the navigator that swaps the sub-pages underneath — and this
 * section has no sub-pages left. Scoring moved to `/scoring` (Profile →
 * Settings), so a frame here would hoist an empty strip.
 *
 * `Screen` supplies every page's chrome, so this navigator draws none. Same
 * shape as `lineup/_layout.tsx`, for the same reason.
 */
export default function LeaderboardLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none' }} />;
}
