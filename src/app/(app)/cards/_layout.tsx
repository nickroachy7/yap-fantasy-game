import { Stack } from 'expo-router';

/** Players and Shop are peers; no header of their own — Screen supplies it. */
export default function CardsLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none' }} />;
}
