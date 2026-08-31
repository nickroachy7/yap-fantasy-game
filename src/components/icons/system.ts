/**
 * THE ICON CONSTRUCTION SYSTEM.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 *
 * A coherent icon set is not twenty-four acts of drawing. It is ONE
 * construction system — a grid, a stroke scale, a keyline, a terminal
 * treatment, a rule for how much of the box the mass fills — and then
 * twenty-four glyphs drawn against it. The system is what makes them look
 * like a family; without it every new glyph is a fresh guess and the set
 * drifts one icon at a time.
 *
 * This app already HAD such a system. It was just never written down as
 * anything a machine could check, so it lived as prose in five different
 * component headers:
 *
 *   TabIcon      24pt box, 1.6 stroke, hollow when inactive and solid when
 *                active, geometry never changes between states
 *   Hearts       faceted rather than round, because the house language is
 *                the rotated square, concentric rings and corner ticks
 *   TierMotif    form differs per tier, so the signal survives greyscale
 *   PositionGlyph shape encodes the group; the corner radius is the cue
 *   Gem          a rotated square, "so it stays crisp everywhere"
 *
 * Everything below is those rules, made into constants and a vocabulary you
 * draw in. Nothing here is a new opinion. The one genuinely new thing is the
 * KEYLINE (see below), which is the piece that was missing and the reason a
 * hand-drawn glyph could look wrong next to its neighbours for no nameable
 * reason.
 *
 * The companion to this file is `validate.ts`, which checks a glyph actually
 * obeys what is written here. A system nothing enforces is a style guide, and
 * style guides lose.
 */

/**
 * The reference box. Every glyph is authored at this size and scaled once at
 * render, so proportion is fixed and only the rasterisation changes.
 *
 * 24 because that is what `TabIcon` already uses and what the tab bar passes.
 * Changing it would silently rescale every existing glyph.
 */
export const GRID = 24;

/**
 * The live area — the part of the box a glyph may actually occupy.
 *
 * A unit and a half of padding on every side. This is not decoration: it is
 * the margin that stops a glyph from touching its neighbour's box in a rail,
 * and it is what lets one glyph carry a bleeding element (a blade, a slash) as
 * a deliberate exception rather than as the accidental result of everything
 * being drawn edge to edge.
 *
 * 1.5 rather than a rounder 2 because the DIAGONAL keyline below is 21 units
 * corner to corner, and a live area of 20 would make the house's own `Gem`
 * mark illegal in its own system. The keyline set decides the padding, not the
 * other way round.
 */
export const LIVE = { min: 1.5, max: 22.5, size: 21 } as const;

/**
 * ---------------------------------------------------------------------------
 * THE KEYLINE — the part that was missing
 * ---------------------------------------------------------------------------
 *
 * Equal dimensions do not read as equal size. A circle 20 units across looks
 * SMALLER than a square 20 units across, because the square's corners put
 * mass where the circle has none. Draw both at 20 and the circle looks shrunk;
 * the set then has a "weight" problem nobody can point at, because every glyph
 * measures correct.
 *
 * So each glyph declares the shape family its dominant mass belongs to, and
 * takes that family's size. These four are tuned to equal optical area, which
 * is why the numbers disagree with each other:
 *
 *   SQUARE     18 x 18   corners carry mass, so it is the smallest
 *   CIRCLE     20 dia    needs the extra to hold its own beside a square
 *   PORTRAIT   16 x 20   tall things: a card, a pack, a shield
 *   LANDSCAPE  20 x 16   wide things: a bar, a field, a fixture
 *   DIAGONAL   21        a rotated square measured corner to corner; the
 *                        house's own motif (`Gem`) and the widest of the set,
 *                        because a diamond's mass sits along its axes
 *
 * A glyph that ignores its keyline is the single most common way a new icon
 * ends up looking wrong, so `validate.ts` treats it as an error rather than a
 * warning.
 */
export const KEYLINE = {
  square: { w: 18, h: 18 },
  circle: { w: 20, h: 20 },
  portrait: { w: 16, h: 20 },
  landscape: { w: 20, h: 16 },
  diagonal: { w: 21, h: 21 },
} as const;

