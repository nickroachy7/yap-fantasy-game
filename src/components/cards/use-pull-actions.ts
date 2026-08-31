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
 * think "spare" — so the buttons belong there. The bar's whole-pack sweeps are
 * the same argument taken one step further; see `runSweep` and `pull-plan`.
 *
 * WHAT IS HERE AND WHAT IS NOT. This owns the reads and the writes; `PullDeck`
 * and `PullBar` own the pixels and know nothing about supabase, which is the
 * same split `PackShelf` already has with the screen above it. It lives beside
 * the components rather than in the route because the pull is a component's
 * worth of state, and the route has enough of its own.
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
 * KEEPING IS THE ONE THING HERE THAT IS NOT AN ACT. `kept` writes nothing and
 * asks the server nothing; it is the player marking a card so the bar's
 * whole-pack sweeps step over it, and it toggles both ways. It lives beside
 * `disposed` rather than in the deck because the PLAN reads it and the plan is
 * built one screen up — and because it has to be dropped with the pack, which
 * the tagged state below does for free.
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

import { dropCards } from '@/components/collection/use-collection';
import { invalidateSets } from '@/components/collection/use-sets';
import { sellErrorMessage } from '@/components/players/sell';
import { usePlayer } from '@/context/PlayerContext';
import { supabase } from '@/lib/supabase';
import { readCardActions, type CardActions } from './card-actions';
import type { PlannedCommit, PlannedSell } from './pull-plan';
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
  | { kind: 'sold'; coins: number }
  | { kind: 'committed'; setName: string; coins: number; burnedThisCopy: boolean };

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Everything scoped to one pack opening, tagged with which opening it is. */
type PullState = {
  /** The pull's identity: its card_instance_ids, joined. '' when there is no pull. */
  key: string;
  actions: Map<string, CardActions>;
  disposed: Map<string, Disposition>;
  /** Cards the player has held back from the sweeps. Toggles; writes nothing. */
  kept: Set<string>;
  loading: boolean;
  busy: string | null;
  sweep: Sweeping | null;
  error: string | null;
};

/**
 * A "do this to all of them" pass, while it is running.
 *
 * SEPARATE FROM `busy`, which names ONE card and is what a per-card button
 * waits on. A sweep is not one card — it is a queue, and the thing that has to
 * be disabled during it is every button on the screen including the other
 * sweep. Folding the two into one field meant the bar could not tell "this card
 * is selling" from "the pack is selling" and drew a spinner in the wrong place.
 */
export type Sweeping = { kind: 'commit' | 'sell'; done: number; total: number };

const fresh = (key: string): PullState => ({
  key,
  actions: new Map(),
  disposed: new Map(),
  kept: new Set(),
  loading: key !== '',
  busy: null,
  sweep: null,
  error: null,
});

export type PullActionsState = {
  /** Keyed by card_instance_id. Empty until the first read lands. */
  actions: Map<string, CardActions>;
  /** True only while the FIRST read for this pull is in flight. */
  loading: boolean;
  /** What each card became. Only ever grows within one pull. */
  disposed: Map<string, Disposition>;
  /**
   * The cards the sweeps must not touch, by `card_instance_id`.
   *
   * Read by `planSweep`, which is what makes it mean anything. A kept card is
   * still fully actionable on its own — see `toggleKeep`.
   */
  kept: Set<string>;
  /** The card a write is in flight for, if any. Blocks every other button. */
  busy: string | null;
  /** A whole-pack pass, while it runs. Blocks everything. */
  sweep: Sweeping | null;
  /** The last refusal, in words a player can act on. */
  error: string | null;
  clearError: () => void;
  sell: (cardInstanceId: string) => void;
  commit: (cardInstanceId: string, setCode: string) => void;
  /** Add every planned card to its set, one write at a time. */
  commitAll: (plan: PlannedCommit[]) => void;
  /** Sell every planned card, one write at a time. */
  sellAll: (plan: PlannedSell[]) => void;
  /** Hold a card back from the sweeps, or stop holding it back. */
  toggleKeep: (cardInstanceId: string) => void;
};

