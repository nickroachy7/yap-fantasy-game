/**
 * The two reads the friends surface needs, and one rule about keeping them in
 * step.
 *
 * ---------------------------------------------------------------------------
 * WHY THE LIST AND THE INBOX ARE ONE HOOK
 * ---------------------------------------------------------------------------
 *
 * Accepting a request moves a person FROM one list TO the other. Two hooks with
 * two refresh schedules would show them in both for as long as the slower one
 * took, and in a beta that is a screenshot somebody sends you. One loader, two
 * `Promise.all`'d reads, one refresh: after any action both lists are re-read
 * together or neither is.
 *
 * ---------------------------------------------------------------------------
 * NO OPTIMISTIC MOVE, AND THE REASON IS THE MUTUAL ASK
 * ---------------------------------------------------------------------------
 *
 * The obvious optimisation is to splice the row across locally and skip the
 * round trip. It cannot be right: "send request" can come back 'accepted' when
 * the other person has already asked (see `friend_request`), so the row's next
 * home is not knowable from the press. The button already shows a spinner for
 * the duration, so the honest version costs a moment of nothing happening and
 * never shows a state the server does not agree with.
 *
 * The SEARCH results are patched locally, though — see `useManagerSearch`. That
 * list is debounced, and re-running the query on every button press would make
 * rows jump under the finger as the ordering changed.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLoader, type Load } from '@/hooks/use-loader';
import {
  fetchFriends,
  fetchRequests,
  findManagers,
  friendsVersion,
  type Friend,
  type FriendLink,
  type FriendRequest,
  type ManagerHit,
} from './friends';

export type FriendsState = {
  friends: Friend[] | null;
  /** Everything pending, both directions. `incoming` first — see the RPC. */
  requests: FriendRequest[] | null;
  /** The ones that are a to-do, counted for the tab's badge. */
  incoming: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
  refresh: () => Promise<void>;
};

export function useFriends(): FriendsState {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [requests, setRequests] = useState<FriendRequest[] | null>(null);
  /** The version these lists were read at — see the focus effect below. */
  const seen = useRef(friendsVersion());

  const load = useCallback<Load>(async (live) => {
    // Captured BEFORE the await: a friendship changed while this read was in
    // flight must leave the lists behind, not be counted as already seen.
    const at = friendsVersion();
    try {
      const [list, pending] = await Promise.all([fetchFriends(), fetchRequests()]);
      if (!live()) return;
      seen.current = at;
      setFriends(list);
      setRequests(pending);
    } catch (err) {
      return err instanceof Error ? err.message : 'Could not load your friends.';
    }
  }, []);

  const { loading, error, reload, refresh } = useLoader(load);

  /**
   * CATCH UP ON THE WAY BACK IN.
   *
   * A manager's profile is presented OVER this screen, so unfriending somebody
   * from the sheet leaves this list mounted with the row still on it — and
   * dismissing a sheet is a dismissal rather than a navigation, so nothing here
   * re-reads by itself. Comparing versions rather than reloading on every focus
   * means an ordinary tab switch still costs nothing.
   */
  useFocusEffect(
    useCallback(() => {
      if (friends !== null && seen.current !== friendsVersion()) void refresh();
    }, [friends, refresh]),
  );

  const incoming = useMemo(
    () => (requests ?? []).filter((r) => r.direction === 'incoming').length,
    [requests],
  );

  return { friends, requests, incoming, loading, error, reload, refresh };
}

export type SearchState = {
  /** What the field holds right now. */
  typed: string;
  setTyped: (next: string) => void;
  hits: ManagerHit[] | null;
  loading: boolean;
  error: string | null;
  /** Redraw one row's state without re-running the query. See the header. */
  patch: (userId: string, link: FriendLink) => void;
  refresh: () => Promise<void>;
};

/**
 * The manager directory, searched as you type.
 *
 * DEBOUNCED AT 250ms, and the debounce is a second piece of state rather than a
 * ref: the loader is keyed on the settled query, so a keystroke must not change
 * the loader's identity or every letter would fire a read and the results would
 * arrive out of order. `useLoader` cancels stale attempts anyway; this keeps
 * them from being made.
 *
 * AN EMPTY FIELD IS THE WHOLE DIRECTORY, not an empty list — `find_managers`
 * makes that decision and this hook simply does not second-guess it. A search
 * box that answers nothing until you already know who is here is no use in a
 * game whose beta is seven people.
 */
export function useManagerSearch(): SearchState {
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ManagerHit[] | null>(null);

  useEffect(() => {
    // Written from a timer, not from the effect body: the point is to NOT
    // commit a render per keystroke.
    const timer = setTimeout(() => setQuery(typed), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  const seen = useRef(friendsVersion());

  const load = useCallback<Load>(
    async (live) => {
      const at = friendsVersion();
      try {
        const found = await findManagers(query);
        if (!live()) return;
        seen.current = at;
        setHits(found);
      } catch (err) {
        return err instanceof Error ? err.message : 'Could not search for managers.';
      }
    },
    [query],
  );

  const { loading, error, refresh } = useLoader(load);

  /* The same catch-up as the lists above: every row here carries a friend
     state, and one changed on a sheet over this screen is one this list is now
     wrong about. */
  useFocusEffect(
    useCallback(() => {
      if (hits !== null && seen.current !== friendsVersion()) void refresh();
    }, [hits, refresh]),
  );

  const patch = useCallback((userId: string, link: FriendLink) => {
    setHits((rows) =>
      rows === null ? rows : rows.map((r) => (r.userId === userId ? { ...r, link } : r)),
    );
  }, []);

  return { typed, setTyped, hits, loading, error, patch, refresh };
}
