/**
 * Loads the signed-in player's set progress.
 *
 * Held for the session, and invalidated by the same four actions that change
 * what the answer is — for exactly the reasons spelled out in
 * `use-collection`, which this deliberately mirrors:
 *
 *   opening a pack     mints cards, which moves `ready` on every set they
 *                      belong to (a five-card pack can move six sets at once);
 *   selling a card     removes one, which can drop `ready` back to zero;
 *   committing a card  fills a slot AND burns the card, so it moves both
 *                      counts on this view and the collection behind it;
 *   claiming a set     writes the completion this view reads.
 *
 * Anything else that comes to mint or destroy a card must call
 * `invalidateSets()` too, which is why the setter is exported beside the
 * reader rather than hidden inside the hook.
 *
 * NO PAGING, unlike the collection, and the reason is worth stating rather
 * than assuming: `my_sets` returns one row per SET, not per card. That is 37
 * rows for the 2026 pool and it grows only when a family is added — never with
 * the size of a collection. PostgREST's silent 1000-row cap is nowhere near.
 */
import { useCallback, useState } from 'react';

import { useLoader, type Load } from '@/hooks/use-loader';
import { sessionCache } from '@/lib/session-cache';
import { supabase } from '@/lib/supabase';
import { normaliseSet, type CardSet, type SetViewRow } from './sets';

const COLUMNS =
  'set_id, code, name, family, subtitle, season, required_count, commit_payout_pct, sort_order, total_cards, committed, ready, complete, milestones, total_reward, claimable_gems, claimed_gems, next_at, next_reward';

async function fetchSets(): Promise<CardSet[]> {
  // my_sets is security_invoker, so RLS scopes both the ownership counts and
  // the claims to the caller. No user_id filter is sent, and none would help.
  const { data, error } = await supabase
    .from('my_sets')
    .select(COLUMNS)
    .order('family')
    .order('sort_order');

  if (error) throw new Error(error.message);

  return ((data ?? []) as SetViewRow[]).map(normaliseSet);
}

/** One player, one key — RLS decides whose. */
const sets = sessionCache<'mine', CardSet[]>(fetchSets);

/** Forget the held progress. The next read goes back to the server. */
export function invalidateSets(): void {
  sets.invalidate();
}

export type SetsState = {
  /** Null until the first load resolves. */
  sets: CardSet[] | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Re-read without the pull-to-refresh flag — for after a claim. */
  reload: () => Promise<void>;
};

export function useSets(): SetsState {
  /* Seeded from the cache's synchronous peek, so coming back from the Shop or
     from a checklist draws the list you left in the first render rather than a
     spinner. See `lib/session-cache`. */
  const [rows, setRows] = useState<CardSet[] | null>(() => sets.peek('mine') ?? null);

  const load = useCallback<Load>(async (live) => {
    try {
      const next = await sets.read('mine');
      if (!live()) return;
      setRows(next);
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not load your sets.';
    }
  }, []);

  const { loading, refreshing, error, refresh } = useLoader(load);

  /* Pull-to-refresh must reach the server. It is also the player's own escape
     hatch from a stale list if some future mutation forgets to invalidate. */
  const reread = useCallback(async () => {
    invalidateSets();
    await refresh();
  }, [refresh]);

  /* Same read, without the refreshing flag: a claim already has its own
     spinner on the button it was pressed from, and lighting the pull-to-refresh
     control as well would say the whole page is reloading when one row is. */
  const reload = useCallback(async () => {
    invalidateSets();
    await sets.read('mine').then(setRows, () => undefined);
  }, []);

  return {
    sets: rows,
    error,
    // A seeded list is not loading, whatever the read behind it is doing.
    loading: loading && rows === null,
    refreshing,
    refresh: reread,
    reload,
  };
}
