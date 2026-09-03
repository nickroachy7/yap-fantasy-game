/**
 * The one door to a manager's profile, so every name in the app opens it the
 * same way.
 *
 * There are five surfaces that draw somebody else's handle — the six boards,
 * the pinned copy of your own row, a contest's field, your friends list, the
 * directory — and each of them was one `router.push` away from spelling the
 * route slightly differently. A route typed in five places is a route that gets
 * renamed in four.
 *
 * THE HANDLE TRAVELS AS A PARAM, and it is a courtesy rather than data: the row
 * that pushed this already knows the name, so the sheet can be titled during
 * the round trip instead of opening blank. `manager_profile` returns the real
 * one and it wins the moment it lands. Nothing is trusted from the URL — it is
 * a placeholder for a title, and a display name is public on every board
 * already. `EntryView` takes exactly the same courtesy for the same reason.
 *
 * NOT FOR USE INSIDE THE CONTESTS SHEET. A push from in there would stack a
 * sheet on a sheet, which is the thing `ContestSheet` exists to prevent; the
 * manager is a FRAME on that stack instead. See `ManagerView`'s two hosts.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

export function useOpenManager() {
  const router = useRouter();
  return useCallback(
    (userId: string, name?: string) => {
      router.push({ pathname: '/manager/[id]', params: { id: userId, name } });
    },
    [router],
  );
}
