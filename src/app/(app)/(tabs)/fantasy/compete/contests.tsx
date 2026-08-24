import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useContests, type Contest } from '@/components/contests/use-contests';
import { Screen } from '@/components/shell/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { StatusChip } from '@/components/ui/StatusChip';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Every contest on this week's slate, and which of them you have filed for.
 *
 * WHAT THIS SCREEN IS FOR, and why it is not just a list.
 *
 * The rule that makes contests worth having is that a card plays in ONE of them
 * a week (`card_plays_one_contest`, 20260825010000). Without it a second
 * contest is another place to park the same eight cards and the bench gets more
 * comfortable; with it, each contest is a claim on the roster, and the cards
 * behind your starters have to come out to meet it. That rule is invisible on
 * the lineup screen — you only meet it when a card you wanted is already
 * playing somewhere else — so this page has to state it rather than wait to
 * enforce it. Hence the footnote under the list, which is not decoration.
 *
 * THE FREE CONTEST IS LISTED BUT IT IS NOT A CHOICE. Every account is entered
 * automatically, so it appears here for completeness and to say whether your
 * lineup is in — and the row goes to the lineup rather than to an entry flow,
 * because there is nothing to enter.
 *
 * THERE IS ONE LOBBY CONTEST AND IT COSTS GEMS. The fee is not flavour: a
 * second contest is a second source of score gems (`award_score_gems` pays 1.5
 * a point on every slot in every lineup filed), so a free-to-enter lobby is a
 * faucet with no tap. `20260825050000` sets out how 40 was arrived at.
 *
 * THERE ARE NO PRIZES YET, which the row is honest about by not mentioning any.
 * What an entry buys today is career_fp on three cards that were earning
 * nothing — tier, the one currency packs cannot sell.
 */
export default function ContestsScreen() {
  const router = useRouter();
  const { contests, loading, error } = useContests();

  const free = contests?.filter((c) => c.kind === 'free') ?? [];
  const lobby = contests?.filter((c) => c.kind === 'lobby') ?? [];

  const context = loading
    ? undefined
    : contests === null
      ? undefined
      : lobby.length > 0
        ? `${lobby.length} open · ${free.length + lobby.length} this week`
        : 'One card plays one contest a week';

  return (
    <Screen title="Contests" measure="form" context={context}>
      {error ? <ErrorLine message={error} /> : null}
      <Panel title="Your week">
        {free.length === 0 && !loading ? (
          <EmptyState
            pad={false}
            title="No slate yet"
            body="There are no fixtures loaded for a week to be played."
          />
        ) : (
          free.map((c) => (
            <ContestRow key={c.id} contest={c} onPress={() => router.replace('/fantasy/compete')} />
          ))
        )}
      </Panel>

      <Panel title="Lobby">
        {lobby.length > 0 ? (
          lobby.map((c) => (
            <ContestRow
              key={c.id}
              contest={c}
              onPress={() =>
                router.push({ pathname: '/fantasy/compete', params: { contest: c.code } })
              }
            />
          ))
        ) : (
          <EmptyState
            pad={false}
            title="The lobby opens soon"
            body="Extra contests you can enter with the cards you are not already playing. Small formats — three cards, no quarterback or kicker to find."
          />
        )}
      </Panel>

      <Footnote />
    </Screen>
  );
}

/** The loader's failure, said once at the top rather than per panel. */
function ErrorLine({ message }: { message: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return <Text style={[Type.fine, { color: c.negative }]}>{message}</Text>;
}

/**
 * One contest.
 *
 * THE RIGHT-HAND FIGURE IS THE ENTRY, NOT THE PRIZE. A row that led with a
 * prize pool would be reading as a betting slip, and for the free contest —
 * which is most of this screen and all of it today — there is no prize to name.
 * What a player actually wants to know at a glance is whether their lineup is
 * in, which is the one thing that can still be wrong at this moment.
 */
function ContestRow({ contest, onPress }: { contest: Contest; onPress: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const filled = contest.mine?.filled ?? 0;
  const entered = contest.mine !== null;

  /* FOUR STATES, and the order they are tested in is the order they matter.
     "Not set" and "5 of 8" are different problems — one is a screen you have
     not opened, the other a lineup you left half done — and an unaffordable
     contest is neither, so collapsing any of them would hide a real one behind
     a wrong word. */
  const status = !entered
    ? contest.entryFeeGems > 0 && !contest.affordable
      ? { label: 'Not enough gems', tone: 'neutral' as const }
      : { label: contest.entryFeeGems > 0 ? 'Enter' : 'Not set', tone: 'warning' as const }
    : filled < contest.slotCount
      ? { label: `${filled} of ${contest.slotCount}`, tone: 'warning' as const }
      : { label: 'Lineup in', tone: 'positive' as const };

  /* The fee is only news until you have paid it. After that the row is about
     the lineup, and repeating the price of something already bought is the
     kind of detail that makes a list harder to scan rather than richer. */
  const price = entered
    ? 'Entered'
    : contest.entryFeeGems > 0
      ? `${contest.entryFeeGems} gems`
      : 'Free';

  const seats =
    contest.maxEntrants !== null
      ? `${contest.entrants} of ${contest.maxEntrants} in`
      : contest.entrants > 0
        ? `${contest.entrants} in`
        : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderColor: c.border }, pressed && styles.pressed]}>
      <View style={styles.rowText}>
        <Text style={[Type.body, { color: c.text }]} numberOfLines={1}>
          {contest.name}
        </Text>
        <Text style={[Type.fine, { color: c.textSecondary }]} numberOfLines={1}>
          {[`${contest.formatName} · ${contest.slotCount} cards`, price, seats]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <StatusChip label={status.label} tone={status.tone} />
    </Pressable>
  );
}

/**
 * The exclusivity rule, said once, under the list.
 *
 * It is a footnote rather than a banner because it is a rule of the game and
 * not a warning about the current state — a banner would be shouting the same
 * sentence at somebody who has read it every week since the lobby opened.
 */
function Footnote() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <Text style={[Type.fine, styles.footnote, { color: c.textSecondary }]}>
      A card can only play in one contest a week. Entering more means playing
      deeper into your roster, not playing the same cards twice.
    </Text>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
      },
  /* Takes the room the chip does not, so a long contest name truncates rather
     than pushing the status off the right edge. */
  rowText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.6 },
  footnote: { marginTop: Spacing.two, paddingHorizontal: Spacing.one },
});
