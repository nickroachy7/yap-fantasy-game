/**
 * Every contest you have finished, oldest still reachable.
 *
 * WHY THIS EXISTS AT ALL
 *
 * Until `contest_history` (20260831030000) a contest stopped existing the
 * moment the slate moved past it. `contest_lobby` is scoped to two weeks — the
 * one you can enter and the one you just finished — so a season of entries sat
 * in `lineups`, every result derivable from them, and none of it reachable from
 * any screen. This is the archive.
 *
 * IT IS PAGED, AND ON A CURSOR RATHER THAN A PAGE NUMBER. The server keys on
 * `(finalized_at, contest_id)` for the reason its own comment gives — a whole
 * slate finalises in one sweep and shares a timestamp — and the client's job is
 * simply to hand back the last row it saw. An offset would re-read rows it
 * already has and slide by one when a settlement lands mid-scroll.
 *
 * WHY NOT `useLoader`, WHICH EVERY OTHER READER HERE USES. That hook owns one
 * request and replaces its result; this one accumulates across requests and has
 * a second loading state that must not blank the list already on screen. The
 * two are different enough that sharing would mean teaching `useLoader` about
 * pagination for a single caller.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** How many rows a page asks for. The server clamps to 100 whatever is sent. */
const PAGE = 20;

export type HistoryEntry = {
  contestId: string;
  code: string;
  name: string;
  kind: string;
  season: number;
  seasonType: string;
  week: number;
  points: number;
  /** Where you finished. Null when the field was too small to rank. */
  rank: number | null;
  entrants: number | null;
  /**
   * 'W' | 'L' | 'T', or null.
   *
   * NULL IS NOT A LOSS. A field too small to be a contest produces no result at
   * all, which is the distinction `contest_results` is careful about and the
   * one a row of icons is most likely to flatten.
   */
  result: 'W' | 'L' | 'T' | null;
  prizeCoins: number | null;
  /** When the week was swept. The rail's 24-hour window is measured off this. */
  finalizedAt: string;
};

type HistoryRow = {
  contest_id: string;
  code: string;
  name: string;
  kind: string;
  season: number;
  season_type: string;
  week: number;
  points: number | string | null;
  rnk: number | string | null;
  entrants: number | string | null;
  result: string | null;
  prize_coins: number | string | null;
  finalized_at: string;
};

const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v);

/* Anything else is a value this client does not know about, and a row of icons
   must not guess at one. Treated as "no result", which is already a state it
   draws. */
const asResult = (v: string | null): 'W' | 'L' | 'T' | null =>
  v === 'W' || v === 'L' || v === 'T' ? v : null;

function toEntry(r: HistoryRow): HistoryEntry {
  return {
    contestId: r.contest_id,
    code: r.code,
    name: r.name,
    kind: r.kind,
    season: r.season,
    seasonType: r.season_type,
    week: r.week,
    points: num(r.points) ?? 0,
    rank: num(r.rnk),
    entrants: num(r.entrants),
    result: asResult(r.result),
    prizeCoins: num(r.prize_coins),
    finalizedAt: r.finalized_at,
  };
}

/**
 * @param enabled Whether to fetch at all. False until the archive is actually
 * opened.
 *
 * IT IS HOISTED TO THE LOBBY, WHICH IS WHY THIS EXISTS. The hook lives on the
 * screen that owns the sheet rather than inside the panel, so going back to the
 * open list and returning does not refetch a season — but that also means it
 * would run on every single lobby open, for a list most visits never look at.
 * The flag buys the caching without buying the round trip.
 *
 * IT ONLY EVER TURNS ON. Once the archive has been opened the rows are kept, so
 * flipping back to the open list does not throw them away and asking again is
 * free.
 */
