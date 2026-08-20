/**
 * The frame around a player profile when it is presented over the app.
 *
 * TWO PRESENTATIONS, ONE OBJECT
 *
 * On a phone the route is a native page sheet (`presentation: 'modal'`): the
 * platform draws the rounded top edge and owns the drag-to-dismiss gesture, so
 * this component does not reimplement either — a hand-rolled dismiss would be a
 * worse copy of one the device already does perfectly.
 *
 * It does draw two things the platform will not. The SURFACE, because a page
 * sheet separates itself from what it covers by dimming it and this app's page
 * is #000, so there was nothing to dim (see `surfaceSheet`) — and on top of it
 * the `tone` wash, which is what actually marks the sheet's top edge. And a
 * GRABBER, because `sheetGrabberVisible` is ignored on anything but
 * `formSheet`, which is the presentation this app deliberately moved off.
 *
 * The grabber REPLACES the ✕ on iOS rather than joining it: the gesture is
 * real there, so the bar is a signpost to something that exists. Android and
 * web have no such gesture and keep the button — see `draggable`.
 *
 * On web the route is a `transparentModal`, which renders over the page and
 * paints nothing, so the surface is ours to draw — and it is drawn TWO ways,
 * on the same breakpoint and by the same rule as `SwapSheet`:
 *
 *   wide (>=900)  a centred dialog capped at `SheetDialogWidth`. A full-width
 *                 bar sliding up under a 1400pt browser window is a phone
 *                 gesture wearing a desktop's clothes, and the pointer is
 *                 nowhere near the bottom edge anyway.
 *   narrow        a bottom sheet, anchored to the edge the thumb is already at.
 *                 Mobile web is a real target here, not a degraded case: the
 *                 deployed site is the plan's kickoff insurance and testers
 *                 will open it on phones before TestFlight exists.
 *
 * WHY THE TITLE IS NOT DRAWN UNTIL YOU SCROLL
 *
 * Both profiles open with a hero carrying the player's name at full size. A
 * sticky header printing the same name 20pt below it says the name twice on the
 * surface where vertical space is scarcest — but simply deleting the header
 * title is worse, because after a screen of game log there is then nothing at
 * all saying whose page this is.
 *
 * So the title behaves the way a large title does everywhere else: absent while
 * its full-size counterpart is on screen, faded in once that has scrolled under
 * the header. The threshold is a little past the name's own height, so the two
 * never both read as headings at once.
 *
 * WHY THE BACKDROP IS A SIBLING, NOT A PARENT
 *
 * A Pressable WRAPPING the card renders a <button> containing <button>s on
 * web, which React rejects at runtime. `SwapSheet`, `DropdownChip` and
 * `ConfirmDialog` all hit this; the fix is the same one — the backdrop is laid
 * behind the card, not around it.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Colors,
  SheetCorner,
  SheetDialogInset,
  SheetDialogWidth,
  Spacing,
  Type,
} from '@/constants/theme';
import { rgba } from '@/components/ui/gradient';
import { useIsWide } from '@/components/shell/useResponsive';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function PlayerSheetFrame({
  title,
  subtitle,
  onClose,
  closeLabel = 'Close player profile',
  tone,
  children,
}: {
  /** The player's name once known; undefined while loading. */
  title?: string;
  subtitle?: string;
  onClose: () => void;
  /**
   * What the close control announces. The frame is shared by the player
   * profile and the card profile, and a screen reader saying "close player
   * profile" on a card is simply wrong — the two are deliberately different
   * objects everywhere else in the app.
   */
  closeLabel?: string;
  /**
   * A colour to wash the top of the sheet with — the card profile's tier, the
   * player profile's club.
   *
   * IT IS THE FRAME'S AND NOT THE HERO'S, for two reasons. The hero sits inside
   * a scroll container that is inset `Spacing.three` each side, so a background
   * drawn there stops short of the sheet's edges and reads as a coloured card
   * laid on the header rather than as the header. And the band the eye actually
   * takes in includes the grabber and the title bar above the hero, which the
   * hero cannot reach at all.
   *
   * Undefined draws nothing, which is what the set checklist gets: it is not
   * about a player and has neither a club nor a tier to be the colour of.
   */
  tone?: string | null;
  children: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { bottom } = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  /* A narrow BROWSER window gets the bottom sheet, not the dialog. There is no
     native sheet to hand on web at any width, and mobile web is a real target
     here — the deployed site is the plan's kickoff insurance. Same breakpoint
     and same rule as SwapSheet, so the two cannot diverge. */
  const wide = useIsWide();

  /**
   * Where the sheet can actually be dragged away, which is what decides whether
   * a grabber is a signpost or a lie.
   *
   * iOS's page sheet has the gesture built in and nothing on screen says so.
   * Android's `modal` is not a bottom sheet and has no drag; web has no drag at
   * any width. So iOS gets the bar INSTEAD of the ✕, and everywhere else keeps
   * the ✕ because it is the only way out that exists. The web narrow sheet
   * shows the bar too, as it always has — decoration there, marking "this came
   * from the bottom", with the ✕ still doing the work.
   */
  const draggable = Platform.OS === 'ios' && !isWeb;
  const showClose = !draggable;
  const showHandle = draggable || (isWeb && !wide);

  /* Only ever flips twice, so this is a cheap piece of state rather than a
     per-frame re-render: the comparison is done on every scroll event but
     setState is called only on a crossing. */
  const [titleShown, setTitleShown] = useState(false);
  /* useState, not useRef: reading `.current` during render trips React 19's
     refs rule, and the lazy initialiser gives the same once-per-mount value. */
  const [titleFade] = useState(() => new Animated.Value(0));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const past = e.nativeEvent.contentOffset.y > TITLE_REVEAL_AT;
    if (past !== titleShown) setTitleShown(past);
  };

  useEffect(() => {
    Animated.timing(titleFade, {
      toValue: titleShown ? 1 : 0,
      duration: 140,
      /* react-native-web drives opacity through the JS animator and warns when
         asked for the native one. */
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [titleShown, titleFade]);

  /* Escape closes it. `onRequestClose` covers Android's back button and nothing
     else — react-native-web does not map the key — so without this a keyboard
     user on a desktop browser has no way out but the mouse. Same omission
     SwapSheet had to fix. */
  useEffect(() => {
    if (!isWeb) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isWeb, onClose]);

  const titleText = (
    <>
      {title ? (
        <Text numberOfLines={1} style={[Type.section, { color: c.text }]}>
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text numberOfLines={1} style={[Type.micro, { color: c.textSecondary }]}>
          {subtitle}
        </Text>
      ) : null}
    </>
  );

  /**
   * The bar as it is on web and Android: IN FLOW, always occupying its height,
   * with only the title fading.
   *
   * `collapsable={false}` is load-bearing on iOS, not a hint. React Native
   * drops layout-only Views from the native tree as an optimisation, hoisting
   * their children into the parent. react-native-screens' sheet presentations
   * count their subviews to decide how to lay out, and expect at most two — a
   * header and a scroll view — so once this View was collapsed the sheet saw
   * six loose subviews, gave the header no height, and painted it on top of the
   * scrolling content. It looked like three separate bugs (overlapping text,
   * content past the sheet edge, a dead top area) and was this one flag. The
   * library says so out loud: "FormSheet with ScrollView expects at most 2
   * subviews. Got 6".
   *
   * It stays in flow here because it holds the ✕, which is the only way out on
   * these platforms and must never be absent. iOS has the grabber instead and
   * gets the floating version below.
   */
  const header = (
    <View collapsable={false} style={[styles.header, { borderBottomColor: c.border }]}>
      {/* `pointerEvents="none"` so the invisible title never eats a tap meant
          for the sheet behind it. Kept mounted rather than conditionally
          rendered: mounting on scroll would resize the header mid-gesture. */}
      <Animated.View pointerEvents="none" style={[styles.headerText, { opacity: titleFade }]}>
        {titleText}
      </Animated.View>

      {!showClose ? null : (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          hitSlop={10}
          style={({ pressed }) => [
            styles.close,
            { backgroundColor: pressed ? c.backgroundSelected : c.backgroundElement },
          ]}>
          <Text style={[styles.closeGlyph, { color: c.textSecondary }]}>✕</Text>
        </Pressable>
      )}
    </View>
  );

  /**
   * The bar as it is on iOS: OVER the content, taking no space until it appears.
   *
   * The in-flow version reserved its full height from the moment the sheet
   * opened, and on iOS there is now nothing in it to justify that — the ✕ went
   * when the grabber arrived, so at rest it was ~50pt of blank sheet between the
   * grabber and the player's name, on the surface where vertical space is
   * scarcest. Floating it costs nothing at rest and behaves the way a large
   * title does everywhere else on the platform.
   *
   * IT PAINTS ITS OWN BACKGROUND, in two layers, and they are not decoration —
   * without them the content scrolls visibly under the title. The pair is the
   * sheet's fill with the tone at the wash's PEAK laid over it, which is exactly
   * what the wash itself is doing at this height: the wash holds flat for its
   * first 40% (~120pt) and this bar ends around 65, so a flat fill at peak and
   * the gradient behind it composite to the same colour. That is why the bar can
   * appear over a coloured header without drawing a seam across it.
   *
   * The whole thing fades, background included, so at rest it is not there at
   * all. `pointerEvents="none"` throughout — there is no control in it on this
   * platform, and an invisible bar must not eat taps meant for the hero.
   */
  const floatingHeader = (
    <Animated.View
      collapsable={false}
      pointerEvents="none"
      style={[styles.headerFloat, { opacity: titleFade }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surfaceSheet }]} />
      {tone ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(tone, TONE_PEAK) }]} />
      ) : null}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={styles.headerText}>{titleText}</View>
      </View>
    </Animated.View>
  );

  /**
   * `textTertiary`, not `borderStrong`, and that is a legibility fix rather
   * than a taste one.
   *
   * The grabber is the only thing telling an iOS reader this sheet can be
   * dragged away — the ✕ went when it arrived — so it is the one mark here that
   * must not be subtle. At `borderStrong` (#34373C) it was four levels off the
   * sheet's own fill and effectively disappeared once the tone wash tinted the
   * area behind it. `textTertiary` (#7E8289) is roughly where UIKit draws its
   * own grabber on a dark sheet, and the same value the player silhouette
   * already uses for a non-text mark.
   */
  const handle = showHandle ? (
    <View style={[styles.handleBar, styles.handleFlow, { backgroundColor: c.textTertiary }]} />
  ) : null;

  /* Absolute, and drawn AFTER the floating header so it sits on top of it: the
     grabber is the dismiss affordance and must stay visible whether or not the
     title bar has appeared. */
  const floatingHandle = showHandle ? (
    <View pointerEvents="none" style={styles.handleFloat}>
      <View style={[styles.handleBar, { backgroundColor: c.textTertiary }]} />
    </View>
  ) : null;

  const scroller = (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[
        styles.content,
        // The native sheet stops short of the home indicator on its own; the
        // web dialog has no safe area to respect.
        { paddingBottom: (isWeb ? 0 : bottom) + Spacing.four },
        /* With the header floating, the grabber floats too, so the content has
           to reserve the space it used to occupy in flow or the hero starts
           underneath it. */
        draggable && { paddingTop: HANDLE_BLOCK + Spacing.three },
      ]}
      onScroll={onScroll}
      scrollEventThrottle={32}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );

  if (!isWeb) {
    /**
     * The page sheet already IS the surface — draw on it, do not draw another.
     *
     * The sheet's own colour is the only separation cue here, and it is enough.
     *
     * There WAS a 1pt outline traced along UIKit's corner — measured, because
     * the platform will neither report nor let us set that curve on a page
     * sheet. It is gone, and what replaced it is the `tone` wash: a coloured
     * top edge says where the sheet begins far more plainly than a grey
     * hairline did, and against a warm wash the hairline read as a cool line
     * fighting it. Every sheet in the app now carries a tone — a tier, a club
     * or a position — so there is no case left where the edge goes unmarked.
     *
     * If a sheet ever opens with no tone, give it one rather than reinstating
     * the outline. The outline cost a measured curve, a device-dependent radius
     * and an SVG dependency, and the wash costs a colour the screen already
     * knows.
     */
    return (
      <View collapsable={false} style={[styles.sheetRoot, { backgroundColor: c.surfaceSheet }]}>
        {scroller}
        {floatingHeader}
        {floatingHandle}
      </View>
    );
  }

  /* The construction below is SwapSheet's, deliberately copied rather than
     improved on. The first version wrapped the card in an extra View and put
     `pointerEvents="box-none"` on the centring box — react-native-web
     implements that as `pointer-events: none` on the element and only restores
     `auto` on children that ask for it, so the whole subtree went dead: the
     backdrop, the close button and Escape all stopped working at once, and it
     looked like three unrelated bugs. One container that is BOTH the backdrop
     and the centring box, with the dismiss target laid behind the card, has
     none of that. */
  return (
    <View
      style={[styles.backdrop, wide ? styles.backdropCentre : styles.backdropBottom]}>
      {/* Behind the card, never around it — see the note at the top. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
      />
      <View
        style={[
          styles.card,
          wide ? styles.dialog : styles.bottomSheet,
          { backgroundColor: c.surfaceSheet, borderColor: c.borderStrong },
        ]}>
        {/* Decoration — this sheet is not draggable on web — but it is the
            standard mark for "this came from the bottom and goes back there",
            and without it the panel reads as a page. Same call as SwapSheet.
            `showHandle` already knows it is web-narrow only. */}
        {handle}
        {header}
        {scroller}
      </View>
    </View>
  );
}

