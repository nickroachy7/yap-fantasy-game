/**
 * Everybody in a contest, and one of their lineups on demand.
 *
 * THE CONTEST PAGE HAD NO PEOPLE IN IT. It could say the format, the fee and a
 * count, which is a strange thing for a game whose whole opponent model is "you
 * are somewhere in a base of managers" — the base was never once drawn as
 * anybody. `contest_field` is what draws it.
 *
 * BOTH RPCS ARE SECURITY DEFINER OVER RLS-HIDDEN ROWS, so what they return is
 * deliberate rather than incidental: a name, a score, a place, a result, a
 * prize. Nothing about anybody's collection, wallet, run or hearts. See
 * `20260826030000`.
 *
 * THE LINEUP IS A SEPARATE CALL AND A SEPARATE DECISION. Every entrant's slots
 * shipped down with the list would be the whole contest's roster in one
 * payload, and most of it never looked at — but the real reason is the reveal
 * rule. `open` is decided per lineup, when every card in it has kicked off, and
 * a list that carried the slots would be shipping the ones it had decided you
 * may not see.
 */
import { useCallback, useState } from 'react';

import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

import type { Result } from '@/components/lineup/field';

export type FieldEntrant = {
  userId: string;
  displayName: string;
  avatarKey: string;
  lineupId: string;
  /** Slots occupied, not whether the lineup is legal. */
  filled: number;
  points: number;
  rank: number;
  /** Null until the week is final and the field is big enough to be a contest. */
  result: Result | null;
  /** Gems won, once settled. Null before that — never a projection. */
  prize: number | null;
  isMe: boolean;
  /**
   * Their lineup may be read.
   *
   * TRUE ONLY ONCE EVERY CARD IN IT HAS KICKED OFF, because players lock one at
   * a time and a week drains over four days rather than shutting at once. Open
   * it earlier and the last person to file reads the field's shape before
   * choosing; open it never and the best hour of the week is a list of numbers
   * with no lineups behind them. Your own is always open.
   */
  open: boolean;
};

type Row = {
  user_id: string;
  display_name: string;
  avatar_key: string;
  lineup_id: string;
  filled: number | string;
  points: number | string | null;
  rnk: number | string;
  result: string | null;
  prize: number | string | null;
  is_me: boolean;
  open: boolean;
};

/** Same trap as everywhere else: numeric and bigint can both arrive as strings. */
const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

export function useContestField(contestId: string | null) {
  const [entrants, setEntrants] = useState<FieldEntrant[] | null>(null);

  const load = useCallback<Load>(
    async (live) => {
      if (!contestId) {
        setEntrants(null);
        return null;
      }
      const { data, error } = await supabase.rpc('contest_field', { p_contest: contestId });
      if (!live()) return null;
      if (error) return error.message;

      setEntrants(
        ((data ?? []) as Row[]).map((r) => ({
          userId: r.user_id,
          displayName: r.display_name,
          avatarKey: r.avatar_key,
          lineupId: r.lineup_id,
          filled: Number(r.filled ?? 0),
          points: num(r.points) ?? 0,
          rank: Number(r.rnk ?? 0),
          result: (r.result as Result) ?? null,
          prize: num(r.prize),
          isMe: Boolean(r.is_me),
          open: Boolean(r.open),
        })),
      );
      return null;
    },
    [contestId],
  );

  const { loading, error, reload } = useLoader(load);
  return { entrants, loading, error, reload };
}

/* --------------------------------------------------------------- the peek */

export type PeekSlot = {
  slot: string;
  playerId: string;
  playerName: string;
  pos: string | null;
  team: string | null;
  tier: string;
  points: number;
  /** Their game has kicked off. False only on a bye, which cannot score. */
  started: boolean;
};

type PeekRow = {
  slot: string;
  player_id: string;
  player_name: string;
  pos: string | null;
  team: string | null;
  tier: string;
  points: number | string | null;
  started: boolean | null;
};

/**
 * One entrant's lineup, fetched when it is opened rather than with the list.
 *
 * THE SERVER REFUSES RATHER THAN RETURNING NOTHING when a lineup is not open
 * yet, and that refusal is surfaced as-is. An empty result is indistinguishable
 * from an empty lineup, and "they have not filed" and "you may not look yet"
 * are different sentences a reader is owed.
 */
export function useContestLineup(contestId: string | null, userId: string | null) {
  const [slots, setSlots] = useState<PeekSlot[] | null>(null);

  const load = useCallback<Load>(
    async (live) => {
      if (!contestId || !userId) {
        setSlots(null);
        return null;
      }
      const { data, error } = await supabase.rpc('contest_lineup', {
        p_contest: contestId,
        p_user: userId,
      });
      if (!live()) return null;
      if (error) return error.message;

      setSlots(
        ((data ?? []) as PeekRow[]).map((r) => ({
          slot: r.slot,
          playerId: r.player_id,
          playerName: r.player_name,
          pos: r.pos,
          team: r.team,
          tier: r.tier,
          points: num(r.points) ?? 0,
          started: Boolean(r.started),
        })),
      );
      return null;
    },
    [contestId, userId],
  );

  const { loading, error } = useLoader(load);
  return { slots, loading, error };
}
