/**
 * What a pack deals you, turned over one card at a time.
 *
 * WHAT THIS REPLACED, AND WHY THE GRID HAD TO GO
 *
 * `PullResult` drew every pulled card at once in a wrapping grid, staggered by
 * 55ms so they landed in sequence. Its own note called that "the beta's version
 * of the moment, not the finished one", and named the two things wrong with it:
 * the cards arrive as a finished table, and there is nothing to do with them.
 * This is the finished one.
 *
 * THREE IDEAS, AND THEY ARE THE WHOLE FILE
 *
 *   ONE CARD AT A TIME. The deck runs left to right and snaps, so exactly one
 *   card is in front of you. Cards start face down and turn over as they reach
 *   the middle — which makes SCROLLING the act of dealing rather than a way of
 *   reviewing something already dealt. A grid can only ever show you a result;
 *   a deck you move through has a next card in it.
 *
 *   THE CARD IS BIG. `detail`, the 320pt size the card profile uses, against
 *   the grid's 168. Eight cards you scroll past one at a time can each be four
 *   times the area of eight cards laid out at once, and the pull is the one
 *   moment in this app that is purely about looking at a card.
 *
 *   THE DECISION IS MADE HERE, AND ON THE CARD. Most of a pack is duplicates,
 *   and until now the only thing the reveal let you do was look at them —
 *   selling lived on `card/[id]`, committing lived on `set/[code]`, so clearing
 *   a pack meant leaving the sheet and finding eight cards in an inventory that
 *   had just grown by eight. Both exits are on the card now, priced by the
 *   server. See `use-pull-actions`.
 *
 *   EACH CARD CARRIES ITS OWN PAIR, inside its own slide. The first version put
 *   ONE panel under the deck and pointed it at whichever card was in front of
 *   you, which is fewer pixels and the wrong object: the buttons then belong to
 *   the carousel rather than to the card, so "sell this" is a claim about a
 *   selection you have to trust the panel got right. Swipe fast and the panel
 *   is mid-swap while your thumb is already on the button. Under the card there
 *   is nothing to get wrong — what you press is attached to what you are
 *   looking at, and it travels with it.
 *
 * WHY THE FLIP IS 2D
 *
 * `scaleX` 1 -> 0 on the back and 0 -> 1 on the face, in sequence, which reads
 * as a card turning over and is the same motion a real one makes in silhouette.
 * A `rotateY` with `backfaceVisibility` is the obvious alternative and was not
 * taken: it needs a perspective origin to avoid looking like a shear, and the
 * three platforms this ships on (iOS, Android, react-native-web) resolve
 * `transform` origins and backface culling differently enough that "it works on
 * my simulator" is not evidence. The 2D version has no backface to cull and
 * nothing to get wrong.
 *
 * A NEW PACK IS A NEW DECK, and it says so by remounting: the screen gives this
 * component a `key` made of the pull's card ids, so opening another pack
 * discards the scroll position, the turned-over set and the focused index in one
 * go rather than resetting five pieces of state in an effect and rendering the
 * new pack once against the old one's answers.
 *
 * NOTHING IS EVER STUCK FACE DOWN. Cards turn over when they reach the middle,
 * on tap, and all at once from `Reveal all` — because the ceremony is a gift
 * and a gift you cannot decline is a chore. The last of these is also the
 * accessibility answer: reaching a card by swipe is not a thing every player
 * can do.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { YapMark } from '@/components/brand/YapLogo';
import { Gem } from '@/components/shell/AppHeader';
import { horizontalStrip } from '@/components/ui/scroll-strip';
import { rgba } from '@/components/ui/gradient';
import {
  Colors,
  NUMERIC,
  Radius,
  SheetDialogWidth,
  Spacing,
  TierColors,
  Type,
  type CardTier,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PlayerCard, type PlayerCardModel } from './PlayerCard';
import type { Pulled } from './PackShelf';
import type { Disposition, PullAction, PullSet } from './use-pull-actions';

/** Every card is minted at the floor tier; only lineup starts move it. */
const MINT_TIER: CardTier = 'bronze';
const NEXT_TIER_LABEL = 'SILVER';

/**
 * How wide the card in front of you is.
 *
 * `detail`'s own 320 wherever it fits, and never wider — the card is drawn for
 * that size and stretching it past it makes a poster. The 88 is the peek: the
 * strip either side that shows the edge of the next card, which is what says
 * there IS a next card without a caption saying so. On a 375pt phone that
 * leaves 287, and the floor stops a 320pt-wide device squeezing it to nothing.
 */
const CARD_MAX = 320;
const CARD_MIN = 232;
const PEEK = 88;

