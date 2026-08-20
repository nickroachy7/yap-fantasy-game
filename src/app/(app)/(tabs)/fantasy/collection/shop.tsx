import { ShopPanel } from '@/components/cards/ShopPanel';
import { Screen } from '@/components/shell/Screen';

export default function ShopScreen() {
  return (
    <Screen title="Shop" context="Packs & pulls" scroll={false}>
      <ShopPanel />
    </Screen>
  );
}
