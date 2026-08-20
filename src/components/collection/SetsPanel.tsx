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
 * the network, the wallet, the two notices — and the summary strip, which is
 * pinned here above the scroll rather than drawn by the list. That is what puts
 * it at the same height as the inventory's, which is pinned above ITS list for
 * the same reason; see the note at the render.
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

import { useTabBarInset } from '@/components/shell/useResponsive';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { SetsList, SetsStrip } from './SetsList';
import { summariseSets, type CardSet } from './sets';
import { useSets } from './use-sets';

export function SetsPanel({
  onOpenSet,
  onBackToInventory,
}: {
  onOpenSet: (code: string) => void;
  onBackToInventory: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const tabInset = useTabBarInset();
  // Single source of truth for the balance: the header reads the same value, so
  // a claim has to refresh THAT rather than keep a second copy here.
  const { refresh: refreshPlayer } = usePlayer();
  const { sets, error, loading, refreshing, refresh, reload } = useSets();

  /** The code being claimed, so only the pressed row shows a spinner. */
  const [claiming, setClaiming] = useState<string | null>(null);
  /** The last claim's failure. Shared with nothing — it is about one press. */
  const [claimError, setClaimError] = useState<string | null>(null);
  /** The last claim that worked, kept until the next press. */
  const [claimed, setClaimed] = useState<{ name: string; gems: number } | null>(null);

  const all = useMemo(() => sets ?? [], [sets]);

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
      {/* PINNED, AND AT THE INVENTORY'S HEIGHT. The two tabs draw the same
          `SummaryStrip` in the same place, and until this it was neither: the
          strip lived inside the scroll — so it slid away, where the inventory's
          does not — and it sat 24pt under the section nav against the
          inventory's 8, because this panel wrapped everything in a 16pt
          `padding` and the nav already leaves 8 of its own below it.

          The gap is the nav's 8 now, on both, and the two strips line up when
          you flip between the tabs rather than stepping down half a line.

          Only when there ARE sets: the empty state below is a whole-page
          message and a summary of nothing above it would be four noughts
          explaining themselves. */}
      {all.length > 0 ? (
        <View style={styles.strip}>
          <SetsStrip stats={summariseSets(all)} />
        </View>
      ) : null}

      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.content,
          /* The strip owns the gap under the nav now, so the scroll starts
             flush — except with no strip above it, where this is the only thing
             holding the empty state off the nav. */
          all.length === 0 && styles.contentTop,
          { paddingBottom: tabInset + Spacing.four },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
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

          <SetsList
            sets={all}
            claimingCode={claiming}
            onOpenSet={onOpenSet}
            onClaim={(set) => void claim(set)}
          />

          <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
            Open a set to add cards to it. A card you add is burnt — it leaves your collection for
            good and cannot be started again — and pays back part of what it would have sold for.
            Packs are still drawn from the whole season pool, so which sets you can fill is a matter
            of what you happen to pull.
          </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /* The inventory's `summary` wrapper, to the point: one gutter, and the 8pt
     gap to whatever comes next. Two screens with the same strip at different
     heights is what this replaced. */
  strip: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  content: { paddingHorizontal: Spacing.three, gap: Spacing.three },
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