export function usePullActions(pulled: Pulled[] | null): PullActionsState {
  const { refresh: refreshWallet, applyCardDelta } = usePlayer();

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
    async (at: string, gone: string | null) => {
      /* ONE COPY, ALWAYS, whichever act it was. A sale takes the copy in hand;
         a commit takes the least valuable copy you hold, which may be a
         different one — but it is exactly one either way.

         `gone` is WHICH one, as the server named it, so the inventory loses the
         right row rather than the pressed one. Both move now rather than when
         the read below lands, so the header, the roster warning and the grid
         behind this sheet agree with the card that has just been stamped. See
         `applyCardDelta` and `dropCards`. */
      applyCardDelta(-1);
      dropCards(gone ? [gone] : []);
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
    [applyCardDelta, refreshWallet, foldInto],
  );

  const sell = useCallback(
    (cardInstanceId: string) => {
      if (state.busy || state.sweep) return;
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
          disposed: new Map(held.disposed).set(cardInstanceId, { kind: 'sold', coins: value }),
        }));
        // A sale always takes the copy that was pressed, so there is nothing to
        // read back — unlike the commit below.
        await settle(at, cardInstanceId);
      })();
    },
    [state.busy, state.sweep, state.key, state.actions, foldInto, settle],
  );

  const commit = useCallback(
    (cardInstanceId: string, setCode: string) => {
      if (state.busy || state.sweep) return;
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

        /* The coins the server actually paid, not the figure the button
           advertised. They agree today and the SQL suite asserts it; reading it
           back is what keeps that true if the payout rule ever moves. */
        const answer = data as { paid?: number; card_instance_id?: string } | null;
        const paid = num(answer?.paid);
        /* WHICH COPY BURNT, read back rather than assumed. `commit_card_to_set`
           takes the least valuable copy you hold, which on a player you own
           twice is not the card in front of you — and the inventory behind this
           sheet has to lose that one. */
        const burnt = typeof answer?.card_instance_id === 'string' ? answer.card_instance_id : null;
        foldInto(at, (held) => ({
          ...held,
          disposed: new Map(held.disposed).set(cardInstanceId, {
            kind: 'committed',
            setName: target.name,
            coins: paid,
            burnedThisCopy: action.burnsThisCopy,
          }),
        }));
        await settle(at, burnt);
      })();
    },
    [state.busy, state.sweep, state.key, state.actions, foldInto, settle],
  );

  /**
   * Do one act to every card a plan names, one write at a time.
   *
   * SEQUENTIAL, AND NOT NEGOTIABLE. Both RPCs take the same wallet row lock, so
   * fifty fired together queue on it anyway — and a failure in the middle of a
   * pile of concurrent writes cannot be reported truthfully, because there is
   * no "middle". This is the same shape as the open loop on the shelf and
   * `claimAll` in `SetsPanel`, for the same reason.
   *
   * IT DOES NOT STOP AT A REFUSAL, and that is the difference from the open
   * loop. There, every open is the same pack against the same balance, so
   * whatever refused the fourth refuses the fifth. Here each write is a
   * DIFFERENT card into a different slot: a set that filled up under us refuses
   * that one card and has nothing to say about the next seven. Stopping would
   * abandon work the player asked for on the strength of one card's bad luck.
   * The refusals are counted and the last one is quoted.
   *
   * ONE TIDY-UP AT THE END, NOT ONE PER CARD. The single-card path re-reads
   * `card_actions` and the wallet after every write, which is right when the
   * player is about to press another button on the same screen. A fifty-card
   * sweep doing that is fifty extra round trips to produce answers that are
   * stale again one write later. The counts move optimistically as it goes
   * (see `applyCardDelta`), and the truth lands once when it is over.
   */
  const runSweep = useCallback(
    (kind: 'commit' | 'sell', items: (PlannedCommit | PlannedSell)[]) => {
      if (state.busy || state.sweep || items.length === 0) return;
      const at = state.key;
      const held = state.actions;

      setState((s) => ({ ...s, sweep: { kind, done: 0, total: items.length }, error: null }));

      void (async () => {
        const stamped = new Map<string, Disposition>();
        /** Every copy the server actually took, so the inventory loses those. */
        const burnt: string[] = [];
        let refused = 0;
        let lastRefusal: string | null = null;

        for (const item of items) {
          if (kind === 'sell') {
            const sale = item as PlannedSell;
            const { error } = await supabase.rpc('sell_card', {
              p_card_instance_id: sale.cardInstanceId,
            });
            if (error) {
              refused += 1;
              lastRefusal = sellErrorMessage(error.message);
            } else {
              stamped.set(sale.cardInstanceId, { kind: 'sold', coins: sale.coins });
              burnt.push(sale.cardInstanceId);
            }
          } else {
            const add = item as PlannedCommit;
            const action = held.get(add.cardInstanceId);
            if (!action) {
              refused += 1;
            } else {
              const { data, error } = await supabase.rpc('commit_card_to_set', {
                p_set_code: add.setCode,
                p_card_id: action.cardId,
              });
              if (error) {
                refused += 1;
                // Verbatim: every refusal this RPC raises is written for a player.
                lastRefusal = error.message;
              } else {
                const answer = data as { paid?: number; card_instance_id?: string } | null;
                stamped.set(add.cardInstanceId, {
                  kind: 'committed',
                  setName: add.setName,
                  coins: num(answer?.paid),
                  burnedThisCopy: !add.spare,
                });
                if (typeof answer?.card_instance_id === 'string') {
                  burnt.push(answer.card_instance_id);
                }
              }
            }
          }

          foldInto(at, (s) =>
            s.sweep ? { ...s, sweep: { ...s.sweep, done: s.sweep.done + 1 } } : s,
          );
        }

        /* THE STAMPS GO ON BEFORE THE TIDY-UP, so the deck shows what happened
           the moment the last write lands rather than a round trip later. */
        foldInto(at, (s) => ({
          ...s,
          disposed: new Map([...s.disposed, ...stamped]),
        }));

        if (burnt.length > 0) {
          applyCardDelta(-burnt.length);
          dropCards(burnt);
        }
        invalidateSets();

        const summary =
          refused === 0
            ? null
            : /* Counted as CARDS, because that is what the player pressed on.
                 "3 of 8 added" plus the reason is the whole of what went wrong;
                 naming eight separate refusals would bury it. */
              `${items.length - refused} of ${items.length} ${
                kind === 'sell' ? 'sold' : 'added'
              }${lastRefusal ? ` — ${lastRefusal}` : '.'}`;

        try {
          const [, actions] = await Promise.all([refreshWallet(), readCardActions(at.split(','))]);
          foldInto(at, (s) => ({ ...s, actions, sweep: null, error: summary }));
        } catch {
          /* The writes already happened. A tidy-up that throws must not leave
             the sweep flag set, or every button on the page stays disabled with
             nothing on screen explaining why. */
          foldInto(at, (s) => ({ ...s, sweep: null, error: summary }));
        }
      })();
    },
    [state.busy, state.sweep, state.key, state.actions, foldInto, applyCardDelta, refreshWallet],
  );

  const commitAll = useCallback((plan: PlannedCommit[]) => runSweep('commit', plan), [runSweep]);
  const sellAll = useCallback((plan: PlannedSell[]) => runSweep('sell', plan), [runSweep]);

  /**
   * Keep this one out of the sweeps, or put it back in.
   *
   * IT DOES NOT WAIT ON `busy` OR `sweep`, unlike every other function here.
   * Those two guard the WALLET — one write at a time against one balance — and
   * this is not a write. What it also is not is a lock: a kept card's own Add
   * and Sell buttons go on working, because pressing a button on one card is
   * the player naming that card, and there is nothing there to protect them
   * from. The flag only ever answers "did you mean this one too?", which is the
   * only question a button that acts on eight cards has to ask.
   */
  const toggleKeep = useCallback((cardInstanceId: string) => {
    setState((held) => {
      const next = new Set(held.kept);
      /* `delete` reports whether it removed anything, so the toggle is one
         lookup rather than a `has` and then one of two branches. */
      if (!next.delete(cardInstanceId)) next.add(cardInstanceId);
      return { ...held, kept: next };
    });
  }, []);

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
    kept: live.kept,
    busy: live.busy,
    sweep: live.sweep,
    error: live.error,
    clearError,
    sell,
    commit,
    commitAll,
    sellAll,
    toggleKeep,
  };
}
