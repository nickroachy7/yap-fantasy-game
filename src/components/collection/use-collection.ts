/**
 * Loads the signed-in player's owned cards.
 *
 * Two things here are deliberate and load-bearing:
 *
 * 1. PAGING. PostgREST silently caps a `.select()` at 1000 rows and returns no
 *    error when it truncates, so a large collection would quietly lose its tail
 *    and nothing would look wrong. Every page is fetched via `.range()` until a
 *    short page proves the end. The order is `career_fp desc, id asc` — the id
 *    tiebreak matters, because paging over a non-unique sort key can repeat or
 *    skip rows between requests.
 *
 * 2. PLAYER IDS. `my_collection` exposes `card_id` (the catalogue entry) but not
 *    `player_id`, and the player detail route is keyed by player. Rather than
 *    add a migration we resolve card_id -> player_id against `cards`, which is
 *    readable by any authenticated user. It is a second round trip, so it is
 *    non-fatal: if it fails the grid still renders, cards just are not tappable
 *    rather than navigating somewhere that does not exist.
 */
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { normaliseRow, type CollectionCard, type CollectionViewRow } from './types';

const COLUMNS =
  'id, card_id, player_name, position_abbreviation, team_abbreviation, injury_status, tier, career_fp, lineup_starts, tier_floor_fp, next_tier_at, next_tier_label, season, acquired_at, sell_value';

/** Comfortably under the PostgREST 1000-row ceiling. */
const PAGE_SIZE = 500;
/** A runaway loop against a paginated API is worse than a truncated grid. */
const MAX_PAGES = 60;
/** `.in()` becomes a query string, so the id list has to stay URL-sized. */
const LOOKUP_CHUNK = 150;

export type CollectionState = {
  /** Null until the first load resolves. */
  cards: CollectionCard[] | null;
  /** card_id -> player_id. Empty when the lookup has not landed or failed. */
  playerIds: Map<string, string>;
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

async function fetchPlayerIds(cardIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (let i = 0; i < cardIds.length; i += LOOKUP_CHUNK) {
    const chunk = cardIds.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await supabase.from('cards').select('id, player_id').in('id', chunk);

    if (error) throw new Error(error.message);
    for (const row of data ?? []) map.set(row.id, row.player_id);
  }

  return map;
}

export function useCollection(): CollectionState {
  const [cards, setCards] = useState<CollectionCard[] | null>(null);
  const [playerIds, setPlayerIds] = useState<Map<string, string>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await fetchAllRows();
      setCards(rows);

      const ids = [...new Set(rows.map((r) => r.cardId).filter((id): id is string => Boolean(id)))];
      try {
        setPlayerIds(await fetchPlayerIds(ids));
      } catch {
        // Non-fatal: the grid is still correct, it just stops being tappable.
        setPlayerIds(new Map());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your collection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { cards, playerIds, error, loading, refreshing, refresh };
}
