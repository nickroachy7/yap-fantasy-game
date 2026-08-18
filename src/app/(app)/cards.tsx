/**
 * The Cards tab: scout every player in the game (Players), then acquire them
 * (Shop). Two halves of the same loop, so they live behind one segmented
 * control rather than two tabs.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlayersPanel } from '@/components/cards/PlayersPanel';
import { ShopPanel } from '@/components/cards/ShopPanel';
import type { DirectoryFetch } from '@/components/cards/player-directory';
import { Screen } from '@/components/shell/Screen';
import { SegmentedControl, type Segment } from '@/components/shell/SegmentedControl';
import { Spacing } from '@/constants/theme';

type Tab = 'players' | 'shop';

export default function CardsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('players');
  // Once a panel has been shown it stays mounted (hidden), so switching back
  // does not re-read ~1,000 directory rows or discard a pack you just opened.
  const [shopMounted, setShopMounted] = useState(false);
  const [directory, setDirectory] = useState<DirectoryFetch | null>(null);

  const select = useCallback((next: Tab) => {
    if (next === 'shop') setShopMounted(true);
    setTab(next);
  }, []);

  const openPlayer = useCallback(
    (playerId: string) => router.push({ pathname: '/player/[id]', params: { id: playerId } }),
    [router],
  );

  const segments: Segment<Tab>[] = [
    {
      value: 'players',
      label: 'Players',
      badge: directory?.complete ? String(directory.players.length) : undefined,
    },
    { value: 'shop', label: 'Shop' },
  ];

  const context =
    tab === 'players'
      ? directory?.season
        ? `${directory.season} player directory`
        : 'Player directory'
      : 'Packs & pulls';

  return (
    <Screen context={context} scroll={false}>
      <View style={styles.header}>
        <SegmentedControl segments={segments} value={tab} onChange={select} />
      </View>

      {/* `display: none` rather than unmounting: keeps scroll position, search
          text and the last pack result across a tab switch. */}
      <View style={[styles.panel, tab !== 'players' && styles.hidden]}>
        <PlayersPanel onOpenPlayer={openPlayer} onLoaded={setDirectory} />
      </View>

      {shopMounted ? (
        <View style={[styles.panel, tab !== 'shop' && styles.hidden]}>
          <ShopPanel />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  panel: { flex: 1 },
  hidden: { display: 'none' },
});
