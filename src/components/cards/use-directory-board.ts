/**
 * The read every players board makes: the directory, plus prices that are
 * allowed to be newer than it.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PRICE IS A SECOND READ
 * ---------------------------------------------------------------------------
 *
 * `loadPlayerDirectory` is cached for the life of the app session, which is
 * right for what it mostly holds — bios and season stats move once a week. A
 * SELL VALUE does not: `refresh-player-values` rewrites it hourly, so a board
 * that took its price from the session snapshot quoted the wrong number for the
 * rest of the day, and disagreed with the collection about what one card is
 * worth. That is how this was found, twice.
 *
 * So the price is read separately on every mount — one indexed pass over
 * (uuid, int) — and overlaid. The heavy read stays cached, the volatile number
 * stays live, and nothing has to choose between a spinner and a stale figure.
 *
 * THREE BOARDS USE THIS, which is the other half of the point. Trend, Top and
 * Search were each doing their own load, and only one of them had a way to
 * refresh; `invalidatePlayerDirectory` existed from the day the cache did and
 * had no caller at all, so nothing in the app could ever get a fresher
 * directory than the one it happened to load first.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  fetchBasePrices,
  invalidatePlayerDirectory,
  loadPlayerDirectory,
  peekPlayerDirectory,
  type DirectoryFetch,
} from './player-directory';

export type DirectoryBoard = {
  result: DirectoryFetch | null;
  /** Live base prices by player id, or null until the second read lands. */
  prices: Map<string, number> | null;
  failed: boolean;
  refreshing: boolean;
  /** Drops the cached directory and reads both halves again. */
  refresh: () => Promise<void>;
};

export function useDirectoryBoard(): DirectoryBoard {
  /* Seeded from the peek so a return visit paints the board on its first frame
     rather than showing a spinner over rows that never left memory. */
  const [result, setResult] = useState<DirectoryFetch | null>(() => peekPlayerDirectory());
  const [prices, setPrices] = useState<Map<string, number> | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const next = await loadPlayerDirectory();
        if (live) setResult(next);
        if (next.season !== null) {
          const fresh = await fetchBasePrices(next.season);
          if (live) setPrices(fresh);
        }
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      invalidatePlayerDirectory();
      const next = await loadPlayerDirectory();
      setResult(next);
      setFailed(false);
      if (next.season !== null) setPrices(await fetchBasePrices(next.season));
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { result, prices, failed, refreshing, refresh };
}
