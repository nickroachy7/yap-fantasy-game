/**
 * Another manager's profile, opened straight onto it.
 *
 * A DOOR, NOT A SCREEN — the page is `ManagerView`, and this route is the way
 * in from anywhere OUTSIDE the contests sheet: a name on any of the six boards,
 * a row of your friends list, a row of the directory. Inside that sheet the
 * same component is a FRAME on its own stack instead, so opening a manager off
 * a contest's field does not stack a second sheet on the first. See
 * `ContestSheet`.
 *
 * The param is a USER id — an account — never a player id or a card instance
 * id. `/player/<id>` is the footballer and `/card/<id>` is one copy of him;
 * this is the person holding them.
 *
 * `?name=` is an optional courtesy: the row that pushed this usually knows the
 * handle already, and passing it means the sheet is titled during the round
 * trip rather than blank. The fetched name wins the moment it lands.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { ManagerView } from '@/components/friends/ManagerView';

export default function ManagerRoute() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();

  /**
   * Dismiss the sheet.
   *
   * `back()` is a DISMISSAL, not a navigation — the tabs are still mounted
   * underneath (see `unstable_settings.anchor`), so this puts the profile down
   * and leaves the reader where they were, mid-scroll. The fallback is for a
   * cold deep link, which has nothing beneath it; the leaderboard is the page
   * most doors into this one sit on.
   */
  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/fantasy/leaderboard');
  }, [router]);

  return (
    <ManagerView
      userId={typeof id === 'string' ? id : null}
      name={typeof name === 'string' ? name : undefined}
      onClose={dismiss}
    />
  );
}
