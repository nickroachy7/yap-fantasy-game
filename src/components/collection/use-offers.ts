/**
 * Which of your copies a set would take, for the WHOLE collection at once.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS AFFORDABLE, WHICH IS THE ONLY INTERESTING THING ABOUT IT
 * ---------------------------------------------------------------------------
 *
 * `use-bulk` reads the same RPC and reads it LAZILY — on the press of "Add to
 * sets" rather than on every tick — and its note gives the reason: firing it
 * per cell "would be a round trip per card". That is true of a per-card read
 * and it is not true of this one, because `card_actions` takes an ARRAY. The
 * roster caps at thirty. So the offers for an entire collection are one round
 * trip, not thirty, and the assumption that made them expensive enough to defer
 * to a confirmation dialog was an assumption about the wrong call shape.
 *
 * That is what makes "which of these finishes a set" answerable on the GRID.
 * Before this, the app knew — it had always known, `can_commit` is the server's
 * own conjunction — and only ever said so after the player had already done the
 * hard part by hand, inside the dialog confirming a selection they had guessed
 * their way to.
 *
 * The lazy read in `use-bulk` stays exactly where it is. It asks a different
 * question of the answer (which set, paying what, burning which copy) and it
 * asks it about a selection at the moment money moves; re-using a map cached
 * over here would be routing a commit off figures read at some earlier point in
 * the session. Two reads, and the cheap one is not the one that spends.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT ANSWERS, AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------------------------
 *
 * One question: is there at least one set that would take this copy right now.
 * Not which set, not what it pays, not whether this is the copy that burns —
 * all of which the same rows carry and none of which a filter chip can use. A
 * hook that returned the whole map would invite a caller to make a commitment
 * decision from it, which is the lazy read's job.
 *
 * IT IS NOT `in_set`. `my_collection.in_set` says another copy of this printed
 * card is already committed somewhere, which is a fact about the PLAYER and is
 * not the same question — a card already in a team set may still be commitable
 * to today's daily, and its own migration says so. `can_commit` is the only
 * thing that answers this, per copy, per set.
 *
 * ---------------------------------------------------------------------------
 * WHEN IT RE-READS
 * ---------------------------------------------------------------------------
 *
 * ON FOCUS, and on any change to the ids it is about — `use-starters`' cadence,
 * for `use-starters`' reason, plus one more. A set is completed on the Sets tab,
 * which is a focus change on the way back; and a card leaves the collection
 * under this very screen when the bulk bar sells it, which is not. The ids are
 * the second trigger because they are the thing that moves without a focus.
 *
 * A FAILED READ RETURNS AN EMPTY SET, which is `readCardActions`' own contract
 * and is the permissive direction: the chip reads zero and offers nothing,
 * rather than a grid that claims cards are commitable when nobody asked.
 * `ready` is what separates "nothing fits a set" from "we have not been told
 * yet", so the chip can decline to print a nought it cannot stand behind.
 *
 * AND `ready` IS PER-KEY, NOT A LATCH, which is the whole reason the answer and
 * the ids it is about are held in ONE piece of state. As two, `ready` went true
 * on the first answer and stayed true — so the window between the collection
 * changing and the new answer landing was spent printing the OLD count as
 * though it were current, which is the same nought-you-cannot-stand-behind in a
 * more convincing disguise. Comparing the answered key against the current one
 * makes the flag mean "we have been told about THESE cards".
 *
 * It also gets the refetch right for free: a focus re-read of an unchanged
 * collection keeps the same key, so the counts stay up while it runs instead of
 * blinking out and back on every visit to the tab.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { readCardActions } from '@/components/cards/card-actions';
import type { CollectionCard } from './types';

/**
 * Ids per RPC. A roster caps at thirty and this will not be reached — it is
 * here because the cap is a game rule and this is a URL-length one, and a
 * silently truncated answer would draw a chip that undercounts.
 */
const CHUNK = 100;

export type Offers = {
  /** Instance ids at least one set would take right now. */
  commitable: Set<string>;
  /** False until an answer has landed. Distinguishes "none" from "not yet". */
  ready: boolean;
};

const EMPTY: Set<string> = new Set();

export function useOffers(cards: CollectionCard[] | null): Offers {
  /* The answer AND the ids it is about, together — see the header for why they
     cannot be two states. */
  const [answer, setAnswer] = useState<{ key: string | null; commitable: Set<string> }>({
    key: null,
    commitable: EMPTY,
  });
  // Guards against a slow answer landing after the collection has moved on.
  const token = useRef(0);

  /* The ids, and the string that says whether they have changed. Joined rather
     than compared by identity: `dropCards` hands back a NEW array holding the
     same rows on every patch, so identity would re-read after a sale that took
     nothing. Thirty uuids is a cheap string to build once per collection. */
  const ids = useMemo(() => (cards ?? []).map((c) => c.id), [cards]);
  const key = useMemo(() => ids.join(','), [ids]);

  useFocusEffect(
    useCallback(() => {
      const mine = ++token.current;

      if (ids.length === 0) {
        /* An empty collection is a complete ANSWER, not a pending one — the
           chip should read 0 rather than sit blank for the whole session. */
        setAnswer({ key, commitable: EMPTY });
        return;
      }

      void (async () => {
        const next = new Set<string>();
        for (let i = 0; i < ids.length; i += CHUNK) {
          const offers = await readCardActions(ids.slice(i, i + CHUNK));
          if (mine !== token.current) return;
          for (const [id, action] of offers) {
            if (action.sets.some((s) => s.canCommit)) next.add(id);
          }
        }
        if (mine !== token.current) return;
        setAnswer({ key, commitable: next });
      })();

      return () => {
        token.current++;
      };
      /* `key` is the dependency and `ids` is read inside — the array is rebuilt
         whenever `cards` is, and depending on it directly would re-read on
         every patch that changed nothing. See its own note. */
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]),
  );

  return useMemo(
    () => ({ commitable: answer.commitable, ready: answer.key === key }),
    [answer, key],
  );
}
