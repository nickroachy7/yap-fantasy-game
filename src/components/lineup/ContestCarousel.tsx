/**
 * Your contests for the week, one card each, swiped horizontally.
 *
 * WHY A CAROUSEL AND NOT A LIST. The card is not a row: it is the top of the
 * table the lineup below it belongs to, and it carries a distribution that
 * needs its full width to read as an axis rather than a bar chart. Stacking
 * two of them would push the lineup off the screen on a phone, and shrinking
 * them would cost the one thing the card is for.
 *
 * SWIPING CHANGES THE BOARD BENEATH IT. That is the whole point — the card and
 * the slots under it are one object, so a carousel that only moved the card
 * would be showing you a contest's standing above a different contest's
 * lineup, which is exactly the bug this component was built to fix (see
 * `20260825070000`).
 *
 * THE FREE CONTEST IS ALWAYS FIRST and the carousel opens on it. It is the one
 * nobody chose to be in, the only one with a season riding on it, and the only
 * one that is there before you have done anything.
 *
 * ONE CARD DRAWS NO CHROME, and there is very little chrome left to draw. The
 * page dots are gone: they stated position and nothing else, in a row of small
 * marks sitting directly above the run's rack — two indicators of the same size
 * arguing about which one the reader should be counting. Position is carried by
 * the rack now (the lit heart names the page) and by a pair of edge chevrons
 * that appear only in the directions that exist, so a single-contest account
 * sees one arrow toward the lobby and nothing else.
 *
 * THE RACK IS ALSO THE NAVIGATOR. Tapping a heart goes to the page it belongs
 * to — its contest, or the lobby tile for a heart still free. See `pipPage`.
 *
 * ---------------------------------------------------------------------------
 * `onMomentumScrollEnd` DOES NOT EXIST ON WEB
 * ---------------------------------------------------------------------------
 *
 * It was the only thing calling `onIndexChange`, so on web the card moved and
 * the board underneath did not — the exact mismatch this component was built to
 * fix, reintroduced by the one platform nobody swipes on during development.
 *
 * react-native-web's `ScrollViewBase` emits `onScroll` and nothing else. It
 * synthesises a scroll-END by debouncing that same handler 100ms, but it calls
 * `onScroll` with it rather than `onMomentumScrollEnd`, so the momentum prop is
 * silently inert — it is accepted, forwarded to the scroll responder, and never
 * fired. Checked in `node_modules`, not inferred from the symptom.
 *
 * So web listens on `onScroll` as well. The handler is the same one and it is
 * idempotent — it compares against the current index and returns — so the extra
 * ticks during a drag cost nothing but a page change as you pass the halfway
 * point, which is what a snapping carousel should do anyway.
 *
 * The snapping itself is fine on web: `pagingEnabled` compiles to CSS
 * scroll-snap there, so the offset always settles on a real page and the
 * rounding below cannot land between two. A `snapToInterval` peek was tried in
 * its place and reverted — see the note on `step`.
 *
 * `goTo` exists because none of that fires for a PROGRAMMATIC scroll: a tap on a
 * heart has to move the list and the state itself.
 */
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { ContestCard } from '@/components/contests/ContestCard';
import { termsOfEntry, type MyContest } from '@/components/contests/use-my-contests';
import { Hearts, type HeartSpan } from '@/components/runs/Hearts';
import { Colors, Radius, Spacing, Type, selectionAccent } from '@/constants/theme';
import type { PlayerState } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * How far outside the card each chevron hangs.
 *
 * ---------------------------------------------------------------------------
 * IT IS BORROWED FROM THE SCREEN'S PADDING, NOT TAKEN FROM THE CARD
 * ---------------------------------------------------------------------------
 *
 * These arrows used to be absolutely positioned ON the scroll surface, 5pt
 * inside the card's own border — a grey glyph on the card's fill, at the height
 * of its densest band, legible only if you already knew it was there.
 *
 * The tidy fix was to give each one a real column in a row with the pager:
 * gutter, pages, gutter. That was wrong on sight. 28pt off a 343pt phone column
 * is a visibly crunched card, and the card is the densest thing on the screen —
 * it cannot pay for its own affordance.
 *
 * `Screen` already pads its content by `Spacing.three`, and the boards below
 * cancel that padding to bleed to the screen edge. So there are 16 points of
 * air either side of the card that nothing else is using, and the arrows go
 * there: outside the card, inside the screen, and free.
 *
 * 14 leaves 2pt of clearance at the screen edge and puts the 7pt glyph roughly
 * halfway into the trough. They are placed absolutely and therefore draw
 * OUTSIDE their parent's box, which iOS and the web both allow; if this ever
 * ships to Android and the arrows vanish, that clipping is the reason.
 */
