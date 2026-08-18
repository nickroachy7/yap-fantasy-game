import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { PlayersPanel } from '@/components/cards/PlayersPanel';
import type { DirectoryFetch } from '@/components/cards/player-directory';
import { Screen } from '@/components/shell/Screen';
import { SubNav } from '@/components/shell/SubNav';
import { CARD_SEGMENTS } from '@/components/shell/sections';

export default function PlayersScreen() {
  const router = useRouter();
  const [directory, setDirectory] = useState<DirectoryFetch | null>(null);

  const openPlayer = useCallback(
    (playerId: string) => router.push({ pathname: '/player/[id]', params: { id: playerId } }),
    [router],
  );

  const context = directory?.season ? `${directory.season} player directory` : 'Player directory';

  return (
    <Screen context={context} scroll={false}>
      <SubNav segments={CARD_SEGMENTS} />
      <PlayersPanel onOpenPlayer={openPlayer} onLoaded={setDirectory} />
    </Screen>
  );
}
