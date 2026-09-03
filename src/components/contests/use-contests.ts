/**
 * The contests on this week's slate, and which of them you are in.
 *
 * ONE RPC, and it has to be one: two of the three facts a lobby row shows are
 * things the caller cannot read for themselves. How full a contest is means
 * counting OTHER people's lineups, which the RLS policy on `lineups` hides, and
 * whether you can afford it means reading a wallet against a fee. A plain
 * PostgREST select would return a lobby where every contest looked empty.
 *
 * `contest_lobby()` is SECURITY DEFINER for exactly that reason and returns
 * only aggregates — a count and a boolean — never anybody else's rows.
 *
 * IT ALSO CARRIES THE STAKES. A contest that can end a run and one that cannot
 * are not the same product, and the difference is invisible from the fee — both
 * cost 40 coins. `hearts_at_risk`, `hearts_on_win` and the win condition come
 * down with the row so a lobby can never draw the two identically; entering
 * something that kills a run without being told it could is the worst surprise
 * this feature can hand somebody.
 *
 * NOT SESSION-CACHED, unlike the collection and the sets. Those answer "what do
 * I own", which changes only when you act; this answers "what is open, how full
 * is it, can I afford it", which changes when a WEEK rolls over and when other
 * people enter. It reloads on focus, which is cheap at this size and cannot go
 * stale in the direction that matters — showing a seat that is already taken.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useLoader, type Load } from '@/hooks/use-loader';
import { sessionCache } from '@/lib/session-cache';
import { supabase } from '@/lib/supabase';
import type { ContestTerms, PayoutCurve, WinCondition } from './contest-model';

export type Contest = {
  id: string;
  code: string;
  kind: 'free' | 'lobby' | 'friendly';
  name: string;
  formatCode: string;
  formatName: string;
  /** How many cards the format asks for. Drawn as "3 cards". */
  slotCount: number;
  entryFeeCoins: number;
  maxEntrants: number | null;
  entrants: number;
  season: number;
  seasonType: number;
  week: number;
  /**
   * Your entry, or null.
   *
   * `filled` is slots occupied, NOT whether the lineup is legal — a seven of
   * eight lineup is a real thing this game lets you file, and the row has to be
   * able to say so.
   */
  mine: { lineupId: string; filled: number } | null;
  /** True when you are already in, or hold the fee. */
  affordable: boolean;

  /**
   * HOW THIS CONTEST DECIDES A WINNER.
   *
   *   `median`   even money — you beat the middle of the field or you do not.
   *   `top_n`    only the first `winRank` places, so most of its field loses.
   *   `top_pct`  the top `winPct` per cent, so the places scale with the field.
   *   `target`   beat `targetPoints`. No field needed, so it settles even when
   *              you are the only entrant.
   *
   * A row has to say which it is BEFORE a heart is committed to it.
   */
  winCondition: WinCondition;
  /** For `top_n`: the last place that still counts as a win. */
  winRank: number | null;
  /** For `top_pct`: the share of the field that wins, as a whole percent. */
  winPct: number | null;
  /** For `target`: the score to beat. Set before the week opens. */
  targetPoints: number | null;
  /** How the pool is divided among the winners. */
  payoutCurve: PayoutCurve;
  /**
   * Coins per fantasy point, before the card's tier multiplier. The same on
   * every row — it is the game's baseline, not this contest's. Carried down so
   * the app never hardcodes a rate the payout might not be using.
   */
  scoreRate: number;
  /** Hearts a loss here costs the run. 0 means it cannot end you. */
  heartsAtRisk: number;
  /** Hearts a win heals, capped at the run's maximum. */
  heartsOnWin: number;
  /** Hearts the caller's run is holding, or null before they have one. */
  myHearts: number | null;

  /**
   * Coins this contest has collected that it will pay back out.
   *
   * LIVE, AND SMALL EARLY. The pool is funded by entries — 90% of the fees
   * taken, see `20260901020000` — so it is genuinely nought before the first
   * one and genuinely tiny in a four-tester week. The lobby draws the real
   * figure and says it grows; rounding it up to something respectable would be
   * the grant that inverts the fee's whole justification.
   */
  prizePool: number;
  podiumCoins: number;
  /** The share of collected fees paid out, in basis points. 9000 = 90%. */
  prizePoolBps: number;
  /**
   * A contest from the week the board has already moved past, carried so its
   * page can still be opened from the recap card. THE LOBBY LIST FILTERS THESE
   * OUT — a finished contest among the ones you can enter would be an offer
   * that cannot be taken. See `20260830030000`.
   */
  recap: boolean;

  /**
   * WHO BUILT IT, and null on everything the game built itself.
   *
   * A friendly and a lobby row are the same object to every function that
   * scores or pays one, and they are NOT the same offer to a reader: "Flex
   * Three" is a fixture and "Nick's Sunday Six" is an invitation from a person.
   * These four fields are the whole difference on screen.
   */
  createdBy: string | null;
  /** The creator's display name, already resolved. Null unless friendly. */
  creatorName: string | null;
  /**
   * The six characters that admit somebody to the room — AND ONLY THE CREATOR
   * EVER RECEIVES IT. `contest_lobby` nulls this column for everybody else, so
   * a guest cannot fill a room with people the creator did not ask for.
   */
  joinCode: string | null;
  /**
   * Seats spoken for: everyone invited or self-admitted who has not declined.
   * NOT the same as `entrants`, which counts filed lineups — a room of six with
   * two lineups in it still has four seats gone.
   */
  invited: number | null;
};