export type Keyline = keyof typeof KEYLINE;

/**
 * Stroke weights, at the 24 reference. Three, and no more.
 *
 * `regular` is 1.6 because that is `TabIcon.STROKE` and those nine glyphs are
 * the largest existing set — anything else would make the new work disagree
 * with the tab bar, which is the most-looked-at row in the app.
 *
 * `hairline` is for a subordinate part inside an already-busy glyph, never for
 * a whole glyph. `heavy` is for a glyph that must hold up at 16pt or below.
 */
export const STROKE = { hairline: 1, regular: 1.6, heavy: 2.4 } as const;
export type StrokeWeight = keyof typeof STROKE;

/**
 * Corner radii. A scale, not a free number.
 *
 * `sharp` is a true corner and is the default: this is a faceted house, and
 * `Hearts` documents at length why the soft valentine was cut into facets to
 * belong beside `Gem` and `TierMotif`. Rounding is the exception you reach for
 * on a glyph that depicts something genuinely soft.
 */
export const RADIUS = { sharp: 0, soft: 2, round: 4, pill: 999 } as const;
export type Radius = keyof typeof RADIUS;

/**
 * The chamfer — the corner cut that makes a rectangle read as faceted rather
 * than merely square. This is the house's signature move and the reason a
 * `chamfer()` exists beside `rect()` below.
 */
export const FACET = 3;

/**
 * Everything snaps to half a unit.
 *
 * Not tidiness. At the 24 box a half unit is a third of a pixel at 1x and one
 * pixel at 3x, so a coordinate of 7.37 lands the same place as 7.5 on every
 * device that exists while making the geometry impossible to reason about and
 * impossible to diff. `validate.ts` rejects unsnapped coordinates.
 */
export const SNAP = 0.5;

export function snap(n: number): number {
  return Math.round(n / SNAP) * SNAP;
}

/** Centre of the box, and the origin every rotation turns about. */
export const C = GRID / 2;

/**
 * ---------------------------------------------------------------------------
 * THE DRAWING VOCABULARY
 * ---------------------------------------------------------------------------
 *
 * Glyphs are composed from these and nothing else. That constraint is the
 * point: a set drawn from eight shared primitives coheres by construction,
 * where a set of freehand path data coheres only if someone is watching.
 *
 * Every builder returns SVG path data, snapped. They take box coordinates
 * (0..24), so a glyph reads as geometry rather than as a magic string.
 */

const f = (n: number) => String(snap(n));

/** A rectangle, optionally rounded. The plainest mass in the system. */
export function rect(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0) {
    return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
  }
  const k = Math.min(r, w / 2, h / 2);
  return (
    `M${f(x + k)} ${f(y)}H${f(x + w - k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + w)} ${f(y + k)}` +
    `V${f(y + h - k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + w - k)} ${f(y + h)}` +
    `H${f(x + k)}A${f(k)} ${f(k)} 0 0 1 ${f(x)} ${f(y + h - k)}` +
    `V${f(y + k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + k)} ${f(y)}Z`
  );
}

/**
 * A rectangle with its corners cut off — the faceted rectangle.
 *
 * `cut` defaults to FACET. This is what `rect` should be reached for instead
 * of whenever the thing being drawn is an object rather than a container: a
 * card, a pack, a plate, a tile.
 */
export function chamfer(x: number, y: number, w: number, h: number, cut = FACET): string {
  const k = Math.min(cut, w / 2, h / 2);
  return (
    `M${f(x + k)} ${f(y)}H${f(x + w - k)}L${f(x + w)} ${f(y + k)}` +
    `V${f(y + h - k)}L${f(x + w - k)} ${f(y + h)}` +
    `H${f(x + k)}L${f(x)} ${f(y + h - k)}` +
    `V${f(y + k)}Z`
  );
}