/** The turn. Long enough to read as a card being turned, short enough to sit through eight. */
const FLIP_MS = 420;

/**
 * How far a card fades once it has been spent.
 *
 * Still drawn, and still in the deck. Removing it would resize the deck under a
 * thumb that is mid-scroll and renumber every pip below it — for a card the
 * player has just deliberately looked at.
 */
const SPENT_OPACITY = 0.42;

/**
 * The snap, on web, because `snapToInterval` is not implemented there.
 *
 * MEASURED RATHER THAN ASSUMED: react-native-web 0.21 accepts the prop and
 * emits `scroll-snap-type: none`, so the deck free-scrolled in a browser and
 * came to rest between two cards — which on a surface whose whole premise is
 * "one card in front of you" is the difference between a deck and a shelf.
 * Mobile web is a real target here, not a degraded one (see the note in
 * `PlayerSheetFrame` about the deployed site being the kickoff insurance), so
 * the CSS is written directly.
 *
 * Same shim shape as `gradient()`: a cast, because these are real CSS
 * properties that React Native's style type has no name for. Native keeps
 * `snapToInterval`, which is the thing this is a stand-in for.
 */
const WEB_SNAP: ViewStyle | null =
  Platform.OS === 'web' ? ({ scrollSnapType: 'x mandatory' } as ViewStyle) : null;
const WEB_SNAP_CHILD: ViewStyle | null =
  Platform.OS === 'web' ? ({ scrollSnapAlign: 'center' } as ViewStyle) : null;

/**
 * How long the first card waits before turning itself over.
 *
 * Not zero. A card that is already face up when the sheet finishes opening was
 * never face down, and the whole point of the back is that you see it first.
 */
const FIRST_REVEAL_MS = 260;

/* ---- the deck ---------------------------------------------------------- */

