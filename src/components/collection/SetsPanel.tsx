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
 * THE DECISION IT WAS HOLDING OPEN, RESOLVED TWICE OVER. Completion pays COINS,
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
 * maths says a named five-card set costs ~44,000 coins against a season's income
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
 *  2. Claim on your behalf. The coins land on an explicit press, so the reward
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
 * note at the render for why it stopped.
 *
 * IT IS A SHEET NOW, over the collection, and it used to be a page beside it
 * under a COLLECTION | SETS bar. See `SETS` in `sections.ts` for why the bar
 * went; what it means for this file is that the panel renders its own
 * `PlayerSheetFrame` rather than sitting inside a `Screen`.
 *
 * THE VIEW RENDERS THE FRAME, which is `ContestSheet`'s rule and worth
 * restating: the title, the subtitle and the pinned controls are all derived
 * from `useSets`, so a host that owned the frame would have to call this
 * panel's data hook to fill it in. The route above is a path and a close
 * handler and nothing else.
 *
 * AND THE SCROLL IS THE FRAME'S. This drew its own `ScrollView` as a page, and
 * keeping it would have put one scroller inside another — the frame supplies
 * one, drives its floating header from it, and reserves the sheet's bottom
 * inset in it. The filters and the claim bar move to the frame's `pinned` slot,
 * which is the same guarantee this file's render note asks for: a control that
 * cannot be scrolled away from what it controls.
 *
 * WHAT THAT COST: pull-to-refresh, which a sheet has nowhere to put. It is not
 * a loss worth machinery — a sheet is mounted fresh every time it is opened, so
 * `useSets` reads on the way in, and the claim path reloads on its own. The
 * contests sheet made the same trade.
 */
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PlayerSheetFrame } from '@/components/players/PlayerSheetFrame';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { SetsList } from './SetsList';
import {
  summariseSets,
  type CardSet,
} from './sets';
import { useSets } from './use-sets';

