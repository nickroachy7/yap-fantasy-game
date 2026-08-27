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
 * different. A collection is MUTABLE — packs mint cards into it, selling and
 * committing take them out — so the cache is only safe because every one of
 * those paths tells it so. Anything that comes to mutate `my_collection` in
 * future must do the same, which is why both setters are exported next to the
 * reader rather than hidden inside the hook.
 *
 * TWO SETTERS, AND WHICH ONE DEPENDS ON WHETHER YOU KNOW WHAT CHANGED.
 * `invalidateCollection()` is the honest shrug — something is different, read
 * it again — and it is what a pack opening uses, because the rows it minted are
 * not in the answer it got back. `dropCards(ids)` is for the other case, where
 * the server has named exactly which copies went: it takes those rows out on
 * the spot and invalidates behind itself. See its own note for why the
 * difference is worth a second function.
 *
 * Pull-to-refresh also invalidates, because a refresh the user ASKED for that
 * returns a cached answer is not a refresh.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

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
 * Take these copies out of the grid NOW, before anything is re-read.
 *
 * WHY INVALIDATING WAS NOT ENOUGH, and it is the same shape of bug the roster
 * count had. `invalidateCollection()` drops the cached rows and a screen picks
 * that up ON FOCUS — which works for the packs sheet and the card profile,
 * because closing them is a focus change. It does nothing at all for the bulk
 * bar, which acts on the collection screen itself and never leaves it. So
 * selling twelve cards left all twelve sitting in the grid, tick marks gone,
 * looking exactly like a sale that had not happened, until the tab was left and
 * returned to.
 *
 * CALL IT WITH THE IDS THE SERVER NAMED, never with the ids that were asked
 * for. `sell_cards` and `commit_cards_to_set` both hand back a `cards` array of
 * what actually went, and the two lists are not the same: a sale skips what its
 * rules refuse, and a commit takes the least valuable copy you hold rather than
 * the one that was ticked — so a player with three of somebody may well have
 * pressed one copy and burnt another. Dropping the pressed one would leave the
 * grid wrong in both directions at once.
 *
 * IT IS AN ECHO, NOT AN AUTHORITY, exactly like `applyCardDelta` beside it: the
 * rows are patched, the cache is dropped, and the next real read is still the
 * collection of record. What this buys is the half second in between, which is
 * the half second the player is looking at.
 *
 * IT INVALIDATES TOO, so it REPLACES `invalidateCollection()` at a call site
 * rather than sitting beside one. That is not tidiness: a patch can only
 * rewrite a value the cache still holds, so `invalidateCollection()` first and
 * `dropCards()` second is a silent no-op and the rows linger exactly as they
 * did before. Folding the two together is the only version of this that cannot
 * be wired up in the wrong order.
 */
export function dropCards(ids: string[]): void {
  if (ids.length > 0) {
    const gone = new Set(ids);
    collection.patch('mine', (rows) => rows.filter((row) => !gone.has(row.id)));
  }
  /* Subscribers have already taken the patched rows into their own state, so
     dropping the cache here costs them nothing and buys the guarantee every
     other mutation path relies on: the next read is a real one. */
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
      /* OVERTAKEN, so the answer is dropped rather than drawn. A sale that
         landed while this read was in the air has already taken its rows out of
         the cache and pushed them into this state — writing the pre-sale rows
         over them now would put the sold cards back on screen for as long as it
         takes something else to correct it. `seen.current` is deliberately left
         where it was, so the focus check reads this as a read still owed. */
      if (collection.version('mine') !== at) return;
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

  /**
   * AND CATCH UP WITHOUT LEAVING, which focus cannot do.
   *
   * `dropCards` rewrites the held rows under a screen that is looking at them —
   * the bulk bar sells from this very grid — so there is no focus change to
   * hang the update on. The cache pushes instead. See `SessionCache.subscribe`.
   *
   * `peek` rather than a value handed to the listener, so this cannot be the
   * thing that decides what the rows are: the cache is still the one copy, and
   * a patch that landed between two renders is picked up whole.
   */
  useEffect(
    () =>
      collection.subscribe(() => {
        const rows = collection.peek('mine');
        if (rows) setCards(rows);
      }),
    [],
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
