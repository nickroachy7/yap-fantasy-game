import { ShopPanel } from '@/components/cards/ShopPanel';
import { Screen } from '@/components/shell/Screen';
import { SubNav } from '@/components/shell/SubNav';
import { COLLECTION_SEGMENTS } from '@/components/shell/sections';

export default function ShopScreen() {
  return (
    <Screen title="Shop" context="Packs & pulls" scroll={false}>
      <SubNav segments={COLLECTION_SEGMENTS} />
      <ShopPanel />
    </Screen>
  );
}
