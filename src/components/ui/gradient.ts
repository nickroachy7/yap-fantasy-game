/**
 * CSS gradients, addressed to whichever prop the platform calls it.
 *
 * React Native 0.86 takes one under `experimental_backgroundImage` and
 * react-native-web takes the same string under `backgroundImage`, so the value
 * is written once and only the key differs. Neither is in the other's style
 * type, which is what the cast is for.
 *
 * THIS LIVES HERE RATHER THAN IN `PlayerCard` because it is now used by two
 * unrelated things — the card's scrims and both profile headers' colour wash —
 * and the second copy of a platform shim is how the two drift onto different
 * property names the day RN promotes the experimental one.
 *
 * The card's own note on why a real gradient rather than stacked bands is worth
 * keeping: to hide the seams between flat views the alpha step has to be under
 * about 0.02, which over a compact card's ~35pt ramp is forty-odd views per
 * scrim per card, in a grid drawing dozens. Coarsen it to five or six bands and
 * the 0.17 step draws visible stripes. One view and one interpolation done by
 * the compositor is the whole argument.
 */
import { Platform, type ViewStyle } from 'react-native';

export const gradient = (css: string): ViewStyle =>
  (Platform.OS === 'web'
    ? { backgroundImage: css }
    : { experimental_backgroundImage: css }) as ViewStyle;

/** `#RRGGBB` -> `'r, g, b'`, the form a `rgba()` stop wants. */
export function rgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((d) => d + d)
          .join('')
      : h,
    16,
  );
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** `#RRGGBB` at an alpha, as an `rgba()` string. */
export const rgba = (hex: string, alpha: number): string =>
  `rgba(${rgbTriplet(hex)}, ${alpha})`;

/**
 * A colour washed down from the top edge and gone by the bottom of the block.
 *
 * WHAT IT IS FOR: the identity band at the top of both profiles. The card
 * profile washes its tier, the player profile its club — the two questions the
 * pages exist to answer, said before a word is read.
 *
 * IT HOLDS FLAT BEFORE IT FALLS, and that is the difference between dressing
 * the identity block and painting a stripe on the ceiling. The first ~70pt of
 * a sheet is the grabber and the title bar, which is empty until you scroll —
 * so a wash that peaks at the top edge and decays from there spends most of its
 * colour on nothing, and by the time it reaches the player's name it is gone.
 * Holding the peak through `flat` puts full colour behind the name and the club
 * line, which is what it is there to dress.
 *
 * The fall is then eased rather than linear. A straight interpolation keeps
 * meaningful colour all the way down, so the facts at the bottom sit on a tint
 * and the eye reads a rectangle with an edge; falling away fast and then
 * crawling lands it on the sheet's own surface with nothing to see.
 *
 * `peak` is deliberately the caller's, not a constant: a tier accent and a
 * normalised club colour do not carry the same weight at the same alpha, and
 * the header has to look like one treatment across both pages.
 */
export function wash(hex: string, peak: number, flat = 40): ViewStyle {
  const rgb = rgbTriplet(hex);
  const at = (alpha: number, pct: number) =>
    `rgba(${rgb}, ${alpha.toFixed(3)}) ${pct.toFixed(0)}%`;
  const rest = 100 - flat;
  return gradient(
    `linear-gradient(to bottom, ${[
      at(peak, 0),
      at(peak, flat),
      at(peak * 0.38, flat + rest * 0.34),
      at(peak * 0.1, flat + rest * 0.66),
      at(0, 100),
    ].join(', ')})`,
  );
}
