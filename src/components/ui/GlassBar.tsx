/**
 * A floating bar of ACTIONS, in the tab pill's material.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SAME GLASS AS THE TAB PILL, AND NOT MERELY A SIMILAR ONE
 * ---------------------------------------------------------------------------
 *
 * The floating tab bar is the only thing in this app that hovers over content
 * you can still see moving underneath it, and Liquid Glass is what makes that
 * legible rather than obstructive: the page is visibly there, visibly behind,
 * and the controls are visibly not part of it. A sheet's action bar is the same
 * object doing the same job one layer up — so it is drawn from the same
 * material rather than from a solid strip that would read as the page ending.
 *
 * `TabBarGlass` is not reused directly because it is a CAPSULE sized to the tab
 * pill and positioned by the tab layout. What is shared is the reasoning and
 * the two values that make the material work, and those are stated here rather
 * than imported so that a change to the tab bar's geometry cannot silently
 * restyle every action bar in the app.
 *
 * ---------------------------------------------------------------------------
 * REAL GLASS WHERE THERE IS REAL GLASS, AND A DESIGNED FALLBACK WHERE NOT
 * ---------------------------------------------------------------------------
 *
 * `expo-glass-effect` has been a dependency since the first commit and is
 * already in the native project, which is the only reason this ships over the
 * air rather than through TestFlight. It binds UIKit's Liquid Glass, which
 * exists from iOS 26; `isLiquidGlassAvailable` is the whole test.
 *
 * BELOW 26 IT MUST NOT LOOK LIKE THE GLASS FAILED. `GlassView` degrades to a
 * plain view on its own, which would leave a transparent box with the list
 * showing through the labels, so the fallback is drawn deliberately: `surface`
 * at 88% plus the hairline a floating object needs and an attached one does
 * not. Web takes the same path — there is no Liquid Glass in a browser, and a
 * blur filter is not it.
 *
 * ---------------------------------------------------------------------------
 * THE SCRIM IS WHAT STOPS IT BEING A SHELF
 * ---------------------------------------------------------------------------
 *
 * Content scrolls under this bar and has to stop being readable before it
 * reaches the screen's edge, or the last row is half-legible under the glass
 * and reads as a rendering fault. A gradient from transparent to solid does
 * that without drawing a line anywhere: the dimming passes straight THROUGH
 * the bar's own footprint rather than stopping at it, because any difference in
 * dimming across that boundary is a visible edge in the shape of the bar. The
 * tab pill learned this twice, in both directions; the note on `TabBarGlass`
 * has the full account and it applies here unchanged.
 */
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Colors, Spacing, TabPillHeight, TabPillInset } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** A device capability, so it is read once at module load and never per render. */
const LIQUID = isLiquidGlassAvailable();

/**
 * ---------------------------------------------------------------------------
 * EVERY NUMBER HERE IS THE TAB PILL'S, IMPORTED RATHER THAN MATCHED
 * ---------------------------------------------------------------------------
 *
 * This bar was drawn with values reasoned out from scratch — a measured height,
 * a 16pt inset, a lighter scrim on the theory that a bench has less contrast to
 * refract than a collection grid — and every one of them was a small departure
 * that added up to a different object. Reported, correctly, as "not the exact
 * same look".
 *
 * The glass props were never the problem: `glassEffectStyle`, `tintColor`,
 * `colorScheme` and `isInteractive` are identical to `TabBarGlass`'s and always
 * were. What differed was the SHAPE the material was poured into and how dark
 * the ground behind it was, and those are exactly the things that decide
 * whether two pieces of glass read as the same material.
 *
 * So the height, the inset and the radius are `TabPillHeight` and
 * `TabPillInset` themselves, imported, so the two cannot drift; and the scrim
 * is the pill's own 24 and 0.55. If the tab bar is ever retuned this follows it
 * without anybody remembering that it should.
 *
 * IT ALSO REMOVES THE MEASUREMENT. With a fixed height every stop in the
 * gradient is arithmetic on constants, so there is no `onLayout`, no state, and
 * no render-after-layout — which is the same code path that produced the
 * "Cannot read property 'layout' of null" crash. A component that does not
 * measure cannot get measuring wrong.
 */
