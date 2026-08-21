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
      /**
       * THE `profiles` FILTER IS NOT REDUNDANT, AND ASSUMING IT WAS BROKE THE
       * HEADER FOR EVERY PLAYER.
       *
       * These three reads used to go out unfiltered, on the stated grounds that
       * "all three are RLS-scoped to the caller". Two of them are.
       * `gem_balances` and `card_instances` both have policies of the form
       * `auth.uid() = user_id`, so an unfiltered select returns exactly the
       * caller's row and `.single()` is honest.
       *
       * `profiles` does not. Its SELECT policy is a flat `true` — deliberately,
       * because the leaderboards render other players' names and cannot do that
       * if a profile is only visible to its owner. So an unfiltered select
       * returns EVERY profile, and `.single()` on nine rows is a PostgREST 406
       * (`PGRST116: cannot coerce the result to a single JSON object`).
       *
       * It worked exactly as long as the table had one row in it. The moment a
       * second person signed up it broke for everybody at once, and it broke
       * quietly: the failure is swallowed into `error`, the state keeps its
       * initial values, and the rail and the header settle on "player" and a
       * balance of 0. It reads as data that will not save rather than data that
       * will not load — a display name change DOES land, and then the chrome
       * goes on showing the old default, so the natural conclusion is that the
       * save failed.
       *
       * The lesson is in the shape, not the query: RLS scoping is a per-table
       * fact, so a comment claiming it for a batch is a claim about tables it
       * has not checked.
       */
      const [profile, balance, cards] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('id', session.user.id).single(),
        supabase.from('gem_balances').select('balance').single(),
        /* `is_held`, not every row this user has ever had. A sold copy is still
           their row and a committed one is too, so an unfiltered count made the
           header's card total drift upward every time somebody cleared a
           duplicate — and committing a card to a set would have made it drift
           faster. The generated column is the same predicate `my_collection`
           filters on, so the two cannot disagree. */
        supabase
          .from('card_instances')
          .select('id', { count: 'exact', head: true })
          .eq('is_held', true),
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