/**
 * A full disc.
 *
 * Drawn as FOUR quarter arcs rather than the usual two semicircles, and that
 * is not a stylistic choice. `validate.ts` measures a glyph from the endpoints
 * of its path commands, because a general arc-extent solver is a great deal of
 * machinery for a vocabulary this small. Two semicircles put endpoints only at
 * the left and right of the circle, so the validator would measure a disc as a
 * horizontal line of zero height and wave through a glyph of any size. Four
 * quarters put an endpoint at each of the four extremes, so the cheap measure
 * is the correct one.
 *
 * The general rule this follows: a builder must place an explicit point at
 * every extreme of the shape it draws. Corner arcs elsewhere are exempt — a
 * small arc never leaves the box its own endpoints describe.
 */
export function disc(cx: number, cy: number, r: number): string {
  const a = `A${f(r)} ${f(r)} 0 0 1 `;
  return (
    `M${f(cx)} ${f(cy - r)}` +
    `${a}${f(cx + r)} ${f(cy)}` +
    `${a}${f(cx)} ${f(cy + r)}` +
    `${a}${f(cx - r)} ${f(cy)}` +
    `${a}${f(cx)} ${f(cy - r)}Z`
  );
}

/**
 * A rotated square, measured corner to corner — the `Gem` shape, and the
 * house's most-repeated mark. Its keyline is `diagonal` for the reason given
 * up at KEYLINE.
 */
export function diamond(cx: number, cy: number, r: number): string {
  return `M${f(cx)} ${f(cy - r)}L${f(cx + r)} ${f(cy)}L${f(cx)} ${f(cy + r)}L${f(cx - r)} ${f(cy)}Z`;
}

/**
 * A chevron — an open arrow head, drawn as a filled band so it carries the
 * same weight as everything else rather than depending on a stroke.
 *
 * `dir` is the direction it points. Chevrons are how this system says rank,
 * progress and direction, which is why the tier ladder is built from them.
 */
export function chevron(
  cx: number,
  cy: number,
  w: number,
  h: number,
  t: number,
  dir: 'up' | 'down' = 'up',
): string {
  const s = dir === 'up' ? 1 : -1;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const yTip = cy - (s * h) / 2;
  const yTail = cy + (s * h) / 2;
  return (
    `M${f(x0)} ${f(yTail)}L${f(cx)} ${f(yTip)}L${f(x1)} ${f(yTail)}` +
    `L${f(x1 - t)} ${f(yTail)}L${f(cx)} ${f(yTip + s * t)}L${f(x0 + t)} ${f(yTail)}Z`
  );
}

/**
 * A bar. Horizontal by default; the workhorse for rows, rules and name slots.
 *
 * Bars are always solid, never outlined — a 2-unit bar cannot hold a 1.6
 * outline and read as anything, which `TabIcon` found the hard way and wrote
 * into its `lineup` case.
 */
export function bar(x: number, y: number, w: number, h: number): string {
  return rect(x, y, w, h, Math.min(h / 2, 1));
}

/**
 * A shield — the tier and outcome carrier.
 *
 * Flat shoulders and a chamfered point rather than a curved crest, so it
 * belongs to the faceted family. Keyline `portrait`.
 */
export function shield(cx: number, top: number, w: number, h: number): string {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const shoulder = top + h * 0.62;
  const cut = w * 0.28;
  return (
    `M${f(x0)} ${f(top)}H${f(x1)}V${f(shoulder)}` +
    `L${f(cx + cut)} ${f(top + h)}H${f(cx - cut)}` +
    `L${f(x0)} ${f(shoulder)}Z`
  );
}

/**
 * ---------------------------------------------------------------------------
 * THE SWEPT SHAPES — where a glyph gets its character
 * ---------------------------------------------------------------------------
 *
 * Everything above this line is a straight-edged mass: rectangles, polygons,
 * a disc. That was the whole vocabulary in the first version of this file, and
 * it capped what the set could ever be — a plate with a chevron on it, a
 * shield with a diamond in it. Correct by every rule in the system and dead on
 * the page, because nothing in the vocabulary could TAPER.
 *
 * A tapered stroke — a shape that comes to a point, swells, and comes to a
 * point again — is what separates a sports mark from a wayfinding pictogram.
 * It is what every blade, slash, laurel leaf, dart and swoosh on a reference
 * sheet of this kind is made of. Adding it is not decoration; it is the
 * difference between a set that reads as designed and one that reads as
 * assembled from a shape palette.
 */

