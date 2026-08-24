import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useContests, type Contest } from '@/components/contests/use-contests';
import { Heart, Hearts } from '@/components/runs/Hearts';
import { nextRungLine, recordOf, wageredLine } from '@/components/runs/run';
import { Screen } from '@/components/shell/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { StatusChip } from '@/components/ui/StatusChip';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
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
 * THIS PAGE IS THE LOBBY AND NOTHING ELSE: contests you could join, not ones
 * you are in. Your entries live on the carousel at the top of the Lineup board,
 * over the lineup each belongs to. Showing them in both places would make
 * "where do I edit this" a question with two answers, and the answer that lost
 * would still be one tap away — which is how two editors get built.
 *
 * The free contest never appears. Nobody chose it and nobody can leave it, so
 * it is not a thing to browse.
 *
 * THERE IS ONE LOBBY CONTEST AND IT COSTS GEMS. The fee is not flavour: a
 * second contest is a second source of score gems (`award_score_gems` pays 1.5
 * a point on every slot in every lineup filed), so a free-to-enter lobby is a
 * faucet with no tap. `20260825050000` sets out how 40 was arrived at.
 *
 * THERE ARE NO GEM PRIZES YET, which the row is honest about by not mentioning
 * any. What an entry buys today is career_fp on three cards that were earning
 * nothing — tier, the one currency packs cannot sell — and, on the rows that
 * risk a heart, the heart back if it wins.
 *
 * WHICH IS THE OTHER THING THIS SCREEN NOW HAS TO SAY. Some of these contests
 * can end your run (`hearts_at_risk`, 20260825130000) and some cannot, and
 * nothing about a fee or a format tells them apart — the two rows cost the same
 * 40 gems. A player who enters a run-ending contest without being told it was
 * one has been ambushed by their own lobby, so the stake is drawn on the row
 * itself rather than left to the contest page to disclose after the tap.
 *
 * THE STAKE LINE IS ONLY ON ROWS THAT HAVE ONE. A "0 hearts" note on the safe
 * contests would make the safe thing look like a lesser version of the risky
 * one, when it is simply a different offer.
 */
export default function ContestsScreen() {
  const router = useRouter();
  const { contests, loading, error } = useContests();
  const { run } = usePlayer();

  /* THE LOBBY IS WHAT YOU ARE NOT ALREADY IN. Contests you have entered live
     on the carousel at the top of the Lineup board, where their card sits over
     the lineup it belongs to — listing them here as well would put the same
     contest on two screens and make "which one do I edit" a question with two
     answers. See the note on the takeover in `contest/[code]`.

     The free contest never appears: nobody chose it and nobody can leave it. */
  const open = (contests ?? []).filter((c) => c.kind !== 'free' && c.mine === null);
  const entered = (contests ?? []).filter((c) => c.kind !== 'free' && c.mine !== null).length;

  const context = loading
    ? undefined
    : open.length > 0
      ? `${open.length} open · one card plays one contest`
      : 'One card plays one contest a week';

  return (
    <Screen title="Contests" measure="form" context={context}>
      {error ? <ErrorLine message={error} /> : null}

      {/* THE RUN, ABOVE THE LOBBY, because the lobby cannot be read without it.
          Every stake below is priced in hearts, and a player deciding whether
          to risk one needs to know how many are left in the same glance. */}
      {run ? <RunPanel run={run} onClaim={() => router.push('/run-over')} /> : null}

      <Panel title="Open">
        {open.length > 0 ? (
          open.map((c) => (
            <ContestRow
              key={c.id}
              contest={c}
              onPress={() =>
                router.push({ pathname: '/contest/[code]', params: { code: c.code } })
              }
            />
          ))
        ) : loading ? null : (
          <EmptyState
            pad={false}
            title={entered > 0 ? "You're in everything that's open" : 'Nothing open right now'}
            body={
              entered > 0
                ? 'Your entries are on the Lineup board — swipe the card at the top to move between them.'
                : 'Extra contests appear here each week. Small formats, so there is no quarterback or kicker to find.'
            }
          />
        )}
      </Panel>

      <Footnote />
    </Screen>
  );
}

