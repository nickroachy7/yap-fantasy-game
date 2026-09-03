/**
 * Invitations waiting on you, and the two answers to one.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT PART OF `useContests`
 * ---------------------------------------------------------------------------
 *
 * An invited contest is already in the lobby — `contest_lobby()` returns it the
 * moment the invite row exists, because the invite is what makes it visible.
 * So this hook is not "the contests you were invited to". It is the narrower,
 * shorter-lived thing: the ones somebody ASKED you about and you have not
 * answered, which is a to-do rather than an offer.
 *
 * The distinction is what stops the shelf double-counting. A contest you joined
 * with a code, or one you were invited to and have since entered, is in the
 * lobby list and NOT here. `my_friendly_invites` draws that line server-side.
 *
 * ---------------------------------------------------------------------------
 * ANSWERING RELOADS BOTH LISTS, NEVER JUST THIS ONE
 * ---------------------------------------------------------------------------
 *
 * Declining removes a row from here AND from the lobby, and entering moves a
 * row from here into the lobby's Entered shelf. Either way two lists change
 * together, so `answer` takes the lobby's `reload` and calls it — the same rule
 * `useFriends` states about its own two lists, for the same reason: two refresh
 * schedules mean a window where a row is in both places or neither.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useLoader, type Load } from '@/hooks/use-loader';
import { declineFriendly, fetchInvites, joinFriendly, type ContestInvite } from './friendly';

export type InvitesState = {
  invites: ContestInvite[] | null;
  /** How many are a to-do. Drawn on the shelf's heading. */
  count: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Say no. Resolves once the list has been re-read. */
  decline: (code: string) => Promise<void>;
  /** Let yourself in with a code. Returns the contest to open. */
  join: (joinCode: string) => Promise<{ code: string; name: string; joined: boolean }>;
};

export function useFriendlyInvites(): InvitesState {
  const [invites, setInvites] = useState<ContestInvite[] | null>(null);

  const load = useCallback<Load>(async (live) => {
    try {
      const rows = await fetchInvites();
      if (!live()) return null;
      setInvites(rows);
    } catch (err) {
      if (!live()) return null;
      return err instanceof Error ? err.message : 'Could not load your invitations.';
    }
    return null;
  }, []);

  const { loading, error, reload } = useLoader(load);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  /* NO OPTIMISTIC REMOVAL, for `friends.ts`' reason: the server is the only
     thing that knows whether the row is still there to decline — the creator
     may have called the whole contest off while this sheet was open. */
  const decline = useCallback(
    async (code: string) => {
      await declineFriendly(code);
      reload();
    },
    [reload],
  );

  const join = useCallback(
    async (joinCode: string) => {
      const r = await joinFriendly(joinCode);
      reload();
      return r;
    },
    [reload],
  );

  return { invites, count: invites?.length ?? 0, loading, error, reload, decline, join };
}