/** A point at `deg` degrees and `r` units from a centre. 0° is straight up. */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/**
 * A BLADE: a lens that comes to a point at both ends and swells to `w` across
 * its middle, with an optional `bow` bending its spine.
 *
 * This is the workhorse of the swept vocabulary. A slash behind a figure, a
 * laurel leaf, a dart, a claw, a motion streak and a flame tongue are all this
 * shape at different lengths, widths and bows.
 *
 * Both sides are quadratics off the same spine, so the two tips are genuinely
 * sharp — which is the property that matters. Rounded ends read as a lozenge
 * and lose the whole effect.
 *
 * NOTE ON SNAPPING: control points are snapped like everything else, so a very
 * short blade can lose its bow to the grid. Below about four units, draw the
 * shape as a polygon instead — the taper is not visible at that size anyway.
 */
export function taper(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  bow = 0,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // Unit normal to the spine. The two sides bulge along it in opposite
  // directions; `bow` slides the whole spine along it first.
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (x1 + x2) / 2 + nx * bow;
  const my = (y1 + y2) / 2 + ny * bow;
  return (
    `M${f(x1)} ${f(y1)}` +
    `Q${f(mx + nx * w)} ${f(my + ny * w)} ${f(x2)} ${f(y2)}` +
    `Q${f(mx - nx * w)} ${f(my - ny * w)} ${f(x1)} ${f(y1)}Z`
  );
}

/**
 * A star / burst. `points` spikes alternating between `outer` and `inner`.
 *
 * Straight-edged on purpose — a star is the one radial mark in this system
 * that should NOT taper, because a tapered star is a sparkle and reads as
 * decoration rather than as a rank or an award.
 */
export function star(
  cx: number,
  cy: number,
  points: number,
  outer: number,
  inner: number,
  rotate = 0,
): string {
  const step = 360 / (points * 2);
  const segs: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const p = polar(cx, cy, i % 2 === 0 ? outer : inner, rotate + i * step);
    segs.push(`${i === 0 ? 'M' : 'L'}${f(p.x)} ${f(p.y)}`);
  }
  return `${segs.join('')}Z`;
}

/**
 * Radial repetition — `n` copies of a shape around a centre.
 *
 * The builder is called with the index and the angle and returns path data, so
 * repetition composes with every other primitive without this file having to
 * parse and rewrite path strings. That is the whole reason it is shaped as a
 * callback rather than as `rotate(path, deg)`: rewriting arbitrary path data
 * correctly means implementing a path interpreter, and the callback needs
 * none.
 *
 * Radial arrangement is the second half of what gives a badge its energy. One
 * blade is a mark; six blades around a centre is a burst.
 */
export function radial(n: number, build: (i: number, deg: number) => string): string {
  const step = 360 / n;
  return Array.from({ length: n }, (_, i) => build(i, i * step)).join('');
}

/**
 * A blade swept around a centre — the commonest radial case, pulled out
 * because writing it inline with `polar` twice is noisy and easy to get wrong.
 *
 * Runs from `rInner` to `rOuter` along `deg`, with `bow` bending it into the
 * curved claw that makes a burst look like it is spinning rather than
 * exploding.
 */
export function spoke(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  deg: number,
  w: number,
  bow = 0,
): string {
  const a = polar(cx, cy, rInner, deg);
  const b = polar(cx, cy, rOuter, deg);
  return taper(a.x, a.y, b.x, b.y, w, bow);
}

/**
 * Corner ticks — the "this one is picked" motif, lifted from
 * `TierColors.cornerTicks` and `Hearts`' focus treatment.
 *
 * Returned as four separate subpaths so the caller can stroke them. They sit
 * OUTSIDE the keyline on purpose: they frame a glyph rather than being part of
 * one. That is also why they belong to the caller and never to a `Glyph` —
 * dropped into `parts` they would blow the live-area check, correctly, because
 * at that point they would be claiming to be part of the drawing.
 */
