/**
 * The two exits a freshly pulled card has, and the state of taking them.
 *
 * WHY THE PACK SCREEN NEEDED THIS AT ALL
 *
 * A pack deals five to eight cards and most of them are duplicates you are
 * never going to start. Until now the only thing you could do on the reveal was
 * look at them: selling lived on `card/[id]` and committing lived on
 * `set/[code]`, so clearing a pack meant leaving the sheet, finding each card in
 * an inventory that had just grown by eight, and acting on it there. The two
 * decisions are made AT the reveal — that is the moment you look at a card and
 * think "spare" — so the buttons belong there.
 *
 * WHAT IS HERE AND WHAT IS NOT. This owns the reads and the writes; `PackReveal`
 * owns the pixels and knows nothing about supabase, which is the same split
 * `PackShelf` already has with the screen above it. It lives beside the
 * components rather than in the route because the pull is a component's worth
 * of state, and the route is already the longest file in the feature.
 *
 * EVERY FIGURE COMES FROM THE SERVER, read through `card-actions` — which is
 * its own module rather than part of this one because the card profile now
 * offers the same two exits and must not import them out of the pack reveal.
 * Nothing here recomputes a figure; see that file's note.
 *
 * ONE CARD AT A TIME, DELIBERATELY. `busy` is a single id rather than a set, so
 * a second tap while a sale is in flight does nothing. Both RPCs move the
 * wallet, and two in flight against one balance is the shape of every
 * double-spend — the server locks the row and would serialise them correctly,
 * but the SCREEN would show a balance that briefly disagrees with itself.
 *
 * AN ACT IS NEVER UNDONE. Selling and committing are both permanent
 * server-side, so `disposed` only ever grows. What it does NOT decide is
 * whether the card can still be acted on — see `Disposition`.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY FIELD LIVES IN ONE STATE OBJECT, TAGGED WITH THE PULL
 * ---------------------------------------------------------------------------
 *
 * All of it is scoped to one pack opening, and "Open another" has to drop the
 * lot at once: the offers, what was done with them, whatever was in flight and
 * whatever went wrong. Five `useState`s reset one after another in an effect is
 * the version this replaced, and it was wrong twice over — it renders the new
 * pull once against the old pack's answers before the effect runs, and it is
 * the cascading-render pattern React now lints for.
 *
 * So the pull's id IS part of the state, compared during render, and a
 * mismatch swaps the whole object before anything is drawn. That tag is also
 * what makes the async paths safe without a single ref: every write checks that
 * the state it is about to fold into still belongs to the pull it was started
 * for, and a late answer from the previous pack lands on nothing.
 */
import { useCallback, useEffect, useState } from 'react';

import { invalidateCollection } from '@/components/collection/use-collection';
import { invalidateSets } from '@/components/collection/use-sets';
import { sellErrorMessage } from '@/components/players/sell';
import { usePlayer } from '@/context/PlayerContext';
import { supabase } from '@/lib/supabase';
import { readCardActions, type CardActions } from './card-actions';
import type { Pulled } from './PackShelf';

/**
 * What the player did with a card on the reveal.
 *
 * A RECORD OF THE ACT, NOT A CLAIM THAT THE CARD IS GONE. Selling always takes
 * the copy in hand, but a commit takes the least valuable copy you hold — so
 * committing a player you already own a spare of leaves the pulled card exactly
 * where it was. `burnedThisCopy` says which happened, and the card's `held`
 * flag on the re-read is what actually decides whether it is still actionable.
 */
export type Disposition =
  | { kind: 'sold'; gems: number }
  | { kind: 'committed'; setName: string; gems: number; burnedThisCopy: boolean };

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Everything scoped to one pack opening, tagged with which opening it is. */
type PullState = {
  /** The pull's identity: its card_instance_ids, joined. '' when there is no pull. */
  key: string;
  actions: Map<string, CardActions>;
  disposed: Map<string, Disposition>;
  loading: boolean;
  busy: string | null;
  error: string | null;
};

const fresh = (key: string): PullState => ({
  key,
  actions: new Map(),
  disposed: new Map(),
  loading: key !== '',
  busy: null,
  error: null,
});

export type PullActionsState = {
  /** Keyed by card_instance_id. Empty until the first read lands. */
  actions: Map<string, CardActions>;
  /** True only while the FIRST read for this pull is in flight. */
  loading: boolean;
  /** What each card became. Only ever grows within one pull. */
  disposed: Map<string, Disposition>;
  /** The card a write is in flight for, if any. Blocks every other button. */
  busy: string | null;
  /** The last refusal, in words a player can act on. */
  error: string | null;
  clearError: () => void;
  sell: (cardInstanceId: string) => void;
  commit: (cardInstanceId: string, setCode: string) => void;
};

