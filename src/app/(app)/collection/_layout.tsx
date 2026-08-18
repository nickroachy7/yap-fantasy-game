import { Stack } from 'expo-router';

/** Inventory and Sets are peers; Screen supplies the chrome. */
export default function CollectionLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none' }} />;
}
