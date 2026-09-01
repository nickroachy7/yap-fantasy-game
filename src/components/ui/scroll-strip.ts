/**
 * The props every horizontal strip in this app wants, and the reason it wants
 * them.
 *
 * A HORIZONTAL ScrollView BOUNCES WHETHER OR NOT THERE IS ANYWHERE TO GO. React
 * Native resolves `alwaysBounceHorizontal` to `props.horizontal` when it is not
 * given — read out of ScrollView.js, not assumed — so every one of these is
 * created with bouncing ON. A row of three items that comfortably fits could
 * still be grabbed and pulled, and it rubber-banded back having moved nothing.
 *
 * That is a real defect rather than a cosmetic one: a gesture that responds is
 * a promise there is more to see, and the section nav, the filter chips, the
 * sort strip, the segmented tabs and the stat tables were all making it on
 * every screen where they happened to fit.
 *
 * `alwaysBounceHorizontal: false` is the whole fix. It does not disable
 * scrolling — a strip whose content genuinely overruns still scrolls, and still
 * bounces at the ends, because iOS only suppresses the bounce when the content
 * fits. Android gets `overScrollMode` for the same reason: no glow at the edge
 * of something that cannot move.
 *
 * WHAT THIS REPLACED, because the wrong answer is instructive. The first
 * attempt measured the strip — `onLayout` for the box, `onContentSizeChange`
 * for the content — and set `scrollEnabled` from the comparison. It latched
 * shut: react-native-web implements `onContentSizeChange` as an `onLayout` on
 * the content container, and a container inside `overflow: hidden` lays out
 * CLAMPED to that box, so once disabled the measurement could only ever report
 * "it fits". A six-item nav needing 402pt in 327 reported 327 and stopped
 * scrolling at all, which is worse than the bounce it was fixing. Starting
 * enabled fixed the latch and left a frame of wrongness plus two pieces of
 * state, to arrive at what two static props do exactly.
 */
export const horizontalStrip = {
  alwaysBounceHorizontal: false,
  overScrollMode: 'never',
} as const;

/**
 * The props a VERTICAL scroller wants, which is one prop and a colour decision.
 *
 * ---------------------------------------------------------------------------
 * THE DEFAULT INDICATOR FOLLOWS THE DEVICE, AND THIS APP DOES NOT
 * ---------------------------------------------------------------------------
 *
 * `indicatorStyle` left unset resolves to UIKit's `default`, which adapts to
 * the SYSTEM appearance: a dark bar under a light device setting, a bright one
 * under a dark setting. Every other colour in this app is fixed — see
 * `use-color-scheme`, where shipping one theme is a product decision — so the
 * one element still asking the phone what it thinks is a scroll indicator, and
 * it answers differently for two players looking at the same screen.
 *
 * `black` pins it. On a #080808 page that is a bar you can find when you are
 * looking for it and do not notice when you are not, which is what a scroll
 * indicator is for: it reports how far down a list you are, and it is never the
 * thing you came to read. iOS draws it with a faint light edge, so it does not
 * vanish outright against the page.
 *
 * THE WEB HALF IS IN `global.css`. react-native-web renders these as a real
 * overflow container with the browser's own scrollbar on it, which no React
 * prop reaches — `indicatorStyle` is silently dropped there. The rules under
 * `::-webkit-scrollbar` are the same decision expressed in the only vocabulary
 * that platform has.
 */
export const quietScrollbar = {
  indicatorStyle: 'black',
} as const;