const TOP_FADE = 24;
/**
 * ---------------------------------------------------------------------------
 * THE VEIL IS LIGHTER THAN THE TAB PILL'S, TO GET THE SAME RESULT
 * ---------------------------------------------------------------------------
 *
 * The tab bar holds 0.55 behind its capsule and reads as clear and see-through,
 * and copying that number here produced a dark, closed panel. Both are correct
 * and the difference is arithmetic: 45% of a collection grid is still card art,
 * colour and contrast for the material to bend, while 45% of a bench — 11pt
 * grey type on near-black — is indistinguishable from black.
 *
 * A probe settled that this was never the glass: with `tintColor` forced to red
 * the capsule's RIM went red and its interior did not move, which says the real
 * material is rendering and that its interior is simply whatever is behind it.
 * Put the tab pill over a dark list — the lineup board's own bench — and it
 * goes just as dark, which is the check worth repeating before touching this
 * number again.
 *
 * So the constant that transfers is not 0.55, it is "leave the content
 * visible". 0.16 over near-black leaves about as much as 0.55 leaves over the
 * grid, and the two bars read as the same material at last.
 *
 * ADDING LIGHT IS THE WRONG FIX, and it was tried: a faint white plate under
 * the glass. It lifts the rim and turns the interior milky, which is the exact
 * opposite of see-through — an opaque panel wearing a glass edge. The material
 * wants LESS in front of the content, not more behind it.
 */
const SURROUND = 0.16;
const BAR_H = TabPillHeight;
/** Clearance above the bar, so it floats rather than butting the content. */
const BAR_TOP = Spacing.two;

export function GlassBar({ children }: { children: ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  /**
   * THE DIM IS HELD FLAT ACROSS THE ROW and only falls to solid BELOW it.
   *
   * A gradient that kept darkening through the bar's own height would be
   * darkest exactly where the material is, and Liquid Glass with nothing behind
   * it renders as flat grey — it only exists where content passes under it.
   * `TabBarGlass` holds `SURROUND` from its capsule's top edge to its bottom
   * edge for this reason; these are the same two stops with the fractions
   * worked out from the heights above.
   */
  const total = TOP_FADE + BAR_TOP + BAR_H + TabPillInset;
  const barTop = (TOP_FADE + BAR_TOP) / total;
  const barEnd = (TOP_FADE + BAR_TOP + BAR_H) / total;

  return (
    <View style={styles.wrap}>
      {/* THE SCRIM, DRAWN FIRST AND REACHING ABOVE THE ROW. `pointerEvents`
          none throughout: it is a wash over content, and a wash that ate taps
          would make the rows under it unreachable for the height of the fade. */}
      <View style={[styles.scrim, { top: -TOP_FADE }]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="glassBarSurround" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.background} stopOpacity="0" />
              <Stop offset={`${barTop}`} stopColor={c.background} stopOpacity={`${SURROUND}`} />
              <Stop offset={`${barEnd}`} stopColor={c.background} stopOpacity={`${SURROUND}`} />
              {/* Solid only past the row, where what is left is the home
                  indicator's clearance — too short to show a whole row, and a
                  fragment at the screen's edge reads as a rendering fault. */}
              <Stop offset="1" stopColor={c.background} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#glassBarSurround)" />
        </Svg>
      </View>

      <View style={styles.row}>{children}</View>
    </View>
  );
}

/**
 * One capsule of glass, holding one action.
 *
 * ---------------------------------------------------------------------------
 * SEPARATE PILLS, NOT ONE PILL DIVIDED
 * ---------------------------------------------------------------------------
 *
 * The bar was a single capsule with a hairline down the middle, which is the
 * tab bar's construction — and the tab bar is right to do it, because its four
 * cells are the same KIND of thing: four destinations, one navigator, one
 * object. These two are not. One rearranges a lineup and the other spends forty
 * coins, and putting them in one container says they are two halves of a single
 * control.
 *
 * Split, each is its own object with its own material, its own edge and its own
 * press. The gap between them is the statement: nothing about pressing the left
 * one leads to pressing the right one.
 *
 * ---------------------------------------------------------------------------
 * THE TINT IS THE ONLY COLOUR, AND IT LIVES ON THE RIM
 * ---------------------------------------------------------------------------
 *
 * A probe established what `tintColor` actually does to this material: forced
 * to red, the capsule's RIM went red and its interior did not move. So a tinted
 * pill is a pill with a coloured EDGE and a faint cast, never a filled button —
 * which is exactly the restraint this bar needs, because a fill on glass is a
 * hole in the glass (see `BarAction`). Colour here marks which pill is the
 * consequential one without any of them stopping being glass.
 */
export function GlassPill({
  children,
  tint,
  grow = false,
  compact = false,
}: {
  children: ReactNode;
  /** A hue for the rim. Undefined takes the tab bar's neutral. */
  tint?: string;
  /** Take the leftover width. The secondary pills hug their labels. */
  grow?: boolean;
  /**
   * A circle the height of the row, for a pill carrying a mark and no word.
   *
   * It is what lets a third action onto a 362pt row without the other two
   * having to shorten their labels into abbreviations — and it is the right
   * shape for the quietest of the three anyway.
   */
  compact?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const neutral = scheme === 'dark' ? 'rgba(14,16,19,0.25)' : 'rgba(255,255,255,0.25)';

  return (
    <View style={[styles.pill, grow && styles.grow, compact && styles.compact]}>
      {LIQUID ? (
        <GlassView
          /* THE RADIUS IS ON THE GLASS, not just on the box clipping it. UIKit
             draws Liquid Glass with its own rim — the bright edge treatment
             that is most of what makes it read as a material — and derives it
             from the view's OWN corner radius. Left square inside a rounded
             parent, the rim is drawn as a rectangle and the clip removes it at
             both ends. Clipping cannot round an edge; it can only delete the
             parts outside the shape. */
          style={[StyleSheet.absoluteFill, styles.glass]}
          glassEffectStyle="regular"
          tintColor={tint ?? neutral}
          colorScheme={scheme}
          /* A container for a control, not the control. Interactive glass
             reacts to touches on itself, which would put a highlight under the
             button and a second one on the button's own press state. */
          isInteractive={false}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.fallback,
            { backgroundColor: at88(c.surface), borderColor: tint ?? c.borderStrong },
          ]}
        />
      )}
      <View style={[styles.content, compact && styles.contentCompact]}>{children}</View>
    </View>
  );
}

