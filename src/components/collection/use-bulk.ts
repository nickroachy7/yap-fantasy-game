/**
 * Running a bulk sale or a bulk commit, and holding what happened.
 *
 * The screen owns WHICH cards are ticked; this owns what becomes of them. Same
 * split as `use-pull-actions` and the pack reveal, and for the same reason: the
 * grid is already the longest file in the feature and none of this is about
 * pixels.
 *
 * THE OFFERS ARE READ LAZILY, on the press of "Add to sets" rather than on every
 * tick. Selling needs nothing from the server — `my_collection` already carries
 * each copy's price — but routing a mixed selection into sets needs
 * `card_actions` for all of them, and firing that on every tap of a grid cell
 * would be a round trip per card for an action most selections never take.
 *
 * ONE RUN AT A TIME. `busy` gates every entry point. Both RPCs move the wallet,
 * and two in flight against one balance is the shape of every double-spend —
 * the server serialises them correctly, but the SCREEN would show a balance
 * disagreeing with itself.
 *
 * A COMMIT IS N CALLS, ONE PER SET, and they are deliberately sequential. Each
 * takes the wallet lock; firing fourteen at once would have thirteen of them
 * queue on it anyway, and a failure half way through a parallel batch leaves a
 * result nobody can describe. Sequential, the report is simply the sum of what
 * came back.
 */
import { useCallback, useState } from 'react';

import { readCardActions } from '@/components/cards/card-actions';
import { sellErrorMessage } from '@/components/players/sell';
import { usePlayer } from '@/context/PlayerContext';
import { supabase } from '@/lib/supabase';
import { planCommits, type CommitPlan } from './bulk';
import type { BulkResult, BulkStage } from './BulkBar';
import type { CollectionCard } from './types';
import { dropCards } from './use-collection';
import { invalidateSets } from './use-sets';

export type BulkState = {
  stage: BulkStage;
  busy: boolean;
  planning: boolean;
  plan: CommitPlan | null;
  error: string | null;
  result: BulkResult | null;
  /** Opens the sell confirmation. */
  askSell: () => void;
  /** Reads the offers for this selection, then opens the add confirmation. */
  askAdd: (selected: CollectionCard[]) => void;
  runSell: (selected: CollectionCard[]) => void;
  runAdd: () => void;
  /** Sells exactly the copies the add could not use. See `stage: 'leftovers'`. */
  runSellLeftovers: () => void;
  cancel: () => void;
  dismissResult: () => void;
};