const CHEV_GUTTER = 14;

export function ContestCarousel({
  contests,
  index,
  onIndexChange,
  onOpen,
  onTileChange,
  lockAt,
  locked,
  now,
  run,
  onEnter,
  width,
}: {
  contests: MyContest[];
  index: number;
  onIndexChange: (i: number) => void;
  /**
   * Opening a card's contest — its format, its price, how full it is, and the
   * way out of it.
   *
   * THE CARD IS THE HANDLE FOR THE CONTEST, which it was not before: it drew a
   * standing and could not be pressed, so the only route to a contest's terms
   * was the lobby — and the lobby deliberately lists only what you are NOT in.
   * A contest you had entered had no page at all once you were in it.
   */
  onOpen?: (contest: MyContest) => void;
  /**
   * "The reader has swiped past the last contest, onto the invitation."
   *
   * THE BOARD UNDERNEATH USED TO KEEP THE LAST CONTEST'S LINEUP HERE, and the
   * reasoning was that swapping it for nothing empties the screen behind an
   * invitation. In practice it did something worse: a page whose card says
   * "enter a new contest" sat over a filled `Starting lineup · 3/3` belonging
   * to a contest that had just slid off the screen — a lineup presented as
   * though it were this page's, on the one page that has none.
   *
   * So the tile is a state the parent has to know about, and it draws its own
   * empty board for it. Fired only when the answer CHANGES, because on web the
   * settle handler runs on every scroll tick (see the header) and this would
   * otherwise re-render the whole lineup screen mid-drag.
   */
  onTileChange?: (onTile: boolean) => void;
  lockAt: string | null;
  locked: boolean;
  now: number;
  /**
   * The run, for the rack under the card. Null while it loads, and drawn only
   * while the run has hearts to draw — a dead one awaiting its carry shows
   * nothing here, exactly as the masthead used to decide. See the foot.
   */
  run: PlayerState['run'];
  /** Open the lobby. The last page of the carousel is the way in. */
  onEnter: () => void;
  /**
   * The measured width of the column this sits in.
   *
   * MEASURED BY THE PARENT, not derived from the window. `Screen` caps its
   * content at a `ContentMeasure` and the rail eats 236 more on wide web, so
   * a page width computed from `useWindowDimensions` is wrong by hundreds of
   * points on a desktop — the same arithmetic the inventory grid's header
   * warns against restating.
   */
  width: number;
}) {
  const listRef = useRef<FlatList<MyContest>>(null);
  const { width: windowWidth } = useWindowDimensions();
  /* Before the parent has measured, fall back to the window rather than to
     zero: a zero-width page makes `getItemLayout` divide by nothing and the
     list snaps to index NaN.

     A PEEK WAS TRIED HERE — a sliver of the next card at the right edge, in
     place of the page dots. It is the standard carousel affordance and it was
     wrong for this card: at any width big enough to read as another card, the
     bordered slab at the edge looks like a layout fault rather than a hint, and
     at any width small enough not to, it reads as a rendering seam. Full-width
     pages, and the swipe is advertised some other way. */
  const step = width > 0 ? width : windowWidth;

  /* A dead run draws no rack, which is the masthead's old rule and its reason
     holds here too: an empty rack is the death screen's line to deliver, and
     three hollow pips inside a contest card would be a worse way to say it. */
  const rack = run && !run.awaitingCarry ? run : null;

  /**
   * WHICH PAGE, which is not the same question as which CONTEST.
   *
   * The last page is the lobby tile, and landing on it must not change the
   * board underneath — a reader looking at "enter a new contest" still has the
   * last contest's lineup below them, and swapping it for nothing would empty
   * the screen behind an invitation. So the page is tracked here and
   * `onIndexChange` fires only for the pages that are contests.
   *
   * Adjusted DURING RENDER when the parent moves the index — arriving from the
   * contest sheet on a particular card — which is React's own pattern for
   * "state derived from a prop that can also change on its own". Same
   * construction, and same reasoning, as `lastPage` in `Screen`.
   */
  const [page, setPage] = useState(index);
  const [lastIndex, setLastIndex] = useState(index);
  /**
   * How tall a card is, so the tile can be the same.
   *
   * MEASURED RATHER THAN STRETCHED. A row stretches its children by default and
   * the tile asks for `flex: 1`, but a `ListFooterComponent` is wrapped by
   * `VirtualizedList` in a box of its own that sizes to its content — so the
   * tile came out card-width and text-height, with a hand's width of dead space
   * under it before the foot row. The list's height is the tallest page either
   * way; this makes the tile one of them instead of leaving the gap visible.
   */
  const [cardHeight, setCardHeight] = useState(0);
  if (index !== lastIndex) {
    setLastIndex(index);
    setPage(index);
  }

  /* "The scroll has settled on a page." Native learns that from momentum end;
     web from the debounced scroll event. Same arithmetic either way. */
  const onSettle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / step);
      if (next < 0 || next > contests.length) return;
      /* ONLY ON A CHANGE OF ANSWER. On web this handler is the debounced
         `onScroll` (see the header), so an unconditional call would re-render
         the whole lineup screen on every tick of a drag. */
      if ((next >= contests.length) !== (page >= contests.length)) {
        onTileChange?.(next >= contests.length);
      }
      setPage(next);
      // The tile is not a contest; the board below draws its own empty state.
      if (next < contests.length && next !== index) onIndexChange(next);
    },
    [step, contests.length, index, page, onIndexChange, onTileChange],
  );

  /**
   * Drive the carousel from somewhere other than a swipe — today, a tap on a
   * heart. Moves the list AND the state, because a programmatic scroll fires no
   * settle event on web.
   */
  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next > contests.length) return;
      /**
       * NOT ANIMATED, and that is a correctness fix rather than a taste one.
       *
       * On web this component listens on `onScroll` directly (see the header —
       * `onMomentumScrollEnd` never fires there), so an animated programmatic
       * scroll emits a stream of intermediate offsets and the FIRST of them,
       * still reading ~0, ran `onSettle` and put the page straight back where it
       * started. The tap moved the list a couple of points and snapped home.
       *
       * A jump lands on the target before any scroll event is dispatched, so the
       * settle that follows agrees with the state instead of fighting it. It also
       * happens to be the better interaction: a tap is a direct instruction and
       * should not make the reader watch it being carried out.
       */
      listRef.current?.scrollToOffset({ offset: step * next, animated: false });
      if ((next >= contests.length) !== (page >= contests.length)) {
        onTileChange?.(next >= contests.length);
      }
      setPage(next);
      if (next < contests.length && next !== index) onIndexChange(next);
    },
    [step, contests.length, index, page, onIndexChange, onTileChange],
  );

  /**
   * WHICH PIPS EACH CONTEST IS HOLDING — one span per card, computed once for
   * the whole carousel.
   *
   * IT USED TO BE COMPUTED FOR THE PAGE YOU WERE ON, because there was one rack
   * on the screen and it belonged to the carousel rather than to a card. Now
   * each card carries its own foot, so each needs its own span and the answer is
   * a list rather than a lookup — which is the honester shape anyway: the
   * mapping was always per contest, and reading it out of the current page was
   * how the rack came to live outside the object it described.
   *
   * Nothing in the schema maps a heart to a contest — `run.wagered` is a count —
   * so the mapping is made here and made consistently: `Hearts` draws wagered
   * pips FIRST, so stakes fill from pip 0 rightward and contests take them in
   * carousel order. The count is the database's; only the order is ours, and it
   * is stable because the carousel's order is.
   *
   * The cursor walks every contest, including free ones, so a contest's span
   * never depends on how many free contests precede it.
   *
   * Null on a contest that risks nothing, and null past `atRisk` — a stake with
   * no wagered pip behind it gets no highlight rather than a borrowed one.
   */
  const spans = (() => {
    if (!rack) return [];
    const held = Math.max(0, rack.hearts);
    const atRisk = Math.min(Math.max(0, rack.wagered), held);
    let cursor = 0;
    return contests.map((ct) => {
      const n = Math.max(0, ct.heartsAtRisk);
      if (n <= 0) return null;
      const start = cursor;
      cursor += n;
      if (start >= atRisk) return null;
      return { start, count: Math.min(n, atRisk - start) };
    });
  })();

  /**
   * The inverse of `spans`: for each pip, the page a tap on it should go to.
   *
   * THIS IS WHAT MAKES THE RACK A NAVIGATOR rather than a readout. A staked
   * heart goes to the contest holding it; a free heart goes to the lobby tile,
   * which is the page about spending one; a killed heart goes nowhere, because
   * the contest that took it is over and there is nothing to show.
   *
   * The free-heart case is the same mapping the tile already draws in reverse —
   * standing on the tile lights every free heart — so the two directions agree
   * by construction rather than by two lists being kept in step.
   */
  const pipPage = (() => {
    if (!rack) return [];
    const held = Math.max(0, rack.hearts);
    const atRisk = Math.min(Math.max(0, rack.wagered), held);
    const total = Math.max(rack.rack, held, 1);
    const out: (number | null)[] = Array.from({ length: total }, (_, i) =>
      /* Free hearts point at the invitation to spend them. Killed ones at
         nothing. */
      i >= atRisk && i < held ? contests.length : null,
    );
    spans.forEach((span, contest) => {
      if (!span) return;
      for (let i = span.start; i < span.start + span.count && i < total; i += 1) {
        out[i] = contest;
      }
    });
    return out;
  })();

  if (contests.length === 0) return null;

  /* The tile is the page after the last contest, and it is the one page whose
     rail speaks about free hearts rather than staked ones. */
  const onTile = page >= contests.length;

  return (
    <View>
      {/* THE STAGE: the pages, with an arrow hung off each side in the screen's
          own padding. Only in the directions that exist — see `CHEV_GUTTER`. */}
      <View style={styles.stage}>
        <ChevSlot side="left" show={page > 0} onPress={() => goTo(page - 1)} />
        <ChevSlot side="right" show={page < contests.length} onPress={() => goTo(page + 1)} />
        <FlatList
          ref={listRef}
          data={contests}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onSettle}
          /* Web only, and only because the prop above never fires there. Adding
             it on native as well would move the board mid-drag, which is a
             behaviour change to the platform that already works. */
          {...(Platform.OS === 'web'
            ? { onScroll: onSettle, scrollEventThrottle: 16 }
            : null)}
          keyExtractor={(item) => item.id}
          getItemLayout={(_, i) => ({ length: step, offset: step * i, index: i })}
          /* OPENS ON THE LINKED CARD, not on the first one. Arriving from the
             contest sheet means the reader has just chosen a contest, and a
             carousel that marked it active while showing the free contest's card
             would be the same mismatch this component exists to fix — one rank
             down. Safe with `getItemLayout` supplied; without it the list cannot
             measure ahead and silently ignores this. */
          initialScrollIndex={index}
          renderItem={({ item, index: i }) => (
            <View
              style={{ width: step }}
              /* The first card only: they are within a few points of each other
                 — the same rows in the same order — and measuring every page
                 would set the same state from three directions on every swipe. */
              onLayout={i === 0 ? (e) => setCardHeight(e.nativeEvent.layout.height) : undefined}>
              <Card contest={item} onOpen={onOpen} {...{ lockAt, locked, now }} />
            </View>
          )}
          /* THE LAST PAGE IS THE WAY INTO THE LOBBY, and it is a footer rather
             than an extra row of data so that nothing downstream has to hold a
             union of "contest or invitation": `keyExtractor`, `getItemLayout`
             and the index arithmetic all stay about contests. It is exactly one
             page wide, so `round(x / page)` keeps working across it. */
          ListFooterComponent={
            <View style={{ width: step }}>
              <EnterTile onPress={onEnter} minHeight={cardHeight} />
            </View>
          }
        />
      </View>
      {rack ? (
        <RunRail
          run={rack}
          focus={onTile ? null : (spans[page] ?? null)}
          onTile={onTile}
          pipPage={pipPage}
          onGo={goTo}
        />
      ) : null}
    </View>
  );
}

