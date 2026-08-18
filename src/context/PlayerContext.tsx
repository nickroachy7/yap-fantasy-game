/**
 * The signed-in player's headline state: gems and identity.
 *
 * Lives in context because the header renders on every tab — without this each
 * screen would fetch the balance separately and they would drift apart after a
 * pack opening.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type PlayerState = {
  gems: number;
  displayName: string;
  cardCount: number;
  loading: boolean;
  error: string | null;
  /** Call after anything that spends or earns gems. */
  refresh: () => Promise<void>;
};

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [gems, setGems] = useState(0);
  const [displayName, setDisplayName] = useState('player');
  const [cardCount, setCardCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    setError(null);
    // All three are RLS-scoped to the caller; no user_id filter is sent.
    const [profile, balance, cards] = await Promise.all([
      supabase.from('profiles').select('display_name').single(),
      supabase.from('gem_balances').select('balance').single(),
      supabase.from('card_instances').select('id', { count: 'exact', head: true }),
    ]);
    const failure = profile.error ?? balance.error ?? cards.error;
    if (failure) {
      setError(failure.message);
    } else {
      setDisplayName(profile.data?.display_name ?? 'player');
      setGems(balance.data?.balance ?? 0);
      setCardCount(cards.count ?? 0);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<PlayerState>(
    () => ({ gems, displayName, cardCount, loading, error, refresh }),
    [gems, displayName, cardCount, loading, error, refresh],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}
