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
 */
import { useCallback, useState } from 'react';

import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';
import { normaliseRow, type CollectionCard, type CollectionViewRow } from './types';

const COLUMNS =
  'id, card_id, player_name, position_abbreviation, team_abbreviation, injury_status, tier, career_fp, lineup_starts, tier_floor_fp, next_tier_at, next_tier_label, season, acquired_at, sell_value';

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

export function useCollection(): CollectionState {
  const [cards, setCards] = useState<CollectionCard[] | null>(null);

  const load = useCallback<Load>(async (live) => {
    try {
      const rows = await fetchAllRows();
      if (!live()) return;
      setCards(rows);
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not load your collection.';
    }
  }, []);

  const { loading, refreshing, error, refresh } = useLoader(load);

  return { cards, error, loading, refreshing, refresh };
}
