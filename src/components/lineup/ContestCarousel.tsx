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
import { useCallback, useRef } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Pressable } from 'react-native';
import { ContestCard } from '@/components/lineup/ContestCard';
import type { MyContest } from '@/components/contests/use-my-contests';
import type { Record_ } from '@/components/lineup/field';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function ContestCarousel({
  contests,
  index,
  onIndexChange,
  onOpen,
  displayName,
  weekLabel,
  lockAt,
  locked,
  now,
  record,
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
  weekLabel: string;
  lockAt: string | null;
  locked: boolean;
  now: number;
  /** The SEASON record, which only the free contest's card shows. */
  record: Record_;
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
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const listRef = useRef<FlatList<MyContest>>(null);
  const { width: windowWidth } = useWindowDimensions();
  /* Before the parent has measured, fall back to the window rather than to
     zero: a zero-width page makes `getItemLayout` divide by nothing and the
     list snaps to index NaN. */
  const page = width > 0 ? width : windowWidth;

  /* "The scroll has settled on a page." Native learns that from momentum end;
     web from the debounced scroll event. Same arithmetic either way. */
  const onSettle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / page);
      if (next !== index && next >= 0 && next < contests.length) onIndexChange(next);
    },
    [page, index, contests.length, onIndexChange],
  );

  if (contests.length === 0) return null;

  // See the header: one contest must look exactly like no carousel.
  if (contests.length === 1) {
    return (
      <Card
        contest={contests[0]}
        onOpen={onOpen}
        {...{ displayName, weekLabel, lockAt, locked, now, record }}
      />
    );
  }

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
        getItemLayout={(_, i) => ({ length: page, offset: page * i, index: i })}
        /* OPENS ON THE LINKED CARD, not on the first one. Arriving from the
           contest sheet means the reader has just chosen a contest, and a
           carousel that marked it active while showing the free contest's card
           would be the same mismatch this component exists to fix — one rank
           down. Safe with `getItemLayout` supplied; without it the list cannot
           measure ahead and silently ignores this. */
        initialScrollIndex={index}
        renderItem={({ item }) => (
          <View style={{ width: page }}>
            <Card
              contest={item}
              onOpen={onOpen}
              {...{ displayName, weekLabel, lockAt, locked, now, record }}
            />
          </View>
        )}
      />
      <View style={styles.dots}>
        {contests.map((ct, i) => (
          <View
            key={ct.id}
            style={[
              styles.dot,
              { backgroundColor: i === index ? c.text : c.border },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * One card.
 *
 * The free contest keeps the season record under the name; a lobby contest
 * says what it asks of you instead — see `ContestCard.standingLine`.
 */
function Card({
  contest,
  displayName,
  weekLabel,
  lockAt,
  locked,
  now,
  record,
  onOpen,
}: {
  contest: MyContest;
  displayName: string;
  weekLabel: string;
  lockAt: string | null;
  locked: boolean;
  now: number;
  record: Record_;
  onOpen?: (contest: MyContest) => void;
}) {
  /* `Pressable` around the card rather than a control ON it. The card is a
     dense thing — a name, a standing, a distribution with three labels — and
     any button placed inside it would be competing with the axis for the one
     corner that is not already saying something. */
  const inner = (
    <ContestCard
      displayName={contest.kind === 'free' ? displayName : contest.name}
      weekLabel={weekLabel}
      lockAt={lockAt}
      locked={locked}
      now={now}
      myPoints={contest.field.myPoints}
      field={contest.field}
      record={record}
      standingLine={
        contest.kind === 'free'
          ? undefined
          : `${contest.formatName} · ${contest.slotCount} cards`
      }
      heartsAtRisk={contest.heartsAtRisk}
      heartsOnWin={contest.heartsOnWin}
    />
  );

  if (!onOpen) return inner;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${contest.name}`}
      onPress={() => onOpen(contest)}
      style={({ pressed }) => (pressed ? { opacity: 0.75 } : null)}>
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* Under the card rather than over it. The card's bottom edge is its axis
     labels, and a dot row floating on top of those would read as a fourth
     label. */
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: Spacing.one },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
