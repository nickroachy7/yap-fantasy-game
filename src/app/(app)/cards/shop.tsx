import { ShopPanel } from '@/components/cards/ShopPanel';
import { Screen } from '@/components/shell/Screen';
import { SubNav } from '@/components/shell/SubNav';
import { CARD_SEGMENTS } from '@/components/shell/sections';

export default function ShopScreen() {
  return (
    <Screen context="Packs & pulls" scroll={false}>
      <SubNav segments={CARD_SEGMENTS} />
      <ShopPanel />
    </Screen>
  );
}