export function PackReveal({
  pulled,
  silverAt,
  actions,
  loadingActions,
  disposed,
  busy,
  error,
  onDismissError,
  onSell,
  onCommit,
  onAgain,
  onSeeInventory,
}: {
  pulled: Pulled[];
  /** Career FP the next tier starts at, read from `tier_thresholds`. */
  silverAt: number;
  /** What each card can be turned into, keyed by card_instance_id. */
  actions: Map<string, PullAction>;
  loadingActions: boolean;
  disposed: Map<string, Disposition>;
  /** The card a write is in flight for. Blocks every button on every card. */
  busy: string | null;
  error: string | null;
  onDismissError: () => void;
  onSell: (cardInstanceId: string) => void;
  onCommit: (cardInstanceId: string, setCode: string) => void;
  onAgain: () => void;
  onSeeInventory: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  const [measured, setMeasured] = useState(0);
  const [focus, setFocus] = useState(0);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const scroller = useRef<ScrollView>(null);

  /**
   * How wide the box holding the deck is.
   *
   * DERIVED FIRST, MEASURED SECOND, AND THE ORDER IS THE POINT.
   *
   * `onLayout` is the obvious way to get this and it cannot be the only way.
   * Twice over: it necessarily reports AFTER a first paint, so a deck that
   * waited for it drew one frame of cards at the floor width and then jumped —
   * and react-native-web's `onLayout` is one shared `ResizeObserver` behind a
   * `__reactLayoutHandler` on the node, which in a real build of this app
   * attaches the handler and then never fires it. The symptom was every card
   * pinned at `CARD_MIN` in a 404pt box, with the deck's gutter at the 16pt
   * floor instead of the 44 that centres it. Calling the handler by hand from
   * the console laid it out correctly, which is what proved where the fault was.
   *
   * The derivation is exact rather than a guess. This only ever renders inside
   * `PlayerSheetFrame`, which is full-bleed on a phone and on narrow web and a
   * dialog capped at `SheetDialogWidth` on wide web — so the box is the window
   * or the cap, whichever is smaller, and the bleed below cancels the frame's
   * own gutter. `onLayout` still refines it when it does fire, which is what
   * keeps this honest if the frame's own width ever stops being either of those.
   */
  const { width: windowWidth } = useWindowDimensions();
  const viewport = measured || Math.min(windowWidth, SheetDialogWidth);

  const card = Math.max(CARD_MIN, Math.min(CARD_MAX, viewport - PEEK));
  /* The snap step. Cards are one gap apart, so the interval is the card plus
     the gap and the side inset is whatever is left over — which is what puts
     each card in the middle of the box rather than at its left edge. */
  const step = card + Spacing.three;
  const inset = Math.max(Spacing.three, (viewport - card) / 2);

  const reveal = useCallback((id: string) => {
    setRevealed((held) => (held.has(id) ? held : new Set(held).add(id)));
  }, []);

  /* THE FIRST CARD DEALS ITSELF. Everything after it is dealt by the player
     scrolling to it — see `onScroll` — but something has to start, and a deck
     that sits entirely face down until you touch it reads as having failed to
     load rather than as waiting for you. */
  useEffect(() => {
    const first = pulled[0]?.card_instance_id;
    if (!first) return;
    const t = setTimeout(() => reveal(first), FIRST_REVEAL_MS);
    return () => clearTimeout(t);
  }, [pulled, reveal]);

  /**
   * Where a programmatic scroll is headed, while it is still getting there.
   *
   * THE PANEL MUST NOT FOLLOW AN ANIMATION IT ALREADY KNOWS THE END OF. Pressing
   * the pip for card 3 starts a smooth scroll that passes over cards 1 and 2 on
   * the way, and every frame of it arrives here as a scroll event with a
   * different index — so the panel underneath flicked through two other players
   * before settling, and on the way it turned both of their cards over. Which
   * card you are looking at is decided by whoever moved the deck; this ref is
   * how a press keeps that decision until its own scroll catches up.
   *
   * A ref rather than state on purpose: it changes on frames that must not
   * render, and it is read only from inside the handler that clears it.
   */
  const heading = useRef<number | null>(null);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (step <= 0) return;
      const i = Math.round(e.nativeEvent.contentOffset.x / step);
      const at = Math.max(0, Math.min(pulled.length - 1, i));

      if (heading.current !== null) {
        // Still in transit. Arriving is the only event worth acting on.
        if (heading.current !== at) return;
        heading.current = null;
      }

      setFocus(at);
      const id = pulled[at]?.card_instance_id;
      if (id) reveal(id);
    },
    [step, pulled, reveal],
  );

  /* WHEREVER IT ACTUALLY STOPPED WINS, and this is the release valve for the
     ref above: a programmatic scroll that never emits an event landing exactly
     on its target would otherwise leave `heading` set forever and the deck
     would stop following the player entirely. A finger on the deck cancels it
     outright, since a drag is a newer instruction than the press that started
     the animation. */
  const settle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      heading.current = null;
      onScroll(e);
    },
    [onScroll],
  );

  const revealAll = useCallback(() => {
    setRevealed(new Set(pulled.map((p) => p.card_instance_id)));
  }, [pulled]);

  const goTo = useCallback(
    (i: number) => {
      /* The focus moves HERE, not in the scroll handler this animation will
         eventually reach. Pressing a pip is a statement about which card you
         want in front of you, and leaving it to `onScroll` meant the panel
         underneath went on describing the old card for the length of a smooth
         scroll — or forever, on any platform that resolves an animated
         `scrollTo` without emitting scroll events. */
      setFocus(i);
      heading.current = i;
      scroller.current?.scrollTo({ x: i * step, animated: true });
      const id = pulled[i]?.card_instance_id;
      if (id) reveal(id);
    },
    [step, pulled, reveal],
  );

  const allRevealed = revealed.size >= pulled.length;
  /* What this pack has paid out so far. Only drawn once something has been
     spent, because "+0 gems" on an untouched pack reads as a reward that
     failed to arrive. */
  const earned = useMemo(() => {
    let total = 0;
    for (const d of disposed.values()) total += d.gems;
    return total;
  }, [disposed]);

  const toModel = (p: Pulled): PlayerCardModel => ({
    playerName: p.player_name ?? 'Unknown player',
    positionAbbreviation: p.position_abbreviation,
    teamAbbreviation: p.team_abbreviation,
    // A freshly pulled card has never been started, so it starts at the floor.
    tier: MINT_TIER,
    careerFp: 0,
    tierFloorFp: 0,
    nextTierAt: silverAt,
    nextTierLabel: NEXT_TIER_LABEL,
  });

  return (
    <>
      {/* ---- the counter, and the way out of the ceremony ---------------- */}
      <View style={styles.deckHead}>
        <View style={styles.pips}>
          {pulled.map((p, i) => (
            <Pressable
              key={p.card_instance_id}
              onPress={() => goTo(i)}
              accessibilityRole="button"
              accessibilityLabel={`Card ${i + 1} of ${pulled.length}`}
              accessibilityState={{ selected: i === focus }}
              hitSlop={6}
              style={styles.pipTap}>
              <View
                style={[
                  styles.pip,
                  {
                    backgroundColor: i === focus ? gold : c.borderStrong,
                    // A card already turned over is filled; one still face down
                    // is an outline, so the row doubles as "how much is left".
                    opacity: revealed.has(p.card_instance_id) || i === focus ? 1 : 0.45,
                  },
                ]}
              />
            </Pressable>
          ))}
        </View>

        {allRevealed ? (
          <Text style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
            {`${focus + 1} of ${pulled.length}`}
          </Text>
        ) : (
          <Pressable
            onPress={revealAll}
            accessibilityRole="button"
            accessibilityLabel="Turn over every card in this pack"
            hitSlop={8}
            style={({ pressed }) => [pressed && styles.pressed]}>
            <Text style={[Type.label, { color: gold }]}>REVEAL ALL</Text>
          </Pressable>
        )}
      </View>

      {/* ---- the deck ---------------------------------------------------- */}
      {/* Bled back out to the sheet's edges. The scroll content is inset
          `Spacing.three` each side by the frame, and a deck that stopped there
          would put its peeking neighbour behind a margin — the card either side
          has to run to the edge of the screen or it does not read as a deck. */}
      <View style={styles.bleed}>
        <ScrollView
          ref={scroller}
          horizontal
          onLayout={(e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width)}
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          decelerationRate="fast"
          style={WEB_SNAP}
          disableIntervalMomentum
          onScroll={onScroll}
          onScrollBeginDrag={() => {
            heading.current = null;
          }}
          onMomentumScrollEnd={settle}
          onScrollEndDrag={settle}
          scrollEventThrottle={16}
          contentContainerStyle={[styles.deck, { paddingHorizontal: inset }]}
          {...horizontalStrip}>
          {pulled.map((p, i) => (
            <RevealSlot
              key={p.card_instance_id}
              width={card}
              tone={gold}
              revealed={revealed.has(p.card_instance_id)}
              index={i}
              count={pulled.length}
              spent={
                // A card that has left the collection is drawn back, not gone:
                // the deck must not resize itself under a scrolling thumb.
                !!disposed.get(p.card_instance_id) &&
                actions.get(p.card_instance_id)?.held === false
              }
              onReveal={() => {
                reveal(p.card_instance_id);
                if (i !== focus) goTo(i);
              }}
              actions={(turned) => (
                <CardActions
                  player={p.player_name ?? 'This card'}
                  revealed={turned}
                  action={actions.get(p.card_instance_id)}
                  loading={loadingActions}
                  became={disposed.get(p.card_instance_id)}
                  busy={busy === p.card_instance_id}
                  /* Every button on every card waits on a write in flight —
                     both RPCs move the one wallet, so a second one decided
                     against a balance that is about to change is the shape of a
                     double-spend. */
                  locked={busy !== null && busy !== p.card_instance_id}
                  error={busy === p.card_instance_id ? error : null}
                  onDismissError={onDismissError}
                  onSell={() => onSell(p.card_instance_id)}
                  onCommit={(code) => onCommit(p.card_instance_id, code)}
                />
              )}>
              <PlayerCard model={toModel(p)} size="detail" fixedWidth={false} />
            </RevealSlot>
          ))}
        </ScrollView>
      </View>

      <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
        New cards start at bronze. Start them in a lineup to earn their way up — or spend the
        spares here.
      </Text>

      {/* ---- and out ----------------------------------------------------- */}
      <View style={styles.afterRow}>
        <Pressable
          onPress={onSeeInventory}
          accessibilityRole="button"
          accessibilityLabel="See these cards in your inventory"
          style={({ pressed }) => [
            styles.after,
            { backgroundColor: c.text },
            pressed && styles.pressed,
          ]}>
          <Text style={[Type.strong, { color: c.background }]}>See in Inventory</Text>
        </Pressable>
        <Pressable
          onPress={onAgain}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.after,
            { backgroundColor: c.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <Text style={[Type.strong, { color: c.text }]}>Open another</Text>
        </Pressable>

        {earned > 0 ? (
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${earned} gems earned from this pack`}
            style={styles.earned}>
            <Gem size={11} color={gold} />
            <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{`+${earned}`}</Text>
            <Text style={[Type.fine, { color: c.textTertiary }]}>from this pack</Text>
          </View>
        ) : null}
      </View>
    </>
  );
}

/* ---- one slot in the deck ---------------------------------------------- */

/**
 * A card and the back it is behind, stacked, with the turn between them.
 *
 * THE FACE IS IN FLOW AND THE BACK IS OVER IT, which is what makes the slot the
 * right height without anybody measuring a card: the face lays out normally and
 * establishes the box, and the back is an `absoluteFill` over it. Doing it the
 * other way round would need a height in points here, and the card's height is
 * `artAspect` times a width this component computes at runtime.
 *
 * SO THE FACE IS ALWAYS MOUNTED, including while it is face down and invisible.
 * That is a screen reader announcing the player's name on a card the sighted
 * player has not turned over yet — hence `accessibilityElementsHidden` and its
 * Android counterpart while it is down, which is the same pair `Modal` uses to
 * hide what is behind it.
 */
function RevealSlot({
  width,
  tone,
  revealed,
  spent,
  index,
  count,
  onReveal,
  actions,
  children,
}: {
  width: number;
  tone: string;
  revealed: boolean;
  /** The copy has left the collection — sold, or burnt into a set. */
  spent: boolean;
  index: number;
  count: number;
  onReveal: () => void;
  /**
   * This card's own sell / add-to-set panel, drawn under it.
   *
   * Taken as a function of `turned` rather than as a node, because whether the
   * card has finished turning is the slot's fact and the panel's business, and
   * nothing above here can know it without duplicating the timing.
   */
  actions: (turned: boolean) => React.ReactNode;
  children: React.ReactNode;
}) {
  const flip = useSharedValue(revealed ? 1 : 0);

  /**
   * The turn is FINISHED, which is a different moment from "the turn started".
   *
   * `revealed` flips the instant the card reaches the middle of the deck, and
   * the turn takes `FLIP_MS` after that. Hanging the panel off `revealed` put
   * "Add to a set · 2" and a priced sell button directly beneath a card still
   * showing its back and the words TAP TO REVEAL — pressable, for four hundred
   * milliseconds, on a card the player had not seen. That was survivable when
   * one shared panel sat below the whole deck; with the buttons under the card
   * they belong to it is simply wrong.
   *
   * Set from the timing's own completion callback rather than a parallel
   * timeout, so it cannot drift from the animation it is reporting on, and it
   * never fires for a turn that was interrupted. It only ever goes true: a card
   * is never turned back over, and the deck remounts for each new pack.
   */
  const [turned, setTurned] = useState(revealed);

  useEffect(() => {
    if (!revealed) return;
    flip.value = withTiming(
      1,
      { duration: FLIP_MS, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(setTurned)(true);
      },
    );
  }, [revealed, flip]);

  /* Both halves read the same 0..1. The back owns the first half of it and the
     face the second, so the face is at zero width for exactly as long as the
     back is shrinking and the two never overlap. */
  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ scaleX: interpolate(flip.value, [0, 0.5], [1, 0], Extrapolation.CLAMP) }],
  }));
  /* THE SPENT DIM LIVES IN HERE rather than in a style beside it, and it has to.
     Reanimated writes an animated style straight onto the node, so a static
     `opacity` in the same array is simply overwritten however it is ordered —
     which is why a sold card went on looking exactly like the four it was
     drawn beside. */
  const faceStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 0 : spent ? SPENT_OPACITY : 1,
    transform: [{ scaleX: interpolate(flip.value, [0.5, 1], [0, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={[{ width }, WEB_SNAP_CHILD, styles.slot]}>
      {/* THE CARD BOX, and the turn happens only in here. The panel below must
          not flip with it — it belongs to the card but it is not printed on it,
          and a set picker that shrank to nothing edge-on would read as the UI
          breaking rather than as a card turning over. */}
      <View>
        {/* `aria-hidden` rather than the platform pair it stands for. React
            Native maps it to `accessibilityElementsHidden` on iOS and
            `importantForAccessibility` on Android, and react-native-web emits
            the real attribute — where the pair on its own does nothing at all,
            so the browser went on announcing both the face-down card's back AND
            the player printed on the face nobody has turned over yet. */}
        <Animated.View
          style={[faceStyle, { pointerEvents: revealed ? 'auto' : 'none' }]}
          aria-hidden={!revealed}>
          {children}
        </Animated.View>

        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            backStyle,
            { pointerEvents: revealed ? 'none' : 'auto' },
          ]}
          aria-hidden={revealed}>
          <CardBack tone={tone} index={index} count={count} onPress={onReveal} />
        </Animated.View>
      </View>

      {actions(turned)}
    </View>
  );
}

/**
 * The back of a card, which is the only thing on this screen that is not data.
 *
 * Geometry and the mark, for the same two reasons the card's front is geometry:
 * there is no licensed art to put here, and a back that differed per player
 * would leak which card it is before it is turned. Every back in the deck is
 * identical on purpose.
 */
function CardBack({
  tone,
  index,
  count,
  onPress,
}: {
  tone: string;
  index: number;
  count: number;
  onPress: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Card ${index + 1} of ${count}, face down. Turn it over.`}
      style={({ pressed }) => [
        styles.back,
        { backgroundColor: c.surfaceSunken, borderColor: tone },
        pressed && styles.pressed,
      ]}>
      {/* Four bars, well off centre, in the sheet's own gold at a whisper. A
          plain field behind the mark reads as a placeholder that failed to
          load; this reads as printing. */}
      <View style={[StyleSheet.absoluteFill, styles.inert]}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.backBar,
              { backgroundColor: rgba(tone, 0.1), top: `${14 + i * 22}%` },
            ]}
          />
        ))}
      </View>

      <YapMark height={44} color={tone} ink={c.surfaceSunken} />
      <Text style={[Type.micro, { color: c.textTertiary }]}>TAP TO REVEAL</Text>
    </Pressable>
  );
}

