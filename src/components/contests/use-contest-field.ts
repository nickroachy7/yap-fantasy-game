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
 * prize, a lineup. Nothing about anybody's collection, wallet or run.
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
import { sessionCache } from '@/lib/session-cache';
import { supabase } from '@/lib/supabase';

import type { Result } from '@/components/lineup/field';
import { resolveStatus, type GameContext } from '@/components/lineup/model';

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
  /** Coins won, once settled. Null before that — never a projection. */
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

/**
 * THE FIELD, HELD BETWEEN VISITS.
 *
 * Unlike the slot shapes this is live: entrants arrive, lineups fill, scores
 * move on a Sunday. So it is cached to be SHOWN and never to be trusted — the
 * hook seeds from memory, then invalidates and re-reads on every mount, which
 * is what `useLoader` was already doing. What changes is only what the reader
 * looks at while that runs: the field as it was a moment ago, not a hole.
 *
 * Keyed by contest, so opening a second contest does not show the first one's
 * entrants for a frame.
 */
const fieldCache = sessionCache<string, FieldEntrant[]>(async (contestId) => {
  const { data, error } = await supabase.rpc('contest_field', { p_contest: contestId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((r) => ({
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
  }));
});

/**
 * Forget every contest's field. The rows carry `is_me` and the reader's own
 * entry, so they are this account's view and must not outlive the account.
 * See `forgetUserData`.
 */
export function invalidateContestFields(): void {
  fieldCache.invalidate();
}

export function useContestField(contestId: string | null) {
  /* Seeded from memory so a revisit draws the field it already knows on the
     first paint. Null on a contest never opened, which is what the panel's
     skeleton is for. */
  const [entrants, setEntrants] = useState<FieldEntrant[] | null>(() =>
    contestId ? (fieldCache.peek(contestId) ?? null) : null,
  );

  const load = useCallback<Load>(
    async (live) => {
      if (!contestId) {
        setEntrants(null);
        return null;
      }
      /* INVALIDATED BEFORE EVERY READ, which is the whole trick and is easy to
         get wrong. `sessionCache.read` does not re-fetch after a success — it
         holds the resolved promise until something invalidates the key, which
         is right for immutable config and would freeze a live field: entrants
         arrive, lineups fill, scores move on a Sunday, and this would go on
         answering with the first version it ever saw.
         Clearing the key first forces the network every time. What survives is
         the copy already in component state, seeded from `peek` above, so the
         reader looks at the field as it was a moment ago instead of a hole. */
      fieldCache.invalidate(contestId);
      try {
        const rows = await fieldCache.read(contestId);
        if (!live()) return null;
        setEntrants(rows);
      } catch (err) {
        if (!live()) return null;
        return err instanceof Error ? err.message : 'Could not load the field.';
      }
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
  /**
   * What the CARD has earned across every week it has started, this one
   * included — so `careerFp - points` is what it walked in with.
   *
   * NULL MEANS THE SERVER DID NOT SEND IT, and that is a state worth being
   * able to represent. `career_fp` is `not null default 0` on the table, so a
   * real card always has one — null here can only mean this client is talking
   * to a database where `contest_lineup` has not been rewritten yet
   * (20260831020000). The row draws no card line at all in that case rather
   * than doing arithmetic on a zero that means "absent"; see `cardStory`.
   *
   * This is what makes the JS and the migration independent of each other. The
   * OTA can land first and show what it always showed, or the migration can
   * land first and wait — neither order produces a broken row, which matters
   * because CI publishes the update and does NOT run `db push`.
   */
  careerFp: number | null;
  /**
   * Where the card's current tier begins. Only interesting next to the two
   * figures above it: a card whose pre-contest total was below this floor was
   * promoted BY this contest. See `EntryLineup`.
   */
  tierFloorFp: number | null;
  /** Where the next tier begins, and which one. Null on the top tier. */
  nextTierAt: number | null;
  nextTierLabel: string | null;
  /**
   * WHAT THE CARD WAS PAID for this week, in coins.
   *
   * `coins` is the score award — 1.5 a point times the multiplier of the tier
   * the card held going INTO the week — and `bonusCoins` is the position-finish
   * bonus on top of it, which a handful of slots a week get and the rest do
   * not. Both are stamped onto the slot at payout rather than derived here, so
   * a row and the wallet cannot disagree about what was paid.
   *
   * `awarded` IS NOT `coins > 0`. A week that has been scored but not yet paid
   * has null in both; a card that scored nothing has an earned zero. Drawn the
   * same way, "not paid yet" would read as "earned nothing" — see the row.
   */
  coins: number | null;
  bonusCoins: number | null;
  awarded: boolean;
  /**
   * THE FIXTURE, so a settled row can be the board's row.
   *
   * `started` is a boolean and was the whole of what this function knew about
   * the game, which is enough to grey a figure and not enough to name one — a
   * card on a bye and a card whose club lost 27–13 drew the same two-line row.
   * `20260831050000` sends the fixture instead, in the shape `GameContext`
   * already has, so `Identity` can draw it without a second vocabulary.
   *
   * NULL IS A BYE. UNDEFINED IS "THIS SERVER DOES NOT SEND FIXTURES" — an
   * install without that migration — and the two must not be collapsed: a card
   * that played and scored, drawn as a bye, is the row telling a confident lie
   * about the one thing on it nobody can check from the screen. See `RowCard`.
   */
  game?: GameContext | null;
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
  /* numeric over the wire is a STRING through PostgREST, which is why every
     one of these goes through `num` rather than being trusted as a number. */
  career_fp: number | string | null;
  tier_floor_fp: number | string | null;
  next_tier_at: number | string | null;
  next_tier_label: string | null;
  coins: number | string | null;
  bonus_coins: number | string | null;
  awarded: boolean | null;
  /* OPTIONAL for the same reason `my_coins` is on `MyContest`: CI publishes JS
     without running `db push`, so the update has to survive landing on a
     database where `20260831050000` has not been applied. */
  opponent?: string | null;
  home?: boolean | null;
  starts_at?: string | null;
  status_state?: string | null;
  status_text?: string | null;
  team_score?: number | string | null;
  opp_score?: number | string | null;
};

/**
 * One entrant's lineup, in the format's own slot order.
 *
 * THE SERVER STILL REFUSES ON A STRANGER — somebody who is not in this contest
 * raises rather than returning nothing, because an empty result cannot be told
 * apart from an empty lineup. That refusal is surfaced as written.
 */
export function useContestLineup(contestId: string | null, userId: string | null) {
  /**
   * THE ANSWER, TAGGED WITH THE QUESTION IT ANSWERS.
   *
   * A bare `PeekSlot[] | null` survives a change of contest: the loader only
   * writes on success, so between "the reader swiped to another finished
   * contest" and "that contest's lineup arrived" the state still holds the
   * PREVIOUS one — and the board drew it, under the new contest's card. That is
   * the exact mismatch the carousel exists to prevent (`20260825070000`), and
   * it is reachable by anyone who played two contests in the recap week, or who
   * opens two managers' entries in a row off the field.
   *
   * Keying the stored value to its request and deriving `slots` from a match
   * closes it with no extra state and no extra render: a stale answer simply
   * stops being an answer to the question now being asked.
   */
  const [held, setHeld] = useState<{ key: string; slots: PeekSlot[] } | null>(null);
  const key = `${contestId ?? ''}:${userId ?? ''}`;
  const slots = held !== null && held.key === key ? held.slots : null;

  const load = useCallback<Load>(
    async (live) => {
      if (!contestId || !userId) {
        setHeld(null);
        return null;
      }
      const { data, error } = await supabase.rpc('contest_lineup', {
        p_contest: contestId,
        p_user: userId,
      });
      if (!live()) return null;
      if (error) return error.message;

      setHeld({
        key: `${contestId}:${userId}`,
        slots: ((data ?? []) as PeekRow[]).map((r) => ({
          slot: r.slot,
          playerId: r.player_id,
          playerName: r.player_name,
          pos: r.pos,
          team: r.team,
          tier: r.tier,
          points: num(r.points) ?? 0,
          started: Boolean(r.started),
          /* NOT DEFAULTED. A zero here would be indistinguishable from a
             card that has never scored, and the row would print a career of
             0.0 for a card with a season behind it. See the type. */
          careerFp: num(r.career_fp),
          tierFloorFp: num(r.tier_floor_fp),
          /* Null is a real answer on these two as well, for a second reason:
             the top tier has nothing above it. `0 to Diamond` would be a
             promotion that never arrives. */
          nextTierAt: num(r.next_tier_at),
          nextTierLabel: r.next_tier_label,
          coins: num(r.coins),
          bonusCoins: num(r.bonus_coins),
          /* THE COLUMN'S PRESENCE, not its value, is the first question. A
             row without an `opponent` key at all is an unmigrated server and
             cannot say anything; a row whose `opponent` is null is a BYE, and
             that is a real answer the row draws in the negative colour. */
          game: !('opponent' in r)
            ? undefined
            : r.opponent
            ? {
                opponent: r.opponent,
                home: Boolean(r.home),
                startsAt: r.starts_at ?? null,
                /* `resolveStatus`, the same derivation the board's own
                   schedule uses: the feed's word, promoted to `live` by the
                   clock where the feed is still saying `scheduled` about a
                   game that kicked off an hour ago. Two surfaces asking the
                   same question must not answer it two ways. */
                status: resolveStatus(r.status_state ?? null, r.starts_at ?? null),
                statusText: r.status_text ?? null,
                teamScore: num(r.team_score),
                oppScore: num(r.opp_score),
              }
            : null,
          /* FALSE ON AN OLD SERVER, which is the same forward-compatibility
             `careerFp` has: `20260831040000` adds this column, and until it is
             applied the row draws no money line rather than a paid nought. */
          awarded: Boolean(r.awarded),
        })),
      });
      return null;
    },
    [contestId, userId],
  );

  const { loading, error } = useLoader(load);
  return { slots, loading, error };
}
