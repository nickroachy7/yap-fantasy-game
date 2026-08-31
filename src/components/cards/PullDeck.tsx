/**
 * The deck: what a pack dealt you, turned over one card at a time.
 *
 * WHAT THIS WAS, AND WHAT MOVED OUT OF IT
 *
 * `PackReveal`, which was the whole of the pull — the counter row, the deck,
 * the two exits under each card, a paragraph of guidance and the way out —
 * drawn inside the packs SHEET. The pull is its own page now (`app/(app)/pull`),
 * so everything that was chrome went to the page and everything that was the
 * deck stayed here. What is left is exactly one idea: cards, face down, that
 * you move through.
 *
 * The three ideas the deck has always been built on are unchanged:
 *
 *   ONE CARD AT A TIME. The deck runs left to right and snaps, so exactly one
 *   card is in front of you. Cards start face down and turn over as they reach
 *   the middle — which makes SCROLLING the act of dealing rather than a way of
 *   reviewing something already dealt. A grid can only ever show you a result;
 *   a deck you move through has a next card in it.
 *
 *   THE CARD IS BIG. It is the one moment in this app that is purely about
 *   looking at a card, and on a page rather than in a sheet there is finally
 *   room to say so — the page hands down a height budget and the card takes as
 *   much of it as it can. See `cardHeightCap`.
 *
 *   THE DECISION IS MADE HERE, AND ON THE CARD. Most of a pack is duplicates,
 *   and the two things worth doing with a spare — sell it, or burn it into a
 *   set — are attached to the card they are about, inside its own slide. One
 *   shared panel under the deck was the first version: the buttons then belong
 *   to the carousel rather than to the card, so "sell this" is a claim about a
 *   selection you have to trust the panel got right, and swiping fast puts your
 *   thumb on a button that is mid-swap. Under the card there is nothing to get
 *   wrong.
 *
 * WHOSE STATE IS WHOSE. The deck owns the ScrollView, the measurement and the
 * turn; `useReveal` owns which cards are face up and which one is in front of
 * you, because the page's bar needs both. The deck reports where it came to
 * rest and acts on `seek`; it never decides.
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
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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
  Spacing,
  TierColors,
  Type,
  type CardTier,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PlayerCard, type PlayerCardModel } from './PlayerCard';
import { SetPickRow } from './SetPickRow';
import type { Pulled } from './PackShelf';
import type { CardActions } from './card-actions';
import type { Reveal } from './use-reveal';
import type { Disposition } from './use-pull-actions';

/** Every card is minted at the floor tier; only lineup starts move it. */
const MINT_TIER: CardTier = 'bronze';
const NEXT_TIER_LABEL = 'SILVER';

/**
 * How wide the card in front of you is.
 *
 * THE CEILING WENT UP WHEN THE SHEET WENT AWAY. In a sheet the card had a
 * counter row, a hero and a paragraph competing with it and 264 was as much as
 * it could take without becoming the only thing on screen. On a page whose only
 * subject is the card there is nothing to compete with, so the cap is the
 * card's own drawn size — `detail` is 320 — and the real limit is whichever of
 * the two axes runs out first. See `cardHeightCap`.
 *
 * THE PEEK IS THE OTHER HALF OF THE DECISION. It is the strip either side
 * showing the edges of the cards next to this one, and it is what says there IS
 * a deck without a caption saying so.
 *
 * The floor stops a 320pt-wide device squeezing the card to nothing.
 */
const CARD_MAX = 340;
const CARD_MIN = 200;
const PEEK = 104;

/** The turn. Long enough to read as a card being turned, short enough to sit through eight. */
const FLIP_MS = 420;

/** The lift that says which card you are looking at. See `RevealSlot`. */
const FOCUS_MS = 220;
const ASIDE_SCALE = 0.9;
const ASIDE_OPACITY = 0.5;

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
 * Mobile web is a real target here, not a degraded one, so the CSS is written
 * directly.
 *
 * Same shim shape as `gradient()`: a cast, because these are real CSS
 * properties that React Native's style type has no name for. Native keeps
 * `snapToInterval`, which is the thing this is a stand-in for.
 */
const WEB_SNAP: ViewStyle | null =
  Platform.OS === 'web' ? ({ scrollSnapType: 'x mandatory' } as ViewStyle) : null;
const WEB_SNAP_CHILD: ViewStyle | null =
  Platform.OS === 'web' ? ({ scrollSnapAlign: 'center' } as ViewStyle) : null;

/* ---- the deck ---------------------------------------------------------- */

