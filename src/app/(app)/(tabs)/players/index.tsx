import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { PlayersPanel } from '@/components/cards/PlayersPanel';
import type { DirectoryFetch } from '@/components/cards/player-directory';
import { Screen } from '@/components/shell/Screen';

export default function PlayersScreen() {
  const router = useRouter();
  const [directory, setDirectory] = useState<DirectoryFetch | null>(null);

  const openPlayer = useCallback(
    (playerId: string) => router.push({ pathname: '/player/[id]', params: { id: playerId } }),
    [router],
  );

  // The panel's own count line moves with the filter; this one does not, so it
  // is the answer to "how big is the pool" rather than "what am I looking at".
  const context = directory?.season
    ? `${directory.season} season · ${directory.expected} players`
    : 'Player directory';

  return (
    /* 'table' rather than 'grid': this is nine columns of rows being read, and
       the wider measure only buys empty space between a name and its points. */
    <Screen title="Players" measure="table" context={context} scroll={false}>
      <PlayersPanel onOpenPlayer={openPlayer} onLoaded={setDirectory} />
    </Screen>
  );
}
