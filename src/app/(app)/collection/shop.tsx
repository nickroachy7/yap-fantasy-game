import { ShopPanel } from '@/components/cards/ShopPanel';
import { Screen } from '@/components/shell/Screen';
import { SectionNav } from '@/components/shell/SectionNav';

export default function ShopScreen() {
  return (
    <Screen title="Shop" context="Packs & pulls" scroll={false}>
      <SectionNav section="/collection" />
      <ShopPanel />
    </Screen>
  );
}