/**
 * The coloured band behind a sheet's identity block, ending in a hard edge at
 * the tabs.
 *
 * IT IS A BACKGROUND INSIDE THE SCROLL VIEW, not an overlay pinned to the
 * sheet, and that is forced by the hard edge. As a fixed overlay the colour
 * stopped at a chosen height, which lines up with the tab rule at rest and at
 * no other moment — scroll a pixel and the tabs move while the colour does not,
 * and the "cut at the line" becomes a band floating across the content. Wrapping
 * the hero and the tabs makes the edge the tab rule BY CONSTRUCTION, at every
 * scroll position, because it is the same box.
 *
 * THE NEGATIVE MARGINS ARE THE POINT. The scroll container insets its content
 * `Spacing.three` each side and clears the grabber at the top, so a background
 * drawn on a child stops short of the sheet's edges and reads as a coloured
 * card laid on the header rather than as the header. The band pulls back out to
 * the edges and pushes its padding back in, which is why the numbers here have
 * to be the container's own — they are, and that is why this lives in this file
 * rather than in the routes that use it.
 *
 * FLAT, not a gradient. A fade has to end somewhere and the whole point is that
 * this one ends on a rule; a gradient reaching zero at the same line would just
 * be a weaker band with a soft edge nobody asked for.
 */
