import { Stack } from 'expo-router';

/**
 * This week's decision and the scoreboard behind it are peers.
 * `Screen` supplies every page's chrome, so this navigator draws none.
 */
export default function LineupLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none' }} />;
}
