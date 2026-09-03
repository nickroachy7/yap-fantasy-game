/**
 * The swap. One component, two presentations, two directions.
 *
 * WHAT REPLACED WHAT
 *
 * The picker used to expand in place, underneath the slot you tapped. That
 * reads well in a mockup and badly on a phone: opening RB1 pushed every row
 * below it off-screen, so the eight-row board you were comparing against
 * disappeared at the moment of choosing, and the list you scrolled through had
 * the rest of the lineup interleaved behind it. It also had no bench-side
 * equivalent — starting a bench player was a tap that silently picked a slot
 * for you.
 *
 * So: a sheet. On a phone it rises from the bottom edge, which is where the
 * thumb already is and where every other iOS and Android picker comes from. On
 * a wide window it is a centred dialog, because a full-width bar sliding up
 * under a 1400pt browser window is a phone gesture wearing a desktop's clothes,
 * and the pointer is not near the bottom edge anyway.
 *
 * TWO DIRECTIONS, ONE SHEET
 *
 *   slot   — "who starts at RB1". Lists every eligible card, with the incumbent
 *            pinned above the list rather than buried in it, and a way to empty
 *            the slot outright.
 *   bench  — "where does this player go". Lists the slots he is legal for and
 *            says who is in each one, so replacing a starter is a choice you
 *            make rather than something that happens to you.
 *
 * They are one component because they are one interaction seen from either end,
 * and because two sheets would drift in exactly the ways a modal must not:
 * dismissal, safe-area padding, and what the backdrop does.
 *
 * AND THEY ARE THE SAME SHAPE
 *
 * Both modes read: the subject pinned at the top under a label, then a labelled
 * list of what you are choosing between, in ONE set of columns. The bench mode
 * used to be a different object — taller rows, its own typography, its own
 * FP/G pair written as a sentence — so the same decision looked like two
 * unrelated screens depending on which end you started from. Now a destination
 * is drawn by the same `PlayerBand` as a candidate, with the slot as the badge
 * — exactly where the lineup board puts it — and an unoccupied slot uses the
 * band's own empty state. You are always comparing like with like.
 *
 * AND THEY ARE THE SAME ROWS YOU CAME FROM
 *
 * The sheet lists `PlayerBand`: the lineup row's identity band, without the
 * stat strip under it. It used to draw its own compact table row, so opening a
 * swap re-rendered the same eight players in a second format at the exact
 * moment you were comparing them. One figure survives the loss of the columns,
 * and it follows the sort.
 *
 * AND IT IS DISMISSED THE WAY IT LOOKS DISMISSED
 *
 * The bottom sheet used to carry a grabber that did nothing and a full-width
 * Close row pinned under the options. Those two facts were the same mistake
 * seen twice: the mark that means "pull me down" failed silently, so the only
 * working exit was a permanent 44pt band of chrome spent on an action every
 * other sheet in this app gets from a gesture. The grabber now pulls and the
 * row is gone. What is left to close it: the pull, the backdrop, Escape on
 * web, and Android's back button.
 *
 * ON AN IPHONE THE PULL IS UIKIT'S, not ours, and so is the corner — this is a
 * `pageSheet` there, the same presentation the contest lobby and both profile
 * sheets use. `nativeSheet` has the whole reason, including why the hand-rolled
 * version could not have worked.
 *
 * The Modal-with-sibling-backdrop construction is the same as `DropdownChip`
 * and `ConfirmDialog` — a Pressable WRAPPING the sheet renders a <button>
 * containing <button>s on web, which React rejects at runtime.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DASH } from '@/components/ui/DataTable';
import { PositionBadge, positionsForSlot, slotBadgeLabel } from '@/components/ui/PositionBadge';
import { Colors, SheetCorner, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { BADGE_SIZE, BADGE_WIDTH, PlayerBand, WeekFigure } from './LineupRow';
import { SortBar } from './SortBar';
import { matchupLabel, weekFigureFor, type LineupCard, type SortKey } from './model';

/** A slot this bench player is legal for, and whoever is currently in it. */
export type SwapDestination = { slot: string; occupant: LineupCard | null };

