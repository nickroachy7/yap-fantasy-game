/**
 * Collection · Sets — the named groups, what you have of each, and the reward.
 *
 * WHAT THIS SCREEN USED TO BE
 *
 * A designed "not yet": a dashed panel stating that no set table existed, that
 * the completion reward was undecided, and listing three candidate mechanics
 * without picking one. That was the right screen to have while the decision was
 * open. It is the wrong screen now, and none of its content survives except the
 * discipline behind it — every number below comes off `my_sets`, and nothing
 * here states a rule the server does not enforce.
 *
 * THE DECISION IT WAS HOLDING OPEN, RESOLVED TWICE OVER. Completion pays GEMS,
 * once, on an explicit claim — of the three candidates that was the only one
 * that changes nothing about what a card is. And a card has to be COMMITTED to
 * a set, which burns it: the set takes the card out of the collection for good
 * and pays back a share of its sell value on the way.
 *
 * The burn is what makes this a tab rather than a read-out. Progress used to
 * accumulate on its own while you were somewhere else; it is now something you
 * spend duplicates on, against the cost of never starting them again.
 *
 * A set is completed by committing a THRESHOLD of its cards, not all of them —
 * six, whatever the group's size. The old screen said "all of them"; the pack
 * maths says a named five-card set costs ~44,000 gems against a season's income
 * of ~6,000, which is not a hard set but an impossible one. The arithmetic is
 * in the migration header. What matters here is that the screen never implies
 * otherwise: every row reads "4/6", and the set's full size is named beside it
 * so the six cannot be mistaken for the whole group.
 *
 * FOUR THINGS THIS SCREEN REFUSES TO DO:
 *
 *  1. Compute completion itself. `complete` comes off the view and the claim
 *     button follows it. A client that decides for itself when a set is done
 *     will eventually disagree with the server, and the disagreement is a
 *     player pressing Claim and reading a raw Postgres error.
 *  2. Claim on your behalf. The gems land on an explicit press, so the reward
 *     is something you collect rather than something that happened while you
 *     were on another tab.
 *  3. Burn anything from here. Adding a card destroys it, so the act belongs on
 *     the checklist behind a `destructive` confirmation naming the copy — never
 *     one tap from a list of 37 rows.
 *  4. Hide a claimed set. It stays, marked, in its family: a checklist you can
 *     no longer see the finished half of is a worse checklist.
 *
 * The list itself is `SetsList`, which takes rows and draws them. This half is
 * the network, the wallet, the two notices — and the summary strip, which sits
 * at the TOP OF THE SCROLL, under the filters, and goes up the page with the
 * rows. It used to be pinned above the scroll and collapse on a push; see the
 * note at the render for why it stopped. The inventory's strip made the same
 * move in the same change, and the two have to keep making it together — a
 * strip that scrolls on one tab and collapses on the other is a step down half
 * a line every time you flip between them.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { ClaimAllBar, SetsFilters, SetsList, SetsStrip } from './SetsList';
import {
  claimableSets,
  filterSets,
  summariseSets,
  type CardSet,
  type SetListFilter,
} from './sets';
import { useSets } from './use-sets';

export function SetsPanel({
  onOpenSet,
  onBackToInventory,
}: {
  onOpenSet: (code: string) => void;
  onBackToInventory: () => void;
  /**
   * Drawn on the right of the summary strip — the Packs button.
   *
   * A NODE FROM THE ROUTE, like `onBackToInventory` beside it, rather than
   * something this panel reaches for itself. Everything in here that navigates
   * arrives as a prop, which is what keeps the panel drawable from `/gallery`
   * with no router under it.
   */
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  // Single source of truth for the balance: the header reads the same value, so
  // a claim has to refresh THAT rather than keep a second copy here.
  const { refresh: refreshPlayer } = usePlayer();
  const { sets, error, loading, refreshing, refresh, reload } = useSets();

  /** The code being claimed, so only the pressed row shows a spinner. */
  /* Which sets are on screen. Held here rather than in `SetsList`, because the
     chip row is drawn in the PINNED block above the scroll and the list is
     inside it — two children of this panel, one piece of state between them. */
  const [filter, setFilter] = useState<SetListFilter>('ALL');
  const [claiming, setClaiming] = useState<string | null>(null);
  /** The last claim's failure. Shared with nothing — it is about one press. */
  const [claimError, setClaimError] = useState<string | null>(null);
  /** The last claim that worked, kept until the next press. */
  const [claimed, setClaimed] = useState<{ name: string; gems: number } | null>(null);
  /** Set while the sweep is running, so the bar can say so and refuse a second. */
  const [claimingAll, setClaimingAll] = useState(false);

  const all = useMemo(() => sets ?? [], [sets]);
  /* The sweep's list, and the same definition the strip's READY cell counts.
     Derived in `sets.ts` so a button and a summary cannot disagree. */
  const ready = useMemo(() => claimableSets(all), [all]);
  /* One summary for both the strip and the claim bar. Computed twice it was two
     passes over every set on every render, and — worse — two chances for the
     figure on the button to disagree with the figure above it. */
  const summary = useMemo(() => summariseSets(all), [all]);
  /** What the chips have left on screen. `SetsList` groups whatever it is given. */
  const shown = useMemo(() => filterSets(all, filter), [all, filter]);

  const claim = useCallback(
    async (set: CardSet) => {
      setClaiming(set.code);
      setClaimError(null);
      setClaimed(null);
      // The completion check, the payout and the ledger row all happen inside
      // this one call, server-side. Nothing is credited here.
      const { error: err } = await supabase.rpc('claim_set_reward', { p_set_code: set.code });
      if (err) {
        setClaimError(err.message);
      } else {
        setClaimed({ name: set.name, gems: set.claimableGems });
        // Both matter: the list has to redraw the row as claimed, and the
        // header has to show the gems that just landed.
        await Promise.all([reload(), refreshPlayer()]);
      }
      setClaiming(null);
    },
    [reload, refreshPlayer],
  );

  /**
   * Collect every set with gems waiting, in one press.
   *
   * WHY THIS EXISTS. The list used to lift claimable sets out into a section of
   * their own at the top, which made them findable at the cost of taking a
   * weekly out from under "Weekly". Ready sets now rise inside their own
   * section instead, and this is what covers the case that lifted section was
   * really for: collecting several without hunting for them.
   *
   * ONE CALL PER SET, SEQUENTIALLY, because `claim_set_reward` takes one code
   * and there is no batch form of it. Sequential rather than parallel because
   * every one of them takes the SAME wallet row lock — fired together they
   * would queue on that lock anyway, and a failure in the middle of a pile of
   * concurrent writes is far harder to report honestly than one in a loop.
   *
   * PARTIAL SUCCESS IS REPORTED, NOT SWALLOWED — the same posture as
   * `sell_cards` and `commit_cards_to_set`, which both hand back what worked
   * and what did not. A sweep that claimed four of five and said "claimed"
   * would be lying about the fifth, and the gems would be the evidence.
   *
   * ONE RELOAD AT THE END rather than one per set: the list is redrawn from the
   * server once the whole sweep is done, so the rows do not shuffle under a
   * player watching them.
   */
  const claimAll = useCallback(async () => {
    if (ready.length === 0) return;

    setClaimingAll(true);
    setClaimError(null);
    setClaimed(null);

    let gems = 0;
    let done = 0;
    let firstFailure: string | null = null;

    for (const set of ready) {
      const { error: err } = await supabase.rpc('claim_set_reward', { p_set_code: set.code });
      if (err) {
        /* The FIRST failure is the one reported. Later ones are usually the
           same cause repeated, and a notice listing five variations of one
           problem is a notice nobody reads. */
        firstFailure ??= err.message;
      } else {
        gems += set.claimableGems;
        done += 1;
      }
    }

    if (done > 0) {
      setClaimed({
        name: done === 1 ? ready[0].name : `${done} sets`,
        gems,
      });
    }
    if (firstFailure) {
      setClaimError(
        done > 0
          ? `${ready.length - done} of ${ready.length} could not be claimed: ${firstFailure}`
          : firstFailure,
      );
    }

    // Both matter: the list has to redraw the rows as claimed, and the header
    // has to show the gems that just landed.
    await Promise.all([reload(), refreshPlayer()]);
    setClaimingAll(false);
  }, [ready, reload, refreshPlayer]);

  const onRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshPlayer()]);
  }, [refresh, refreshPlayer]);

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator />
      </View>
    );
  }

  /* Only when there is nothing to draw. A failed REFRESH over a list that is
     already on screen must not replace it with an error page — the rows are
     still the last true answer. */
  if (error && sets === null) {
    return (
      <View style={styles.centred}>
        <Text style={[Type.section, { color: c.text }]}>Could not load your sets</Text>
        <Text style={[Type.body, styles.centredText, { color: c.textSecondary }]}>{error}</Text>
        <Pressable
          onPress={() => void onRefresh()}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.retry,
            { backgroundColor: c.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <Text style={[Type.strong, { color: c.text }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {/* WHAT IS PINNED IS THE CONTROLS AND NOTHING ELSE.

          The chips decide what you are looking at, so they cannot leave the
          screen you are looking at. The claim-all bar acts on sets you may not
          have scrolled to, so it must not be possible to scroll past it. Both
          only exist when there are sets — the empty state below is a whole-page
          message, and chips over it would be filters on nothing.

          THE STRIP IS NOT UP HERE ANY MORE. It is the first thing in the scroll
          instead, and goes up the page with the rows. It is a statement — how
          many sets, how many claimed, how much is waiting — and a statement
          about a list belongs with the list rather than over the controls that
          cut the list down. The inventory's strip made the identical move; see
          the note at the top of this file for why the two have to match. */}
      {all.length > 0 ? (
        <View style={styles.strip}>
          <SetsFilters sets={all} filter={filter} onFilter={setFilter} />
          {ready.length > 0 ? (
            <ClaimAllBar
              count={ready.length}
              gems={summary.gemsWaiting}
              busy={claimingAll}
              onPress={() => void claimAll()}
            />
          ) : null}
        </View>
      ) : null}

      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.content,
          /* The pinned chips own the gap under the nav now, so the scroll starts
             flush — except with no chips above it, where this is the only thing
             holding the empty state off the nav. */
          all.length === 0 && styles.contentTop,
          styles.contentTail,
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* FIRST IN THE SCROLL, above the notices and the rows, which is the
            place the filters used to occupy. It is the same `SummaryStrip` the
            inventory draws in the same position on its own list — see the note
            at the render above.

            Only when there ARE sets: the empty state below is a whole-page
            message, and a summary of nothing over it would be four noughts
            explaining themselves. */}
        {all.length > 0 ? <SetsStrip stats={summary} /> : null}

        {all.length === 0 ? (
          /* No sets AT ALL is a season with no card pool behind it — a fresh
             database, or a season whose cards have not synced. That is not the
             same thing as owning none of them, and it does not offer the Shop,
             because buying a pack would not produce a set to collect. */
          <EmptyState
            title="No sets this season"
            body="Sets are built from the season's card pool, and there is no pool here yet."
            actionLabel="Back to Inventory"
            onAction={onBackToInventory}
          />
        ) : (
          <>
            {claimed ? (
              <View style={[styles.notice, { borderColor: c.positive, backgroundColor: c.surface }]}>
                <Text style={[Type.micro, { color: c.positive }]}>CLAIMED</Text>
                <Text style={[Type.body, { color: c.text }]}>
                  {`${claimed.name} — ${claimed.gems.toLocaleString()} gems added to your balance.`}
                </Text>
              </View>
            ) : null}

            {claimError ? (
              <View style={[styles.notice, { borderColor: c.negative, backgroundColor: c.surface }]}>
                <Text style={[Type.micro, { color: c.negative }]}>THAT DID NOT WORK</Text>
                <Text style={[Type.body, { color: c.text }]}>{claimError}</Text>
              </View>
            ) : null}

            {shown.length === 0 ? (
              /* A FILTER THAT FOUND NOTHING IS NOT AN EMPTY SEASON, and the two
                 must not read alike: the message above is about there being no
                 card pool at all, and this is about the four chips overhead. It
                 names the chip so the way out is obvious. */
              <Text style={[Type.body, styles.centredText, { color: c.textTertiary }]}>
                {filter === 'READY'
                  ? 'No sets have a reward waiting. Add cards to a set to reach the next one.'
                  : filter === 'CAN_ADD'
                    ? 'None of your cards fit an open slot right now. Open a pack, or check back after a game.'
                    : 'You have not finished a set yet.'}
              </Text>
            ) : (
              <SetsList
                sets={shown}
                claimingCode={claiming}
                onOpenSet={onOpenSet}
                onClaim={(set) => void claim(set)}
              />
            )}

            {shown.length === 0 ? null : (
            <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
              Open a set to add cards to it. A card you add is burnt — it leaves your collection for
              good and cannot be started again — and pays back part of what it would have sold for.
              Packs are still drawn from the whole season pool, so which sets you can fill is a matter
              of what you happen to pull.
            </Text>
            )}
            </>
          )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /* The pinned controls: one gutter, the 8pt gap down to the scroll, and the
     same 8 between the chips and the claim bar when both are drawn. Named
     `strip` from when the summary lived in here too — it is the chips' block
     now, and the strip is inside the scroll. */
  strip: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.two },
  content: { paddingHorizontal: Spacing.three, gap: Spacing.three },
  /* Clearance under the last set, and NOT a tab bar's worth of it — the scene
     already ends where the bar begins. See the inventory grid's `LIST_TAIL`. */
  contentTail: { paddingBottom: Spacing.four },
  contentTop: { paddingTop: Spacing.three },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  centredText: { textAlign: 'center' },
  retry: {
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    padding: Spacing.two + 2,
    gap: Spacing.half,
  },
  pressed: { opacity: 0.75 },
  // Sentences, not a grid: hold them to a readable line at any measure.
  measure: { maxWidth: 560 },
});
