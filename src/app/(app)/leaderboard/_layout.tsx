import { Stack } from 'expo-router';

/**
 * Standings and the scoring rules that produce them are peers.
 * `Screen` supplies every page's chrome, so this navigator draws none.
 */
export default function LeaderboardLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none' }} />;
}
