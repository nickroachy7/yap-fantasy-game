/**
 * Collection · Inventory — the cards you own.
 *
 * Virtualised from the first render: a collection has no upper bound, so
 * mapping over an array here would be a cliff rather than a slowdown.
 *
 * IT IS A LIST OF ROWS, NOT A GRID OF CARDS, and that is the newest thing about
 * it. Every card face has been replaced by the compete board's row — see
 * `InventoryRow` for the argument, which comes down to a 100pt square having
 * nowhere to put the two numbers this screen exists to weigh. The card art is
 * not retired; it is reserved for the pack pull, where a face being a face is
 * the whole event.
 *
 * Everything below still holds, and most of it got simpler: the rows are
 * full-bleed and fixed-height, so the column arithmetic, the layout
 * measurement and the remount that came with them are all gone.
 *
 * THE CONTROLS ARE OUTSIDE THE LIST; THE SUMMARY IS INSIDE IT. The chips and
 * the two round buttons are siblings of the FlatList rather than its header, so
 * that a control cannot scroll away from the thing it controls.
 *
 * THERE IS NO SEARCH FIELD ANY MORE, and it was the reason the controls first
 * moved out here: a `TextInput` used as a `ListHeaderComponent` is remounted on
 * every keystroke and loses focus after one character. The field is gone
 * because the question is — the roster caps at thirty, position and tier cut
 * that to a handful, and a shelf you can see all of does not need searching.
 * See `InventoryControls`. The rest stayed out here on their own merits.
 *
 * THE SUMMARY WENT THE OTHER WAY, and that is the change this note is about.
 * It used to sit ABOVE the controls and collapse on a push up the page — a
 * transform on a block one strip taller than the frame, a threshold, a measured
 * travel, and a matching pad on the bottom of every list inside it. All of that
 * machinery existed to buy back ~50pt of height that a summary does not need to
 * be holding once you are twenty rows in.
 *
 * Scrolling it away with the cards buys the same height for none of the
 * machinery, and it fixes what the collapse could not: the strip is a statement
 * about the whole collection, so it belongs where the collection is drawn, not
 * over the controls that cut the collection down. So the order is now controls
 * first, then the scroll — and the first thing in the scroll is what you own.
 *
 * The controls still do not move. They are the things you just pressed.
 *
 * THE ROSTER WARNING FOLLOWED IT IN, and sits directly under the strip. It is
 * the same kind of object — a statement about the collection, not a control
 * over it — and the two figures belong together: the strip counts what you
 * hold, the bar says what holding that many costs you. See the render.
 *
 * AND WHEN THE CAP IS BROKEN, A LINE ACROSS THE GRID AT IT. The bar says how
 * many you are over; the line says WHICH, in the order you are looking at them.
 * See `cutId` for the three conditions it insists on before drawing, and
 * `RosterCut` for what it is claiming.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTabBarSpace } from '@/components/shell/useTabBarSpace';
import { CollectionValue } from '@/components/collection/CollectionValue';
import { RosterAlert } from '@/components/collection/RosterAlert';
import { RosterCount } from '@/components/collection/RosterCount';
import { BulkBar } from '@/components/collection/BulkBar';
import { SELECTION_MAX, sellTotal } from '@/components/collection/bulk';
import { RosterCut } from '@/components/collection/RosterCut';
import { useStarters } from '@/components/collection/use-starters';
import { useBulk } from '@/components/collection/use-bulk';
import { EmptyCollection } from '@/components/collection/EmptyInventory';
import { InventoryRow } from '@/components/collection/InventoryRow';
import { sortCards, summarise, type CollectionCard } from '@/components/collection/types';
import { useCollection } from '@/components/collection/use-collection';
import { Screen } from '@/components/shell/Screen';
import { PACKS, SETS } from '@/components/shell/sections';
import { useIsWide } from '@/components/shell/useResponsive';
import { DoorChip, Plus } from '@/components/ui/DoorChip';
import { quietScrollbar } from '@/components/ui/scroll-strip';
import { Colors, Spacing, Type } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Whether the packs sheet has already been offered to an empty collection this
 * session. See the effect that reads it — it must survive a remount of this
 * screen, which is what rules out `useState`/`useRef`.
 */