export function useContestHistory(enabled: boolean) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  /* The first page only. A page appended to a list already on screen must not
     replace it with a spinner — see `loadingMore`. */
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* THE GUARD AGAINST TWO PAGES IN FLIGHT, and it is a ref rather than the
     `loadingMore` state because a fast scroll fires `more()` again before React
     has re-rendered with the flag set. State drives the spinner; this decides
     whether the request happens at all. */
  const busy = useRef(false);
  /* WHETHER THE FIRST PAGE HAS BEEN ASKED FOR. A ref rather than reading
     `entries`, because `entries` as an effect dependency would re-run the
     effect on every appended page and start the first one over. Set INSIDE the
     effect: a ref written during render is a second source of truth for the
     same frame, which is what `react-hooks/refs` is pointing at. */
  const asked = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const fetchPage = useCallback(async (after: HistoryEntry | null) => {
    const { data, error: err } = await supabase.rpc('contest_history', {
      p_limit: PAGE,
      p_before: after?.finalizedAt ?? undefined,
      p_before_id: after?.contestId ?? undefined,
    });
    if (err) return { rows: null, message: err.message };
    return { rows: ((data ?? []) as HistoryRow[]).map(toEntry), message: null };
  }, []);

  const reload = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    const { rows, message } = await fetchPage(null);
    busy.current = false;
    if (!live.current) return;
    setLoading(false);
    if (message !== null) {
      setError(message);
      return;
    }
    setEntries(rows);
    /* A SHORT PAGE IS THE END. Asking again to be told nothing is a round trip
       spent learning what the row count already said. */
    setDone(rows.length < PAGE);
  }, [fetchPage]);

  const more = useCallback(async () => {
    if (busy.current || done || !entries || entries.length === 0) return;
    busy.current = true;
    setLoadingMore(true);
    const { rows, message } = await fetchPage(entries[entries.length - 1]);
    busy.current = false;
    if (!live.current) return;
    setLoadingMore(false);
    if (message !== null) {
      setError(message);
      return;
    }
    setEntries((held) => [...(held ?? []), ...rows]);
    setDone(rows.length < PAGE);
  }, [done, entries, fetchPage]);

  /* THE FIRST PAGE DOES NOT GO THROUGH `reload`, and the reason is a lint rule
     worth obeying rather than silencing: `reload` sets `loading` before it
     awaits anything, and a synchronous setState inside an effect is a second
     render before the first has been shown. It does not need to — `loading`
     starts true — so the effect awaits first and touches state only once there
     is something to say. `reload` stays for the caller who wants to refresh a
     list that is already on screen, where flipping the spinner back on IS the
     point. */
  useEffect(() => {
    /* Not yet asked for, or already answered. Either way there is nothing to
       fetch — and `loading` stays true so an enabled-later mount does not flash
       an empty state before its first page lands. */
    if (!enabled || asked.current) return;
    asked.current = true;
    let alive = true;
    busy.current = true;
    void (async () => {
      const { rows, message } = await fetchPage(null);
      busy.current = false;
      if (!alive || !live.current) return;
      setLoading(false);
      if (message !== null) {
        /* A FAILED FIRST PAGE IS NOT AN ANSWER. Released so the next thing that
           enables this — reopening the archive — tries again, rather than
           leaving the screen permanently showing one refusal. */
        asked.current = false;
        setError(message);
        return;
      }
      setEntries(rows);
      setDone(rows.length < PAGE);
    })();
    return () => {
      alive = false;
    };
  }, [enabled, fetchPage]);

  return { entries, loading, loadingMore, done, error, more, reload };
}

/**
 * The contests that finished within the last day.
 *
 * THE 24-HOUR RULE LIVES HERE, ON THE CLIENT, and that is deliberate: it is a
 * presentation decision — how long a result stays on the rail before the player
 * is nudged to look forward — rather than a fact about the data. The server
 * returns everything and says nothing about how long any of it is interesting.
 *
 * IT IS NOT THE SAME WINDOW AS `recap_slate()` AND MUST NOT BECOME IT. That one
 * keeps the recap CARD on the board until there is new football, which is what
 * stops the board going blank across an eleven-day gap (20260830030000). This
 * one clears a row of markers a day after the fact. Two surfaces, two jobs; the
 * bug that migration fixed cannot come back through this function.
 */
export const RECENT_MS = 24 * 60 * 60 * 1000;

export function recentlySettled(entries: HistoryEntry[] | null, now: number): HistoryEntry[] {
  if (!entries) return [];
  return entries.filter((e) => {
    const at = Date.parse(e.finalizedAt);
    /* An unparseable timestamp is not "just now". Dropped rather than shown,
       because the whole point of this list is that everything in it is fresh. */
    if (Number.isNaN(at)) return false;
    return now - at >= 0 && now - at < RECENT_MS;
  });
}