export function SetsPanel({
  onOpenSet,
  onClose,
  frame = 'sheet',
}: {
  onOpenSet: (code: string) => void;
  /**
   * Whether this is the sets SHEET or the Collect section's Sets PAGE.
   *
   * Passed through to `PlayerSheetFrame`; nothing this panel draws changes
   * between the two. As a page it is the second tab of the Collect strip, so
   * the strip is how it is reached and left and `onClose` is never called.
   */
  frame?: 'sheet' | 'page';
  /**
   * Put the sheet down.
   *
   * It was `onBackToInventory` and pointed at a sibling tab; with the tab gone
   * there is nothing to go BACK to — closing puts you on whatever board you
   * opened this from, which is the collection in every path that exists today
   * and does not have to be.
   */
  onClose: () => void;
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
  /* NO `refreshing` ANY MORE. It drove a `RefreshControl` on a scroll this file
     owned; the frame supplies the scroller now and takes no refresh control, so
     the flag has nothing to drive. `refresh` itself stays — the error state's
     Try again button is the one thing that still calls it. */
  const { sets, error, loading, refresh, reload } = useSets();

  /** The code being claimed, so only the pressed row shows a spinner. */
  const [claiming, setClaiming] = useState<string | null>(null);
  /** The last claim's failure. Shared with nothing — it is about one press. */
  const [claimError, setClaimError] = useState<string | null>(null);
  /** The last claim that worked, kept until the next press. */
  const [claimed, setClaimed] = useState<{ name: string; coins: number } | null>(null);

  const all = useMemo(() => sets ?? [], [sets]);
  /* STILL DERIVED, for the frame's subtitle and nothing else now. The strip and
     the claim-all bar were its other two readers and both are gone; `context`
     below is what is left, and it is the one place a total still earns its
     keep — a line of type in the header rather than four cells above the list. */
  const summary = useMemo(() => summariseSets(all), [all]);

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
        setClaimed({ name: set.name, coins: set.claimableCoins });
        // Both matter: the list has to redraw the row as claimed, and the
        // header has to show the coins that just landed.
        await Promise.all([reload(), refreshPlayer()]);
      }
      setClaiming(null);
    },
    [reload, refreshPlayer],
  );


  const onRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshPlayer()]);
  }, [refresh, refreshPlayer]);

  /**
   * THE SHEET'S ONE LINE BEFORE THE LIST, and it came off the route.
   *
   * It says the most actionable true thing, in that order: coins you can claim
   * beat slots you can fill, and both beat the inventory number. "2 ready to
   * claim" is worth a line; "37 sets" is what is left when there is nothing to
   * do about any of them.
   *
   * IT IS DERIVED HERE RATHER THAN PASSED IN, which is the whole reason this
   * file renders its own frame. As a page it was computed in the route from a
   * second `useSets()` call — free, because the hook is session-cached, but
   * still two places that had to agree about what the most actionable thing is.
   */
  const context = loading
    ? 'Loading'
    : summary.ready > 0
      ? `${summary.ready} ready to claim · ${summary.coinsWaiting.toLocaleString()} coins`
      : summary.toCommit > 0
        ? `${summary.toCommit} slots you can fill today`
        : `${summary.sets} sets · ${summary.claimed} claimed`;

  const pinned = null;

  /* Only when there is nothing to draw. A failed REFRESH over a list that is
     already on screen must not replace it with an error page — the rows are
     still the last true answer. */
  const body =
    loading || (error && sets === null) ? (
      <View style={styles.centred}>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <>
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
          </>
        )}
      </View>
    ) : (
      <View style={styles.content}>
        {/* NO SUMMARY STRIP. It read SETS / CLAIMED / TO FILL / READY across the
            top, and every one of those four is a count of rows that are on the
            screen underneath it: the groups say how many, each card says its own
            progress, and a set with a reward waiting draws a gold button that is
            hard to miss. A readout that totals what the list already shows earns
            its height only when the list is too long to total by eye, and this
            one is grouped into Daily, Weekly and Season long precisely so it is
            not. */}

        {all.length === 0 ? (
          /* No sets AT ALL is a season with no card pool behind it — a fresh
             database, or a season whose cards have not synced. That is not the
             same thing as owning none of them, and it does not offer the Shop,
             because buying a pack would not produce a set to collect. */
          <EmptyState
            title="No sets this season"
            body="Sets are built from the season's card pool, and there is no pool here yet."
            actionLabel="Back to your cards"
            onAction={onClose}
          />
        ) : (
          <>
            {claimed ? (
              <View style={[styles.notice, { borderColor: c.positive, backgroundColor: c.surface }]}>
                <Text style={[Type.micro, { color: c.positive }]}>CLAIMED</Text>
                <Text style={[Type.body, { color: c.text }]}>
                  {`${claimed.name} — ${claimed.coins.toLocaleString()} coins added to your balance.`}
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
      </View>
    );

  return (
    /* `surface` rather than `tone`: a board full of sets is not about a club or
       a tier and has no hue to be washed in — the same call `LobbyView` makes,
       and the same step on the dark scale, so the two screens a player reaches
       from the two boards are made of the same material.
       AND NONE OF IT AS A PAGE, for the reason spelled out at `LobbyView`'s own
       call: the raised step exists to separate a sheet from what it covers, and
       a page covers nothing. */
    <PlayerSheetFrame
      surface={frame === 'page' ? undefined : c.backgroundElement}
      title="Sets"
      subtitle={context}
      frame={frame}
      onClose={onClose}
      closeLabel="Close sets"
      pinned={pinned}>
      {body}
    </PlayerSheetFrame>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /* The pinned controls: one gutter, the 8pt gap down to the scroll, and the
     same 8 between the chips and the claim bar when both are drawn. Named
     `strip` from when the summary lived in here too — it is the chips' block
     now, and the strip is inside the scroll. */
  strip: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.two },
  /* NO PADDING OF ITS OWN ANY MORE — the frame's scroller carries the sheet's
     gutter and its bottom inset, and adding either here would be a double
     indent against the pinned chips above. What is left is the rhythm between
     the strip, the notices and the list. */
  content: { gap: Spacing.three },
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
