/**
 * The contests sheet, opened on the lobby.
 *
 * A DOOR, NOT A SCREEN. Everything this file used to hold is `LobbyView`, and
 * everything it used to navigate to is a frame on the same stack — see the
 * header on `ContestSheet` for what that fixed. What is left here is the route:
 * a path, one param, and the frame it opens on.
 *
 * `?view=history` is the board rail's second door — `Weeks` rather than
 * `+ Contests` — and it is read here and handed down, because a route param is
 * exactly the thing a route file should be turning into an opening position.
 */
import { useLocalSearchParams } from 'expo-router';

import { ContestSheet } from '@/components/contests/ContestSheet';

export default function ContestsRoute() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  return <ContestSheet initial={{ view: 'lobby', arrivedOn: view }} />;
}
