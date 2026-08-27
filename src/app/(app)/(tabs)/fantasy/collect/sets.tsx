import { useRouter } from 'expo-router';

import { SetsPanel } from '@/components/collection/SetsPanel';
import { summariseSets } from '@/components/collection/sets';
import { useSets } from '@/components/collection/use-sets';
import { Screen } from '@/components/shell/Screen';

/**
 * The context line reads the SAME session cache the panel below it does, so it
 * costs no second request and the two can never disagree.
 *
 * It says the most actionable true thing, in that order: gems you can claim
 * beat slots you can fill, and both beat the inventory number. "2 ready to
 * claim" is worth a line; "37 sets" is what is left when there is nothing to
 * do about any of them.
 */
export default function SetsScreen() {
  const router = useRouter();
  const { sets } = useSets();
  const stats = summariseSets(sets ?? []);

  const context =
    stats.ready > 0
      ? `${stats.ready} ready to claim · ${stats.gemsWaiting.toLocaleString()} gems`
      : stats.toCommit > 0
        ? `${stats.toCommit} slots you can fill today`
        : `${stats.sets} sets · ${stats.claimed} claimed`;

  return (
    <Screen title="Sets" measure="table" context={context} scroll={false}>
      <SetsPanel
        onOpenSet={(code) => router.push({ pathname: '/set/[code]', params: { code } })}
        onBackToInventory={() => router.replace('/fantasy/collect')}
      />
    </Screen>
  );
}
