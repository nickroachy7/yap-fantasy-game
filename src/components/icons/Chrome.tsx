/**
 * APP CHROME MARKS — the back chevron and the settings gear.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE ARE NOT IN `glyphs.ts`
 * ---------------------------------------------------------------------------
 *
 * That file states the rule plainly: a new glyph is DRAWN — generated as part
 * of a row, traced, flattened, linted — and never assembled from primitives,
 * because eighteen assembled glyphs were deleted for looking dead beside the
 * traced ones and "two icon languages in one set is worse than either alone."
 *
 * These two are not in that set, and the boundary is nameable rather than
 * convenient: `glyphs.ts` draws the GAME — coins, packs, tiers, hearts, runs.
 * Every mark in it depicts a thing the player owns or wins, and every one is
 * illustrative enough that tracing is the only way to get it right.
 *
 * A back chevron and a gear depict nothing. They are the OS's own wayfinding
 * vocabulary, they exist in every app ever shipped, and their whole value is
 * being instantly recognisable rather than being ours. Tracing a hand-drawn
 * gear would buy character on the one mark in the app where character is a
 * liability.
 *
 * So they are built from `system.ts`'s own vocabulary instead — `chevron` for
 * one, the same faceted logic for the other — which keeps them on the house's
 * 24-unit grid and in the house's flat-facet language without pretending to be
 * members of a set they would drag down.
 *
 * They are deliberately NOT exported as `Glyph`s and so are not linted. The
 * lint's rules are about a glyph agreeing with its twenty-three neighbours;
 * these two have no neighbours.
 *
 * ---------------------------------------------------------------------------
 * AND NOT `expo-symbols` EITHER, which was the obvious alternative and is
 * already a dependency (`collapsible.tsx` uses it for a disclosure arrow).
 *
 * SF Symbols would be free and correct on iOS. On web `SymbolView` fetches a
 * Material Symbols webfont at runtime and renders an empty box until it lands
 * — which is fine for an arrow inside a collapsed section and not fine for two
 * marks in the masthead of every screen, where the failure is a header that
 * loads without its controls. `react-native-svg` is already here and paints on
 * the first frame on every platform.
 * ---------------------------------------------------------------------------
 */
import Svg, { G, Path } from 'react-native-svg';

import { GRID, STROKE, chevron, disc } from './system';

type ChromeProps = {
  /** Rendered box size. The mark is authored at `GRID` and scaled once. */
  size?: number;
  color: string;
  accessibilityLabel?: string;
};

const BOX = `0 0 ${GRID} ${GRID}`;
const C = GRID / 2;

/**
 * BACK.
 *
 * A filled band, not a stroked polyline, because that is what `chevron()`
 * makes and what the tier ladder is already built from — the house says
 * direction with mass. Authored pointing up and rotated a quarter turn, which
 * is cheaper than a second builder and cannot drift from the first.
 *
 * `heavy` rather than `regular`: this is a touch target at the edge of the
 * screen competing with a 15pt name beside it, and 1.6 units reads as a
 * hairline once it is only 8 units wide.
 */
export function BackChevron({ size = 20, color, accessibilityLabel }: ChromeProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={BOX}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}>
      <G transform={`rotate(-90 ${C} ${C})`}>
        <Path fill={color} d={chevron(C, C, 13, 7.5, STROKE.heavy, 'up')} />
      </G>
    </Svg>
  );
}

/**
 * SETTINGS.
 *
 * EIGHT FLAT-TOPPED TEETH, not a rounded cog. The teeth are trapezoids —
 * straight flanks from the root radius out to a flat crest — which is the same
 * construction as the chamfers and shoulders everywhere else in this house.
 * A gear of round-ended lugs would be the one soft mark in a faceted set, and
 * `Hearts` already documents the cost of that: the valentine had to be cut
 * into facets to sit beside `Coin` at all.
 *
 * The hole is a second subpath under `evenodd` rather than a lighter disc
 * drawn on top, so the mark is genuinely pierced and works on any surface —
 * the same reason `Icon.tsx` masks its knockouts instead of painting them.
 *
 * Angles rather than a snapped grid, deliberately. Eight teeth on a 45-degree
 * pitch cannot land on half units and stay symmetrical, and symmetry is the
 * only thing the eye checks on a gear.
 */
const TEETH = 8;
const PITCH = 360 / TEETH;
/** Crest, valley, bore. The rim between valley and bore is 4.5 units. */
const OUTER = 10.2;
const ROOT = 7.8;
/**
 * The bore is WIDE — 4.4 of a 10.2 radius, so the rim is a band rather than a
 * disc with a pinhole. Drawn at 3.3 first and it read as a solid lump beside
 * the two balance pills at 19pt: what makes a gear legible at chrome size is
 * the hole, not the teeth.
 */
const BORE = 4.4;
/** Half-widths in degrees: the crest is a shade narrower than the valley. */
const CREST = 8;
const VALLEY = 13;

function f(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Polar to cartesian about the box centre, zero at twelve o'clock. */
function at(r: number, deg: number): string {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${f(C + r * Math.cos(a))} ${f(C + r * Math.sin(a))}`;
}

const COG = (() => {
  let d = '';
  for (let i = 0; i < TEETH; i++) {
    const a = PITCH * i;
    d += `${i === 0 ? 'M' : 'L'}${at(ROOT, a - VALLEY)}`;
    d += `L${at(OUTER, a - CREST)}`;
    d += `L${at(OUTER, a + CREST)}`;
    d += `L${at(ROOT, a + VALLEY)}`;
  }
  return `${d}Z${disc(C, C, BORE)}`;
})();

export function Gear({ size = 20, color, accessibilityLabel }: ChromeProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={BOX}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}>
      <Path fill={color} fillRule="evenodd" d={COG} />
    </Svg>
  );
}