/**
 * The run, under the whole carousel: what you hold, what is riding, and which
 * heart belongs to the card above.
 *
 * ---------------------------------------------------------------------------
 * IT IS UNDER THE CAROUSEL BECAUSE A RUN DOES NOT SWIPE
 * ---------------------------------------------------------------------------
 *
 * This has now lived in three places, and the first two were both wrong for the
 * same reason at different scales.
 *
 * In the MASTHEAD it stated your hearts on Collection and Players — screens
 * where a heart cannot be won or lost — beside a gem balance, with nothing
 * linking it to the contest actually risking one.
 *
 * As a BAND OF THE CARD it was adjacent to the right thing and still lied about
 * ownership: the rack was rendered once per page, so the identical three hearts
 * slid off the screen and three more slid on every time you swiped. A run does
 * not change when you change which contest you are looking at. Drawing it
 * inside the thing that moves said that it did.
 *
 * Here the rack is FIXED and only the highlight travels. The motion now tells
 * the truth — the run stays, the stake moves — which is the whole reason the
 * mapping is worth drawing at all.
 *
 * (The intermediate objection is still real and is why this is not a panel: a
 * bordered, filled, rounded box under a bordered, filled, rounded card is a
 * second card, and two cards argue about which one matters. This is a hairline
 * and a row. No border, no fill, no radius.)
 *
 * ---------------------------------------------------------------------------
 * ONE ROW, AND WHAT WAS CUT TO GET IT
 * ---------------------------------------------------------------------------
 *
 * The band version was three rows — a `YOUR RUN` label, the rack, and a caption
 * — and two of them were not carrying anything.
 *
 * The LABEL went because the count is the fact. "Wagering 2 of 3 hearts" needs
 * no heading; `YOUR RUN` was a title for a thing that is self-evidently your
 * run.
 *
 * The CONTEST NAME under the lit heart went because the card directly above the
 * rail already says it. Naming it twice, eight points apart, to explain a
 * highlight whose subject is the only card on screen.
 *
 * What is left is the rack on the left and two lines of text on the right, and
 * those two lines have different sources on purpose:
 *
 *   LEAD  is the RUN's state — how much of what you hold is committed. True
 *         wherever you are in the carousel; it does not change as you swipe.
 *   SUB   is the PAGE's meaning — what the contest in view does to you. This
 *         is the half that changes under your thumb.
 *
 * So the row answers "where do I stand" and "what does this one cost" without
 * either question borrowing the other's words.
 *
 * ---------------------------------------------------------------------------
 * EVERY PAGE LIGHTS SOMETHING
 * ---------------------------------------------------------------------------
 *
 * A contest that stakes a heart lights that heart. The free contest lights
 * nothing and says so. And the lobby tile — the last page, the app's main call
 * to action — lights every heart you have NOT spent, dashed, in the same
 * language as the tile's own dashed border.
 *
 * That last case is why free hearts needed a state of their own. "Enter a new
 * contest" is an invitation to spend something, and before this the thing being
 * spent was drawn nowhere near it.
 */
