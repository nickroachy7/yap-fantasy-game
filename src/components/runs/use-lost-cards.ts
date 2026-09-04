/**
 * The cards a dead run took, for the screen that gives some of them back.
 *
 * WHY NOT `useCollection`. The death screen used to pick from the collection,
 * because the wipe had not happened yet — the carry was a rescue. It happens at
 * settlement now (20260825235000), so by the time this screen renders the
 * collection is empty and the cards in question are gone. `my_lost_cards` is
 * the pool the carry is actually chosen from.
 *
 * SAME SHAPE, SAME NORMALISER, ON PURPOSE. The view is derived from
 * `my_collection`'s own definition, so these rows come back with exactly the
 * columns `normaliseRow` already knows how to read and render through the same
 * card component. A parallel type would drift, and it would drift into the one
 * screen where a card rendering wrong is least forgivable.
 *
 * NOT CACHED, unlike the collection. It is read once on a screen that exists
 * for one decision and empties itself the moment that decision lands — the view
 * is scoped to the run awaiting a carry, so after `claim_carry` it returns
 * nothing at all. Caching that would mean holding a list whose whole purpose is
 * to stop existing.
 */
import { useCallback, useState } from 'react';

import { normaliseRow, type CollectionCard, type CollectionViewRow } from '@/components/collection/types';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

/** The same columns `use-collection` selects, for the same normaliser. */
const COLUMNS =
  'id, card_id, player_name, position_abbreviation, team_abbreviation, injury_status, tier, career_fp, lineup_starts, tier_floor_fp, next_tier_at, next_tier_label, season, acquired_at, sell_value, fp_per_game, in_set';

export type LostCardsState = {
  /** Null until the first load resolves. */
  cards: CollectionCard[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useLostCards(): LostCardsState {
  const [cards, setCards] = useState<CollectionCard[] | null>(null);

  const load = useCallback<Load>(async (live) => {
    /* `security_invoker`, so RLS scopes this to the caller and no user filter
       is sent — the same reasoning as `my_collection`. The run scoping is in
       the view itself. */
    const { data, error } = await supabase
      .from('my_lost_cards')
      .select(COLUMNS)
      .order('career_fp', { ascending: false })
      .order('id', { ascending: true });

    if (!live()) return null;
    if (error) return error.message;
    setCards(((data ?? []) as CollectionViewRow[]).map(normaliseRow));
    return null;
  }, []);

  const { loading, error, reload } = useLoader(load);
  return { cards, loading, error, reload };
}