/* ---- the two exits ----------------------------------------------------- */

type Stage = 'idle' | 'picking' | 'selling';

/**
 * Sell it, or put it in a set — for the one card this panel sits under.
 *
 * ONE PANEL PER CARD, DRAWN UNDER IT, INSIDE ITS SLIDE. It is as wide as the
 * card and no wider, which is what makes the buttons a column rather than a
 * row — see `buttonRow`.
 *
 * NO DIALOG. Committing a card burns it, and the set checklist rightly puts a
 * `ConfirmDialog` in front of that: there, the act is a batch of up to thirty
 * cards chosen off a grid, and half of them may be copies with a season of
 * scoring on them. Here every card is seconds old, bronze, and worth
 * single-figure gems — and there are eight of them. A modal per card would make
 * clearing a pack eight modals, which is how a feature intended to save a trip
 * to the inventory becomes slower than the trip.
 *
 * SO THE SAFETY IS A SECOND TAP RATHER THAN A SECOND SURFACE. Both exits stage
 * through this panel: `Quick sell` becomes a priced confirm, `Add to set`
 * becomes the list of sets that can take it. Nothing destructive happens on a
 * first press, which is the property that actually matters on a surface you
 * scroll with your thumb.
 */
function CardActions({
  player,
  revealed,
  action,
  loading,
  became,
  busy,
  locked,
  error,
  onDismissError,
  onSell,
  onCommit,
}: {
  player: string;
  revealed: boolean;
  action: PullAction | undefined;
  loading: boolean;
  became: Disposition | undefined;
  busy: boolean;
  /** Another card is mid-write. Everything here waits for it. */
  locked: boolean;
  error: string | null;
  onDismissError: () => void;
  onSell: () => void;
  onCommit: (setCode: string) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  /* Closed by the press that answers it, never by an effect watching the
     result. The picker and the sell confirm both exist only to collect one tap,
     so the tap itself is the end of them — waiting for the server to come back
     would leave a list of sets up over a commit already in flight. */
  const [stage, setStage] = useState<Stage>('idle');

  const close = useCallback(() => {
    setStage('idle');
    onDismissError();
  }, [onDismissError]);

  /* A face-down card is not a card you have seen, and a button under it would
     be asking you to sell something you have not looked at. */
  if (!revealed) {
    return (
      <View style={styles.panel}>
        <Text style={[Type.fine, { color: c.textTertiary }]}>
          Turn the card over to sell it or add it to a set.
        </Text>
      </View>
    );
  }

  if (loading && !action) {
    return (
      <View style={[styles.panel, styles.panelCentred]}>
        <ActivityIndicator />
      </View>
    );
  }

  const gone = became && action?.held === false;
  const commitable = action?.sets.filter((s) => s.canCommit) ?? [];
  const blocked = action?.sets.filter((s) => !s.canCommit) ?? [];

  return (
    <View style={styles.panel}>
      {/* What this card became, if anything. Kept ABOVE the buttons rather than
          replacing them, because a commit that burnt a spare copy leaves this
          one in your hand and still sellable — see `Disposition`. */}
      {became ? (
        <View style={styles.stamp}>
          <Text style={[Type.label, { color: c.positive }]}>
            {became.kind === 'sold' ? 'SOLD' : 'ADDED TO SET'}
          </Text>
          <Text style={[Type.fine, styles.stampText, { color: c.textSecondary }]}>
            {became.kind === 'sold'
              ? `${player} left your collection for ${became.gems} gems.`
              : became.burnedThisCopy
                ? `${player} is in ${became.setName}. This copy was used, and paid ${became.gems} gems.`
                : `${player} is in ${became.setName} for ${became.gems} gems — a spare copy was used, so this one is still yours.`}
          </Text>
        </View>
      ) : null}

      {error ? (
        <Pressable
          onPress={onDismissError}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss: ${error}`}
          style={[styles.refusal, { borderColor: c.negative }]}>
          <Text style={[Type.fine, { color: c.text }]}>{error}</Text>
        </Pressable>
      ) : null}

      {gone ? null : stage === 'selling' ? (
        <View style={styles.stageBlock}>
          <Text style={[Type.fine, styles.measure, { color: c.textSecondary }]}>
            {`Selling is permanent. ${player} leaves your collection and cannot be pulled back — a future copy starts again at bronze.`}
          </Text>
          <View style={styles.buttonPair}>
            <Pressable
              onPress={close}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                styles.buttonPairHalf,
                { backgroundColor: c.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <Text style={[Type.strong, { color: c.text }]}>Keep it</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setStage('idle');
                onSell();
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Confirm: sell ${player} for ${action?.sellValue ?? 0} gems`}
              accessibilityState={{ busy }}
              style={({ pressed }) => [
                styles.button,
                styles.buttonPairHalf,
                { backgroundColor: c.negative },
                pressed && styles.pressed,
                busy && styles.dim,
              ]}>
              {busy ? (
                <ActivityIndicator />
              ) : (
                <Text style={[Type.strong, { color: c.background }]}>
                  {`Sell for ${action?.sellValue ?? 0}`}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : stage === 'picking' ? (
        <View style={styles.stageBlock}>
          {commitable.map((s) => (
            <SetRow
              key={s.code}
              set={s}
              busy={busy}
              spare={action?.burnsThisCopy === false}
              onPress={() => {
                setStage('idle');
                onCommit(s.code);
              }}
            />
          ))}
          <Pressable
            onPress={close}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              styles.buttonGrow,
              { backgroundColor: c.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <Text style={[Type.strong, { color: c.text }]}>Not now</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.buttonRow}>
          {commitable.length > 0 ? (
            <Pressable
              onPress={() =>
                // One set is not a choice, so it does not get a list. It gets
                // the set's own name on the button and commits on the next tap.
                commitable.length === 1 ? onCommit(commitable[0].code) : setStage('picking')
              }
              disabled={locked || busy}
              accessibilityRole="button"
              accessibilityLabel={
                commitable.length === 1
                  ? `Add ${player} to ${commitable[0].name} for ${commitable[0].pays} gems`
                  : `Choose one of ${commitable.length} sets to add ${player} to`
              }
              accessibilityState={{ busy, disabled: locked || busy }}
              style={({ pressed }) => [
                styles.button,
                styles.buttonGrow,
                { backgroundColor: gold },
                pressed && styles.pressed,
                (locked || busy) && styles.dim,
              ]}>
              {busy ? (
                <ActivityIndicator />
              ) : (
                <Text numberOfLines={1} style={[Type.strong, { color: '#17130A' }]}>
                  {commitable.length === 1
                    ? `Add to ${commitable[0].name} · ${commitable[0].pays}`
                    : `Add to a set · ${commitable.length}`}
                </Text>
              )}
            </Pressable>
          ) : null}

          {action?.sellable ? (
            <Pressable
              onPress={() => setStage('selling')}
              disabled={locked || busy}
              accessibilityRole="button"
              accessibilityLabel={`Quick sell ${player} for ${action.sellValue} gems`}
              accessibilityState={{ disabled: locked || busy }}
              style={({ pressed }) => [
                styles.button,
                styles.buttonGrow,
                styles.sell,
                { backgroundColor: c.backgroundElement, borderColor: c.border },
                pressed && styles.pressed,
                (locked || busy) && styles.dim,
              ]}>
              {busy ? (
                <ActivityIndicator />
              ) : (
                <>
                  <Text style={[Type.strong, { color: c.text }]}>Quick sell</Text>
                  <Gem size={10} color={gold} />
                  <Text style={[Type.strong, NUMERIC, { color: c.text }]}>
                    {action.sellValue}
                  </Text>
                </>
              )}
            </Pressable>
          ) : null}

          {/* THE SPARE-COPY CAVEAT, on the path that never sees the picker.
              With one set there is no list to put it in and the button commits
              on the next tap, so without this the only warning that a DIFFERENT
              copy is about to burn would arrive after it had. */}
          {commitable.length === 1 && action?.burnsThisCopy === false ? (
            <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
              {`You hold a spare of ${player}. Adding him uses your least valuable copy, so this card stays in your collection.`}
            </Text>
          ) : null}

          {/* Why there is nothing to press. Every one of these is a real state
              rather than a load that failed, so each says which. */}
          {commitable.length === 0 && !action?.sellable ? (
            <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
              {!action
                ? 'This card is in your inventory. Sell it or add it to a set from there.'
                : gone
                  ? 'This copy has left your collection.'
                  : blocked.length > 0
                    ? blocked[0].slotFilled
                      ? `${player} is already in ${blocked[0].name}, and this copy is standing in a lineup that has not been scored.`
                      : `${blocked[0].name} is complete, and this copy is standing in a lineup that has not been scored.`
                    : 'This copy is standing in a lineup that has not been scored yet.'}
            </Text>
          ) : null}
        </View>
      )}

      {/* The sets that wanted this card and cannot take it. Named rather than
          dropped: "no set for this one" and "his slot is already filled" are
          different pieces of news, and only one of them is worth a shrug. */}
      {!gone && stage === 'idle' && commitable.length === 0 && blocked.length > 0 ? (
        <Text style={[Type.fine, styles.measure, { color: c.textTertiary }]}>
          {blocked[0].slotFilled
            ? `${player}'s slot in ${blocked[0].name} is already filled.`
            : `${blocked[0].name} has met its requirement, so it cannot take another card.`}
        </Text>
      ) : null}
    </View>
  );
}

/** One set on offer: what it is, how far along it is, and what it pays. */
function SetRow({
  set,
  busy,
  spare,
  onPress,
}: {
  set: PullSet;
  busy: boolean;
  /** The commit would burn an older copy rather than this one. */
  spare: boolean;
  onPress: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const gold = TierColors[scheme].gold.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`Add to ${set.name}, ${set.committed} of ${set.required} filled, pays ${set.pays} gems`}
      style={({ pressed }) => [
        styles.setRow,
        { backgroundColor: c.surface, borderColor: c.border },
        pressed && styles.pressed,
        busy && styles.dim,
      ]}>
      <View style={styles.setText}>
        <Text numberOfLines={1} style={[Type.strong, { color: c.text }]}>
          {set.name}
        </Text>
        <Text style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
          {`${set.committed} of ${set.required} filled`}
          {set.family === 'daily' ? ' · expires at midnight' : ''}
          {spare ? ' · uses a spare copy' : ''}
        </Text>
      </View>
      <View style={styles.setPay}>
        <Gem size={10} color={gold} />
        <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{set.pays}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  deckHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 20,
  },
  pips: { flexDirection: 'row', alignItems: 'center' },
  pipTap: { paddingVertical: Spacing.one, paddingHorizontal: 3 },
  pip: { width: 18, height: 3, borderRadius: 2 },

  /* The frame insets its scroll content `Spacing.three` each side; the deck
     climbs back out over both so the neighbouring card reaches the screen edge.
     See `SheetToneBand`, which does the same thing for the same reason. */
  bleed: { marginHorizontal: -Spacing.three },
  deck: { gap: Spacing.three, alignItems: 'flex-start' },
  /* The card and its own panel are one column. `flex-start` on the deck above
     lets each slide be its own height, so opening a set picker on one card
     grows that card's slide rather than every slide in the pack. */
  slot: { gap: Spacing.two },

  back: {
    flex: 1,
    borderWidth: 2,
    borderRadius: Radius.panel,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    overflow: 'hidden',
  },
  backBar: { position: 'absolute', left: '-10%', right: '-10%', height: 10 },
  inert: { pointerEvents: 'none' },

  /* Held to a floor so the deck does not resize under a thumb as cards turn
     over: a face-down card's one-line hint and a revealed card's two buttons
     have to occupy about the same block, or scrolling the deck would make the
     whole sheet jump every time a card landed. */
  panel: { gap: Spacing.two, minHeight: 108, paddingTop: Spacing.one },
  panelCentred: { alignItems: 'center' },
  stageBlock: { gap: Spacing.two },
  stamp: {
    gap: Spacing.half,
  },
  stampText: { maxWidth: 560 },
  refusal: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 2,
  },

  /* A COLUMN, because the panel is now as wide as the card above it rather
     than as wide as the sheet. "Add to Tennessee Titans · 4" beside "Quick sell
     8" measures past 287pt on a phone, so a row either ellipsised the set's
     name — the one word on the button worth reading — or wrapped into a ragged
     two lines that did not line up with the card's edges. */
  buttonRow: { gap: Spacing.two },
  /* The one pair that IS a row: two short words that fit side by side at any
     card width, and reading "Keep it" above "Sell for 8" would make the safe
     choice look like the primary one. */
  buttonPair: { flexDirection: 'row', gap: Spacing.two },
  button: {
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGrow: { alignSelf: 'stretch' },
  buttonPairHalf: { flex: 1, minWidth: 0 },
  sell: {
    flexDirection: 'row',
    gap: Spacing.one + 2,
    borderWidth: StyleSheet.hairlineWidth,
  },

  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 48,
  },
  setText: { flex: 1, minWidth: 0, gap: 1 },
  setPay: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },

  afterRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  after: {
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earned: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },

  measure: { maxWidth: 560 },
  dim: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
});