export function usePullActions(pulled: Pulled[] | null): PullActionsState {
  const { refresh: refreshWallet } = usePlayer();

  const key = pulled?.map((p) => p.card_instance_id).join(',') ?? '';
  const [state, setState] = useState<PullState>(() => fresh(key));

  /* A NEW PULL DROPS THE OLD ONE'S EVERYTHING, before a frame of it is drawn.
     React's own "adjusting state when a prop changes" — it re-renders
     immediately with the new state and throws the in-progress output away, so
     the second pack never renders against the first pack's offers. */
  if (state.key !== key) setState(fresh(key));

  /* The tag guard, applied to every asynchronous fold. A read or a write
     started against the previous pack resolves into nothing. */
  const foldInto = useCallback(
    (at: string, patch: (held: PullState) => PullState) => {
      setState((held) => (held.key === at ? patch(held) : held));
    },
    [],
  );

  useEffect(() => {
    if (!key) return;
    let live = true;
    void readCardActions(key.split(',')).then((actions) => {
      if (!live) return;
      setState((held) => (held.key === key ? { ...held, actions, loading: false } : held));
    });
    return () => {
      live = false;
    };
  }, [key]);

  /**
   * What both writes do after the server says yes.
   *
   * THE SAME FOUR THINGS THE REST OF THE APP INVALIDATES, for the reasons
   * `use-collection` and `use-sets` set out: the card is gone from the
   * collection, the sets moved, the wallet moved — and the buttons on the OTHER
   * cards in this pack may have moved with them, since committing a Bills card
   * changes what a second Bills card in the same pack is offered. That last one
   * is why this re-reads `card_actions` rather than patching the map in place.
   */
  const settle = useCallback(
    async (at: string) => {
      invalidateCollection();
      invalidateSets();
      try {
        const [, actions] = await Promise.all([refreshWallet(), readCardActions(at.split(','))]);
        foldInto(at, (held) => ({ ...held, actions, busy: null }));
      } catch {
        /* THE BUTTONS COME BACK EVEN WHEN THE TIDY-UP FAILS. This runs after
           the server has already said yes, so a wallet refresh that throws must
           not leave `busy` set — the card would be stamped with what it became
           and every button on every card in the deck would stay disabled with
           nothing on screen explaining why. The offers on hand are stale by one
           act; the next one the player takes corrects them. */
        foldInto(at, (held) => ({ ...held, busy: null }));
      }
    },
    [refreshWallet, foldInto],
  );

  const sell = useCallback(
    (cardInstanceId: string) => {
      if (state.busy) return;
      const at = state.key;
      const value = state.actions.get(cardInstanceId)?.sellValue ?? 0;
      setState((held) => ({ ...held, busy: cardInstanceId, error: null }));

      void (async () => {
        const { error } = await supabase.rpc('sell_card', { p_card_instance_id: cardInstanceId });
        if (error) {
          foldInto(at, (held) => ({ ...held, busy: null, error: sellErrorMessage(error.message) }));
          return;
        }
        foldInto(at, (held) => ({
          ...held,
          disposed: new Map(held.disposed).set(cardInstanceId, { kind: 'sold', gems: value }),
        }));
        await settle(at);
      })();
    },
    [state.busy, state.key, state.actions, foldInto, settle],
  );

  const commit = useCallback(
    (cardInstanceId: string, setCode: string) => {
      if (state.busy) return;
      const at = state.key;
      const action = state.actions.get(cardInstanceId);
      const target = action?.sets.find((s) => s.code === setCode);
      if (!action || !target) return;

      setState((held) => ({ ...held, busy: cardInstanceId, error: null }));

      void (async () => {
        const { data, error } = await supabase.rpc('commit_card_to_set', {
          p_set_code: setCode,
          p_card_id: action.cardId,
        });
        if (error) {
          /* Verbatim. Every refusal `commit_card_to_set` raises is written to
             be read by a player — see the note above `sellErrorMessage`, which
             exists because `sell_card`'s are not. */
          foldInto(at, (held) => ({ ...held, busy: null, error: error.message }));
          return;
        }

        /* The gems the server actually paid, not the figure the button
           advertised. They agree today and the SQL suite asserts it; reading it
           back is what keeps that true if the payout rule ever moves. */
        const paid = num((data as { paid?: number } | null)?.paid);
        foldInto(at, (held) => ({
          ...held,
          disposed: new Map(held.disposed).set(cardInstanceId, {
            kind: 'committed',
            setName: target.name,
            gems: paid,
            burnedThisCopy: action.burnsThisCopy,
          }),
        }));
        await settle(at);
      })();
    },
    [state.busy, state.key, state.actions, foldInto, settle],
  );

  const clearError = useCallback(() => {
    setState((held) => (held.error === null ? held : { ...held, error: null }));
  }, []);

  /* Read off the CURRENT key rather than off `state`, which is one render
     behind whenever the adjustment above has just fired. */
  const live = state.key === key ? state : fresh(key);

  return {
    actions: live.actions,
    loading: live.loading,
    disposed: live.disposed,
    busy: live.busy,
    error: live.error,
    clearError,
    sell,
    commit,
  };
}