let starterOffered = false;

const GUTTER = Spacing.three;
/**
 * Clearance under the last row of a full-height list.
 *
 * IT DOES NOT INCLUDE THE TAB BAR, and it used to. Every list on the app added
 * `useTabBarInset()` — 54pt of bar plus the home indicator's 34 — on the belief
 * that the bar floats over the page. It does not: `BottomTabView` renders the
 * scene and the bar as SIBLINGS in a column, and the bar is only positioned
 * absolutely when it is hidden, so the scene already ends where the bar begins.
 * What that inset bought was ~88pt of black between the last row and the bar on
 * every scrolling screen in the app.
 *
 * So the tail is just a tail now: enough that the last row is not jammed
 * against the bar, and nothing more.
 */
const LIST_TAIL = Spacing.four;

/**
 * What the bar says when a starter is pressed in multi-select.
 *
 * IT NAMES THE CARD, and that is the whole of what changed about it. The first
 * version was a rule — "Cards in your lineup cannot be sold or added to sets" —
 * which is true, general, and answers a question nobody asked: the reader
 * pressed ONE card and wants to know what happened to THAT press. A rule
 * floating over a grid of thirty reads as a policy notice, and leaves them to
 * work out which of the thirty it is about.
 *
 * SO IT IS THREE CLAUSES IN THE ORDER SOMEBODY WOULD ASK THEM. What did not
 * happen (this card was not selected), why (it is in a lineup you have not
 * played), and what to do about it (bench it). The rule is still in there — it
 * is the second clause — but it arrives as the reason for a specific refusal
 * rather than as a sign on the wall.
 *
 * "A LINEUP YOU HAVE NOT PLAYED YET" rather than "this week's lineup", because
 * a card can be standing in a contest's lineup as well as the free one, and
 * because the predicate behind this is `lineup_slots` joined on `scored_at is
 * null` — which is exactly "not played yet" and is not exactly "this week".
 * See `use-starters`.
 *
 * THE NAME IS OPTIONAL because the lookup is against the rows currently loaded
 * and a press can in principle land on a card the grid has since replaced. The
 * sentence still has to work, so it falls back to naming the card as a card.
 */
function cannotSelect(playerName: string | undefined): string {
  const who = playerName ?? 'That card';
  return `${who} cannot be selected — that copy is in a lineup you have not played yet. Bench it first to sell it or add it to a set.`;
}

