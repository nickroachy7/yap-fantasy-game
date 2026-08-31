/**
 * Everybody in a contest, and any one of their lineups.
 *
 * THE CONTEST PAGE HAD NO PEOPLE IN IT. It could say the format, the fee and a
 * count, which is a strange thing for a game whose whole opponent model is "you
 * are somewhere in a base of managers" — the base was never once drawn as
 * anybody. `contest_field` is what draws it.
 *
 * BOTH RPCS ARE SECURITY DEFINER OVER RLS-HIDDEN ROWS, so what they return is
 * deliberate rather than incidental: a name, a score, a place, a result, a
 * prize, a lineup. Nothing about anybody's collection, wallet, run or hearts.
 * See `20260826030000` and `20260830010000`.
 *
 * THE LINEUP IS A SEPARATE CALL because it belongs to a separate SCREEN. Every
 * entrant's slots shipped down with the list would be the whole contest's
 * roster in one payload, most of it never looked at; the field is a list you
 * scan and a lineup is a page you open.
 *
 * IT IS NO LONGER A SEPARATE PERMISSION. Lineups used to open one at a time, as
 * their last card kicked off, so the list could not carry slots it had decided
 * you may not see. That rule is gone — `20260830010000` — and what survives of
 * it is `locked`, which says whether what you are reading can still change.
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
   * Every card in this lineup has kicked off, so it can no longer be changed.
   *
   * NOT A PERMISSION. It was `open` and it gated the peek; now it is only the
   * difference between a filed lineup and a draft, which is what a reader
   * needs to know before drawing a conclusion from somebody else's team. It is
   * also what decides whether LEAVING is still possible — `leave_contest`
   * refuses once a card has started, and the button reads this rather than
   * guessing at the fixtures.
   */
  locked: boolean;
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
  locked: boolean;
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
          locked: Boolean(r.locked),
        })),
      );
      return null;
    },
    [contestId],
  );

  const { loading, error, reload } = useLoader(load);
  return { entrants, loading, error, reload };
}

/* -------------------------------------------------------------- a lineup */

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
 * One entrant's lineup, in the format's own slot order.
 *
 * THE SERVER STILL REFUSES ON A STRANGER — somebody who is not in this contest
 * raises rather than returning nothing, because an empty result cannot be told
 * apart from an empty lineup. That refusal is surfaced as written.
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