/**
 * What the sheet is being asked. The screen holds only the identity of the
 * thing that was tapped and rebuilds this on render, so the contents stay in
 * step with an edit made from somewhere else rather than going stale.
 */
export type SwapRequest =
  | {
      kind: 'slot';
      slot: string;
      /** "RB", or "RB/WR/TE" for a FLEX. Used in the empty and heading copy. */
      eligiblePositions: string;
      current: LineupCard | null;
      /** Eligible cards, already sorted. May include `current`; it is filtered. */
      options: LineupCard[];
      /**
       * Which of those have kicked off and so cannot be brought in.
       *
       * They are listed rather than withheld. Filtering them out left the sheet
       * saying "0 eligible RB" and "no other RB card in your collection can
       * start here" to somebody holding four of them, which reads as a broken
       * screen rather than as a rule — and the rule is one the reader needs to
       * learn, because it governs the whole afternoon.
       */
      lockedIds: Set<string>;
      /**
       * Why a given id is in `lockedIds`, in the words the reader needs.
       *
       * There are two reasons now and they call for different sentences: a
       * player whose game has kicked off, and a card already playing in one of
       * your other contests this week. The second is FIXABLE — go and take him
       * out of the other lineup — so a row that said "already started" about it
       * would send somebody to wait out a game that has not begun.
       */
      reasonFor?: (id: string) => string;
    }
  | { kind: 'bench'; card: LineupCard; destinations: SwapDestination[] };

