/**
 * Which of your copies are standing in a lineup that has not been scored.
 *
 * WHY THE COLLECTION NEEDS TO KNOW. Multi-select can sell a handful of cards or
 * push them into sets, and neither is a thing to do to a player you are
 * starting this week:
 *
 *   SELLING one is refused outright. `sell_card`'s third guard is exactly this
 *     set — see 20260826050000, where the old blanket escrow was replaced by a
 *     per-copy check on `lineup_slots` — so a starter in a selection is a card
 *     the server will skip and a line of "1 skipped" afterwards.
 *
 *   COMMITTING one is WORSE, because it works. `commit_card_to_set` frees the
 *     card out of every unfinalized lineup it is standing in (20260825001000)
 *     and burns it. So ticking twelve spares with a starter among them empties
 *     a slot you filled on Tuesday, silently, and the first you know of it is a
 *     nought on Sunday.
 *
 * The grid therefore refuses to tick them at all, which is the only version of
 * this that cannot go wrong: a card that cannot be selected cannot reach either
 * action, and the reason is said where the tap happened rather than in a report
 * afterwards.
 *
 * IT IS THE SERVER'S OWN PREDICATE, not a guess. `card_actions.in_open_lineup`
 * is this same EXISTS against `lineup_slots` joined to `lineups` on
 * `scored_at is null`, and RLS scopes the read to the caller's own lineups — so
 * there is nothing here to get out of step with. What this cannot do is answer
 * for a card the grid has not drawn, which does not matter: it is only ever
 * asked about cards on screen.
 *
 * `scored_at`, NOT `finalized_at`, and the migration argues it: the question is
 * "would this pull a card out of a lineup you are about to play", which wants
 * the conservative answer. A week scored early is still a week you have not
 * played.
 *
 * REFETCHED ON FOCUS, and focus is the right trigger for THIS one where it was
 * the wrong trigger for the roster count. The set only moves when a lineup is
 * edited, which happens on another screen and therefore always costs a focus
 * change on the way back — unlike the held-card count, which moves under your
 * thumb on this very screen and now lives in `PlayerContext` for that reason.
 * A value cached for the session would be stale in exactly the situation this
 * exists to catch: set a lineup, come back, sell the man in it.
 *
 * A FAILED READ RETURNS AN EMPTY SET rather than throwing, which is the
 * permissive direction and is deliberate. The grid is correct without this; it
 * just stops warning. Both actions are still guarded server-side for the sale,
 * and blocking a whole collection's worth of selection because one small read
 * failed would be a worse screen than the one this is protecting.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** card_instance_ids currently filling a slot in an unscored lineup. */
export function useStarters(): Set<string> {
  const [starters, setStarters] = useState<Set<string>>(() => new Set());
  // Guards against a slow answer landing after the screen has moved on.
  const token = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const mine = ++token.current;
      void (async () => {
        /* `!inner` is load-bearing: without it the join is a left join and the
           `is null` filter on the parent stops narrowing anything, so every
           slot ever filled comes back and last month's cards read as starters. */
        const { data, error } = await supabase
          .from('lineup_slots')
          .select('card_instance_id, lineups!inner(scored_at)')
          .is('lineups.scored_at', null);
        if (error || mine !== token.current) return;

        const next = new Set<string>();
        for (const row of data ?? []) {
          if (row.card_instance_id) next.add(row.card_instance_id);
        }
        setStarters(next);
      })();
      return () => {
        token.current++;
      };
    }, []),
  );

  return starters;
}
