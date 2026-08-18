import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { PlayersPanel } from '@/components/cards/PlayersPanel';
import type { DirectoryFetch } from '@/components/cards/player-directory';
import { Screen } from '@/components/shell/Screen';

export default function CardsScreen() {
  const router = useRouter();
  const [directory, setDirectory] = useState<DirectoryFetch | null>(null);

  const openPlayer = useCallback(
    (playerId: string) => router.push({ pathname: '/player/[id]', params: { id: playerId } }),
    [router],
  );

  const context = directory?.season ? `${directory.season} player directory` : 'Player directory';

  return (
    <Screen title="Cards" measure="table" context={context} scroll={false}>
      <PlayersPanel onOpenPlayer={openPlayer} onLoaded={setDirectory} />
    </Screen>
  );
}
