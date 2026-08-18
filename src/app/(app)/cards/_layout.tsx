import { Stack } from 'expo-router';

/**
 * The directory and the trend board are two views of one pool.
 * `Screen` supplies every page's chrome, so this navigator draws none.
 */
export default function CardsLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none' }} />;
}