export function PullDeck({
  pulled,
  silverAt,
  reveal,
  actions,
  loadingActions,
  disposed,
  kept,
  busy,
  frozen,
  error,
  onDismissError,
  onSell,
  onCommit,
  onToggleKeep,
  cardHeightCap,
}: {
  pulled: Pulled[];
  /** Career FP the next tier starts at, read from `tier_thresholds`. */
  silverAt: number;
  /** Which cards are face up, and which one is in front of you. */
  reveal: Reveal;
  /** What each card can be turned into, keyed by card_instance_id. */
  actions: Map<string, CardActions>;
  loadingActions: boolean;
  disposed: Map<string, Disposition>;
  /** The cards the bar's whole-pack sweeps must step over. */
  kept: Set<string>;
  /** The card a write is in flight for. Blocks every button on every card. */
  busy: string | null;
  /** A whole-pack sweep is running. Every per-card button waits for it. */
  frozen: boolean;
  error: string | null;
  onDismissError: () => void;
  onSell: (cardInstanceId: string) => void;
  onCommit: (cardInstanceId: string, setCode: string) => void;
  onToggleKeep: (cardInstanceId: string) => void;
  /**
   * The tallest the card may be drawn, handed down by the page.
   *
   * THE PAGE OWNS THE HEIGHT and the deck owns the width, because only the page
   * knows what else is on screen — a bar at the bottom, a rail at the top, and
   * a safe area at both ends. The card is square (`artAspect` is 1), so a
   * height budget is a width budget, and the card takes whichever of the two
   * is smaller. Without this the card sized itself off the window and the
   * bottom of it went under the bar on a short phone.
   */
  cardHeightCap: number;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const gold = TierColors[scheme].gold.accent;

  const [measured, setMeasured] = useState(0);
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
   * floor instead of the value that centres it. Calling the handler by hand
   * from the console laid it out correctly, which is what proved where the
   * fault was.
   *
   * The window is the honest fallback here: the pull page is full-bleed on
   * every platform, so the deck's box IS the window until something says
   * otherwise. `onLayout` still refines it when it fires, which is what keeps
   * this right inside the centred column on a wide browser.
   */
  const { width: windowWidth } = useWindowDimensions();
  const viewport = measured || windowWidth;

  const card = Math.max(CARD_MIN, Math.min(CARD_MAX, viewport - PEEK, cardHeightCap));
  /* The snap step. Cards are one gap apart, so the interval is the card plus
     the gap and the side inset is whatever is left over — which is what puts
     each card in the middle of the box rather than at its left edge. */
  const step = card + Spacing.three;
  const inset = Math.max(Spacing.three, (viewport - card) / 2);

  const { focusAt, seek } = reveal;

  /**
   * Where a programmatic scroll is headed, while it is still getting there.
   *
   * THE FOCUS MUST NOT FOLLOW AN ANIMATION IT ALREADY KNOWS THE END OF.
   * Pressing the pip for card 3 starts a smooth scroll that passes over cards 1
   * and 2 on the way, and every frame of it arrives here as a scroll event with
   * a different index — so the deck flicked through two other players before
   * settling, and on the way it turned both of their cards over. Which card you
   * are looking at is decided by whoever moved the deck; this ref is how a
   * press keeps that decision until its own scroll catches up.
   *
   * A ref rather than state on purpose: it changes on frames that must not
   * render, and it is read only from inside the handler that clears it.
   */
  const heading = useRef<number | null>(null);

  /* The one place the deck is moved by something other than a finger. `seek`
     carries a token as well as an index so that asking for the same card twice
     — the reader having swiped away in between — is a fresh instruction. */
  const seekToken = useRef(0);
  useEffect(() => {
    if (!seek || seek.token === seekToken.current) return;
    seekToken.current = seek.token;
    heading.current = seek.index;
    scroller.current?.scrollTo({ x: seek.index * step, animated: true });
  }, [seek, step]);

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

      focusAt(at);
    },
    [step, pulled.length, focusAt],
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
    <ScrollView
      ref={scroller}
      horizontal
      onLayout={(e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width)}
      showsHorizontalScrollIndicator={false}
      snapToInterval={step}
      decelerationRate="fast"
      /* SIZED BY ITS CONTENT, NOT BY ITS PARENT. A ScrollView's default style
         is `flex: 1`, so inside the page's centring column the deck grew to
         fill the whole stage and then laid its cards out at the top of it —
         which read as a card stuck under the rail with half a screen of black
         below it. Growing is the parent's job here; the deck is exactly as tall
         as the tallest slide in it. */
      style={[styles.strip, WEB_SNAP]}
      /* NO `disableIntervalMomentum`, and its absence is the point.
         That prop clamps every gesture to the NEXT card however hard it was
         thrown, which made an eight-card pack eight deliberate swipes with no
         way to go faster — the flick you use to skim is the flick you use to
         step, and the deck ignored the difference. Without it a gentle swipe
         still lands on the neighbour (that is what `snapToInterval` and
         `decelerationRate="fast"` are for) and a hard one carries through
         several, revealing each as it passes the middle. */
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
          revealed={reveal.revealed.has(p.card_instance_id)}
          focused={i === reveal.focus}
          index={i}
          count={pulled.length}
          spent={
            // A card that has left the collection is drawn back, not gone: the
            // deck must not resize itself under a scrolling thumb.
            !!disposed.get(p.card_instance_id) &&
            actions.get(p.card_instance_id)?.held === false
          }
          onReveal={() => {
            reveal.reveal(p.card_instance_id);
            if (i !== reveal.focus) reveal.goTo(i);
          }}
          actions={(turned) => (
            <CardActionPanel
              player={p.player_name ?? 'This card'}
              revealed={turned}
              action={actions.get(p.card_instance_id)}
              loading={loadingActions}
              became={disposed.get(p.card_instance_id)}
              kept={kept.has(p.card_instance_id)}
              busy={busy === p.card_instance_id}
              /* Every button on every card waits on a write in flight — both
                 RPCs move the one wallet, so a second one decided against a
                 balance that is about to change is the shape of a
                 double-spend. */
              locked={frozen || (busy !== null && busy !== p.card_instance_id)}
              error={busy === p.card_instance_id ? error : null}
              onDismissError={onDismissError}
              onSell={() => onSell(p.card_instance_id)}
              onCommit={(code) => onCommit(p.card_instance_id, code)}
              onToggleKeep={() => onToggleKeep(p.card_instance_id)}
            />
          )}>
          <PlayerCard model={toModel(p)} size="detail" fixedWidth={false} />
        </RevealSlot>
      ))}
    </ScrollView>
  );
}

