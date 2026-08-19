import { useRouter } from 'expo-router';

import { SetsPanel } from '@/components/collection/SetsPanel';
import { Screen } from '@/components/shell/Screen';
import { SectionNav } from '@/components/shell/SectionNav';

export default function SetsScreen() {
  const router = useRouter();
  return (
    <Screen title="Sets" measure="form" context="Deferred to Week 3 · nothing tracked" scroll={false}>
      <SectionNav section="/collection" />
      <SetsPanel onBackToInventory={() => router.replace('/collection/inventory')} />
    </Screen>
  );
}