/** `surface` at 88%: opaque enough to carry a label, sheer enough to float. */
function at88(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.88)`;
}

const styles = StyleSheet.create({
  /* The row is in flow — it is handed to a frame's footer slot, which is
     already outside the scroll — and only the scrim is lifted out of it. */
  wrap: { position: 'relative' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  /**
   * THE TAB PILL'S BOX, TO THE POINT.
   *
   * `start`, `end` and `bottom` are all `TabPillInset` and the height is
   * `TabPillHeight`, which is exactly how `(tabs)/_layout` positions the nav —
   * so this row lands on the same pixels and is the same size.
   *
   * THE SAFE AREA IS DELIBERATELY NOT ADDED to the bottom, which is the one
   * number here a careful reader would think is a bug. `insets.bottom` is 34
   * and it is Apple's conservative clearance for the home indicator; the pill's
   * note explains that 20 already clears it and that adding both puts the bar
   * visibly higher off the bottom than it sits off the sides. This bar was
   * passing `insets.bottom` and floating 14pt above where the nav sits, which
   * is precisely the kind of near-miss that reads as "not the same thing".
   */
  row: {
    height: BAR_H,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.two,
    marginHorizontal: TabPillInset,
    marginTop: BAR_TOP,
    marginBottom: TabPillInset,
  },
  pill: { borderRadius: BAR_H / 2, overflow: 'hidden' },
  grow: { flex: 1, minWidth: 0 },
  /* Square, so the capsule's radius makes it a circle. */
  compact: { width: BAR_H },
  /* The border has to be drawn on the same shape it is meant to trace, or the
     clip cuts it away at the corners — see the note on the glass. */
  fallback: { borderWidth: StyleSheet.hairlineWidth, borderRadius: BAR_H / 2 },
  glass: { borderRadius: BAR_H / 2 },
  /**
   * THE PILL IS AS WIDE AS ITS LABEL PLUS THIS.
   *
   * A capsule with no horizontal padding collapses to a circle the height of
   * the row and clips the word inside it — which is what happened the first
   * time these were split. `Spacing.four` either side is what makes a 56pt-tall
   * pill read as a control rather than as a token, and it is the same air the
   * rail's own chips carry.
   */
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.three },
  /* A mark centred in a circle needs no side air of its own. */
  contentCompact: { paddingHorizontal: 0 },
});