function RunRail({
  run,
  focus,
  onTile,
  pipPage,
  onGo,
}: {
  run: NonNullable<PlayerState['run']>;
  focus: HeartSpan | null;
  onTile: boolean;
  /** Where a tap on each pip should land, or null for pips that go nowhere. */
  pipPage: (number | null)[];
  onGo: (page: number) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  const held = Math.max(0, run.hearts);
  const staked = Math.min(Math.max(0, run.wagered), held);
  const free = held - staked;

  /**
   * ONE SHORT LINE, AND IT IS A COUNT.
   *
   * This was two lines — "Wagering 2 of 3 hearts" over "Lose all 3 and your team
   * is eliminated." — and the second was doing a job this row should not have.
   * A consequence that severe is something a player should be TAUGHT once, in
   * onboarding, not reminded of on every glance at their own lineup; standing
   * permanently under the board it reads as nagging, and by week three it is
   * furniture nobody parses.
   *
   * What is left is the fact the rack cannot state on its own: how many of these
   * are committed. The hearts show which; the words show how many. Set at `fine`
   * in the tertiary colour, so it sits under the rack rather than beside it as
   * an equal.
   *
   * The tile still gets its own phrasing, because there the count IS the call to
   * action — "1 free" is the answer to the invitation directly above it.
   */
  /**
   * IT NAMES THE HEART IN VIEW, NOT THE RUN'S TOTAL.
   *
   * This read "2 of 3 staked" on every page — an aggregate, so it said the same
   * thing no matter which card you were looking at, and the one row that moves
   * with the swipe was the one row that never changed. Now the number is the
   * lit heart's POSITION in the rack, so it counts up as you swipe: "1 of 3
   * staked", "2 of 3 staked", "3 of 3 free". The words say what that heart is;
   * the number says which one.
   *
   * `of 3` IS THE HEARTS YOU HOLD, not the pips drawn. Killed hearts sort to the
   * end of the rack (see `Hearts`), so held hearts occupy positions 1..held and
   * the index never has to skip a gap — and "2 of 4" on a run that holds three
   * would be counting a heart the player no longer has.
   *
   * A range where a contest stakes more than one. No contest priced so far does,
   * but `hearts_at_risk` is a number and the first two-heart contest must not
   * quietly report itself as one.
   */
  const span = (first: number, count: number) =>
    count > 1 ? `${first}–${first + count - 1}` : `${first}`;

  const line = onTile
    ? free > 0
      ? `${span(staked + 1, free)} of ${held} free`
      : 'none free'
    : focus
      ? `${span(focus.start + 1, focus.count)} of ${held} staked`
      : `${held} ${held === 1 ? 'heart' : 'hearts'}`;

  return (
    <View style={styles.rail}>
      <Hearts
        hearts={run.hearts}
        wagered={run.wagered}
        rack={run.rack}
        focus={focus}
        /* Nothing to offer means nothing to light: on the tile with every heart
           already committed, dimming the whole rack to highlight an empty set
           would read as a fault rather than as an answer. */
        available={onTile && free > 0}
        size={26}
        onPressPip={onGo}
        pipTarget={pipPage}
      />
      <Text
        numberOfLines={1}
        style={[Type.fine, { color: onTile && free > 0 ? accent : c.textTertiary }]}>
        {line}
      </Text>
    </View>
  );
}

/**
 * The empty slot at the end of the swipe: the lobby, as a card you can reach
 * with the gesture the carousel already teaches.
 *
 * IT IS THE ONLY DOOR ON THIS SCREEN NOW. The board's second view used to be a
 * tab in a bar above the page; that bar is gone (see `CONTESTS` in
 * `sections.ts`), and this took its job. Which is an improvement rather than a
 * swap: the bar was a word at the top of a screen nobody looks at twice, and
 * this is the next thing under your thumb after the contest you are already in.
 *
 * DASHED, AND DELIBERATELY NOT A BUTTON. The dashes say "a card could go here",
 * which is what an empty slot is for — a solid panel with a label would read as
 * another contest you are somehow already in, which is the one thing this must
 * not look like.
 */
function EnterTile({ onPress, minHeight }: { onPress: () => void; minHeight: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Enter a new contest"
      style={({ pressed }) => [
        styles.tile,
        { borderColor: c.border, minHeight },
        pressed && styles.pressed,
      ]}>
      <Text style={[Type.strong, { color: c.text }]}>Enter a new contest</Text>
      <Text style={[Type.fine, styles.tileBody, { color: c.textSecondary }]}>
        See what is open this week. A card can only play in one contest, so
        entering means playing deeper into your roster.
      </Text>
    </Pressable>
  );
}

/**
 * A chevron in the screen's padding, beside the card.
 *
 * ---------------------------------------------------------------------------
 * IT IS A CONTROL NOW, BECAUSE IT IS NO LONGER IN THE WAY
 * ---------------------------------------------------------------------------
 *
 * These used to be `pointerEvents="none"` and that was load-bearing rather than
 * fussy: they sat ON the scroll surface, so a tap target at the card's edge
 * would have swallowed the start of the very drag it was asking for. Outside
 * the card there is nothing to swallow — the trough is not part of the pager —
 * so the arrow can do what an arrow looks like it does.
 *
 * IT DRAWS ONLY IN A DIRECTION THAT EXISTS, so the last page shows one arrow
 * and a single-contest account never sees a left one. Nothing shifts when one
 * disappears: the slots are absolutely placed and the pager does not know they
 * are there.
 */
function ChevSlot({
  side,
  show,
  onPress,
}: {
  side: 'left' | 'right';
  show: boolean;
  onPress: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  if (!show) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={side === 'left' ? 'Previous contest' : 'Next contest'}
      /* The glyph is 7pt in a 14pt trough; the thumb gets the rest. */
      hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
      style={({ pressed }) => [
        styles.chevSlot,
        side === 'left' ? styles.chevLeftSlot : styles.chevRightSlot,
        pressed && styles.pressed,
      ]}>
      <Chevron side={side} color={c.textTertiary} />
    </Pressable>
  );
}

/** One arrow, from a box and two borders. See `styles.chev`. */
function Chevron({ side, color }: { side: 'left' | 'right'; color: string }) {
  return (
    <View
      style={[
        styles.chev,
        side === 'right' ? styles.chevRight : styles.chevLeft,
        { borderColor: color },
      ]}
    />
  );
}

/**
 * One card — the shared `ContestCard`, handed this contest's facts.
 *
 * THIS FUNCTION COMPOSES NOTHING NOW. It used to assemble a `Figure` for the
 * head's right column and a `Standing` for the middle, which meant the board
 * held two thirds of the card's layout and the lobby held its own copy of the
 * other third. The card owns all three bands — its height is a contract, and a
 * caller passing nodes is a caller who can break it — so what is left here is a
 * mapping from `MyContest` to `Entry` and nothing else.
 */
function Card({
  contest,
  lockAt,
  locked,
  now,
  onOpen,
}: {
  contest: MyContest;
  lockAt: string | null;
  locked: boolean;
  now: number;
  onOpen?: (contest: MyContest) => void;
}) {
  const terms = termsOfEntry(contest);

  return (
    <ContestCard
      /* THE CONTEST'S OWN NAME, on every card. The free one is called
         "Preseason Week 4", so the week label this used to draw was the same
         string arriving by a different route — and on a lobby card it was a
         week the screen above already states. */
      name={contest.name}
      terms={terms}
      lock={{ at: lockAt, locked, now }}
      entry={{
        myPoints: contest.field.myPoints,
        /* NO PROJECTIONS EXIST. The slot is real and the value is null — see
           `Entry.projected`. When a pregame number is available this is the one
           line that changes. */
        projected: null,
        field: contest.field,
        cut: contest.cut,
      }}
      prize={contest.myPrize}
      /* THE PAGE, NOT A SHEET. The board is #000 with the tab bar's grey across
         the bottom, and this card is the other end of the same frame — see
         `CardLevel`. */
      level="page"
      onPress={onOpen ? () => onOpen(contest) : undefined}
    />
  );
}

const styles = StyleSheet.create({
  /**
   * The run's row. Hearts left, words right, one hairline above.
   *
   * `flex-start` rather than `center`: the left is a rack of glyphs and the
   * right is two lines of text, and centring them parks each against the
   * other's middle. Aligned to the top, the hearts sit on the lead line — which
   * is the line they are the evidence for.
   */
  /**
   * The run's row. Rack left, one quiet count right.
   *
   * NO RULE ABOVE IT. It had a hairline, on the reasoning that a divider
   * separates the carousel's chrome from the run. There is no chrome left to
   * separate from — the dots are gone — so the line was drawing a boundary
   * between a card and the only other thing on the screen, which is exactly the
   * "second container" mistake that got the rack thrown out of a panel in the
   * first place. Space does the separating.
   */
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingTop: Spacing.two + 2,
  },

  /* The pager, with the two arrows hung off its sides. Nothing here reserves
     width for them — see `CHEV_GUTTER`. */
  stage: { position: 'relative' },
  /* `top: 0, bottom: 0` and centre: the arrow finds the card's vertical middle
     from the stage's own height, which is what the old placement needed a
     measured `cardHeight` for — and why it drew nothing at all until the first
     layout had landed. */
  chevSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: CHEV_GUTTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevLeftSlot: { left: -CHEV_GUTTER },
  chevRightSlot: { right: -CHEV_GUTTER },
  /* A chevron from one box and two borders, the way `TabIcon` builds every glyph
     it draws — no font, no asset, and it inherits the stroke weight of the rules
     around it. */
  chev: { width: 7, height: 7, borderTopWidth: 1.5, borderRightWidth: 1.5, opacity: 0.55 },
  chevRight: { transform: [{ rotate: '45deg' }] },
  chevLeft: { transform: [{ rotate: '-135deg' }] },
  /* Stretches to the tallest page — a horizontal row stretches its children by
     default — so the tile is the height of the card beside it and the foot
     below does not move as you swipe onto it. */
  tile: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: Spacing.four,
  },
  /* A measure rather than the full width: the sentence is the only thing on
     this card and a line that runs the whole way across reads as a paragraph
     of terms. */
  tileBody: { maxWidth: 280 },
  pressed: { opacity: 0.6 },
});