/* ---- one slot in the deck ---------------------------------------------- */

/**
 * A card and the back it is behind, stacked, with the turn between them.
 *
 * THE FACE IS IN FLOW AND THE BACK IS OVER IT, which is what makes the slot the
 * right height without anybody measuring a card: the face lays out normally and
 * establishes the box, and the back is an `absoluteFill` over it.
 *
 * SO THE FACE IS ALWAYS MOUNTED, including while it is face down and invisible.
 * That is a screen reader announcing the player's name on a card the sighted
 * player has not turned over yet — hence `aria-hidden` while it is down.
 *
 * THE NEIGHBOURS SIT BACK. The focused slot is drawn at full size and the ones
 * either side at `ASIDE_SCALE`, faded. It is the cheapest possible version of
 * depth and it does the one job the peek alone could not: it says the card in
 * the middle is the one the buttons underneath belong to. Scale is a transform,
 * so it changes nothing about the layout and cannot move the snap points.
 */
function RevealSlot({
  width,
  tone,
  revealed,
  focused,
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
  /** This is the card in front of you. */
  focused: boolean;
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
  const lift = useSharedValue(focused ? 1 : 0);

  /**
   * The turn is FINISHED, which is a different moment from "the turn started".
   *
   * `revealed` flips the instant the card reaches the middle of the deck, and
   * the turn takes `FLIP_MS` after that. Hanging the panel off `revealed` put
   * a priced sell button directly beneath a card still showing its back and the
   * words TAP TO REVEAL — pressable, for four hundred milliseconds, on a card
   * the player had not seen.
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

  useEffect(() => {
    lift.value = withTiming(focused ? 1 : 0, {
      duration: FOCUS_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [focused, lift]);

  const liftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lift.value, [0, 1], [ASIDE_OPACITY, 1]),
    transform: [{ scale: interpolate(lift.value, [0, 1], [ASIDE_SCALE, 1]) }],
  }));

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
      <Animated.View style={liftStyle}>
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
      </Animated.View>

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
export function CardBack({
  tone,
  index,
  count,
  onPress,
}: {
  tone: string;
  index?: number;
  count?: number;
  onPress?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const label =
    index === undefined || count === undefined
      ? 'A pack, unopened.'
      : `Card ${index + 1} of ${count}, face down. Turn it over.`;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.back,
        { backgroundColor: c.surfaceSunken, borderColor: tone },
        pressed && styles.pressed,
      ]}>
      {/* Four bars, well off centre, in the page's own gold at a whisper. A
          plain field behind the mark reads as a placeholder that failed to
          load; this reads as printing. */}
      <View style={[StyleSheet.absoluteFill, styles.inert]}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.backBar, { backgroundColor: rgba(tone, 0.1), top: `${14 + i * 22}%` }]}
          />
        ))}
      </View>

      <YapMark height={44} color={tone} ink={c.surfaceSunken} />
      {onPress ? <Text style={[Type.micro, { color: c.textTertiary }]}>TAP TO REVEAL</Text> : null}
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
 * scroll with your thumb. The bar's whole-pack sweeps are staged the same way.
 *
 * THE THIRD ANSWER IS `KEEP`, AND IT IS NOT AN EXIT. The two buttons above it
 * both end with the card spent; keeping is the player saying they want this one
 * for a lineup, which is what a card is actually FOR. It could not be said here
 * before: the bar's sweeps take the whole pack, so the only way to hold one
 * card back was to decline both sweeps and clear the other seven by hand.
 *
 * IT IS DRAWN QUIETER THAN THE OTHER TWO, deliberately. It is the outcome that
 * happens anyway if you press nothing, so a third filled button competing with
 * the two that DO something would be shouting an offer to stand still. It is a
 * toggle, it costs nothing, and it can be taken back — the only control on this
 * panel that can.
 *
 * AND IT DOES NOT DISABLE THE BUTTONS ABOVE IT. Keeping answers the bar, not
 * the card: pressing `Quick sell` on a card you kept is you naming that one
 * card, which is unambiguous and needs no protecting from. See `toggleKeep`.
 */