/**
 * The run, and the one thing it might be waiting on.
 *
 * TWO STATES, AND THEY ARE NOT VARIATIONS OF EACH OTHER. A live run is a
 * status line — hearts, record, what the next win buys — and it stays quiet,
 * because it is read every week and has nothing to ask for. A dead run is a
 * CALL TO ACTION with cards hanging on it, and it is drawn in the negative
 * colour and given a button, because until it is answered nothing in the list
 * below can be entered.
 *
 * The dead state does not replace the lobby or block it. The free contest is
 * still live and still needs a lineup — see the note on presentation in
 * `_layout` for why a death is never allowed to become a lockout.
 */
function RunPanel({ run, onClaim }: { run: NonNullable<ReturnType<typeof usePlayer>['run']>; onClaim: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  if (run.awaitingCarry) {
    return (
      <Pressable
        onPress={onClaim}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.dead,
          { borderColor: c.negative },
          pressed && styles.pressed,
        ]}>
        <View style={styles.rowText}>
          <Text style={[Type.strong, { color: c.text }]}>Your run ended</Text>
          <Text style={[Type.fine, { color: c.textSecondary }]}>
            {run.carrySlots > 0
              ? `${run.wins} wins — bring ${run.carrySlots} card${run.carrySlots === 1 ? '' : 's'} back.`
              : 'Nothing comes back. Start the next one.'}
          </Text>
        </View>
        <StatusChip label="Open" tone="warning" />
      </Pressable>
    );
  }

  const record = recordOf(run);
  const rung = nextRungLine(run);
  const wagered = wageredLine(run);

  return (
    <View style={styles.live}>
      <Hearts hearts={run.hearts} wagered={run.wagered} size={14} />
      <Text style={[Type.fine, { color: c.textSecondary }]} numberOfLines={1}>
        {/* WHAT IS ON THE LINE COMES FIRST when there is anything on it. The
            record and the next rung are context you read weekly; a live stake
            is the thing that changes what you should do in the next minute. */}
        {[wagered, record, rung].filter(Boolean).join(' · ') || 'Your run starts here'}
      </Text>
    </View>
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

  /* HOW IT IS WON, in the fewest words that are still true. "Beat the median"
     is even money and reads as such; "Top 3 win" does not, and is meant not to
     — most of that field loses, which is exactly what the player is being asked
     to price the heart against. */
  const how =
    contest.winCondition === 'top_n' && contest.winRank !== null
      ? `Top ${contest.winRank} win`
      : 'Beat the median';

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
        {contest.heartsAtRisk > 0 ? <Stake contest={contest} how={how} /> : null}
      </View>
      <StatusChip label={status.label} tone={status.tone} />
    </Pressable>
  );
}

/**
 * What a row costs to lose, and what it pays to win.
 *
 * DRAWN WITH THE GLYPH, NOT THE WORD. "1 heart at risk" is a sentence a reader
 * skims past in a list of five rows; a red heart is a mark they stop on, which
 * is the whole point of putting it here rather than one tap deeper.
 *
 * THE HEAL IS ON THE SAME LINE AS THE RISK because it is the same trade and
 * splitting them would let a player read half of it. A contest that takes a
 * heart most weeks and gives one back when it lands is not a worse version of
 * the even-money row — it is the only place in the game hearts come FROM, and
 * a lobby that showed only the risk would make it look like a strictly harsher
 * option nobody should take.
 */
function Stake({ contest, how }: { contest: Contest; how: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <View style={styles.stake}>
      <Heart size={10} state="safe" color={c.negative} />
      <Text style={[Type.fine, { color: c.textSecondary }]} numberOfLines={1}>
        {contest.heartsAtRisk === 1 ? '1 at risk' : `${contest.heartsAtRisk} at risk`}
        {contest.heartsOnWin > 0
          ? ` · +${contest.heartsOnWin} to win`
          : ''}
        {` · ${how}`}
      </Text>
    </View>
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
  /* Its own line rather than appended to the meta line: the meta line is
     already three facts joined by separators, and a fourth would bury the one
     that can end a run. */
  stake: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  /* No panel, no border: a live run is a status line and a box around it would
     give it the weight of something that needs acting on. */
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.two,
  },
  /* The dead state gets the box the live one does not, because it IS the thing
     that needs acting on. */
  dead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.control,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  pressed: { opacity: 0.6 },
  footnote: { marginTop: Spacing.two, paddingHorizontal: Spacing.one },
});
