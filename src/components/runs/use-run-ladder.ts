/**
 * The carry ladder: how many wins keep how many cards through a death.
 *
 * ---------------------------------------------------------------------------
 * WHY THE WHOLE LADDER, WHEN `my_run()` ALREADY SENDS THE NEXT RUNG
 * ---------------------------------------------------------------------------
 *
 * `next_rung` answers "what does one more win buy me", which is the right
 * question to put in a status line and the wrong one to build a header on. A
 * single rung cannot say whether the reader is near the bottom of the ladder or
 * near the top, what the ceiling is, or which rungs are already behind them —
 * and those three are the whole of why anybody keeps a run alive.
 *
 * The set checklist made this argument first and it is quoted here because it
 * is the same argument: the ladder is "the whole answer to 'why would I keep
 * going on a set I will never finish' — every reward on it, what each wants,
 * what each pays, and which are behind you". Swap set for run and it holds
 * word for word.
 *
 * ---------------------------------------------------------------------------
 * A TABLE READ, NOT AN RPC, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------
 *
 * `run_carry_ladder` is four rows of config with a select policy on it
 * (`20260825110000`), so there is nothing to compute and nothing to hide. An
 * RPC would be a function whose entire body is `select * from`, and one more
 * thing to keep in step with the table it wraps.
 *
 * IT IS THE SERVER'S LADDER, NEVER A CONSTANT HERE. `run_carry_slots()` is what
 * a death actually settles against, and its own comment says why it is a
 * function: "getting it slightly wrong in one of them is the kind of bug that
 * only shows up on a death screen". A client-side copy of these four numbers is
 * exactly that bug, drawn in a header, promising a card the wipe will not keep.
 */
import { useCallback, useState } from 'react';

import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

export type CarryRung = {
  /** Wins needed to stand on this rung. */
  atWins: number;
  /** Cards a death keeps from here. */
  cardSlots: number;
};

type Row = { min_wins: number | string; card_slots: number | string };

export function useRunLadder() {
  const [rungs, setRungs] = useState<CarryRung[] | null>(null);

  const load = useCallback<Load>(async (live) => {
    const { data, error } = await supabase
      .from('run_carry_ladder')
      .select('min_wins, card_slots')
      .order('min_wins');
    if (!live()) return null;
    if (error) return error.message;

    setRungs(
      ((data ?? []) as Row[]).map((r) => ({
        atWins: Number(r.min_wins),
        cardSlots: Number(r.card_slots),
      })),
    );
    return null;
  }, []);

  const { loading, error, reload } = useLoader(load);
  return { rungs, loading, error, reload };
}

/**
 * The rung a win count stands on, and the one above it.
 *
 * THE SAME "HIGHEST AT OR BELOW" READ `run_carry_slots()` DOES, which is the
 * one piece of the server's logic this file does reproduce — because a header
 * that draws the ladder has to mark a place on it, and there is no round trip
 * that answers "which row am I on" for a list already in hand. It is kept to
 * one function for the reason the migration gives about its own: a rule spelled
 * out twice is a rule that will one day be spelled out differently.
 *
 * `next` is null on the top rung, where there is nothing left to climb to.
 */
export function standingOn(
  rungs: CarryRung[],
  wins: number,
): { here: CarryRung | null; next: CarryRung | null } {
  let here: CarryRung | null = null;
  let next: CarryRung | null = null;
  for (const rung of rungs) {
    if (rung.atWins <= Math.max(wins, 0)) here = rung;
    else if (next === null) next = rung;
  }
  return { here, next };
}
