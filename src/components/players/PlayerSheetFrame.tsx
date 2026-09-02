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
 * WHAT ELSE THE BAR CAN HOLD
 *
 * The same argument applies to a CONTROL, and more sharply: the set checklist's
 * filters sat above a grid of thirty cards, so from the second row down they
 * were somewhere you had to scroll back to. `pinned` puts that row in the bar
 * on the same terms the title takes — it appears when the one in the content
 * has gone under, and it is the same row rather than a copy of it, because the
 * screen that owns the state draws both. See `pinned` and `pinnedAt`.
 *
 * WHY THE BACKDROP IS A SIBLING, NOT A PARENT
 *
 * A Pressable WRAPPING the card renders a <button> containing <button>s on
 * web, which React rejects at runtime. `SwapSheet`, `DropdownChip` and
 * `ConfirmDialog` all hit this; the fix is the same one — the backdrop is laid
 * behind the card, not around it.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewProps,
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
  dismissible = true,
  footerGlass = false,
  tone,
  pinned,
  pinnedAt,
  footer,
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
   * Whether a drag can throw this sheet away. See `dragCloses`.
   *
   * TRUE EVERYWHERE BUT A NESTED VIEW. Pass false while the sheet is showing
   * something a back row can return from, so that pulling down and pressing ‹
   * are not two gestures doing opposite things. The ✕ appears in the grabber's
   * place, so there is still one way out and it is unambiguous.
   */
  dismissible?: boolean;
  /**
   * The footer draws its own material — see `GlassBar`.
   *
   * The slot keeps the safe-area inset and gives up the fill and the rule. It
   * is a flag rather than something inferred from the node because a frame
   * cannot look inside a child to find out what it is made of, and guessing
   * wrong in either direction leaves a visible second bar.
   */
  footerGlass?: boolean;
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
  /**
   * A row that TAKES OVER from one in the content once that row has scrolled
   * under the bar — the set checklist's filters, which are the only control on
   * that sheet and used to be unreachable from the moment the grid began.
   *
   * It is drawn inside the same block as the title, which is what puts it under
   * the `tone` wash rather than beside it: the coloured band a reader still
   * sees after the hero has gone now runs down over the filters instead of
   * stopping at a line above them.
   *
   * Undefined draws nothing and costs nothing, which is what every sheet but
   * the checklist gets.
   */
  pinned?: ReactNode;
  /**
   * The content offset past which `pinned` is worth showing — the bottom of the
   * row it stands in for, measured by whatever drew it.
   *
   * WITHOUT IT the row would appear at the title's own threshold, which is 44pt
   * into a sheet whose hero is ten times that: the pinned filters would sit
   * above a screen of hero, and then a second identical row would scroll up to
   * meet them. Handing the offset over is what makes this a takeover rather
   * than a duplicate. Omitted, it falls back to the title's threshold.
   */
  pinnedAt?: number;
  /**
   * A bar pinned to the bottom of the sheet, below the scroll rather than
   * inside it.
   *
   * FOR AN ACTION THE PAGE IS ABOUT, and only that. A sheet several screens
   * long puts its own primary button out of reach the moment you scroll — the
   * set checklist's submit bar sat above a 29-card grid, so ticking the third
   * card scrolled away the button that commits all three. Pinned, it is
   * reachable at any offset. It is the same argument `pinned` above makes for
   * the filters, at the other end of the sheet.
   *
   * THE SLOT OWNS THE CHROME: the fill, the rule above it and the home
   * indicator's inset are drawn here, once, so the two pinned bars cannot
   * drift apart. What is passed in is the controls alone.
   *
   * PASS NOTHING RATHER THAN AN EMPTY NODE. A component that renders null still
   * arrives as a truthy element, so the bar would draw around it and pin an
   * empty strip to the bottom of the sheet — decide at the caller whether there
   * is an action at all.
   */
  footer?: ReactNode;
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
  /**
   * WHETHER A DRAG CAN ACTUALLY TAKE THIS SHEET AWAY RIGHT NOW.
   *
   * Separate from `draggable`, which is about the PRESENTATION — whether this
   * platform's sheet is the kind that comes up from an edge with a bar on it,
   * and therefore how the header is laid out. This is about the GESTURE, and a
   * caller can turn it off for a while without the sheet changing shape.
   *
   * `ContestSheet` is why it exists. That sheet holds a stack of views, and on
   * any view but the first there are two ways out pointing at different places:
   * a back row that goes up one level, and a drag that throws the whole thing
   * away. A reader on a contest's page pulling down to get back to the lobby
   * lost the lobby as well — the two gestures read as one and did opposite
   * things, which is the conflict the flag closes.
   *
   * THE GRABBER GOES WITH IT, and the ✕ arrives to replace it. A handle that
   * does not move is exactly the lie this file already refuses to draw on
   * Android, and a sheet with no way out at all would be worse than either.
   */
  const dragCloses = draggable && dismissible;
  const showClose = !dragCloses;

  /**
   * Whether the bar is taken OUT of the layout and drawn over the content.
   *
   * It used to mean "iOS", and the web bottom sheet paid for that: its handle
   * and title bar sat in flow above the scroller, painted on `surfaceSheet`, so
   * the tone wash — which lives inside the scroll content — began BELOW them.
   * The sheet opened with a strip of undressed dark grey above the colour,
   * where the phone app has the wash running to the very top edge. It read as a
   * header bolted onto a coloured panel rather than as a coloured sheet.
   *
   * The narrow web sheet floats for the same reason iOS does, and gets the same
   * result: the scroller starts at the top of the card, the band's negative
   * margin reaches the corners, and the bar washes over it.
   *
   * The WIDE dialog keeps its bar in flow. It is a centred panel with a title
   * and a close button, not a sheet dragged up from an edge, and there is no
   * top edge for a wash to mark.
   */
  const floats = draggable || (isWeb && !wide);
  /* The ✕ moves out of the bar when the bar floats: the bar is invisible at
     rest (`titleFade` is 0) and the only way out must not be. It is drawn as
     its own floating element instead, above everything. */
  const closeInBar = showClose && !floats;
  const closeFloating = showClose && floats;

  /* Only ever flips twice, so this is a cheap piece of state rather than a
     per-frame re-render: the comparison is done on every scroll event but
     setState is called only on a crossing. */
  const [titleShown, setTitleShown] = useState(false);
  /* The same, for the row that takes over from one in the content. It crosses
     at its own offset, much further down, and never at the title's. */
  const [pinnedShown, setPinnedShown] = useState(false);
  /* useState, not useRef: reading `.current` during render trips React 19's
     refs rule, and the lazy initialiser gives the same once-per-mount value. */
  const [titleFade] = useState(() => new Animated.Value(0));

  /**
   * The title bar's own height, measured rather than guessed, and only the bar:
   * the pinned row is a sibling of it precisely so that revealing the row
   * cannot change the number the reveal is decided by.
   *
   * It matters because on iOS this bar FLOATS over the content, so a row is out
   * of sight a bar's height before it reaches the top of the window. Measuring
   * is what keeps the takeover on the right pixel across text sizes.
   */
  const [barHeight, setBarHeight] = useState(0);
  /**
   * How tall a FLOATING footer is, so the scroller can end above it.
   *
   * Zero until measured, which is one frame of the last row sitting under the
   * bar on first paint. Reserving a guess instead would be a jump on every
   * open, and the guess would be wrong the moment a caller's bar grows a second
   * line.
   */
  const [footerHeight, setFooterHeight] = useState(0);

  /**
   * DRAG-TO-DISMISS, FOR THE NARROW WEB SHEET ONLY.
   *
   * iOS has this from the platform and Android's `modal` is not a bottom sheet,
   * so this is the one presentation that looked draggable and was not: it comes
   * up from the bottom edge with a grabber on it, and the grabber was decoration
   * admitted as such in a comment. A handle that does nothing is worse than no
   * handle, because it is the mark that means "pull me".
   *
   * `PanResponder` rather than react-native-gesture-handler: the app has no
   * `GestureHandlerRootView` anywhere and adding one for a single web sheet is a
   * root-level change to satisfy a leaf. PanResponder is in React Native itself,
   * react-native-web implements it over pointer events, and this file already
   * animates with `Animated`.
   *
   * `useNativeDriver: false` throughout, because there is no native driver on
   * web — passing true only earns a console warning on every drag.
   *
   * THE GESTURE IS OWNED BY THE TOP STRIP, not the whole card. A responder on
   * the card competes with the ScrollView for every vertical touch, and the
   * usual fix — only drag when the list is scrolled to the top — means holding
   * scroll offset in a ref and getting it wrong at the boundary. The strip is
   * the grabber's own area, which is the part a reader reaches for anyway.
   */
  const [dragY] = useState(() => new Animated.Value(0));
  const [cardHeight, setCardHeight] = useState(0);
  const canDrag = isWeb && !wide && dismissible;

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
          /* Off the bottom of its own height, so the card is GONE rather than
             merely low when `onClose` unmounts it. Falls back to a generous
             constant if the layout has not reported a height yet. */
          toValue: cardHeight || 900,
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
    [dragY, cardHeight, onClose],
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
         * ONE SETTLE, ON EVERY WAY THE GESTURE CAN END.
         *
         * `onPanResponderEnd` fires for a release AND for a termination, and
         * the other two are kept because a responder that ends without settling
         * leaves the sheet parked halfway down the screen with the app behind
         * it — the single worst state this can be in, and unrecoverable without
         * a reload. Three routes to the same idempotent function is cheap
         * insurance against exactly that.
         */
        onPanResponderEnd: (_e, g) => settle(g.dy, g.vy),
        onPanResponderRelease: (_e, g) => settle(g.dy, g.vy),
        /* An interrupted gesture — the pointer leaving the window mid-drag, or
           another responder taking over — puts the sheet back rather than
           leaving it stranded. No distance is passed, so it always springs. */
        onPanResponderTerminate: () => settle(0, 0),
      }),
    [dragY, settle],
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const past = y > TITLE_REVEAL_AT;
    if (past !== titleShown) setTitleShown(past);

    if (pinned) {
      /* The floating bar covers the top of the content; the in-flow one sits
         above it and covers nothing. So the row it replaces is gone a bar
         earlier on iOS than it is anywhere else. */
      const covered = draggable ? HANDLE_BLOCK + barHeight : 0;
      const at = pinnedAt === undefined ? TITLE_REVEAL_AT : pinnedAt - covered;
      const on = y > at;
      if (on !== pinnedShown) setPinnedShown(on);
    }
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
  const bar = (
    <View
      onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
      style={[
        styles.header,
        /* The rule belongs to the BOTTOM of the block, wherever that now is.
           With a pinned row under it, a line here would draw a second edge
           across the middle of one band. */
        { borderBottomColor: pinnedShown ? 'transparent' : c.border },
      ]}>
      {/* `pointerEvents="none"` so the invisible title never eats a tap meant
          for the sheet behind it. Kept mounted rather than conditionally
          rendered: mounting on scroll would resize the header mid-gesture. */}
      <Animated.View pointerEvents="none" style={[styles.headerText, { opacity: titleFade }]}>
        {titleText}
      </Animated.View>

      {!closeInBar ? null : (
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
   * The takeover row, under the title and inside the same band.
   *
   * MOUNTED ON THE CROSSING, not kept and faded, and that is the whole
   * behaviour rather than a shortcut past an animation. The band is drawn by
   * the block this sits in, so a row held at zero opacity is a row of EMPTY
   * COLOUR hanging under the title — which is exactly what a reader sees during
   * the handover, when the inline row is halfway under the bar and its
   * replacement has not arrived. Mounting it makes the band's height and its
   * contents the same fact.
   *
   * The title fades because it replaces nothing. This replaces something, and
   * arrives at the moment that thing is gone.
   */
  const pinnedRow = pinned && pinnedShown ? (
    <View style={[styles.pinned, { borderBottomColor: c.border }]}>{pinned}</View>
  ) : null;

  /** The bar as it is on web and Android: IN FLOW, always occupying its height. */
  const header = (
    <View collapsable={false}>
      {bar}
      {pinnedRow}
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
      /* `box-none` once the pinned row is live, so the row inside it can be
         pressed while the bar itself still lets nothing through. Fully `none`
         at rest, as it always was: there is no control in it then. */
      pointerEvents={pinnedShown ? 'box-none' : 'none'}
      style={[styles.headerFloat, { opacity: titleFade }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surfaceSheet }]} />
      {tone ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(tone, TONE_PEAK) }]} />
      ) : null}
      {/* The two fills above are `absoluteFill`, so whatever this block grows to
          hold is washed with it: the colour runs down over the filters rather
          than stopping at a line above them. */}
      {bar}
      {pinnedRow}
    </Animated.View>
  );

  /**
   * `textTertiary`, not `borderStrong`, and that is a legibility fix rather
   * than a taste one.
   *
   * The grabber is the only thing telling an iOS reader this sheet can be
   * dragged away — the ✕ went when it arrived — so it is the one mark here that
   * must not be subtle. On the narrow web sheet it now marks a real gesture
   * too, and is drawn inside the strip that owns it rather than here. At `borderStrong` (#363636) it was four levels off the
   * sheet's own fill and effectively disappeared once the tone wash tinted the
   * area behind it. `textTertiary` (#808080) is roughly where UIKit draws its
   * own grabber on a dark sheet, and the same value the player silhouette
   * already uses for a non-text mark.
   */
  /* Absolute, and drawn AFTER the floating header so it sits on top of it: the
     grabber is the dismiss affordance and must stay visible whether or not the
     title bar has appeared. */
  const floatingHandle = dragCloses ? (
    <View pointerEvents="none" style={styles.handleFloat}>
      <View style={[styles.handleBar, { backgroundColor: c.textTertiary }]} />
    </View>
  ) : null;

  /**
   * The ✕, floating, for the narrow web sheet.
   *
   * Drawn separately from the bar because the bar fades in on scroll and this
   * must not: on web the drag is a nicety and the button is the guarantee. It
   * is rendered after the floating header AND after the grabber so it takes its
   * own taps back from both.
   */
  const floatingClose = closeFloating ? (
    <View pointerEvents="box-none" style={styles.closeFloat}>
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
    </View>
  ) : null;

  /**
   * The bar itself: the fill, the rule and the safe area that `footer` promises
   * its callers, drawn once here.
   *
   * `surfaceSheet` rather than a transparent strip, because content scrolls
   * UNDER it — the same reason the floating header paints its own background.
   * No tone: the wash marks the top of the sheet, and a coloured bar at the
   * bottom would read as a second header.
   */
  const footerBar = footer ? (
    <View
      collapsable={false}
      onLayout={footerGlass ? (e) => setFooterHeight(e.nativeEvent.layout.height) : undefined}
      style={[
        styles.footer,
        /**
         * A GLASS FOOTER FLOATS OVER THE SCROLLER; A SOLID ONE SITS UNDER IT.
         *
         * This is the whole difference between a material and a strip, and
         * getting it wrong produces exactly the bug it was reported as: the
         * bottom of the page went black. A footer that is a SIBLING of the
         * scroller in a column has nothing behind it — the content stops where
         * the footer starts — and Liquid Glass with nothing passing under it
         * renders as flat grey. `TabBarGlass` says this about its own first
         * attempt and the sentence transfers word for word: "the material only
         * exists where content passes under it."
         *
         * So it is lifted out of the flow and the scroller is given its height
         * back as padding, which is what the floating tab bar does to the scene
         * underneath it. The list can still be scrolled clear of the bar, and
         * while it is under there the glass has something to refract.
         */
        footerGlass && styles.footerFloat,
        footerGlass && styles.footerGlass,
        /* GLASS BRINGS ITS OWN EVERYTHING. A floating bar draws its own
           material, its own outline and its own scrim over the content behind
           it — so the solid fill and the hairline this slot normally supplies
           would sit BEHIND it as a second, squarer bar with a line on top,
           which is exactly what a floating object must not have under it. The
           safe-area inset is still the frame's: the caller is not the one who
           knows whether this sheet has a home indicator to clear. */
        /* NO INSET HERE FOR GLASS. The home indicator's clearance has to sit
           INSIDE the bar's own box, or the scrim stops at the bar and the strip
           below it is transparent — content scrolling under would show in the
           gap between the glass and the screen's edge. The caller passes it to
           `GlassBar` as `bottomInset` instead, where the wrap grows by it and
           the gradient covers it. */
        footerGlass
          ? null
          : {
              backgroundColor: c.surfaceSheet,
              borderTopColor: c.border,
              paddingBottom: (isWeb ? 0 : bottom) + Spacing.three,
            },
      ]}>
      {footer}
    </View>
  ) : null;

  const scroller = (
    <ScrollView
      /* `overscrollBehavior: 'contain'` asks the browser not to rubber-band
         this scroller past its own ends, which removes the gap the band is
         reaching to cover rather than merely covering it. Support is uneven —
         hence the reach above as well — and it has a second job regardless: it
         stops a flick that runs out of checklist from scrolling the PAGE behind
         the sheet, which is its own small wrongness. */
      style={[styles.fill, isWeb && styles.noBounce]}
      contentContainerStyle={[
        styles.content,
        // The native sheet stops short of the home indicator on its own; the
        // web dialog has no safe area to respect.
        /* The home indicator's clearance belongs to whichever thing is at the
           bottom of the sheet. With a footer that is the footer, and adding it
           here as well would put a band of empty sheet under the last row. */
        /* A FLOATING FOOTER IS NOT IN THE FLOW, so the room it needs has to be
           reserved here — its own height, safe area included, plus the page's
           usual tail. A footer in the flow already occupies its space and only
           the tail is owed. */
        {
          paddingBottom:
            (footerGlass ? footerHeight : footer || isWeb ? 0 : bottom) + Spacing.four,
        },
        /* With the header floating, the grabber floats too, so the content has
           to reserve the space it used to occupy in flow or the hero starts
           underneath it. True of the narrow web sheet as well now. */
        floats && { paddingTop: HANDLE_BLOCK + Spacing.three },
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
        {footerBar}
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
      <Animated.View
        onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        style={[
          styles.card,
          wide ? styles.dialog : styles.bottomSheet,
          { backgroundColor: c.surfaceSheet, borderColor: c.borderStrong },
          canDrag && { transform: [{ translateY: dragY }] },
        ]}>
        {wide ? (
          /* The dialog keeps its bar in flow: it is a centred panel with a
             title and a close button, not a sheet with a top edge to dress. */
          <>
            {header}
            {scroller}
            {footerBar}
          </>
        ) : (
          /* The bottom sheet is built the way the iOS one is — scroller first,
             chrome floated over it — so the tone wash inside the content
             reaches the top corners instead of starting under a grey bar. The
             order is the z-order: header, then grabber, then ✕, each taking its
             own taps back from the one below. */
          <>
            {scroller}
            {footerBar}
            {floatingHeader}
            {/* The grabber, and the strip that makes it mean something. The
                responder lives on a transparent block around it rather than on
                the 36pt bar itself, which is too small a target to pull. */}
            <View style={styles.dragStrip} {...drag.panHandlers}>
              <View style={[styles.handleBar, styles.handleInStrip, { backgroundColor: c.textTertiary }]} />
            </View>
            {floatingClose}
          </>
        )}
      </Animated.View>
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
export function SheetToneBand({
  tone,
  surface,
  onLayout,
  children,
}: {
  tone?: string | null;
  /**
   * A SOLID fill instead of a wash, for a header whose separation from the
   * sheet is a step on the dark scale rather than a colour.
   *
   * `tone` paints `rgba(tone, TONE_PEAK)`, which is right when the band is the
   * colour OF something — a tier, a club, a set — and has to sit at the same
   * weight as every other sheet's. The contests header has no subject to take
   * a colour from, so it takes a surface token instead. Going through this
   * component rather than painting its own view is what keeps it the geometry
   * below, which is the part that is easy to get wrong and invisible when it
   * is: reaching up over the floating grabber, and reaching into the overscroll
   * so a hard flick back to the top rubber-bands the band's own colour rather
   * than the sheet's.
   *
   * Wins over `tone` when both are given.
   */
  surface?: string | null;
  /**
   * Where the band sits in the scroll content. Passed through for the one
   * caller that has to hand the frame a `pinnedAt`: an offset measured inside
   * the band is relative to the band, and the frame is asking about the
   * content.
   */
  onLayout?: ViewProps['onLayout'];
  children: ReactNode;
}) {
  /* Whatever the scroll content is inset by, the band has to climb back over —
     and that inset now includes the grabber's block on the narrow web sheet as
     well as on iOS, because both float their chrome. Reading `useIsWide` here
     is what keeps this in step with the frame's own `floats`; get it wrong and
     the wash either stops short of the top edge or overshoots it. */
  const wide = useIsWide();
  const floats = Platform.OS === 'ios' || (Platform.OS === 'web' && !wide);
  const top = (floats ? HANDLE_BLOCK : 0) + Spacing.three;

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.band,
        /* The pair nets to zero — the box grows upward by exactly what it is
           shifted up by — so the band starts at the top of the scroll content
           however much is added here. See `OVERSCROLL_REACH`. */
        { marginTop: -(top + OVERSCROLL_REACH), paddingTop: top + OVERSCROLL_REACH },
        surface
          ? { backgroundColor: surface }
          : tone
            ? { backgroundColor: rgba(tone, TONE_PEAK) }
            : null,
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
 * 0.26 is set against the NORMALISED club colours rather than the tier accents,
 * because that is the harder case: `teamWash` forces every club to one
 * lightness so a single peak has to work for all thirty-two, where the four
 * tier accents could each have been tuned. Tiers ride the same number so the
 * two pages read as one treatment.
 *
 * IT WAS 0.20 AND READ AS GREY-BLUE RATHER THAN AS THE CLUB. At that weight
 * Jacksonville's teal composited to rgb(23,50,57) over `surfaceSheet` — a hue
 * you could find if you were told it was there. 0.26 puts it at rgb(25,60,68),
 * which is the same colour said out loud.
 *
 * THE ALPHA IS THE LEVER HERE, NOT `WASH_L` in `teams.ts`, and it is worth
 * knowing why before reaching for the other one: at a fifth opacity, eight
 * points of source lightness move the composite by about six. Lightening the
 * source enough to be felt would have to go far enough to cost the white
 * `Type.page` sitting on top of it. Raising the alpha moves the hue directly
 * and leaves the source colours — which are the clubs' own — alone.
 *
 * The ceiling is that white title. At 0.26 the darkest club still clears 9:1
 * and the brightest (Cincinnati, rgb(65,41,29)) clears 9:1 as well, so there is
 * room above this if it is still not enough — but not unlimited room.
 */
/**
 * How far the band reaches ABOVE the top of the scroll content, which is what a
 * bounce reveals.
 *
 * The band is a background inside the scroll view — it has to be, or its bottom
 * edge would not stay on the row it cuts at (see the note on the component). So
 * a fling to the top rubber-bands the whole content DOWN, the band with it, and
 * whatever the band was covering appears in the gap: the sheet's own fill,
 * which against a colour reads as a grey slab dragged out from behind the
 * header.
 *
 * Extending the box upward costs nothing — it is a solid colour, clipped by the
 * scroll view at rest — and it cannot drift out of register with the band
 * proper, because it IS the band.
 *
 * 300 WAS NOT ENOUGH, and the reasoning that picked it was about the wrong
 * gesture. It was measured against a deliberate drag from a standstill at the
 * top. The bounce that actually beats it is a hard flick UP from the bottom of
 * a long checklist: the momentum is still being spent when the content reaches
 * the top, and mobile Safari happily rubber-bands several hundred points past
 * it. Grey appeared above the colour for a few frames, which is exactly the
 * seam the band exists to prevent.
 *
 * 900 is past anything a thumb can produce. It is still one solid colour on one
 * box, so the cost of being generous here is nothing at all — which is the
 * argument for picking a number that cannot be beaten rather than one that is
 * merely usually enough.
 */
const OVERSCROLL_REACH = 900;

/**
 * How far the narrow web sheet has to be pulled before letting go dismisses it,
 * and how fast a flick has to be to count instead.
 *
 * 110 is about a third of the way down a phone-sized sheet: far enough that a
 * scroll misread as a drag does not throw the sheet away, short enough that the
 * pull does not feel like work. The velocity is in points per millisecond, so
 * 0.7 is a deliberate flick and not a hurried scroll.
 */
const DISMISS_AFTER = 110;
const FLICK_VELOCITY = 0.7;

/** Clearance above the grabber, and the height of the block it occupies. */
const HANDLE_TOP = 5;
const HANDLE_BLOCK = HANDLE_TOP + 5 + Spacing.one;

const TONE_PEAK = 0.26;

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
  /** Floating, on iOS: same geometry, taken out of the layout. */
  handleFloat: { position: 'absolute', top: HANDLE_TOP, left: 0, right: 0 },
  headerFloat: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: HANDLE_BLOCK },
  /* Sits on the bar's own line, on the same gutter the bar uses, so the button
     lands where it did when it was inside the bar. */
  closeFloat: {
    position: 'absolute',
    top: HANDLE_BLOCK,
    right: Spacing.three,
    paddingVertical: Spacing.two,
  },
  /**
   * The pull target: full width, transparent, and MUCH taller than the mark it
   * contains.
   *
   * Sized to HANDLE_BLOCK first, which is 14pt — the grabber's own block. That
   * is the size of the drawing, not the size of a thing a thumb can catch, and
   * in practice the pull missed it and landed on the content underneath, where
   * it selected text instead. 48 is the usual minimum for a touch target and it
   * reaches from the top edge down to just above the sheet's title, which is
   * the whole band a reader would call "the top of the sheet".
   *
   * The ✕ sits inside that band on the right. It is rendered AFTER this, so it
   * is above it and takes its own presses back; nothing else up here is
   * interactive.
   *
   * `userSelect: 'none'` because a drag over text is a SELECTION on web unless
   * something says otherwise, and a half-highlighted ladder row left behind by
   * a failed pull looks broken. `cursor: grab` because a pointer that can drag
   * should say so.
   */
  dragStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    justifyContent: 'flex-start',
    ...Platform.select({
      /**
       * `touchAction: 'none'` IS THE GESTURE. Without it there is no drag at
       * all on a real phone, and the reason is invisible from the JS side: a
       * browser decides who owns a vertical touch BEFORE any handler runs, and
       * the default owner is the scroller. It keeps the sequence, PanResponder
       * is never granted, and the sheet does not move. Nothing errors.
       *
       * It is also why this looked fine under automation. Synthetic touch
       * events are dispatched straight at the element and never go past the
       * browser's gesture arbitration, so they reached the responder and moved
       * the sheet — proving the wiring while saying nothing about the one thing
       * that was broken.
       *
       * Declaring `none` on the strip hands vertical touches there to us. It is
       * scoped to the 48pt strip precisely so the rest of the sheet keeps
       * native scrolling, which is the part a browser does better than we ever
       * would.
       *
       * `userSelect: 'none'` because a drag over text is a selection unless
       * something says otherwise. `pointer` and not `grab`: React Native's
       * `CursorValue` admits only `auto` and `pointer`, and casting past the
       * type for a nicer cursor is not worth owning a lie about the API.
       */
      web: {
        touchAction: 'none' as const,
        userSelect: 'none' as const,
        cursor: 'pointer' as const,
      },
      default: {},
    }),
  },
  handleInStrip: { marginTop: HANDLE_TOP },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, gap: 2 },
  noBounce: Platform.select({
    web: { overscrollBehavior: 'contain' as const },
    default: {},
  }),
  /* The gutter is the content's, so the buttons line up with the cards above
     them rather than sitting a few points inside or outside the grid. */
  /* The gutter and the rule belong to the SOLID footer; a glass one supplies
     its own margins and its own edge, and overrides both below. */
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerGlass: { paddingHorizontal: 0, paddingTop: 0, borderTopWidth: 0 },
  /* Over the scroller rather than under it — see the note where it is drawn.
     `start`/`end` rather than left/right so it follows the writing direction,
     as every other absolute box in this file does. */
  footerFloat: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  /**
   * The takeover row: the bar's gutter, its own bottom rhythm, and the rule.
   *
   * The gutter is `styles.header`'s, deliberately the same number, because the
   * row has to line up with the title above it — and in the content it lines up
   * with the same edge by way of the tone band, which insets by the identical
   * amount. A row that scrolls horizontally still needs the inset: the strip is
   * inset, not the page.
   *
   * The rule is the row's baseline, not a gap below it — see the note on the
   * missing bottom padding.
   */
  pinned: {
    paddingHorizontal: Spacing.three,
    /* No bottom padding: the row's own last mark sits on the rule below it,
       which is what the strip under the masthead does and what the band this
       stands in for does at rest. */
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
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
