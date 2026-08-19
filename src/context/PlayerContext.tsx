/**
 * The signed-in player's headline state: gems and identity.
 *
 * Lives in context because the header renders on every tab — without this each
 * screen would fetch the balance separately and they would drift apart after a
 * pack opening.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

export type PlayerState = {
  gems: number;
  displayName: string;
  cardCount: number;
  loading: boolean;
  error: string | null;
  /** Call after anything that spends or earns gems. */
  refresh: () => Promise<void>;
};

/**
 * Exported so the dev galleries can supply a fixture player without a session.
 * The whole shell — rail, header, gem balance — reads this, so there is no way
 * to render the chrome for design work without either signing in or providing
 * the context directly. Product code should use <PlayerProvider>.
 */
export const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [gems, setGems] = useState(0);
  const [displayName, setDisplayName] = useState('player');
  const [cardCount, setCardCount] = useState(0);

  const load = useCallback<Load>(
    async (live) => {
      if (!session) return;
      // All three are RLS-scoped to the caller; no user_id filter is sent.
      const [profile, balance, cards] = await Promise.all([
        supabase.from('profiles').select('display_name').single(),
        supabase.from('gem_balances').select('balance').single(),
        supabase.from('card_instances').select('id', { count: 'exact', head: true }),
      ]);
      if (!live()) return;
      const failure = profile.error ?? balance.error ?? cards.error;
      if (failure) return failure.message;
      setDisplayName(profile.data?.display_name ?? 'player');
      setGems(balance.data?.balance ?? 0);
      setCardCount(cards.count ?? 0);
    },
    [session],
  );

  const { loading, error, refresh } = useLoader(load);

  const value = useMemo<PlayerState>(
    // Without a session there is nothing to read and nothing true to show, so
    // this stays loading — the header draws an em dash rather than a confident
    // balance of zero, which is what it did before the read was extracted.
    () => ({ gems, displayName, cardCount, loading: loading || !session, error, refresh }),
    [gems, displayName, cardCount, loading, error, refresh, session],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}
