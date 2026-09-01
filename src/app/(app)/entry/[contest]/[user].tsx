/**
 * Somebody else's team, opened straight onto it.
 *
 * A DOOR, NOT A SCREEN — the page is `EntryView`, and this is the path that
 * opens the contests sheet with it at the bottom of the stack. See the header
 * on `ContestSheet`.
 *
 * NOTHING IN THE APP PUSHES THIS ANY MORE. Both ways to a rival's team — a row
 * of the field on a contest, a row of the field on a settled recap — are frames
 * on the sheet the reader already has open. What is left for this route is deep
 * links and a refreshed browser tab, which is reason enough to keep it: the
 * path is public, it is in people's history, and a URL that used to draw a
 * lineup should keep drawing one.
 */
import { useLocalSearchParams } from 'expo-router';

import { ContestSheet } from '@/components/contests/ContestSheet';

export default function EntryRoute() {
  const { contest, user, name } = useLocalSearchParams<{
    contest: string;
    user: string;
    name?: string;
  }>();
  return (
    <ContestSheet
      initial={{
        view: 'entry',
        contestId: typeof contest === 'string' ? contest : '',
        userId: typeof user === 'string' ? user : '',
        name,
      }}
    />
  );
}