export default function InventoryScreen() {
  const tabSpace = useTabBarSpace();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  /* The rail draws Packs as a row of its own on wide. See the doors. */
  const wide = useIsWide();
  const { cards, error, loading, refreshing, refresh } = useCollection();
  /* The roster comes off the SAME context as the header's count, which is what
     makes it move the instant a sale lands rather than on the next focus — see
     `PlayerContext`. It used to be a hook of its own that re-read on focus and
     on nothing else. */
  const { cardCount, roster, refresh: refreshPlayer } = usePlayer();

  /**
   * MULTI-SELECT, and it is a MODE rather than a long-press.
   *
   * A cell in this grid opens the card, and that is the tap people already know.
   * Overloading it — long-press to start selecting, tap to select once you are —
   * gives one gesture two meanings depending on a state with nothing on screen
   * to announce it, and there is no long-press on the web build at all. So the
   * mode is a button, and while it is on a tap ticks instead of opening.
   *
   * IDS, NOT CARDS. The rows are replaced wholesale every time the collection is
   * re-read — after a sale, after a commit — so holding the objects would hold a
   * copy of a card that no longer exists. Ids survive that, and anything the
   * selection needs is looked up against the current rows. See `selectedCards`.
   */
  /* DERIVED, NOT A MODE. The circle in every row is always live, so "are we
     selecting" is simply "has anything been picked" — there is no state to
     enter and none to leave. What it still gates is the row's explanation of
     itself (the STARTING and IN SET marks) and the bar at the bottom. */
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selecting = selected.size > 0;

  /* ---- list geometry --------------------------------------------------- *
   * THERE ISN'T ANY, AND THAT IS THE POINT. This screen used to measure itself
   * on layout, derive a column count between three and seven, divide the
   * remainder into exact card widths, hold the first render until the
   * measurement landed, and remount the list whenever the count changed. All
   * of it existed to lay out squares.
   *
   * Rows are full-bleed and fixed-height, so the list needs to know nothing
   * about how wide it is — which also retires the blank first frame, the
   * module-scope width cache that existed to paper over it, and the guaranteed
   * remount on rotation. See `InventoryRow` for why the cards went.          */

  const all = useMemo(() => cards ?? [], [cards]);
  const stats = useMemo(() => summarise(all), [all]);
  /* The copies you are STARTING this week. They cannot be ticked — see
     `use-starters` for why a commit is the dangerous half of that. */
  const starters = useStarters();
  /* THE OTHER TWO DECISION SETS ARE GONE WITH THE CHIPS THAT ASKED FOR THEM.
     `spareIds` and `useOffers` fed the spares/commitable/starting filter — one
     pure pass over the ids, one RPC over the whole collection — and nothing on
     this page asks either question now. `starters` stays: it is not a filter,
     it is the refusal a tick has to honour. */
  /**
   * Why the last blocked tap did nothing, shown on the selection bar.
   *
   * ON THE BAR RATHER THAN ON THE CELL, because a 100pt square already carries
   * a tick, a tier, a nameplate and sometimes an IN SET pill, and the sentence
   * is longer than any of them. The cell says THAT it is blocked — it is dimmed
   * and marked STARTING; this says why, once, in the one place on the screen
   * that is about the selection.
   *
   * Cleared by the next successful tick, so it is about the tap you just made
   * rather than a state the bar sits in.
   */
  const [blockedNote, setBlockedNote] = useState<string | null>(null);

  /**
   * EVERY CARD YOU OWN, BEST FIRST, AND THERE IS NOTHING TO CHOOSE.
   *
   * The board carried three filters and a sort — position, tier, and a
   * "what are you trying to decide" row of spares / commitable / starting —
   * and they are gone from this page. What they were for was finding one card
   * in a mosaic of thirty squares you could not read; a list of rows that each
   * state the player, his season, the tier, the total and the price is the
   * thing the filters were standing in for.
   *
   * They are not deleted, only unused here: `InventoryControls` still exists
   * and `/gallery` still draws it. If a roster cap ever stops being thirty this
   * is the first thing that comes back.
   *
   * CAREER FP, DESCENDING — the sort's own default, now the only order. It puts
   * the copies worth keeping at the top, which makes the bottom of the list the
   * sell pile without anything having to say so.
   */
  const visible = useMemo(() => sortCards(all, 'fp', 'desc'), [all]);

  /**
   * The copy the roster cap falls on, or null when there is no line to draw.
   *
   * TWO CONDITIONS, AND EACH ONE IS THE LINE REFUSING TO LIE. There were three:
   * the third was NOTHING FILTERED, because the thirtieth quarterback on screen
   * is not the thirtieth card you hold. The page has no filters left, so the
   * list is always the whole collection and the condition is always true.
   *
   *   OVER THE CAP. Under it every card you hold is on the right side of the
   *     line, so there is nothing to divide. Same threshold the roster bar uses
   *     to turn red, from the same figure, so the two cannot disagree about
   *     whether there is a problem.
   *
   *   MORE CARDS THAN THE CAP ON SCREEN. Belt and braces against the two above
   *     drifting apart — `roster.held` is the server's count and `visible` is
   *     the rows that have arrived, and for one render after a refresh they can
   *     be different numbers.
   *
   * It is an ID rather than an index because the separator is handed the ROW it
   * follows and not the position of it — see the grid's `ItemSeparatorComponent`.
   */
  const cutId = useMemo(() => {
    if (!roster?.isOver) return null;
    if (visible.length <= roster.cap) return null;
    return visible[roster.cap - 1]?.id ?? null;
  }, [roster, visible]);

  /**
   * The separator, built only when there is a cut to draw.
   *
   * `undefined` otherwise, so a grid with nothing to divide renders no
   * separator component at all rather than one that returns null between every
   * pair of rows.
   *
   * AFTER THE CAP'S CARD, and now that is all there is to say. The grid could
   * only promise to draw it after the ROW holding that card — three columns
   * into thirty is ten whole rows on a phone, but a wider window straddled the
   * cap and the line had to fall above the straddling row so it never claimed a
   * card was over when it was not. One column per card retires the whole
   * caveat: the line lands after the thirtieth card, exactly.
   */
  const cut = useMemo(() => {
    const cap = roster?.cap;
    if (!cutId || !cap) return undefined;
    return function Cut({ leadingItem }: { leadingItem?: CollectionCard | CollectionCard[] }) {
      // One card per item now the list is one column wide. The array form is
      // handled because `ItemSeparatorComponent` hands one over under
      // `numColumns > 1` and this screen has been both.
      const row = Array.isArray(leadingItem) ? leadingItem : leadingItem ? [leadingItem] : [];
      if (!row.some((card) => card.id === cutId)) return null;
      return (
        <View style={styles.cut}>
          <RosterCut cap={cap} />
        </View>
      );
    };
  }, [cutId, roster?.cap]);

  const onRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshPlayer()]);
  }, [refresh, refreshPlayer]);

  /* Resolved against the CURRENT rows, so a card that has just been sold out
     from under the selection simply is not in here any more.

     STARTERS ARE FILTERED HERE AS WELL AS AT THE TICK, and the second guard is
     not belt and braces: the tick refuses what `starters` held AT THE TIME, and
     that set is re-read on focus — so a card ticked on Monday and started on
     Tuesday is in `selected` and must not reach either action. Filtering at the
     point the payload is built is the only place that catches it. */
  const selectedCards = useMemo(
    () => all.filter((card) => selected.has(card.id) && !starters.has(card.id)),
    [all, selected, starters],
  );
  const selectedCoins = useMemo(() => sellTotal(selectedCards), [selectedCards]);

  /* Everything a CELL draws differently from one render to the next, in one
     object, because `extraData` is compared by identity and a fresh literal
     would redraw every row on every render. Both halves matter: the ticks
     change on a tap, and which cells are blocked changes when a lineup is
     edited on another tab. */
  const cellState = useMemo(() => ({ selected, starters }), [selected, starters]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const bulk = useBulk(clearSelection);

  /**
   * TICK OR UNTICK ONE CARD. Called by the circle in the row and by nothing
   * else — there is no mode to open first, so there is no longer any question
   * of how the mode was opened or when it should close. It closes when the last
   * tick comes off, because `selecting` is just "is anything picked".
   */
  const toggleCard = useCallback(
    (id: string) => {
      /* A CARD YOU ARE STARTING CANNOT BE PICKED. Selling one is refused by the
         server and committing one would burn it out of the lineup it is
         standing in — see `use-starters`. The tap says so rather than doing
         nothing, because a cell that ignores a press reads as a broken cell. */
      if (starters.has(id)) {
        setBlockedNote(cannotSelect(all.find((card) => card.id === id)?.playerName));
        return;
      }
      setBlockedNote(null);

      setSelected((held) => {
        const next = new Set(held);
        if (next.has(id)) next.delete(id);
        // The ceiling is the SERVER's — both bulk functions refuse past 64 — so
        // the tick simply does not take rather than the run failing later. The
        // bar says the number when it is reached.
        else if (next.size < SELECTION_MAX) next.add(id);
        return next;
      });
    },
    [starters, all],
  );


  /* `addable` LIVED HERE, and it went with the arming it fed. It was the list a
     press of Select would tick — the visible cards minus the starters, minus
     what was already ticked, truncated at `SELECTION_MAX` — and it only ever
     mattered because a press from a NARROWED list armed the mode. With no
     filters there is nothing to narrow, so the mode always opens empty and
     there is no set of cards to compute. See `startSelecting`.

     The two subtractions it made are not lost: `toggleCard` still refuses a
     starter, and `BulkBar` still counts what is actually ticked. */


  /**
   * A player who owns nothing gets the packs sheet opened FOR them, once.
   *
   * The free Starter Pack is eight cards and a legal lineup — it is the whole
   * first session — and making it depend on noticing a button is how a new
   * account ends up staring at an empty grid. Owning zero cards is a sound
   * enough proxy for "the starter is unclaimed" to skip a query for it: the
   * pack deals eight, so nobody has opened it and has none.
   *
   * ONCE PER APP SESSION, and the flag is module-level rather than state for
   * exactly that reason. Closing the sheet puts you back on this screen, which
   * is still empty — so a re-runnable effect would push it straight back up and
   * the player could not get out. Deciding not to claim has to stick.
   */
  useEffect(() => {
    if (loading || error || all.length > 0 || starterOffered) return;
    starterOffered = true;
    router.push('/packs');
  }, [loading, error, all.length, router]);

  /* ---- navigation ------------------------------------------------------ *
   * A cell in this grid is a COPY you own, not a player, so it opens
   * `/card/<card_instance_id>` — the copy's own tier, what it has earned, the
   * weeks it started, and where it ranks against every other copy of him. The
   * footballer is one more tap from there, and is the same page for everyone.
   *
   * This used to resolve card_id -> player_id and open the player instead,
   * which threw away the one thing the tap actually identified: WHICH of your
   * copies was pressed. Someone holding three Caleb Williams cards got the same
   * screen from all three.
   *
   * `card.id` is the instance id and is always present, so unlike the old
   * player lookup there is nothing to wait on and no unpressable cell.        */
  const openCard = useCallback(
    (card: CollectionCard) => () =>
      router.push({ pathname: '/card/[id]', params: { id: card.id } }),
    [router],
  );

  // cardCount is the header's count and lands before the grid does, so it is
  // the right stand-in only until the rows themselves arrive.
  const total = cards?.length ?? cardCount;
  /* The whole collection, always — there is no filter left to narrow it, so the
     "N of M" form the line used to take has nothing to report. */
  const context = `${total} cards`;

  return (
    <Screen title="Inventory" context={context} scroll={false}>

      <View style={styles.fill}>
        {loading ? (
          <View style={styles.centred}>
            <ActivityIndicator />
          </View>
        ) : error ? (
          <View style={styles.centred}>
            <Text style={[Type.section, { color: c.text }]}>Could not load your cards</Text>
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
        ) : all.length === 0 ? (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={[styles.emptyContent, { paddingBottom: Spacing.six + tabSpace }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            <EmptyCollection onGetCards={() => router.push('/packs')} />
          </ScrollView>
        ) : (
          <>
            {/* TWO READOUTS, A SWITCH, AND TWO DOORS — in that order, left to
                right, which is what the row is FOR read as a sentence: this is
                what you have, this is what you can do to it, and these are the
                places you go from here.

                THE READOUTS PAIR UP ON THE LEFT. Value and the cap used to sit
                at opposite ends with the controls between them, which was the
                right arrangement while the controls were the row's subject.
                They are two facts about one collection — what it is worth, how
                full it is — and they belong together at the head of the row
                where they can be read in one glance.

                THE FILTERS ARE GONE. Position, tier, the decision chips and the
                sort were `InventoryControls`, and they existed because a grid
                of thirty squares could not be read: a filter was how you found
                a card. The rows say everything the squares could not, so the
                controls were narrowing something that no longer needs
                narrowing. See `visible`.

                THE DOORS ARE THE LINEUP RAIL'S, and deliberately the same
                object — `DoorChip`, at the same height, with the same `+`. The
                collection's toolbar and the carousel's rail are now the same
                shape: a readout about the thing above, and the pair of places
                you leave it for. A player who has learned "+ Contests" on
                Sunday has learned this row too.

                ORDER IS BY WHAT THE ACT COSTS. Sets is where cards GO — the one
                exit that preserves board value — and it costs you a card, so it
                is read first. Packs is the shop, and a shop is what you visit
                once you know what you need. Same rule as the rail's Contests
                before Packs.

                NEITHER `+` TAKES THE ACCENT. On the rail the contests mark is
                gold because it is the one control on the screen that spends a
                heart, and gold appears exactly once there. Nothing on this row
                spends anything — both doors merely open a room — so both marks
                are quiet, and the loudest object on the row stays the coin in
                the value readout, which is the fact it is about. */}
            <View style={styles.toolbar}>
              <CollectionValue sellValue={stats.sellValue} />
              {/* See `RosterCount` for why the margin beside it is
                  load-bearing. */}
              <RosterCount roster={roster} />
              <View style={styles.spacer} />
              <View style={styles.doors}>
                <DoorChip
                  label={SETS.label}
                  accessibilityLabel="Sets"
                  onPress={() => router.push(SETS.href as never)}
                  fill={c.backgroundElement}
                  ink={c.text}
                  lead={<Plus color={c.textSecondary} />}
                />
                {/* NOTHING ON WIDE. The rail carries Packs as a row of its own
                    there, and a second door two inches to the right of the
                    first is the duplication the rail's own notes talk it out
                    of — the rule `PacksButton` applied before this chip
                    replaced it. Sets has a rail row too and keeps its chip at
                    every width, exactly as Contests does on the lineup. */}
                {wide ? null : (
                  <DoorChip
                    label={PACKS.label}
                    accessibilityLabel="Packs"
                    onPress={() => router.push(PACKS.href as never)}
                    fill={c.backgroundElement}
                    ink={c.text}
                    lead={<Plus color={c.textSecondary} />}
                  />
                )}
              </View>
            </View>

            <FlatList
              {...quietScrollbar}
              style={styles.fill}
              data={visible}
              keyExtractor={(card) => card.id}
              contentContainerStyle={[styles.list, { paddingBottom: LIST_TAIL + tabSpace }]}
              /* The roster line, drawn after one particular row. See `cut`. */
              ItemSeparatorComponent={cut}
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              removeClippedSubviews
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListHeaderComponent={
                /* ONE STATEMENT, AND IT IS NOT A CONTROL — which is why it is in
                   here rather than pinned above with the toolbar: the header of
                   a list is the one place a fact about the list is allowed to
                   scroll away with it.

                   `ResultLine` USED TO SIT UNDER IT, reporting what the filters
                   had left of the collection. There are no filters, so there is
                   nothing for it to report: the list is always everything you
                   own and `Screen`'s context line already prints the total.

                   NOTHING PRESSABLE IS IN HERE, which is what makes it safe to
                   scroll and what stops it changing height. */
                <View style={styles.headerBox}>
                  {/* SITS ON THE LIST AND SCROLLS WITH IT. Pinned under the
                      toolbar it was a third band of chrome the eye had to pass
                      on every visit — and it is a STATEMENT, which this file's
                      own rule puts inside the list rather than above it.

                      Scrolling away is the right behaviour here even though the
                      state is urgent: you are over the cap for as long as it
                      takes to sell or commit, and the cards you would act on are
                      what you scrolled down to reach. A notice that follows you
                      down a list you are fixing is nagging, not helping.

                      NOTHING UNTIL THE CAP IS BROKEN — `RosterAlert` renders
                      null under it, so this costs no height on an ordinary
                      visit. */}
                  <RosterAlert roster={roster} />
                </View>
              }
              /* NO `ListEmptyComponent`. It drew `EmptyFilterResult` — "no cards
                 match", with a button to clear the chips — and the branch is now
                 unreachable: with no filters, a list of zero rows means a
                 collection of zero cards, which `EmptyCollection` answers above
                 instead and answers better, because the way out of that is a
                 pack rather than a cleared filter. */
              extraData={selecting ? cellState : null}
              /* NO `getItemLayout`, even though every row is exactly
                 `INVENTORY_ROW_HEIGHT` and it is the obvious win of a
                 fixed-height list. `ItemSeparatorComponent` is rendered INSIDE
                 the cell it follows, so the roster cut adds ~30pt to one row —
                 and a layout function that reported `height * index` would be
                 wrong for every row below it, which is a scroll that lands in
                 the wrong place exactly when you are over the cap and looking
                 for the cards to sell. Thirty rows do not need the shortcut. */
              renderItem={({ item }) => (
                <InventoryRow
                  card={item}
                  selecting={selecting}
                  selected={selected.has(item.id)}
                  /* Only once something is picked. A resting collection does not
                     need every starter labelled — see `InventoryRow.selecting`. */
                  blocked={starters.has(item.id)}
                  /* The row opens the card, ALWAYS. The circle is the only thing
                     that ticks, so the tap people already know never changes
                     meaning under them. */
                  onPress={openCard(item)}
                  onToggle={() => toggleCard(item.id)}
                />
              )}
            />

            {/* PINNED UNDER THE GRID, not pushed into it. The bar appears the
                moment the mode opens rather than on the first tick, so the grid
                does not reflow under a thumb that has just started picking —
                and it sits outside the FlatList because anything inside it
                scrolls away from the action it describes. */}
            {selecting ? (
              <BulkBar
                count={selected.size}
                max={SELECTION_MAX}
                sellCoins={selectedCoins}
                plan={bulk.plan}
                planning={bulk.planning}
                stage={bulk.stage}
                busy={bulk.busy}
                error={bulk.error}
                notice={blockedNote}
                result={bulk.result}
                onSell={bulk.askSell}
                onAdd={() => bulk.askAdd(selectedCards)}
                onConfirmSell={() => bulk.runSell(selectedCards)}
                onConfirmAdd={bulk.runAdd}
                onConfirmSellLeftovers={bulk.runSellLeftovers}
                onCancelStage={bulk.cancel}
                onClear={clearSelection}
                onDismissResult={bulk.dismissResult}
              />
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /* The same block as the Players boards' `filters`, down to the numbers: one
     gutter, one gap between the two controls, one gap before the list. Two
     screens with the same controls at different rhythms is what this was
     written to stop. */
  /* `Spacing.one + 2` below rather than `Spacing.two`: with every control at
     `ControlDiameter` the strip is 32pt tall, and 8pt under a 32pt strip made
     the band read as taller than the thing in it. */
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: GUTTER,
    paddingBottom: Spacing.one + 2,
  },
  /* The give in the row, and the ONLY give: everything else is a fixed readout
     or a chip that must not shrink. */
  spacer: { flex: 1, minWidth: 0 },
  /* The two doors, as one cluster rather than two buttons that happen to be
     near each other — the same gap the lineup rail sets between its own pair,
     which is the chip's internal one. */
  doors: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two - 2, flexShrink: 0 },
  /* `minWidth: 0` is load-bearing, and it is the trend board's note verbatim:
     without it the chips' ScrollView reports its full content width as its
     minimum and pushes the buttons off the row instead of scrolling inside what
     is left. */
  chips: { flex: 1, minWidth: 0 },
  /* NO horizontal padding, and no row gap. Rows are FULL-BLEED — each one
     carries the gutter itself and draws its own inset hairline where the grid
     had 12pt of air — so padding out here would indent the rows inside their
     own gutter and double the left margin. Anything in the list that is not a
     row has to ask for the gutter: see `headerBox` and `cut`. */
  list: { paddingBottom: LIST_TAIL },
  /* Everything in the list that is NOT a row — the header block, the empty
     state — and the one place the gutter is applied by hand. */
  headerBox: { paddingHorizontal: GUTTER },
  headerStrip: { paddingBottom: Spacing.two },
  header: { paddingBottom: Spacing.two },
  /* `RosterCut` is set for a grid: 12pt above, 4pt below, and it borrowed the
     grid's own 12pt row gap to make the space under the rule match the space
     over it. There is no row gap any more, so the missing half is added here
     along with the gutter the rule needs to line up with the rows it cuts. */
  cut: { paddingHorizontal: GUTTER, paddingBottom: Spacing.two },
  emptyContent: { padding: GUTTER, paddingBottom: Spacing.six },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  centredText: { textAlign: 'center' },
  retry: { borderRadius: 8, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  pressed: { opacity: 0.75 },
});