export function useBulk(onDone: () => void): BulkState {
  const { refresh: refreshWallet, applyCardDelta } = usePlayer();

  const [stage, setStage] = useState<BulkStage>('idle');
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<CommitPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  const askSell = useCallback(() => {
    if (busy) return;
    setError(null);
    setResult(null);
    setStage('selling');
  }, [busy]);

  const askAdd = useCallback(
    (selected: CollectionCard[]) => {
      if (busy || selected.length === 0) return;
      setError(null);
      setResult(null);
      setPlanning(true);

      void (async () => {
        const offers = await readCardActions(selected.map((x) => x.id));
        const next = planCommits(selected, offers);
        setPlanning(false);
        /* NOTHING TO CONFIRM IS NOT A DIALOG. A selection where every card is
           already in its set, or belongs to none, would otherwise open a
           dialog whose only honest confirm label is "Add 0". Say so on the bar
           instead — it is the same surface the refusals are reported on. */
        setPlan(next);
        /* NOTHING TO ADD IS NOT A DEAD END. A selection no set will take used to
           report itself on the bar and stop there — which is the moment the
           player learns these cards are spare, and the moment they are least
           likely to want to keep them. So it goes straight to the offer. */
        setStage(next.legs.length === 0 ? 'leftovers' : 'adding');
      })();
    },
    [busy],
  );

  /**
   * The four things every completed run has to put back, plus the two the
   * player can see immediately.
   *
   * `gone` is the copies the run actually took, BY ID and as the server named
   * them — never the selection as it was ticked. A sale skips what its rules
   * refuse and a commit burns the least valuable copy you hold rather than the
   * one that was pressed, so the two lists come apart in both directions.
   *
   * Those ids do two jobs at once and both are about the same half second: the
   * rows leave the grid (`dropCards`) and the held count moves (`applyCardDelta`)
   * on the frame the result line appears, rather than a round trip later — with
   * the sold cards still sitting in the grid and the roster bar still telling
   * somebody who has just sold six that they are six over. `refreshWallet()`
   * immediately after is the record; these are the echo.
   */
  const settle = useCallback(
    async (gone: string[]) => {
      applyCardDelta(-gone.length);
      dropCards(gone);
      invalidateSets();
      await refreshWallet();
      onDone();
    },
    [applyCardDelta, refreshWallet, onDone],
  );

  const runSell = useCallback(
    (selected: CollectionCard[]) => {
      if (busy || selected.length === 0) return;
      setBusy(true);
      setError(null);

      void (async () => {
        try {
          const { data, error: err } = await supabase.rpc('sell_cards', {
            p_card_instance_ids: selected.map((x) => x.id),
          });
          if (err) throw new Error(sellErrorMessage(err.message));

          const r = (data ?? {}) as {
            sold?: number;
            skipped?: number;
            paid?: number;
            cards?: { card_instance_id?: string }[];
            refusals?: { reason?: string }[];
          };
          setStage('idle');
          setResult({
            kind: 'sold',
            done: r.sold ?? 0,
            skipped: r.skipped ?? 0,
            // The coins the server actually paid, not the total the bar
            // advertised. They agree, and the SQL suite asserts it.
            coins: r.paid ?? 0,
            firstReason: firstRefusal(r.refusals),
          });
          // What SOLD, not what was ticked: a selection of twelve that skipped
          // four took eight copies, and `cards` is those eight.
          await settle(soldIds(r.cards));
        } catch (e) {
          setError(e instanceof Error ? e.message : 'The sale could not be completed.');
        } finally {
          setBusy(false);
        }
      })();
    },
    [busy, settle],
  );

  const runAdd = useCallback(() => {
    if (busy || !plan) return;
    setBusy(true);
    setError(null);

    void (async () => {
      let added = 0;
      let skipped = 0;
      let paid = 0;
      let reason: string | null = null;
      /* The copies that actually burnt, across every leg. NOT `leg.cardIds`,
         which are printed-card ids and name the player rather than the copy —
         and not the ticked instance either, since the commit takes the cheapest
         copy you hold. Only the server can say. */
      const burnt: string[] = [];

      try {
        for (const leg of plan.legs) {
          const { data, error: err } = await supabase.rpc('commit_cards_to_set', {
            p_set_code: leg.setCode,
            p_card_ids: leg.cardIds,
          });
          /* A LEG THAT FAILS OUTRIGHT DOES NOT UNDO THE ONES BEFORE IT, and it
             must not be reported as though it had: those commits are committed.
             So it is counted as skipped with its reason and the loop goes on,
             which is the same posture the function itself takes toward one
             refused card inside a leg. */
          if (err) {
            skipped += leg.cardIds.length;
            reason = reason ?? err.message;
            continue;
          }
          const r = (data ?? {}) as {
            added?: number;
            skipped?: number;
            paid?: number;
            cards?: { card_instance_id?: string }[];
            refusals?: { reason?: string }[];
          };
          added += r.added ?? 0;
          skipped += r.skipped ?? 0;
          paid += r.paid ?? 0;
          burnt.push(...soldIds(r.cards));
          reason = reason ?? firstRefusal(r.refusals);
        }

        setResult({ kind: 'added', done: added, skipped, coins: paid, firstReason: reason });
        await settle(burnt);
        /* AND THEN THE REST. The add has taken everything a set would have; what
           is left is what the player ticked and nothing can use. The plan is
           kept rather than cleared because it is the only record of which
           copies those were — the selection itself has just been dropped by
           `settle`. */
        if (plan.leftovers.length > 0) {
          setStage('leftovers');
        } else {
          setStage('idle');
          setPlan(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The cards could not be added.');
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, plan, settle]);

  /**
   * Sell the copies the add could not use.
   *
   * ONE CALL, ON IDS CAPTURED BEFORE THE COMMIT RAN, and that is safe for the
   * one reason every bulk action here is safe: `sell_cards` skips what its rules
   * refuse and says why. A leftover CAN have gone in the meantime — a player
   * ticked twice sends one copy to a set and the server burns the cheapest,
   * which may be the very copy left over — so the run reports "3 sold, 1
   * skipped" rather than pretending otherwise.
   */
  const runSellLeftovers = useCallback(() => {
    if (busy || !plan || plan.leftovers.length === 0) return;
    const ids = plan.leftovers.map((x) => x.id);
    setBusy(true);
    setError(null);

    void (async () => {
      try {
        const { data, error: err } = await supabase.rpc('sell_cards', {
          p_card_instance_ids: ids,
        });
        if (err) throw new Error(sellErrorMessage(err.message));

        const r = (data ?? {}) as {
          sold?: number;
          skipped?: number;
          paid?: number;
          cards?: { card_instance_id?: string }[];
          refusals?: { reason?: string }[];
        };
        setStage('idle');
        setPlan(null);
        setResult({
          kind: 'sold',
          done: r.sold ?? 0,
          skipped: r.skipped ?? 0,
          coins: r.paid ?? 0,
          firstReason: firstRefusal(r.refusals),
        });
        await settle(soldIds(r.cards));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The sale could not be completed.');
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, plan, settle]);

  const cancel = useCallback(() => {
    if (busy) return;
    setStage('idle');
    setPlan(null);
    setError(null);
  }, [busy]);

  const dismissResult = useCallback(() => setResult(null), []);

  return {
    stage,
    busy,
    planning,
    plan,
    error,
    result,
    askSell,
    askAdd,
    runSell,
    runAdd,
    runSellLeftovers,
    cancel,
    dismissResult,
  };
}

/**
 * The copy ids out of a bulk answer's `cards` array.
 *
 * `sell_cards` and `commit_cards_to_set` both return one object per copy that
 * went, each carrying `card_instance_id` — this is the same shape read the same
 * way for both, which is deliberate: the two functions are written as twins
 * (see `sell_cards`' own note) and a client that read them differently would be
 * the place they came apart.
 */
function soldIds(cards: { card_instance_id?: string }[] | undefined): string[] {
  return (cards ?? []).map((c) => c.card_instance_id).filter((id): id is string => !!id);
}

/** The first reason the server gave, if it gave one. Shown verbatim. */
function firstRefusal(refusals: { reason?: string }[] | undefined): string | null {
  const raw = refusals?.[0]?.reason;
  return raw ? raw.trim() : null;
}
