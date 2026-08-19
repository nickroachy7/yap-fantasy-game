/**
 * The frame around a player profile when it is presented over the app.
 *
 * TWO PRESENTATIONS, ONE OBJECT
 *
 * On a phone the route is a native page sheet (`presentation: 'modal'`): the
 * platform draws the surface, the rounded top edge and the drag-to-dismiss
 * gesture, so this component adds only what sits INSIDE it — a title bar and
 * the scroll container. Reimplementing any of the rest would be a worse copy of
 * a gesture the device already does perfectly.
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
 * WHY THE BACKDROP IS A SIBLING, NOT A PARENT
 *
 * A Pressable WRAPPING the card renders a <button> containing <button>s on
 * web, which React rejects at runtime. `SwapSheet`, `DropdownChip` and
 * `ConfirmDialog` all hit this; the fix is the same one — the backdrop is laid
 * behind the card, not around it.
 */
import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Colors,
  SheetCorner,
  SheetDialogInset,
  SheetDialogWidth,
  Spacing,
  Type,
} from '@/constants/theme';
import { useIsWide } from '@/components/shell/useResponsive';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function PlayerSheetFrame({
  title,
  subtitle,
  onClose,
  closeLabel = 'Close player profile',
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

  const header = (
    /**
     * `collapsable={false}` is load-bearing on iOS, not a hint.
     *
     * React Native drops layout-only Views from the native tree as an
     * optimisation, hoisting their children into the parent. react-native-screens'
     * sheet presentations count their subviews to decide how to lay out, and
     * expect at most two — a header and a scroll view — so once this View was
     * collapsed the sheet saw six loose subviews, gave the header no height, and
     * painted it on top of the scrolling content. It looked like three separate
     * bugs (overlapping text, content past the sheet edge, a dead top area) and
     * was this one flag. The library says so out loud in a warning worth
     * reading: "FormSheet with ScrollView expects at most 2 subviews. Got 6".
     * Kept after the move from formSheet to a page sheet: still correct, still
     * free, and the failure it prevents is expensive to diagnose.
     */
    <View collapsable={false} style={[styles.header, { borderBottomColor: c.border }]}>
      <View style={styles.headerText}>
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
      </View>

      {/* A named control, not just a gesture. The swipe exists on a phone and
          nothing announces it, and on web there is no swipe at all. */}
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
  );

  const scroller = (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[
        styles.content,
        // The native sheet stops short of the home indicator on its own; the
        // web dialog has no safe area to respect.
        { paddingBottom: (isWeb ? 0 : bottom) + Spacing.four },
      ]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );

  if (!isWeb) {
    // The page sheet already IS the surface — draw on it, do not draw another.
    return (
      <View collapsable={false} style={[styles.sheetRoot, { backgroundColor: c.background }]}>
        {header}
        {scroller}
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
          { backgroundColor: c.background, borderColor: c.borderStrong },
        ]}>
        {/* Decoration — this sheet is not draggable on web — but it is the
            standard mark for "this came from the bottom and goes back there",
            and without it the panel reads as a page. Same call as SwapSheet. */}
        {wide ? null : <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />}
        {header}
        {scroller}
      </View>
    </View>
  );
}

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
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
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
