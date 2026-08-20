import { Stack } from 'expo-router';

import { SectionFrame } from '@/components/shell/SectionFrame';

/**
 * Inventory, Sets and Shop are peers; `Screen` supplies each page's chrome and
 * the frame supplies the section's — header and nav, drawn once above this
 * navigator so neither moves when you flip between the three.
 */
export default function CollectionLayout() {
  return (
    <SectionFrame section="/fantasy/collection">
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
    </SectionFrame>
  );
}