function CardActionPanel({
  player,
  revealed,
  action,
  loading,
  became,
  kept,
  busy,
  locked,
  error,
  onDismissError,
  onSell,
  onCommit,
  onToggleKeep,
}: {
  player: string;
  revealed: boolean;
  action: CardActions | undefined;
  loading: boolean;
  became: Disposition | undefined;
  /** The player is holding this one back from the bar's whole-pack sweeps. */
  kept: boolean;
  busy: boolean;
  /** Another card is mid-write, or the whole pack is. Everything here waits. */
  locked: boolean;
  error: string | null;
  onDismissError: () => void;
  onSell: () => void;
  onCommit: (setCode: string) => void;
  onToggleKeep: () => void;
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
    return <View style={styles.panel} />;
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
  /* A card no sweep would touch anyway has nothing to be kept FROM, and a
     toggle under it would be offering to solve a problem it does not have. The
     test is the same one `planSweep` applies: could either button reach it. */
  const sweepable = !gone && (commitable.length > 0 || action?.sellable === true);

  return (
    <View style={styles.panel}>
      {/* What this card became, if anything. Kept ABOVE the buttons rather than
          replacing them, because a commit that burnt a spare copy leaves this
          one in your hand and still sellable — see `Disposition`. */}
      {/* KEPT, AND NOT YET SPENT. Below `became` rather than beside it: a
          disposition is what HAPPENED to the card and outranks a standing
          intention about it, and a card committed off a spare copy is both.
          The toggle further down still shows the flag either way. */}
      {kept && !became ? (
        <View style={styles.stamp}>
          {/* Not `c.positive`, which is the two acts' colour. Keeping is a
              position held rather than a transaction that went through. */}
          <Text style={[Type.label, { color: c.textSecondary }]}>KEEPING</Text>
          <Text style={[Type.fine, styles.stampText, { color: c.textSecondary }]}>
            {`${player} stays in your collection. Adding or selling the whole pack leaves this card out.`}
          </Text>
        </View>
      ) : null}

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
              {/* NOT "Keep it", which this said until `Keep this one` arrived
                  two buttons below. One panel cannot have two Keeps meaning
                  different things — one cancels a sale, the other holds a card
                  back from the pack buttons. This is the picker's word. */}
              <Text style={[Type.strong, { color: c.text }]}>Not now</Text>
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
            <SetPickRow
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
                /**
                 * THE PRICE IS ITS OWN ELEMENT, not the tail of the sentence,
                 * and the reason is what an ellipsis eats first. As one string,
                 * `Add to Washington Commanders · 4` overruns the card and
                 * `numberOfLines={1}` takes the END of it — so the longest club
                 * names in the league lost the gem figure and the button read
                 * `Add to Washington Comm…`. The one number on it, gone, on
                 * exactly the sets where the label is least readable.
                 */
                <>
                  <Text numberOfLines={1} style={[Type.strong, styles.grow, { color: '#17130A' }]}>
                    {commitable.length === 1
                      ? `Add to ${commitable[0].name}`
                      : /* THE COUNT IS IN THE SENTENCE, not floated to the
                           right like the price is. Every set here is priced
                           separately — `pays` follows each set's own
                           `commit_payout_pct` — so there is no single figure
                           this button could print, and a bare `2` in the slot
                           where the other state prints gems reads as two gems.
                           And it has a second job the price does not: this
                           button opens a LIST where the other one commits on
                           the tap, and "one of" is what warns you. */
                        `Add to one of ${commitable.length} sets`}
                  </Text>
                  {commitable.length === 1 ? (
                    <>
                      {/* The gem in the button's own ink rather than the tone it
                          is printed ON — gold on gold is a hole in the button. */}
                      <Gem size={10} color="#17130A" />
                      <Text style={[Type.strong, NUMERIC, { color: '#17130A' }]}>
                        {commitable[0].pays}
                      </Text>
                    </>
                  ) : null}
                </>
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
                  <Text style={[Type.strong, NUMERIC, { color: c.text }]}>{action.sellValue}</Text>
                </>
              )}
            </Pressable>
          ) : null}

          {/* THE THIRD ANSWER. Outlined rather than filled, and `Type.fine`
              rather than `Type.strong`, because it is the one control here that
              does nothing — see the note on this panel. It sits under the two
              exits because you reach for it after deciding NOT to take either. */}
          {sweepable ? (
            <Pressable
              onPress={onToggleKeep}
              /* Locked with everything else while a write is in flight. It
                 changes what the bar's buttons mean, and the bar is mid-act. */
              disabled={locked || busy}
              accessibilityRole="button"
              accessibilityState={{ selected: kept, disabled: locked || busy }}
              accessibilityLabel={
                kept
                  ? `Stop keeping ${player}. Adding or selling the whole pack will include this card again.`
                  : `Keep ${player}. Adding or selling the whole pack will leave this card alone.`
              }
              style={({ pressed }) => [
                styles.button,
                styles.keep,
                {
                  backgroundColor: kept ? c.backgroundElement : 'transparent',
                  borderColor: kept ? c.borderStrong : c.border,
                },
                pressed && styles.pressed,
                (locked || busy) && styles.dim,
              ]}>
              <Text
                numberOfLines={1}
                style={[
                  kept ? Type.strong : Type.fine,
                  { color: kept ? c.text : c.textSecondary },
                ]}>
                {/* The tick is the state. Drawn as a character for the same
                    reason the close glyph on `/pull` is: it needs no legend. */}
                {kept ? '✓  Keeping this one' : 'Keep this one'}
              </Text>
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

const styles = StyleSheet.create({
  strip: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
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
     over: a face-down card's empty panel and a revealed card's two buttons have
     to occupy about the same block, or scrolling the deck would make the page
     jump every time a card landed. */
  panel: { gap: Spacing.two, minHeight: 104, paddingTop: Spacing.one },
  panelCentred: { alignItems: 'center' },
  stageBlock: { gap: Spacing.two },
  stamp: { gap: Spacing.half },
  stampText: { maxWidth: 560 },
  refusal: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 2,
  },

  /* A COLUMN, because the panel is as wide as the card above it rather than as
     wide as the page. "Add to Tennessee Titans · 4" beside "Quick sell 8"
     measures past 287pt on a phone, so a row either ellipsised the set's name —
     the one word on the button worth reading — or wrapped into a ragged two
     lines that did not line up with the card's edges. */
  buttonRow: { gap: Spacing.two },
  /* The one pair that IS a row: two short words that fit side by side at any
     card width, and reading "Not now" above "Sell for 8" would make the safe
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
  buttonGrow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: Spacing.one + 2,
  },
  /* The label takes what is left after the price, and only the label shrinks. */
  grow: { flexShrink: 1, minWidth: 0 },
  buttonPairHalf: { flex: 1, minWidth: 0 },
  sell: {
    flexDirection: 'row',
    gap: Spacing.one + 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  /* Shorter and thinner than the two exits above it, which is the whole of how
     it says "this is the quiet one". Still 40pt, so it is a target a thumb can
     land on. */
  keep: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
    paddingVertical: Spacing.one + 2,
  },

  measure: { maxWidth: 560 },
  dim: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
});