export function SheetToneBand({ tone, children }: { tone?: string | null; children: ReactNode }) {
  const draggable = Platform.OS === 'ios';
  /* Clears whatever the scroll content is inset by, so the band reaches the
     top of the sheet — on iOS that includes the floating grabber's block. */
  const top = (draggable ? HANDLE_BLOCK : 0) + Spacing.three;

  return (
    <View
      style={[
        styles.band,
        { marginTop: -top, paddingTop: top },
        tone ? { backgroundColor: rgba(tone, TONE_PEAK) } : null,
      ]}>
      {children}
    </View>
  );
}

/**
 * How far the content scrolls before the header title appears.
 *
 * A little past the hero name's own line height, so the full-size name is
 * genuinely leaving the viewport before its small copy arrives — crossing early
 * puts two headings on screen at once, which is the thing this exists to avoid.
 */
const TITLE_REVEAL_AT = 44;

/**
 * How far down the sheet the wash runs, and how strong it starts.
 *
 * 300 reaches from the grabber to just under the identity block — everything
 * above the tabs on a phone — so the colour ends where the page stops being
 * about who this is and starts being about numbers. The wash holds its peak
 * through the first 40% of that (see `wash`), which is the ~120pt covering the
 * title bar and the name rather than the empty bar alone.
 *
 * 0.20 is set against the NORMALISED club colours rather than the tier accents,
 * because that is the harder case: `teamWash` forces every club to one
 * lightness so a single peak has to work for all thirty-two, where the four
 * tier accents could each have been tuned. Tiers ride the same number so the
 * two pages read as one treatment.
 */
