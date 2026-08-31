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
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { StatusChip } from '@/components/ui/StatusChip';
import { termsOfEntry, type MyContest } from '@/components/contests/use-my-contests';
import { ContestHearts, type HeartResult, type HeartSpan } from '@/components/runs/Hearts';
import { Colors, ControlDiameter, Spacing, Type, selectionAccent } from '@/constants/theme';
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

/** The lobby button's height. See `styles.enter` for why it is not `ControlDiameter`. */
const ENTER_HEIGHT = 28;

/** The `+` ahead of the lobby button's label. See `Plus`. */
const PLUS_SIZE = 9;

export function ContestCarousel({
  contests,
  index,
  onIndexChange,
  onOpen,
  showResult,
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
   * Whether a settled contest's W/L/T badge is still being announced.
   *
   * Absent means yes, always — which is what every caller outside the board
   * wants and what this did before the clock existed. The board passes the
   * 24-hour-and-unacknowledged test; see `LineupEditor`.
   */
  showResult?: (contestId: string) => boolean;
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
  if (index !== lastIndex) {
    setLastIndex(index);
    setPage(index);
  }

  /**
   * WHERE THE LIST ITSELF IS, which is not always where `index` says.
   *
   * `page` cannot answer this: the render-time adjustment above sets it from
   * the `index` prop, so by the time an effect could compare them they already
   * agree. This is written only by the two things that actually move the
   * scroller — a settle and a `goTo` — so a change of `index` that neither of
   * them caused is exactly a change driven from OUTSIDE the carousel, and that
   * is the one case the list has to be told about.
   *
   * The case that made it necessary: "Play this week" on the recap board, which
   * is under the carousel and sets the parent's index. Without this the board
   * changed to the live week and the card above it stayed on the finished one —
   * a card over somebody else's lineup, which is the single bug this component
   * exists to prevent.
   */
  const settledAt = useRef(index);

  /* "The scroll has settled on a page." Native learns that from momentum end;
     web from the debounced scroll event. Same arithmetic either way. */
  const onSettle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / step);
      /* EVERY PAGE IS A CONTEST NOW. The list used to carry one more — the
         lobby tile as a footer — and every bound here was `contests.length`
         rather than the last index because of it. */
      if (next < 0 || next > contests.length - 1) return;
      settledAt.current = next;
      setPage(next);
      if (next !== index) onIndexChange(next);
    },
    [step, contests.length, index, onIndexChange],
  );

  /**
   * Drive the carousel from somewhere other than a swipe — today, a tap on a
   * heart. Moves the list AND the state, because a programmatic scroll fires no
   * settle event on web.
   */
  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next > contests.length - 1) return;
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
      settledAt.current = next;
      setPage(next);
      if (next !== index) onIndexChange(next);
    },
    [step, contests.length, index, onIndexChange],
  );

  /**
   * FOLLOW AN INDEX THAT CAME FROM OUTSIDE. A jump rather than an animation,
   * for the same reason `goTo` jumps — on web an animated programmatic scroll
   * emits intermediate offsets that `onSettle` reads as a swipe back.
   *
   * `step` is measured, so it is 0 for the first frame; scrolling on that would
   * land everything at offset 0 and record it as the truth.
   */
  useEffect(() => {
    if (step <= 0 || settledAt.current === index) return;
    settledAt.current = index;
    listRef.current?.scrollToOffset({ offset: step * index, animated: false });
  }, [index, step]);

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
   * ONLY A CONTEST YOU ARE ACTUALLY IN HOLDS A HEART, and getting that wrong is
   * what made the rail stop pointing at anything.
   *
   * The walk used to run over EVERY card and bound itself by `run.wagered`. That
   * held while the carousel only ever drew contests you had entered. It stopped
   * holding the moment the free contest became unconditional (`20260830030000`):
   * an unentered free contest sat at position 0, consumed the run's one stake,
   * and every contest after it fell past the bound and got `null` — so on the
   * Flex Three card the reader had actually entered, the rail highlighted
   * nothing and the line read "3 hearts" instead of "1 of 3 staked".
   *
   * So the test is `lineupId`, which is the entry itself, and `recap` is
   * excluded because a finished week's heart is already settled — spent or
   * returned — and pointing at a pip for it would be pointing at a stake that
   * no longer exists.
   *
   * Null on a contest that risks nothing, and null past the hearts held: a
   * stake with no pip behind it gets no highlight rather than a borrowed one.
   */
  /**
   * ONE PIP PER CARD, IN THE CAROUSEL'S ORDER — the whole rail, in one walk.
   *
   * This was three separate derivations that had to agree: a `receipts` list, a
   * `spans` list mapping contests to rack indices, and a `pipPage` list mapping
   * rack indices back to contests. They agreed by being written carefully,
   * which is the same as not agreeing — the free contest becoming unconditional
   * put a card on the board that consumed no heart, and the two lists quietly
   * fell out of step: four cards, three pips, and a card that lit nothing when
   * you swiped to it.
   *
   * One walk cannot fall out of step with itself. `pips[i].contest` IS the
   * mapping in both directions, and `spanFor` reads it back.
   */
  const pips = contests.flatMap((ct, contest) =>
    Array.from({ length: Math.max(0, ct.heartsAtRisk) }, () => ({
      contest,
      /* A settled contest shows how it went; a live one shows whether you are
         in it. `lineupId` is the entry itself — the fee lands on the first
         submission, so it is null right up until you file. */
      result: ct.recap ? ct.field.result : null,
      entered: ct.lineupId !== null,
    })),
  );

  const spanFor = (contest: number): HeartSpan | null => {
    const start = pips.findIndex((p) => p.contest === contest);
    if (start < 0) return null;
    return { start, count: pips.filter((p) => p.contest === contest).length };
  };

  /**
   * Hearts riding on a live entry, which is what the free count is measured
   * against. Settled contests do not hold one — theirs came back or did not —
   * and a contest you have not entered has not taken one yet.
   */
  const committed = contests.reduce(
    (n, ct) => n + (!ct.recap && ct.lineupId !== null ? Math.max(0, ct.heartsAtRisk) : 0),
    0,
  );

  /**
   * NO CARDS IS STILL A RAIL, and the rail is the way out.
   *
   * This returned null, which took the lobby down with the cards — a player
   * whose week had rolled over got eight empty slots and no way to enter
   * anything. It then returned the lobby TILE for the same reason. The tile is
   * gone (see the note on `onEnter`) and the argument is unchanged: whatever
   * empties this list must not also remove the door. The rail carries it now.
   *
   * `my_contest_cards` always returns the free contest, so this should be
   * unreachable — it is kept because the next thing to empty the list will not
   * announce itself either.
   */
  if (contests.length === 0) {
    return rack ? (
      <RunRail
        run={rack}
        committed={committed}
        pips={[]}
        focus={null}
        onGo={goTo}
        onEnter={onEnter}
      />
    ) : null;
  }

  return (
    <View>
      {/* THE STAGE: the pages, with an arrow hung off each side in the screen's
          own padding. Only in the directions that exist — see `CHEV_GUTTER`. */}
      <View style={styles.stage}>
        <ChevSlot side="left" show={page > 0} onPress={() => goTo(page - 1)} />
        <ChevSlot side="right" show={page < contests.length - 1} onPress={() => goTo(page + 1)} />
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
          renderItem={({ item }) => (
            <View style={{ width: step }}>
              <Card contest={item} onOpen={onOpen} {...{ lockAt, locked, now }} />
            </View>
          )}
        />
      </View>
      {rack ? (
        <RunRail
          run={rack}
          committed={committed}
          pips={pips}
          focus={spanFor(page)}
          onGo={goTo}
          onEnter={onEnter}
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
  committed,
  pips,
  focus,
  onGo,
  onEnter,
}: {
  run: NonNullable<PlayerState['run']>;
  /**
   * Hearts held by a live entry, counted off the same walk that placed the
   * highlights — NOT `run.wagered`.
   *
   * `run.wagered` is the server's count and it is right; it just cannot say
   * WHICH card each heart belongs to, and the carousel now draws cards you have
   * not entered. Deriving both from one walk is what stops the rail lighting
   * one heart while the sentence under it counts a different set.
   */
  committed: number;
  /** One per card on the board, in the carousel's order — see `ContestHearts`. */
  pips: { contest: number; result: HeartResult | null; entered: boolean }[];
  focus: HeartSpan | null;
  onGo: (page: number) => void;
  /** The lobby, from the button at the end of the row. */
  onEnter: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  const held = Math.max(0, run.hearts);
  const staked = Math.min(Math.max(0, committed), held);
  const free = held - staked;

  /**
   * A TRAY AND A BUTTON, and the tray is the one that stretches.
   *
   * ---------------------------------------------------------------------------
   * WHAT THIS REPLACED
   * ---------------------------------------------------------------------------
   *
   * First a 22pt `+` in a circle with `1 free · Contests` set beside it. Two
   * objects for one idea: the words carried the meaning and could not be
   * pressed, the circle took the press and said nothing a `+` does not say
   * everywhere. Worse, the text sat hard against the button and read as its
   * label — the one part of the row that looked tappable was the part that was
   * not.
   *
   * Then one gold pill, which fixed the labelling and broke two other things.
   *
   * ---------------------------------------------------------------------------
   * GOLD IS FILLED, BECAUSE IT ONLY MEANS ONE THING NOW
   * ---------------------------------------------------------------------------
   *
   * This spent a while as an outline, and the reason was real: `selectionAccent`
   * was spoken TWICE on this row. The focused heart wore gold corner ticks —
   * this app's mark for "this is the one you are looking at" — so a gold button
   * put "you are here" and "press me" in one hue forty points apart, and the eye
   * could not rank them. Draining the button to a line resolved that without
   * touching the rack.
   *
   * The rack gave up its ticks instead (see `ContestHearts`), and THAT is what
   * earns the fill back. Gold now appears exactly once on this row and means
   * exactly one thing.
   *
   * The other objection to a fill — that a gold slab out-shouts the card it
   * serves — turned out to be an argument about SIZE wearing a colour's clothes.
   * At 32pt with a 13/600 two-word label it did. At 28 with 12/500 and one word
   * it is a chip, and a call to action is allowed to be the brightest chip in a
   * row that is otherwise a status readout.
   *
   * ---------------------------------------------------------------------------
   * THE GLYPH IS THE VERB, SO THE WORD CAN BE THE ROOM
   * ---------------------------------------------------------------------------
   *
   * The label has been "Contests", then "Enter contest", and is now "Contests"
   * again — which is not a circle, because what changed underneath it is the
   * `+`.
   *
   * "Contests" was wrong beside a BARE `+`: two objects, neither of which said
   * what pressing would do. A verb fixed that by making the button a sentence.
   * But a verb over-claims here. `contests.tsx` is not a lobby — it is three
   * views (open contests, `Recent contests`, and a recap reader), so "enter"
   * names one of the things you go there for and hides the other, on a row whose
   * own hearts are already half settled receipts.
   *
   * With a `+` in front the labour divides properly: the GLYPH carries the act,
   * the WORD carries the room. "+ Contests" reads as "a new one" to anyone
   * glancing and as "the contests screen" to anyone reading, which is the only
   * version of this button that has been true of both.
   *
   * ---------------------------------------------------------------------------
   * THE DEAD AIR IS INSIDE SOMETHING NOW
   * ---------------------------------------------------------------------------
   *
   * `space-between` is not composition: it pushed a rack of flat glyphs to one
   * edge and a slab to the other with a hundred points of nothing between, and
   * the row read as two leftovers rather than one thing.
   *
   * The rack now sits in a tray that STRETCHES to just short of the button, so
   * the slack is enclosed rather than spanned. It also solves the growth
   * problem for free: the tray is the flexible box, so a week with eight cards
   * squeezes the hearts and never the door.
   *
   * ---------------------------------------------------------------------------
   * THE FREE COUNT GOES IN THE TRAY, NOT IN THE BUTTON
   * ---------------------------------------------------------------------------
   *
   * The tray is the RUN — what you hold and what is left of it — and the button
   * is the ACT. The count is a fact about the run, so it is the tray's right-hand
   * occupant and the last thing read before the button, which is the position it
   * wants without being mistaken for the label again. The tray's own edge is
   * what keeps that distinction now; before, nothing did.
   *
   * It is not the rack restated. `pips` is one heart per CARD ON THE BOARD —
   * staked, settled, or waiting on a contest you have not entered — so a heart
   * you hold and have promised to nothing appears nowhere in the rack. This
   * count is the only place it exists on the screen, and it is the fact that
   * decides whether the button is worth pressing.
   *
   * NO GLYPH ON IT. A fifth heart drawn inside a rack of pips reads as a fifth
   * pip. The words carry it.
   *
   * When nothing is free the count goes and the button drops to the quiet fill
   * — still there, still pressable, because the screen behind it is worth
   * reading either way, but no longer pointing at a spend the run cannot make.
   */
  const live = free > 0;
  /* Knocked out of the fill in the page's own colour, the way every punched
     glyph in this app is drawn. See `YapLogo`'s `ink`. */
  const ink = live ? c.background : c.textSecondary;

  return (
    <View style={styles.rail}>
      {/**
        * THE RUN'S TRAY: one heart per card, and what is left over.
        *
        * The rack used to draw the RUN's own hearts — held, staked and lost —
        * because it was the only place saying how many you had. The masthead
        * says that now (see `AppHeader`), which freed this row to be what the
        * screen actually needs: a pager whose lit pip names the card above. See
        * `ContestHearts` for what each state means and for the bug that made
        * the one-to-one non-negotiable.
        */}
      <View style={[styles.tray, { backgroundColor: c.surface }]}>
        <View style={styles.rack}>
          <ContestHearts
            entries={pips}
            focus={focus}
            size={24}
            onPress={(i) => onGo(pips[i].contest)}
          />
        </View>
        {live ? (
          <Text style={[Type.fine, styles.freeCount, { color: c.textSecondary }]}>
            {free} free
          </Text>
        ) : null}
      </View>

      {/**
       * THE WAY INTO ANOTHER CONTEST, at the end of the row it belongs to.
       *
       * The lobby was reachable only by swiping past every card to a tile at
       * the end of the carousel — fine when you are in one contest, a chore
       * when you are in four, and it is the app's main call to action either
       * way. A button at a fixed position under the thumb costs one tap from
       * any page.
       *
       * IT NEVER SHRINKS AND IT NEVER MOVES. The tray beside it is the half
       * that gives. Whatever happens to the left of it, the door stays the same
       * size in the same corner.
       */}
      <Pressable
        onPress={onEnter}
        accessibilityRole="button"
        accessibilityLabel={
          live
            ? `Contests. ${free === 1 ? '1 heart' : `${free} hearts`} free`
            : 'Contests'
        }
        /* Drawn at `ControlDiameter` and reached out past the platform's 44 —
           the same trick `Pip` uses, and the reason this can be a quiet outline
           without being a small target. */
        hitSlop={9}
        style={({ pressed }) => [
          styles.enter,
          !live && styles.enterBare,
          { backgroundColor: live ? accent : c.backgroundElement },
          pressed && styles.pressed,
        ]}>
        {/**
          * THE `+` IS BACK, AND THIS IS NOT THE ONE THAT WAS REMOVED.
          *
          * What was wrong before was a `+` ALONE: a bare glyph in a row of
          * hearts could add a heart, a card or a slot, and the words that said
          * which sat outside the button where they could not be pressed.
          *
          * Leading a label it has the opposite problem to solve and solves it
          * well — the glyph is what the eye finds at a glance and the noun is
          * what settles the ambiguity, so "a new contest, by choice" arrives in
          * one look instead of a read. It is also the only mark on this row
          * that says the act is VOLUNTARY: everything else here is a heart the
          * week has already committed.
          *
          * DRAWN, NOT TYPED. A `+` glyph sits high in its own line box, so
          * centring it needs a hand-tuned baseline nudge that drifts the first
          * time the type size changes — the previous circle carried exactly
          * that hack. Two bars cannot drift, and it is how `Chevron` below
          * draws its own arrow.
          *
          * IT GOES WHEN NOTHING IS FREE, because by then it is a promise the
          * run cannot keep. The quiet state already drops the gold and the
          * count; leaving a `+` on it would be the one part of the button still
          * offering a new contest to somebody with nothing to stake. What is
          * left is the room's name, which is the half that stays true — there
          * are still recaps in there to read.
          */}
        {live ? <Plus color={ink} /> : null}
        <Text style={[styles.enterLabel, { color: ink }]}>Contests</Text>
      </Pressable>
    </View>
  );
}

/** A `+` from two bars, sized to sit inside the lobby button's label. */
function Plus({ color }: { color: string }) {
  return (
    <View style={styles.plus}>
      <View style={[styles.plusBar, { backgroundColor: color }]} />
      <View style={[styles.plusBar, styles.plusBarUp, { backgroundColor: color }]} />
    </View>
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
      /**
       * A RECAP CARD SAYS WHICH WEEK IT IS, in the corner the live cards spend
       * on a countdown.
       *
       * A lobby contest is named after its FORMAT, so once last week's entries
       * stayed on the board the carousel could hold two cards both titled "Flex
       * Three" — one to enter, one to read — and swiping between them was
       * genuinely confusing. The countdown that corner usually carries is
       * meaningless on a finished week, so the slot was free.
       *
       * It replaces the FINAL tag rather than joining it: the head reserves one
       * row there, and the scoring band under it already draws a settled score
       * and a W or an L. "Which week" is the fact that was missing.
       */
      status={contest.recap ? <StatusChip label={contest.weekLabel} tone="neutral" /> : undefined}
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
   * The run's row: a tray that stretches, and a button that does not.
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
    /* NO `space-between`. The tray flexes, so the slack is inside it — pushing
       the two apart as well would just move the gap back out. */
    gap: Spacing.two,
    paddingTop: Spacing.two + 2,
  },
  /**
   * THE TRAY, and the only flexible thing on the row.
   *
   * It stretches to just short of the button so the slack between them is
   * ENCLOSED rather than spanned — which is the whole reason the row stopped
   * reading as two leftovers pushed to opposite edges.
   *
   * `surface` rather than `backgroundElement`: element is this app's fill for
   * things you press, and the tray is not one — the pips inside it are. One
   * step off black is all it needs to give the rack a floor.
   */
  tray: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: ControlDiameter,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: ControlDiameter / 2,
  },
  /**
   * One heart per card means the rack grows with the week, so it is the half
   * that gives. `overflow: hidden` is the interim answer to a rack too long for
   * the tray — a clipped rack is recoverable by swiping, and the alternative is
   * pushing the door off the screen. The real answer is to let it scroll, which
   * is worth doing the week a board can hold eight cards.
   */
  rack: { flexShrink: 1, minWidth: 0, overflow: 'hidden' },
  /* The tray's right-hand occupant. `auto` rather than a spacer so it sits at
     the tray's end whatever the rack is doing, and never wraps. */
  freeCount: { marginLeft: 'auto', paddingLeft: Spacing.two, flexShrink: 0 },
  /**
   * THE LOBBY BUTTON. A gold line, not a gold slab.
   *
   * `ControlDiameter` tall — the app's one round-control height, so this agrees
   * with the filter chips rather than inventing a size — and as wide as its
   * words. An outline because the focus ticks on the active heart are already
   * gold and already mean something else; see the note above `live`.
   */
  enter: {
    flexShrink: 0,
    justifyContent: 'center',
    /**
     * 28, NOT `ControlDiameter`.
     *
     * It was 32 — the app's one round-control height, so that it would agree
     * with the inventory's filter chips. Set beside a 24pt rack it still read
     * as the biggest thing on the row, and a filter chip is not the comparison
     * that matters here: those sit in a row of their own peers, this sits next
     * to hearts and has to rank BELOW them. The rack is what the row is about.
     *
     * Four points off the height, one off the type and two off the padding
     * takes it from 112pt wide to about 92 — a quarter of the row rather than a
     * third — without touching the label, because the noun is what tells you
     * what you are entering and is worth more than the points it costs.
     *
     * The touch target does not shrink with it: `hitSlop` still reaches past
     * 44pt.
     */
    height: ENTER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two - 2,
    /* TIGHTER ON THE GLYPH SIDE. A `+` is mostly air where a letter is mostly
       ink, so equal padding leaves the left visibly slacker than the right.
       Two points back is the optical correction, and it happens to pay for a
       third of what the glyph costs in width. */
    paddingLeft: Spacing.two + 2,
    paddingRight: Spacing.three - 4,
    borderRadius: ENTER_HEIGHT / 2,
  },
  /* NO GLYPH, NO OPTICAL CORRECTION. The tighter left padding above exists to
     pay for the air inside a `+`; with the word alone it just parks the label
     off-centre in its own pill. */
  enterBare: { paddingLeft: Spacing.three - 4 },
  /* The glyph's box. 9 against a 12pt label — a shade under the cap height, so
     it reads as punctuation to the word rather than a second word. */
  plus: { width: PLUS_SIZE, height: PLUS_SIZE, alignItems: 'center', justifyContent: 'center' },
  /* Both bars are the same rule; one of them stood on its end. 1.5 because a
     stroke this short needs the weight to hold its own beside 12pt type. */
  plusBar: { position: 'absolute', width: PLUS_SIZE, height: 1.5, borderRadius: 0.75 },
  plusBarUp: { width: 1.5, height: PLUS_SIZE },
  /* Not on the type scale on purpose: `body` at 12/500 is a caption's weight
     and this is a button. 13/600 is the smallest thing in this app that reads
     as one without being set in caps — and it is a notch under the fill's 700,
     because an outline does not have to work as hard to be seen. */
  /* 12/500. At 13/600 the label was the heaviest text on the screen below the
     card's own name — a button does not have to outweigh the thing it serves. */
  enterLabel: { fontSize: 12, lineHeight: 15, fontWeight: '500' },

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
  pressed: { opacity: 0.6 },
});