type Row = {
  id: string;
  code: string;
  kind: 'free' | 'lobby' | 'friendly';
  name: string;
  format_code: string;
  format_name: string;
  slot_count: number;
  entry_fee_coins: number;
  max_entrants: number | null;
  entrants: number;
  season: number;
  season_type: number;
  week: number;
  my_lineup_id: string | null;
  my_filled: number;
  affordable: boolean;
  win_condition: WinCondition;
  win_rank: number | null;
  win_pct: number | null;
  target_points: number | null;
  payout_curve: PayoutCurve;
  score_rate: number | null;
  hearts_at_risk: number;
  hearts_on_win: number;
  my_hearts: number | null;
  prize_pool: number;
  podium_coins: number | null;
  prize_pool_bps: number;
  recap: boolean | null;
  created_by: string | null;
  creator_name: string | null;
  join_code: string | null;
  invited: number | null;
};

export type ContestsState = {
  contests: Contest[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};
/** One lobby row, in the shape the sheet reads. Lifted out of the hook so the
    cache below and the hook share one mapping rather than two that can drift. */
function rowsToContests(rows: Row[]): Contest[] {
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    kind: r.kind,
    name: r.name,
    formatCode: r.format_code,
    formatName: r.format_name,
    slotCount: Number(r.slot_count),
    entryFeeCoins: r.entry_fee_coins,
    maxEntrants: r.max_entrants,
    entrants: Number(r.entrants ?? 0),
    season: r.season,
    seasonType: r.season_type,
    week: r.week,
    mine: r.my_lineup_id
      ? { lineupId: r.my_lineup_id, filled: Number(r.my_filled ?? 0) }
      : null,
    affordable: r.affordable,
    winCondition: r.win_condition,
    winRank: r.win_rank,
    winPct: r.win_pct === null || r.win_pct === undefined ? null : Number(r.win_pct),
    targetPoints:
      r.target_points === null || r.target_points === undefined
        ? null
        : Number(r.target_points),
    payoutCurve: r.payout_curve ?? 'flat',
    scoreRate: Number(r.score_rate ?? 0),
    heartsAtRisk: Number(r.hearts_at_risk ?? 0),
    heartsOnWin: Number(r.hearts_on_win ?? 0),
    myHearts: r.my_hearts === null || r.my_hearts === undefined ? null : Number(r.my_hearts),
    prizePool: Number(r.prize_pool ?? 0),
    podiumCoins: Number(r.podium_coins ?? 0),
    prizePoolBps: Number(r.prize_pool_bps ?? 0),
    recap: Boolean(r.recap),
    createdBy: r.created_by ?? null,
    creatorName: r.creator_name ?? null,
    joinCode: r.join_code ?? null,
    invited: r.invited === null || r.invited === undefined ? null : Number(r.invited),
  }));
}

/**
 * THE LOBBY, HELD BETWEEN VISITS.
 *
 * `LobbyView` unmounts the moment a contest frame is pushed over it, so coming
 * back mounted a fresh hook with `contests` at null: an empty sheet, a round
 * trip, then the rows again. Popping in and out of a contest made the whole
 * lobby flash, which reads as the app losing its place rather than as a page
 * being read.
 *
 * Cached to be SHOWN and never to be trusted — entries arrive and pools grow
 * while you are inside a contest — so the hook seeds from memory and then
 * reloads every time, exactly as it did before. What changes is only what fills
 * the screen while that runs.
 *
 * INVALIDATED BEFORE EVERY READ, because `sessionCache.read` does not re-fetch
 * after a success: it holds the resolved promise until the key is cleared,
 * which is right for immutable config and would freeze a lobby on the first
 * version it ever saw.
 */
const lobbyCache = sessionCache<'all', Contest[]>(async () => {
  const { data, error } = await supabase.rpc('contest_lobby');
  if (error) throw new Error(error.message);
  return rowsToContests((data ?? []) as Row[]);
});



export function useContests(): ContestsState {
  /* Seeded from memory so returning from a contest draws the lobby it already
     knows on the first paint — see `lobbyCache`. */
  const [contests, setContests] = useState<Contest[] | null>(() => lobbyCache.peek('all') ?? null);

  const load = useCallback<Load>(async (live) => {
    lobbyCache.invalidate('all');
    try {
      const rows = await lobbyCache.read('all');
      if (!live()) return null;
      setContests(rows);
    } catch (err) {
      if (!live()) return null;
      return err instanceof Error ? err.message : 'Could not load the contests.';
    }
    return null;
  }, []);

  const { loading, error, reload } = useLoader(load);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { contests, loading, error, reload };
}

/**
 * A lobby row, as the terms every surface describes it from.
 *
 * An ADAPTER rather than a second shape: `contest-model` deliberately takes a
 * structural type so that the lobby's read and an entry's read can both be
 * described without either becoming the other. This is where the lobby's
 * column names meet it, and it is the only place they do.
 */
export function termsOfContest(c: Contest): ContestTerms {
  return {
    formatName: c.formatName,
    slotCount: c.slotCount,
    entryFeeCoins: c.entryFeeCoins,
    heartsAtRisk: c.heartsAtRisk,
    heartsOnWin: c.heartsOnWin,
    winCondition: c.winCondition,
    winRank: c.winRank,
    winPct: c.winPct,
    targetPoints: c.targetPoints,
    payoutCurve: c.payoutCurve,
    scoreRate: c.scoreRate,
    prizePool: c.prizePool,
    podiumCoins: c.podiumCoins,
    entrants: c.entrants,
    maxEntrants: c.maxEntrants,
  };
}
