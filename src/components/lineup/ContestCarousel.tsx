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
 * ONE CARD DRAWS NO CHROME. With a single contest — which is every account
 * until it enters something, and most accounts most weeks — this has to be
 * indistinguishable from the card that was here before it: no dots, no page
 * indicator, nothing that implies there is something to swipe to.
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
 * rounding below cannot land between two.
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

import { ContestCard, Figure, RunFoot, Standing, figureOf } from '@/components/contests/ContestCard';
import { termsOfEntry, type MyContest } from '@/components/contests/use-my-contests';
import { recordLabel, type Record_ } from '@/components/lineup/field';
import { rungParts } from '@/components/runs/run';
import { Colors, Radius, Spacing, Type, selectionAccent } from '@/constants/theme';
import type { PlayerState } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function ContestCarousel({
  contests,
  index,
  onIndexChange,
  onOpen,
  displayName,
  lockAt,
  locked,
  now,
  record,
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
  displayName: string;
  lockAt: string | null;
  locked: boolean;
  now: number;
  /** The SEASON record, which only the free contest's card shows. */
  record: Record_;
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
     list snaps to index NaN. */
  const pageWidth = width > 0 ? width : windowWidth;

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
      const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      if (next < 0 || next > contests.length) return;
      setPage(next);
      // The tile is not a contest; the board below keeps the one it had.
      if (next < contests.length && next !== index) onIndexChange(next);
    },
    [pageWidth, contests.length, index, onIndexChange],
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

  const rung = rack ? rungParts(rack) : null;

  if (contests.length === 0) return null;

  return (
    <View>
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
        getItemLayout={(_, i) => ({ length: pageWidth, offset: pageWidth * i, index: i })}
        /* OPENS ON THE LINKED CARD, not on the first one. Arriving from the
           contest sheet means the reader has just chosen a contest, and a
           carousel that marked it active while showing the free contest's card
           would be the same mismatch this component exists to fix — one rank
           down. Safe with `getItemLayout` supplied; without it the list cannot
           measure ahead and silently ignores this. */
        initialScrollIndex={index}
        renderItem={({ item, index: i }) => (
          <View
            style={{ width: pageWidth }}
            /* The first card only: they are within a few points of each other
               — the same rows in the same order — and measuring every page
               would set the same state from three directions on every swipe. */
            onLayout={i === 0 ? (e) => setCardHeight(e.nativeEvent.layout.height) : undefined}>
            <Card
              contest={item}
              onOpen={onOpen}
              foot={
                rack ? (
                  <RunFoot
                    hearts={rack.hearts}
                    wagered={rack.wagered}
                    rack={rack.rack}
                    focus={spans[i] ?? null}
                    rung={rung}
                  />
                ) : null
              }
              {...{ displayName, lockAt, locked, now, record }}
            />
          </View>
        )}
        /* THE LAST PAGE IS THE WAY INTO THE LOBBY, and it is a footer rather
           than an extra row of data so that nothing downstream has to hold a
           union of "contest or invitation": `keyExtractor`, `getItemLayout`
           and the index arithmetic all stay about contests. It is exactly one
           page wide, so `round(x / page)` keeps working across it. */
        ListFooterComponent={
          <View style={{ width: pageWidth }}>
            <EnterTile onPress={onEnter} minHeight={cardHeight} />
          </View>
        }
      />
      <Rules page={page} pages={contests.length + 1} />
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
 * Where you are in the swipe, and nothing else.
 *
 * ---------------------------------------------------------------------------
 * THE RUN RACK USED TO SHARE THIS ROW. IT IS INSIDE THE CARD NOW.
 * ---------------------------------------------------------------------------
 *
 * This was a two-part foot: a bordered panel holding the heart rack on the
 * left, page marks pinned to the right, both under the card. The panel was the
 * problem — see `RunFoot` — and moving it into the card took the rack's half of
 * this row with it. What is left is genuinely the carousel's own business:
 * which page of how many.
 *
 * SO THEY CENTRE NOW. They were right-aligned to sit on the card's right edge
 * opposite the rack on its left; with nothing on the left they read as marks
 * that had slid off the end of something. Centred under the card they are what
 * a page indicator is, and the row costs 2pt plus its gap.
 *
 * THE MARKS ARE RULES, NOT DOTS. Dots were a separate widget reporting position
 * and nothing else, in an app whose whole navigation language is a word with a
 * rule under it — see `FantasyTopNav`. As rules they borrow that vocabulary.
 */
function Rules({ page, pages }: { page: number; pages: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = selectionAccent(scheme);

  return (
    <View style={styles.rules}>
      {Array.from({ length: pages }, (_, i) => (
        <View
          key={i}
          style={[styles.rule, { backgroundColor: i === page ? accent : c.border }]}
        />
      ))}
    </View>
  );
}

/**
 * One card — the shared `ContestCard` with a `Standing` in its middle.
 *
 * That middle is the ONLY thing this adds to what the lobby draws. See the
 * header on `ContestCard`: head, terms and foot are the same rows in the same
 * order on both surfaces, so entering a contest does not change its shape.
 */
function Card({
  contest,
  displayName,
  lockAt,
  locked,
  now,
  record,
  foot,
  onOpen,
}: {
  contest: MyContest;
  displayName: string;
  lockAt: string | null;
  locked: boolean;
  now: number;
  record: Record_;
  foot: React.ReactNode;
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
      /* THE HEAD'S RIGHT COLUMN IS THE FIGURE HERE, where the lobby puts a
         chip. Same corner, same question — "what state is this in" — answered
         with the number the state is about rather than with a word for it. The
         `Locked` and `Final` chips this replaces were saying what the masthead
         above already says in the week's context line, and the figure's own
         qualifier says it again where it is useful. */
      state={
        <Figure
          {...figureOf(contest.field, contest.field.myPoints)}
          filled={contest.filled}
          slots={terms.slotCount}
          lock={{ at: lockAt, locked, now }}
          final={contest.field.final}
        />
      }
      prize={contest.myPrize}
      /* THE PAGE, NOT A SHEET. The board is #000 with the tab bar's grey across
         the bottom, and this card is the other end of the same frame — see
         `CardLevel`. */
      level="page"
      middle={
        <Standing
          manager={displayName}
          subtitle={contest.kind === 'free' ? `Season ${recordLabel(record)}` : undefined}
          terms={terms}
          myPoints={contest.field.myPoints}
          field={contest.field}
          cut={contest.cut}
          filled={contest.filled}
        />
      }
      foot={foot}
      onPress={onOpen ? () => onOpen(contest) : undefined}
    />
  );
}

const styles = StyleSheet.create({
  /* Under the card rather than over it, and centred — see `Rules`. */
  rules: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingTop: Spacing.two,
  },
  /* The board strip's mark, at the size a page indicator can afford: 14 rather
     than the width of a word, and the same 2pt rule and 1pt radius. */
  rule: { width: 14, height: 2, borderRadius: 1 },
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