export function ticks(inset: number, len: number): string {
  const a = inset;
  const b = GRID - inset;
  return (
    `M${f(a)} ${f(a + len)}V${f(a)}H${f(a + len)}` +
    `M${f(b - len)} ${f(a)}H${f(b)}V${f(a + len)}` +
    `M${f(b)} ${f(b - len)}V${f(b)}H${f(b - len)}` +
    `M${f(a + len)} ${f(b)}H${f(a)}V${f(b - len)}`
  );
}

/**
 * ---------------------------------------------------------------------------
 * WHAT A GLYPH IS
 * ---------------------------------------------------------------------------
 */

/**
 * One drawn part.
 *
 * `role` is the distinction `TabIcon` discovered and documented but had no way
 * to name: some parts of a glyph carry the hollow/solid state and some are
 * constant. The divider in `scores` and the name bars in `lineup` stay solid
 * in both states, because they are the RELATIONSHIP being drawn rather than
 * one of the things being related. Getting this wrong makes a glyph read as
 * three shapes instead of one idea.
 *
 *   stateful  filled when active, outlined when not — the default
 *   constant  always filled, whatever the state
 *   accent    always filled, and tinted with the accent rather than the
 *             glyph colour (the gold in a tier mark, the steel in a blade)
 *   knockout  cut OUT of the mass beneath it, never painted
 *
 * `knockout` exists because the first version of this file did not have it and
 * the omission was invisible until the set was rendered. A tier shield with a
 * `constant` chevron reads correctly while hollow — outlined shield, filled
 * chevron — and then goes blank the moment it fills, because the chevron is
 * painted the same colour as the shield it sits on. Every mark that reads by
 * SUBTRACTION needs to say so; painting it in the background colour instead
 * would work only until someone put the glyph on a different surface.
 */
export type PartRole = 'stateful' | 'constant' | 'accent' | 'knockout';

export type Part = {
  d: string;
  role?: PartRole;
  /** Outline instead of fill. Weight comes from the scale, never a number. */
  stroke?: StrokeWeight;
  /** Softens this part only. Whole-glyph opacity is not a thing here. */
  opacity?: number;
};

export type Glyph = {
  /** Stable id. Used as the React key and by the validator's report. */
  name: string;
  /** Which optical family the dominant mass belongs to. See KEYLINE. */
  keyline: Keyline;
  parts: Part[];
  /**
   * At most two characters, centred — the reference sheet's own answer for
   * position marks, and a legitimate glyph in this system rather than a
   * failure to draw one. Sized off the keyline, not guessed.
   */
  label?: string;
  /**
   * Parts allowed to break the live area, named so the exception is a decision
   * rather than an oversight. `Hearts` needs this: its hilt and its torn halves
   * leave the box by design.
   */
  bleeds?: boolean;
  /**
   * The coordinate space this glyph's path data was authored in, when it is
   * not `GRID`.
   *
   * Artwork drawn in Figma or exported from a generator arrives on its own
   * canvas — 2048 is what the Figma round-trip returns. Rather than rewrite
   * every coordinate on import (lossy, unreviewable, and it would fight the
   * optical corrections that make the drawing good), the renderer scales the
   * whole glyph once and the validator measures in the same space.
   *
   * Set it and the `snap` rule is waived for that glyph: a curve drawn by hand
   * lands on the decimals it needs to, and forcing those onto a half-unit grid
   * is exactly the rule that made the composed glyphs look stiff.
   */
  source?: number;
};

/**
 * Label size, derived rather than chosen.
 *
 * Two characters across the square keyline's width, allowing for the tracking
 * that a condensed uppercase pair needs to not look jammed. This is the number
 * my first attempt guessed at and got wrong, which is precisely the kind of
 * thing a system exists to stop being a guess.
 */
export const LABEL = {
  size: snap(KEYLINE.square.w * 0.52),
  tracking: 0.4,
  weight: '800' as const,
};
