import { useRouter } from 'expo-router';

import { SetsPanel } from '@/components/collection/SetsPanel';
import { Screen } from '@/components/shell/Screen';
import { SubNav } from '@/components/shell/SubNav';
import { COLLECTION_SEGMENTS } from '@/components/shell/sections';

export default function SetsScreen() {
  const router = useRouter();
  return (
    <Screen title="Sets" measure="form" context="Deferred to Week 3 · nothing tracked" scroll={false}>
      <SubNav segments={COLLECTION_SEGMENTS} />
      <SetsPanel onBackToInventory={() => router.replace('/collection/inventory')} />
    </Screen>
  );
}
