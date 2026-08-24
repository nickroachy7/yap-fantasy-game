/**
 * Loads the signed-in player's owned cards.
 *
 * PAGING is the one load-bearing thing left here. PostgREST silently caps a
 * `.select()` at 1000 rows and returns no error when it truncates, so a large
 * collection would quietly lose its tail and nothing would look wrong. Every
 * page is fetched via `.range()` until a short page proves the end. The order
 * is `career_fp desc, id asc` — the id tiebreak matters, because paging over a
 * non-unique sort key can repeat or skip rows between requests.
 *
 * WHAT WAS REMOVED, AND WHY IT WAS ALREADY DEAD
 *
 * This used to make a second, chunked round trip resolving card_id -> player_id
 * against `cards`, so a grid cell could open the player. Two things ended it.
 * The grid now opens the CARD (`/card/<card_instance_id>`) rather than the
 * player, because a cell is one copy you own and the tap should say which one.
 * And the lookup had in any case been redundant since the migration that added
 * `player_id` to `my_collection` — the comment justifying it went stale without
 * anyone noticing, which is exactly how a per-load round trip survives review.
 *
 * HELD FOR THE SESSION, AND THE INVALIDATION IS THE INTERESTING PART.
 *
 * Collection, Sets and the packs sheet all read the same cards, so glancing at the
 * Shop and coming back unmounted the grid and re-paged the whole collection —
 * the visible pause on the way back in.
 *
 * The other session caches in this app hold things the client cannot change:
 * the fixture list, the season schedule, the card directory. This one is
 * different. A collection is MUTABLE, and it is mutable by exactly two actions
 * — opening a pack mints cards into it, selling removes one — so the cache is
 * only safe because both of them call `invalidateCollection()` and the next
 * read goes back to the network. Anything that comes to mutate `my_collection`
 * in future must do the same, which is why the setter is exported next to the
 * reader rather than hidden inside the hook.
 *
 * Pull-to-refresh also invalidates, because a refresh the user ASKED for that
 * returns a cached answer is not a refresh.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useLoader, type Load } from '@/hooks/use-loader';
import { sessionCache } from '@/lib/session-cache';
import { supabase } from '@/lib/supabase';
import { normaliseRow, type CollectionCard, type CollectionViewRow } from './types';

const COLUMNS =
  'id, card_id, player_name, position_abbreviation, team_abbreviation, injury_status, tier, career_fp, lineup_starts, tier_floor_fp, next_tier_at, next_tier_label, season, acquired_at, sell_value, fp_per_game, in_set';

/** Comfortably under the PostgREST 1000-row ceiling. */
const PAGE_SIZE = 500;
/** A runaway loop against a paginated API is worse than a truncated grid. */
const MAX_PAGES = 60;

export type CollectionState = {
  /** Null until the first load resolves. */
  cards: CollectionCard[] | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

async function fetchAllRows(): Promise<CollectionCard[]> {
  const out: CollectionCard[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    // my_collection is security_invoker, so RLS scopes this to the caller and
    // no user_id filter is sent.
    const { data, error } = await supabase
      .from('my_collection')
      .select(COLUMNS)
      .order('career_fp', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as CollectionViewRow[];
    for (const row of batch) out.push(normaliseRow(row));
    if (batch.length < PAGE_SIZE) break;
  }

  return out;
}

/** One collection, one key — RLS decides whose. */
const collection = sessionCache<'mine', CollectionCard[]>(fetchAllRows);

/**
 * Forget the held collection. The next read pages it again.
 *
 * Call this from anything that mints or removes a card — `open_pack` and
 * `sell_card` are the two today. Failing to call it does not error, it just
 * quietly shows the wrong grid, which is the failure mode worth naming.
 */
export function invalidateCollection(): void {
  collection.invalidate();
}

/**
 * How many times the collection has been invalidated — "have the cards changed
 * since I last looked".
 *
 * EXPORTED FOR THE LINEUP, which is not a `sessionCache` and cannot compare
 * versions of its own. The lineup tab stays mounted for the whole session, so
 * committing a card on the Sets tab left it holding a copy the server had
 * already burnt — and the next autosave sent that dead id and was refused with
 * "card does not belong to you", which stopped the autosave for the rest of the
 * session. See `useLineupData`.
 *
 * THE COLLECTION IS THE RIGHT SIGNAL rather than a lineup-specific one: the
 * bench IS the collection, and every path that mints or destroys a card already
 * calls `invalidateCollection` — packs, the card profile, the set checklist,
 * the bulk bar. A second counter beside it would be one more thing for the next
 * mutation to forget.
 */
export function collectionVersion(): number {
  return collection.version('mine');
}

export function useCollection(): CollectionState {
  /* Seeded from the cache's synchronous peek, so returning from the Shop draws
     the grid you left in the first render rather than a spinner. `useLoader`
     still runs on mount — on a hit it resolves from memory and writes back the
     same rows. See `lib/session-cache`. */
  const [cards, setCards] = useState<CollectionCard[] | null>(() => collection.peek('mine') ?? null);

  /* The cache version these rows came from. See the focus effect below. */
  const seen = useRef(collection.version('mine'));

  const load = useCallback<Load>(async (live) => {
    /* Captured BEFORE the await: an invalidation that lands mid-read must not
       be credited to the answer we are about to store, or it goes unnoticed. */
    const at = collection.version('mine');
    try {
      const rows = await collection.read('mine');
      if (!live()) return;
      seen.current = at;
      setCards(rows);
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not load your collection.';
    }
  }, []);

  const { loading, refreshing, error, refresh } = useLoader(load);

  /**
   * CATCH UP ON THE WAY BACK IN.
   *
   * `invalidateCollection()` drops the cached rows, and that is enough for a
   * screen that has to mount — but the collection lives in a tab, and a tab
   * stays MOUNTED once visited. So opening a pack from a Collection you had
   * already looked at invalidated a cache nobody re-read: the grid held the
   * state it was in before the pack, and the new cards were missing until the
   * app was restarted or the grid pulled by hand. The invalidation was never
   * the missing piece; something had to act on it.
   *
   * The guard is what keeps this cheap, and it compares VERSIONS rather than
   * asking whether the cache still holds a value. Those are not the same
   * question: another screen calling `reload()` invalidates and immediately
   * re-reads, which leaves a full cache that this mounted screen has still
   * never seen. An ordinary tab switch moves no version and costs nothing.
   *
   * `cards !== null` keeps the first mount out of it: `useLoader` is already
   * reading then, and while a second call would be deduped by the in-flight map
   * it would still raise `refreshing` under a grid that has yet to draw.
   */
  useFocusEffect(
    useCallback(() => {
      if (cards !== null && seen.current !== collection.version('mine')) void refresh();
    }, [cards, refresh]),
  );

  /* Pull-to-refresh must reach the server. It is also the user's own escape
     hatch from a stale grid if some future mutation forgets to invalidate. */
  const reread = useCallback(async () => {
    invalidateCollection();
    await refresh();
  }, [refresh]);

  return {
    cards,
    error,
    // A seeded grid is not loading, whatever the read behind it is doing.
    loading: loading && cards === null,
    refreshing,
    refresh: reread,
  };
}