export function SwapSheet({
  request,
  wide,
  sort,
  onSort,
  onPick,
  onClear,
  onClose,
}: {
  /** Null when nothing is open. The Modal stays mounted and simply not visible. */
  request: SwapRequest | null;
  wide: boolean;
  sort: SortKey;
  onSort: (next: SortKey) => void;
  onPick: (slot: string, cardId: string) => void;
  onClear: (slot: string) => void;
  onClose: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { bottom } = useSafeAreaInsets();

  /* Escape closes it on web. `onRequestClose` covers Android's back button and
     nothing else — react-native-web does not map the key — so a keyboard user
     on a desktop browser had no way out but the mouse. */
  useEffect(() => {
    if (Platform.OS !== 'web' || !request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, onClose]);

  /**
   * ON A PHONE THIS IS UIKIT'S PAGE SHEET, NOT A VIEW WE DRAW.
   *
   * The first attempt at fixing the dead grabber hand-rolled a `PanResponder`
   * drag here, the way `PlayerSheetFrame` does for web. It could not work, and
   * the reason is in React Native's own iOS code rather than in anything on
   * this side of the bridge:
   *
   *   `presentationConfiguration()` in `RCTModalHostViewComponentView.mm`
   *   returns `UIModalPresentationOverFullScreen` the moment `transparent` is
   *   true, and never looks at `presentationStyle` at all. `overFullScreen`
   *   has no interactive dismissal in UIKit, and it has no sheet corner
   *   either — so a transparent Modal cannot be pulled down, and every rounded
   *   edge on it is one we painted ourselves at whatever radius we guessed.
   *
   * That is the whole bug, and it is also why the corner never quite matched
   * the contest lobby: the lobby is a ROUTE presented `modal` (see the
   * `sheetOptions` note in `app/(app)/_layout.tsx`), which is a real page
   * sheet, so iOS draws its corner and owns its drag. Guessing a radius was
   * always going to be a near-miss against a number the system picks.
   *
   * So this stops guessing. On an iPhone the Modal is opaque and `pageSheet`,
   * which is the same presentation the lobby, the profiles and the set
   * checklist all use — the corner is iOS's, the drag is iOS's, and
   * `allowSwipeDismissal` routes the pull back through `onRequestClose`, which
   * is already wired to `onClose`.
   *
   * WE STILL DRAW THE GRABBER. `sheetGrabberVisible` is ignored on anything but
   * `formSheet`, which this app deliberately moved off — `PlayerSheetFrame`
   * documents that and draws its own bar for the same reason. One bar, one
   * meaning, on both sheets.
   *
   * WEB AND ANDROID KEEP THE SHEET WE DRAW, because neither has a page sheet to
   * ask for: `presentationStyle` is iOS-only, and on web the Modal is a div.
   * There the `PanResponder` below is the gesture, exactly as it is on
   * `PlayerSheetFrame`'s web sheet.
   */
  const nativeSheet = Platform.OS === 'ios' && !wide;
  const canDrag = !wide && !nativeSheet;
  const [dragY] = useState(() => new Animated.Value(0));
  const [sheetHeight, setSheetHeight] = useState(0);

  /**
   * The Modal STAYS MOUNTED between opens — `visible` is derived from
   * `request`, and the whole component is rendered by the screen once. So the
   * offset a dismissing drag left behind is still there the next time, and
   * without this the second swap sheet would slide up already pulled halfway
   * down. `PlayerSheetFrame` never had to think about it: it is a route, and it
   * unmounts.
   */
  useEffect(() => {
    if (request !== null) dragY.setValue(0);
  }, [request, dragY]);

  /**
   * Where the sheet goes when the finger leaves it.
   *
   * Idempotent by construction: it only ever starts one of two animations to a
   * fixed target, so being called twice — which the three hooks below make
   * possible — costs a redundant animation to the place it is already going.
   */
  const settle = useMemo(
    () => (dy: number, vy: number) => {
      /* Distance OR speed. A short flick is as clear an instruction as a long
         pull, and requiring the distance makes a fast one feel ignored. */
      if (dy > DISMISS_AFTER || vy > FLICK_VELOCITY) {
        Animated.timing(dragY, {
          /* Off the bottom of its own height, so the sheet is GONE rather than
             merely low when the Modal's own slide-out takes over. Falls back to
             a generous constant if the layout has not reported a height yet. */
          toValue: sheetHeight || 900,
          duration: 160,
          useNativeDriver: false,
        }).start(onClose);
        return;
      }
      Animated.spring(dragY, {
        toValue: 0,
        useNativeDriver: false,
        bounciness: 0,
        speed: 18,
      }).start();
    },
    [dragY, sheetHeight, onClose],
  );

  const drag = useMemo(
    () =>
      PanResponder.create({
        /* Claimed on MOVE, not on grant, and only downward: a tap on the
           grabber should still be a tap, and an upward drag belongs to nobody
           here. The axis test stops a horizontal swipe stealing the sheet. */
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          /* Downward only. Following a negative dy would lift the sheet off the
             bottom edge it is anchored to and show the page under it. */
          if (g.dy > 0) dragY.setValue(g.dy);
        },
        /**
         * ONE SETTLE, ON EVERY WAY THE GESTURE CAN END. A responder that ends
         * without settling leaves the sheet parked halfway down the screen with
         * the board behind it — the single worst state this can be in, and with
         * the bottom Close gone there is nothing left to recover it with.
         */
        onPanResponderEnd: (_e, g) => settle(g.dy, g.vy),
        onPanResponderRelease: (_e, g) => settle(g.dy, g.vy),
        onPanResponderTerminate: () => settle(0, 0),
      }),
    [dragY, settle],
  );

  const title =
    request === null
      ? ''
      : request.kind === 'slot'
        ? `Start at ${request.slot}`
        : `Move ${request.card.name}`;

  /**
   * The top of the sheet: grabber, title, count.
   *
   * ON WEB AND ANDROID IT IS ALSO THE DRAG TARGET. The bar alone is 36pt of a
   * gesture that has to be findable with a thumb, and `PlayerSheetFrame` solves
   * that with a 48pt transparent strip floated over its content. Here the whole
   * top of the sheet is already inert — a centred title and a count, nothing
   * pressable on a phone — so the responder can just own it, which gives a
   * target about 70pt tall without a single absolute position. The ✕ inside it
   * is wide-only, and `canDrag` is false there, so the button and the responder
   * are never on screen together.
   *
   * On the iOS page sheet `canDrag` is false and this is just the header: the
   * pull belongs to UIKit, and a responder competing with it would be a worse
   * copy of a gesture the device already does perfectly.
   */
  const chrome = (
    <View style={canDrag ? styles.dragZone : undefined} {...(canDrag ? drag.panHandlers : null)}>
      {/* Same weight as the profile sheets' grabber — one bar, one colour, and
          `borderStrong` was too faint to find. Drawn by us even on the page
          sheet: `sheetGrabberVisible` is ignored on anything but `formSheet`.
          See `PlayerSheetFrame`, whose geometry this matches exactly. */}
      {wide ? null : <View style={[styles.handle, { backgroundColor: c.textTertiary }]} />}

      {request === null ? null : (
        /* Centred, and without a badge or a ✕ on a phone. The badge said the
           same thing as the badge on the subject row two lines below it. What
           is left is the one sentence the sheet is about. */
        <View style={styles.header}>
          <Text numberOfLines={1} style={[Type.section, styles.title, { color: c.text }]}>
            {title}
          </Text>
          <Text numberOfLines={1} style={[Type.fine, styles.title, { color: c.textTertiary }]}>
            {request.kind === 'slot'
              ? countLabel(request)
              : `${request.card.team ?? DASH} · ${matchupLabel(request.card.game)}`}
          </Text>
          {/* A dialog has no drag to dismiss it, so it keeps a button. */}
          {wide ? (
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              style={({ pressed }) => [
                styles.close,
                { borderColor: c.border },
                pressed && styles.pressed,
              ]}>
              <Text style={[Type.strong, { color: c.textSecondary }]}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );

  const scroller =
    request === null ? null : (
      <ScrollView
        style={styles.scroll}
        /* THE SAFE AREA MOVED HERE when the Close row went. It was the footer's
           `paddingBottom`, and dropping the footer without it would have put the
           last option under the home indicator. */
        contentContainerStyle={[
          styles.scrollBody,
          wide ? null : { paddingBottom: Spacing.two + (bottom || Spacing.two) },
        ]}
        showsVerticalScrollIndicator={false}>
        {request.kind === 'slot' ? (
          <SlotBody
            request={request}
            wide={wide}
            sort={sort}
            onSort={onSort}
            onPick={onPick}
            onClear={onClear}
          />
        ) : (
          <BenchBody request={request} wide={wide} onPick={onPick} />
        )}
      </ScrollView>
    );

  return (
    <Modal
      visible={request !== null}
      /* OPAQUE ON THE PAGE SHEET, and it is not a style choice: `transparent`
         is what forces `overFullScreen` in RN's iOS code, taking the corner and
         the drag with it. See `nativeSheet`. */
      transparent={!nativeSheet}
      presentationStyle={nativeSheet ? 'pageSheet' : undefined}
      /* UIKit's own pull-down. It reports through `onRequestClose`, which RN
         requires alongside this prop precisely so the two cannot disagree about
         whether the sheet is open. */
      allowSwipeDismissal={nativeSheet || undefined}
      // Slide on a phone because the sheet comes from the edge it is anchored
      // to; fade on a dialog, which has no edge to come from.
      animationType={wide ? 'fade' : 'slide'}
      onRequestClose={onClose}>
      {nativeSheet ? (
        /* THE PAGE SHEET. No backdrop — UIKit dims and scales the app behind
           it — and no corner, no border and no height cap, because those are
           the presentation's now and anything we drew would be a second sheet
           inside the real one. What is left is the surface, which we DO have to
           paint: a page sheet separates itself from what it covers by dimming
           it, and this app's page is #000, so there is nothing to dim. Same
           reasoning, same token, as `PlayerSheetFrame`. */
        <View style={[styles.pageSheet, { backgroundColor: c.surfaceSheet }]}>
          {chrome}
          {scroller}
        </View>
      ) : (
        <View style={[styles.backdrop, wide ? styles.backdropCentre : styles.backdropBottom]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
          />
          <Animated.View
            onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
            style={[
              styles.sheet,
              wide ? styles.dialog : styles.bottomSheet,
              /* `surfaceSheet`, the same layer both profile sheets and the set
                 checklist sit on. This was `surface` — a panel's fill, one step
                 too high — while the profile sheet was `background`, one step
                 too low, so the app's two sheets disagreed about what a sheet
                 is made of. One token now, and neither can drift. */
              { backgroundColor: c.surfaceSheet, borderColor: c.borderStrong },
              canDrag && { transform: [{ translateY: dragY }] },
            ]}>
            {chrome}
            {scroller}
          </Animated.View>
        </View>
      )}
    </Modal>
  );
}

/** "Who starts here." */
function SlotBody({
  request,
  wide,
  sort,
  onSort,
  onPick,
  onClear,
}: {
  request: Extract<SwapRequest, { kind: 'slot' }>;
  wide: boolean;
  sort: SortKey;
  onSort: (next: SortKey) => void;
  onPick: (slot: string, cardId: string) => void;
  onClear: (slot: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { slot, current, eligiblePositions, lockedIds, reasonFor } = request;

  /* The incumbent is pinned above, so he is not also in the list — one player
     appearing twice in a list you are choosing from is a bug report waiting to
     be filed, however it is marked. */
  const rest = request.options.filter((o) => o.id !== current?.id);
  /* Choosable first, kicked-off after. Not two separate lists with two
     headings: they are the same set of players answering the same question, and
     the only difference is whether the answer is still available — which the
     dimming and the mark already say, in place. */
  const open = rest.filter((o) => !lockedIds.has(o.id));
  const shut = rest.filter((o) => lockedIds.has(o.id));

  return (
    <>
      {current ? (
        <View style={styles.section}>
          {/* THE CURRENT PICK GETS ITS OWN HEADING. It used to be pinned above
              the divider with no label and a tinted background, which made it
              read as a banner rather than as the first of two groups. Naming it
              is what turns the sheet into the shape it describes: who is in,
              then who could be. */}
          <Divider>Currently starting</Divider>
          <PlayerBand
            card={current}
            badge={<PositionBadge label={current.position} size={BADGE_SIZE} width={BADGE_WIDTH} tone="neutral" />}
            right={<WeekFigure {...weekFigure(current)} />}
            selected
            accessibilityLabel={`${current.name} is starting at ${slot}`}
          />
          <ClearRow slot={slot} name={current.name} onPress={() => onClear(slot)} />
        </View>
      ) : null}

      <View style={styles.section}>
        <Divider>
          {current ? 'Choose a replacement' : `Choose a ${eligiblePositions}`}
        </Divider>
        {/* Only when there is something to sort. Three keys offered over a
            list of one is the sheet describing its own machinery — and with a
            single eligible card it was the widest, loudest thing on screen.
            No hint either: the divider above already says what this list is. */}
        {open.length > 2 ? <SortBar value={sort} onChange={onSort} /> : null}
        {open.length === 0 ? (
          <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>
            {shut.length > 0
              ? `Every other ${eligiblePositions} card you hold has already kicked off.`
              : current
                ? `No other ${eligiblePositions} card in your collection can start here.`
                : `Nothing in your collection can start at ${slot}.`}
          </Text>
        ) : null}

        {open.map((card) => (
          <PlayerBand
            key={card.id}
            card={card}
            badge={<PositionBadge label={card.position} size={BADGE_SIZE} width={BADGE_WIDTH} tone="neutral" />}
            right={<WeekFigure {...weekFigure(card)} />}
            onPress={() => onPick(slot, card.id)}
            accessibilityLabel={
              current
                ? `Start ${card.name} at ${slot} in place of ${current.name}`
                : `Start ${card.name} at ${slot}`
            }
          />
        ))}

        {/* Shown, dimmed, and not pressable. See `lockedIds` on the request for
            why they are here at all rather than filtered away. */}
        {shut.map((card) => (
          <PlayerBand
            key={card.id}
            card={card}
            dimmed
            badge={<PositionBadge label={card.position} size={BADGE_SIZE} width={BADGE_WIDTH} tone="neutral" />}
            right={<WeekFigure {...weekFigure(card)} />}
            accessibilityLabel={`${card.name} ${
              reasonFor?.(card.id) ?? 'has already started and cannot be brought in'
            }`}
          />
        ))}
      </View>
    </>
  );
}

/**
 * Take the current starter out and leave the slot empty.
 *
 * It was a line of small red text sitting between the player and the divider —
 * `Bench Dallas Goedert — leave TE empty` — with no border, no target and no
 * shape. On a sheet where everything else is a row, the one thing that was not
 * a row was the only destructive action on it, and red text with no affordance
 * reads as an error message about something that already happened rather than a
 * button offering to do it.
 *
 * So it is a row, in the same rhythm as the players above and below it: same
 * badge column, same two-line block, same press. What it says in that badge is
 * a dashed outline — the shape of a slot with nobody in it, which is exactly
 * what pressing it produces.
 *
 * THE COLOUR IS ON THE VERB ONLY. `ConfirmDialog` is the house rule here —
 * destructive is one coloured thing, not a coloured paragraph — so the action
 * carries the negative and the consequence underneath is stated in plain
 * secondary text. The old version put every word in red, including the player's
 * name, which made benching a tight end look like a data loss warning.
 */
function ClearRow({
  slot,
  name,
  onPress,
}: {
  slot: string;
  name: string;
  onPress: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Bench ${name} and leave ${slot} empty`}
      style={({ pressed }) => [
        styles.clearRow,
        pressed && { backgroundColor: c.backgroundElement },
      ]}>
      <View style={styles.clearBadgeCol}>
        {/* Neutral, not red. The rule cited above is that destructive is ONE
            coloured thing, and the verb is it — a red badge as well makes two,
            and puts the loudest of them in the column the eye scans down to
            compare positions. The dashes carry the meaning here; the colour is
            not doing any of the work. */}
        <View style={[styles.clearBadge, { borderColor: c.border }]}>
          <Text style={[Type.micro, { color: c.textTertiary }]}>–</Text>
        </View>
      </View>
      <View style={styles.clearLines}>
        <Text numberOfLines={1} style={[Type.strong, { color: c.negative }]}>
          Leave {slot} empty
        </Text>
        <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
          {name} goes back to your bench
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * "3 eligible RB", and what it does when some of them cannot be brought in.
 *
 * "unavailable" rather than "locked" since there are two ways to be shut out
 * and only one of them is a kickoff — a card playing in another contest this
 * week is equally unpickable and nothing to do with the clock. The per-row
 * reason is on each band's accessibility label; this is the count.
 */
function countLabel(request: Extract<SwapRequest, { kind: 'slot' }>): string {
  const rest = request.options.filter((o) => o.id !== request.current?.id);
  const open = rest.filter((o) => !request.lockedIds.has(o.id)).length;
  const shut = rest.length - open;
  const head = `${open} eligible ${request.eligiblePositions}`;
  return shut > 0 ? `${head} · ${shut} unavailable` : head;
}

/**
 * "Where does this player go."
 *
 * Every legal slot is listed, taken ones included. A bench player whose slots
 * are all full is the ordinary case — three good running backs, two slots — and
 * a sheet that showed nothing there would be answering a question nobody asked.
 * What it shows instead is who he would replace, which is the actual decision.
 */
function BenchBody({
  request,
  wide,
  onPick,
}: {
  request: Extract<SwapRequest, { kind: 'bench' }>;
  wide: boolean;
  onPick: (slot: string, cardId: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { card, destinations } = request;

  if (destinations.length === 0) {
    return (
      <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>
        {card.position
          ? `No slot in this lineup accepts a ${card.position}.`
          : 'This card has no position, so it cannot be started.'}
      </Text>
    );
  }

  return (
    <>
      {/* The mirror of the slot mode's incumbent: the player the sheet is about,
          in the same row, under his own heading. */}
      <View style={styles.section}>
        <Divider>Moving</Divider>
        <PlayerBand
          card={card}
          badge={<PositionBadge label={card.position} size={BADGE_SIZE} width={BADGE_WIDTH} tone="neutral" />}
          right={<WeekFigure {...weekFigure(card)} />}
          selected
          accessibilityLabel={`${card.name} is on the bench`}
        />
      </View>

      <View style={styles.section}>
        <Divider>Send him to</Divider>
        {/* Every legal slot, taken ones included. A bench player whose slots are
            all full is the ordinary case — three good running backs, two slots —
            and a sheet that showed nothing there would be answering a question
            nobody asked. What it shows instead is who he would replace, in the
            columns you would compare them in. */}
        {destinations.map(({ slot, occupant }) => (
          /* The badge IS the slot here, exactly as it is on the lineup board —
             so "where would he go" is answered by the same mark that answers
             "where is this player now" one screen back. */
          <PlayerBand
            key={slot}
            card={occupant}
            badge={
              <PositionBadge
                label={slotBadgeLabel(slot)}
                positions={positionsForSlot(slot)}
                size={BADGE_SIZE}
                width={BADGE_WIDTH}
                tone="neutral"
              />
            }
            right={<WeekFigure {...weekFigure(occupant)} />}
            emptyPrimary={`${slot} is empty`}
            emptySecondary="Nothing is starting here yet"
            onPress={() => onPick(slot, card.id)}
            accessibilityLabel={
              occupant
                ? `Start ${card.name} at ${slot} in place of ${occupant.name}`
                : `Start ${card.name} at ${slot}, which is empty`
            }
          />
        ))}
      </View>
    </>
  );
}

/**
 * The one figure a band shows, chosen to agree with the SORT.
 *
 * The band has room for a single number where the old table row had three
 * columns. Pinning it to season FP while the list was sorted by FP/G would put
 * the rows in an order the numbers on them do not explain, which is worse than
 * showing less.
 */
/**
 * The right-hand figure, which is the LINEUP ROW'S figure and nothing else.
 *
 * It used to be the card's season total — `198.2 FP` — under a sort that could
 * switch it to points per game. That was the same quantity the row already
 * carries two lines down as `2610.0 TFP`, so the sheet printed a card's career
 * production twice and its week not at all, in the one column the board uses
 * for the week.
 *
 * Now it is `weekFigureFor` over the player's own line, which is exactly what a
 * bench row shows on the board: a dash before kickoff, the running total while
 * he plays, the final figure after — with PROJ reserved underneath.
 *
 * The player's line and not a slot's credit, deliberately. A sheet has no slot
 * points to read and does not need them: the two agree the moment a sweep runs,
 * and what the reader is weighing here is players against each other.
 *
 * `sort` still orders the list — best option first is worth having — it simply
 * no longer decides what the column says.
 */
function weekFigure(card: LineupCard | null) {
  const value = weekFigureFor(card?.form?.weekFp ?? null, card?.game ?? null);
  return {
    points: value === null ? null : value.toFixed(1),
    status: card?.game?.status ?? null,
    /* THE SHEET SHOWS IT TOO, and that is the point of the sheet: it is where a
       swap is chosen, so it is the one screen where a forecast is the number
       you are actually comparing on. Same helper as the board, so the two
       cannot disagree about what a player is projected for. */
    projected: card?.form?.projectedFp ?? null,
  };
}

/**
 * The break between the player the sheet is ABOUT and the list you are choosing
 * from.
 *
 * A centred caption between two rules, rather than the left-aligned micro label
 * that used to sit above each section. Two stacked labels plus a sort row made
 * three bands of 9pt uppercase furniture between the subject and the first
 * option; this is one, and being centred it reads as a divider rather than as
 * another heading competing with the title.
 */
function Divider({ children }: { children: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  return (
    <View style={styles.divider}>
      <View style={[styles.rule, { backgroundColor: c.border }]} />
      <Text style={[Type.micro, { color: c.textTertiary }]}>⇅ {children.toUpperCase()}</Text>
      <View style={[styles.rule, { backgroundColor: c.border }]} />
    </View>
  );
}

/**
 * How far the sheet has to be pulled before letting go dismisses it, and how
 * fast a flick has to be to count instead. Both are `PlayerSheetFrame`'s
 * numbers verbatim — one pull, one meaning, on every sheet in the app.
 */
const DISMISS_AFTER = 110;
const FLICK_VELOCITY = 0.7;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  backdropBottom: { justifyContent: 'flex-end' },
  backdropCentre: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  /* The iOS page sheet's content. No corner, no border, no height cap — the
     presentation owns all three. `flex: 1` because the sheet IS the frame here,
     so the scroller has to be able to fill it. */
  pageSheet: { flex: 1 },
  sheet: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  /* Tall enough to be the screen while leaving the board visible above it —
     the whole reason this is a sheet and not a route. */
  /* `SheetCorner`, not a number of its own. This was 18 against the profile
     sheet's 20 — close enough that neither looked wrong alone and far enough
     that the two never quite agreed, on two sheets a reader opens within
     seconds of each other. One token, and they cannot drift again. */
  bottomSheet: {
    width: '100%',
    maxHeight: '88%',
    borderTopLeftRadius: SheetCorner,
    borderTopRightRadius: SheetCorner,
    borderBottomWidth: 0,
  },
  dialog: { width: '100%', maxWidth: 620, maxHeight: '84%', borderRadius: SheetCorner },
  /* 36x5 and 5pt down: UIKit's own grabber, which is what `PlayerSheetFrame`
     draws. This was 38x4, near enough to read as a mistake beside it. */
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    alignSelf: 'center',
    marginTop: 5,
  },
  /**
   * The block the pull gesture owns: grabber, title, count.
   *
   * `touchAction: 'none'` IS THE GESTURE ON WEB. Without it there is no drag at
   * all on a real phone browser, and the reason is invisible from the JS side:
   * the browser decides who owns a vertical touch BEFORE any handler runs, the
   * default owner is the scroller, and PanResponder is simply never granted.
   * Nothing errors. It is scoped to this block precisely so the list below
   * keeps native scrolling. See the longer note in `PlayerSheetFrame`.
   */
  dragZone: Platform.select({
    web: { touchAction: 'none' as const, userSelect: 'none' as const, cursor: 'pointer' as const },
    default: {},
  }),
  header: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.two + 4,
    paddingBottom: Spacing.three,
  },
  title: { textAlign: 'center' },
  /* Floated, so the centred title is centred on the SHEET rather than on
     whatever space a control in the same row happens to leave it. */
  close: {
    position: 'absolute',
    right: Spacing.three,
    top: Spacing.two,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* `flexShrink` rather than `flex: 1`: a two-option sheet should be two
     options tall, not 88% of the screen with white space under it. */
  scroll: { flexShrink: 1 },
  /* The narrow sheet overrides this with the safe area — see the use. */
  scrollBody: { paddingBottom: Spacing.two },
  section: { gap: Spacing.one },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  /* The player rows' own geometry: `Spacing.three` gutter, a BADGE_WIDTH column,
     a Spacing.two gap. Anything else and the left edge of this row would not
     line up with the left edge of the player it is about. */
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  clearBadgeCol: { width: BADGE_WIDTH, alignItems: 'center' },
  /* Dashed, because the badge is drawing the ABSENCE of a player — a solid
     outline here would read as one more position badge in the column. */
  clearBadge: {
    width: BADGE_SIZE + 8,
    height: BADGE_SIZE,
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearLines: { flex: 1, minWidth: 0, gap: 2 },
  empty: { padding: Spacing.three },
  pressed: { opacity: 0.7 },
});