/** Clearance above the grabber, and the height of the block it occupies. */
const HANDLE_TOP = 5;
const HANDLE_BLOCK = HANDLE_TOP + 5 + Spacing.one;

const TONE_PEAK = 0.2;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /**
   * `height: '100%'`, not just `flex: 1`.
   *
   * A sheet sizes itself to its presentation, and react-native-screens does not
   * always hand the screen's root view a definite height — so `flex: 1` alone
   * can resolve against nothing and the root measure ZERO. The children still PAINT, which
   * is what made this so confusing to look at: the header rendered on top of
   * the scroll content instead of above it, and the content ran past the
   * sheet's own edge. It reads as three unrelated glitches and is one missing
   * height.
   */
  sheetRoot: { flex: 1, height: '100%' },
  band: {
    marginHorizontal: -Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  backdropBottom: { justifyContent: 'flex-end' },
  backdropCentre: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SheetDialogInset,
  },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  /* Tall, but not the whole window: leaving the page visible above it is the
     entire reason this is a sheet and not a route. */
  bottomSheet: {
    width: '100%',
    maxHeight: '92%',
    borderTopLeftRadius: SheetCorner,
    borderTopRightRadius: SheetCorner,
    borderBottomWidth: 0,
  },
  dialog: { width: '100%', maxWidth: SheetDialogWidth, maxHeight: '100%', borderRadius: SheetCorner },
  /**
   * Sized to UIKit's own grabber (36x5, 5pt down) rather than to the 36x4 the
   * web sheet used, because on iOS it sits next to the real thing in every
   * other app on the device and a bar that is nearly the system's reads as a
   * mistake. Web keeps the same object; one bar, one meaning.
   */
  handleBar: { width: 36, height: 5, borderRadius: 2.5, alignSelf: 'center' },
  /** In flow, on the web sheet: the margins are the block's height. */
  handleFlow: { marginTop: HANDLE_TOP, marginBottom: Spacing.one },
  /** Floating, on iOS: same geometry, taken out of the layout. */
  handleFloat: { position: 'absolute', top: HANDLE_TOP, left: 0, right: 0 },
  headerFloat: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: HANDLE_BLOCK },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, gap: 2 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: { fontSize: 13, fontWeight: '700', lineHeight: 16 },
  content: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
});
