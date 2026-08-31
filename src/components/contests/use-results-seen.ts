/**
 * How far through your results you have been told.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------
 *
 * Two surfaces need to know the same thing — "has this player been shown that
 * contest settled" — and they must not answer it differently:
 *
 *   the welcome-back banner   shown until you acknowledge, however long that is
 *   the rail's result pips    shown for 24 hours, or until you acknowledge
 *
 * ONE HIGH-WATER MARK RATHER THAN A SET OF IDS. Results only ever arrive newer
 * than the last one, so "everything up to this instant has been seen" answers
 * the question in one string and cannot leak: a set of acknowledged contest ids
 * grows for the life of the account and has to be pruned by something.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BANNER IS NOT ALSO CAPPED AT 24 HOURS
 * ---------------------------------------------------------------------------
 *
 * Because that would be the hole the 24-hour rule opens, patched by the same
 * rule that opened it. `recap_slate()` exists because results vanishing on a
 * timer means a player who does not open the app for two days never learns how
 * they did — see 20260830030000, which was written after exactly that.
 *
 * So the banner is bounded by ACKNOWLEDGEMENT and not by time. It waits as long
 * as it has to. That is what makes it safe for the pips to clear themselves
 * after a day: the ambient reminder is allowed to expire precisely because it is
 * not the thing carrying the guarantee.
 *
 * ---------------------------------------------------------------------------
 * FIRST RUN IS SEEDED, NOT ANNOUNCED
 * ---------------------------------------------------------------------------
 *
 * With nothing stored, every result an account has ever had is "unseen", and a
 * fresh install would open on a banner reporting a season. So the first read
 * stamps the newest result as already seen and says nothing. The guarantee
 * starts from the install and applies to everything after it, which is the only
 * reading under which the banner is news.
 *
 * PER ACCOUNT, because two people on one device must not inherit each other's
 * acknowledgements. The key carries the user id.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { HistoryEntry } from './use-contest-history';

const key = (userId: string) => `yap.results.seen.${userId}`;

export type ResultsSeen = {
  /**
   * Everything settled at or before this instant has been shown.
   *
   * `undefined` while the read is in flight, which is a THIRD state and not a
   * synonym for "nothing seen" — treating it as the latter flashes the banner
   * for one frame on every cold start, which is the one moment it must not be
   * wrong.
   */
  seenThrough: string | undefined | null;
  loading: boolean;
  /** Mark everything up to and including `through` as seen. */
  acknowledge: (through: string) => void;
};

export function useResultsSeen(userId: string | null): ResultsSeen {
  const [seenThrough, setSeenThrough] = useState<string | undefined | null>(undefined);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void (async () => {
      let held: string | null = null;
      try {
        held = await AsyncStorage.getItem(key(userId));
      } catch {
        /* A DEVICE THAT CANNOT REMEMBER IS NOT A REASON TO SHOW NOTHING. Read
           as "nothing stored", which seeds below and simply means the banner
           starts guaranteeing from this launch rather than the last one. */
        held = null;
      }
      if (!alive || !live.current) return;
      setSeenThrough(held);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const acknowledge = useCallback(
    (through: string) => {
      setSeenThrough(through);
      if (!userId) return;
      /* Fire and forget. The state has already moved, and a write that fails
         costs the player one repeated banner on the next cold start — which is
         a far better failure than blocking the dismissal on the disk. */
      void AsyncStorage.setItem(key(userId), through).catch(() => {});
    },
    [userId],
  );

  return { seenThrough, loading: seenThrough === undefined, acknowledge };
}

/**
 * The results this player has not been told about yet.
 *
 * NEWEST FIRST, as `contest_history` returns them, so `[0]` is the mark to
 * acknowledge through.
 */
export function unseenResults(
  entries: HistoryEntry[] | null,
  seenThrough: string | undefined | null,
): HistoryEntry[] {
  if (!entries || seenThrough === undefined) return [];
  if (seenThrough === null) return [];
  const mark = Date.parse(seenThrough);
  if (Number.isNaN(mark)) return [];
  return entries.filter((e) => {
    const at = Date.parse(e.finalizedAt);
    return !Number.isNaN(at) && at > mark;
  });
}

/**
 * Whether a first read needs seeding, and to what.
 *
 * Returns the stamp to store, or null when there is nothing to do. Kept out of
 * the hook so the caller decides WHEN — the seed must not happen until the
 * history has actually loaded, or it would stamp an empty list and announce the
 * next result as if it were the first.
 */
export function seedFor(
  entries: HistoryEntry[] | null,
  seenThrough: string | undefined | null,
): string | null {
  if (seenThrough !== null || !entries) return null;
  /* Nothing settled yet: stamp the moment instead, so an account that has never
     played still starts its guarantee here rather than staying unseeded and
     announcing its first ever result twice. */
  return entries[0]?.finalizedAt ?? new Date().toISOString();
}
