/**
 * The set. Every glyph composed from `system.ts`'s vocabulary and nothing else.
 *
 * This is the payoff of the other three files: a glyph here is a handful of
 * named shapes at named coordinates, so it can be read, diffed and argued with.
 * Compare that to the path data a drawing tool or an image model hands you,
 * where the only way to change a shoulder is to nudge forty numbers and hope.
 *
 * ---------------------------------------------------------------------------
 * HOW TO ADD ONE
 * ---------------------------------------------------------------------------
 *
 *   1. Decide which KEYLINE the dominant mass belongs to. Get this wrong and
 *      the glyph will look the wrong size beside its neighbours even though
 *      every number in it is correct. This is the step that is easy to skip
 *      and expensive to skip.
 *   2. Draw it from the builders. If you find yourself wanting a shape the
 *      vocabulary does not have, add it to `system.ts` with a comment saying
 *      what it is for — do not inline one path's worth of freehand here, which
 *      is how a set starts to drift.
 *   3. Run the lint (`npm run icons:lint`) and look at it in `/kit` at 16, 24
 *      and 64 next to the rest. The lint catches disagreement with the system;
 *      only your eye catches a football that reads as an egg.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT HERE
 * ---------------------------------------------------------------------------
 *
 * The nine tab glyphs stay in `TabIcon.tsx`. They are rectangles and circles
 * drawn from Views, they carry no facet, and they survive an out-of-date
 * native binary that renders every `<Svg>` as an unimplemented component —
 * which is a real property worth keeping for the one row of chrome present on
 * every screen. `Hearts` stays where it is for the same class of reason: three
 * states composed from clip paths, with per-scheme steel, is a renderer rather
 * than a glyph.
 *
 * This set is the BADGE layer — tiers, packs, sets, formats, outcomes — which
 * is fixed-size, stateless-ish art where a shared construction system pays.
 */
import {
  C,
  bar,
  chamfer,
  chevron,
  diamond,
  disc,
  radial,
  shield,
  spoke,
  star,
  taper,
  type Glyph,
} from './system';

/**
 * The tier ladder.
 *
 * Rank is COUNT, not colour: one chevron, two, three. `TierMotif` already
 * establishes that tier must differ in form so the signal survives greyscale
 * and a colour-blind reader, and a ladder of chevrons is the cheapest true
 * statement of "more" that this vocabulary can make.
 *
 * The top tier breaks the pattern on purpose. Three chevrons and four would be
 * a counting exercise at 24pt; a diamond is categorically a different mark,
 * which is the same move `TierMotif` makes when it reserves the lattice for
 * the top tier alone.
 */
const TIER_SHIELD = shield(C, 2, 16, 20);

export const tierBronze: Glyph = {
  name: 'tier-bronze',
  keyline: 'portrait',
  parts: [{ d: TIER_SHIELD }, { d: chevron(C, 13, 8, 4, 1.5), role: 'knockout' }],
};

export const tierSilver: Glyph = {
  name: 'tier-silver',
  keyline: 'portrait',
  parts: [
    { d: TIER_SHIELD },
    { d: chevron(C, 10.5, 8, 4, 1.5), role: 'knockout' },
    { d: chevron(C, 15.5, 8, 4, 1.5), role: 'knockout' },
  ],
};

export const tierGold: Glyph = {
  name: 'tier-gold',
  keyline: 'portrait',
  parts: [
    { d: TIER_SHIELD },
    { d: chevron(C, 8.5, 8, 4, 1.5), role: 'knockout' },
    { d: chevron(C, 13, 8, 4, 1.5), role: 'knockout' },
    { d: chevron(C, 17.5, 8, 4, 1.5), role: 'knockout' },
  ],
};

export const tierDiamond: Glyph = {
  name: 'tier-diamond',
  keyline: 'portrait',
  parts: [{ d: TIER_SHIELD }, { d: diamond(C, 13, 5), role: 'knockout' }],
};

/**
 * A pack. Chamfered rather than rounded because it is an object, and the
 * chamfer is what tells an object from a container in this system.
 *
 * The seal is a `knockout` — cut out of the pack rather than laid on top of
 * it. That is what a seam IS, and it is also the only version that survives
 * the glyph filling: a bar painted in the same colour as the body it sits on
 * disappears the moment the body is solid.
 */
export const pack: Glyph = {
  name: 'pack',
  keyline: 'portrait',
  parts: [{ d: chamfer(4, 2, 16, 20) }, { d: bar(6.5, 6, 11, 2), role: 'knockout' }],
};

/**
 * Cards — the collection mark. Two chamfered plates, offset.
 *
 * The back plate is drawn first and carries reduced opacity rather than a
 * lighter colour, so it recedes identically in both schemes and against any
 * tint the caller passes. `TabIcon`'s `players` case reaches for the same
 * trick and for the same reason: a solid pair at this size merges into a blob.
 */
export const cards: Glyph = {
  name: 'cards',
  keyline: 'portrait',
  parts: [{ d: chamfer(7, 2, 13, 17), opacity: 0.55 }, { d: chamfer(4, 5, 13, 17) }],
};

/**
 * A fixture — two sides, side by side. The landscape keyline exists for
 * exactly this shape, and using it is what stops a wide glyph from reading as
 * oversized next to a shield.
 */
export const fixture: Glyph = {
  name: 'fixture',
  keyline: 'landscape',
  parts: [{ d: chamfer(2, 4, 9, 16) }, { d: chamfer(13, 4, 9, 16) }],
};

/**
 * Live — a disc with a rule through it. The only circle-keyline glyph in this
 * starter set, and it is here to prove the keyline does its job: at 20 units
 * it sits beside the 18-unit square glyphs without either looking wrong.
 */
export const live: Glyph = {
  name: 'live',
  keyline: 'circle',
  parts: [{ d: disc(C, C, 10) }, { d: bar(7, 11, 10, 2), role: 'knockout' }],
};

/**
 * The gem — the house's own mark, and the one glyph whose geometry was already
 * decided elsewhere (`AppHeader.Gem`, a rotated square).
 *
 * It is the sole `diagonal` glyph and the reason that keyline is 21 rather
 * than 20: a diamond has to be the widest thing in the set to look the same
 * size as everything else. Draw it at 20 and it reads small; that single fact
 * is most of why an eyeballed icon set never quite settles.
 */
export const gem: Glyph = {
  name: 'gem',
  keyline: 'diagonal',
  parts: [{ d: diamond(C, C, 10.5) }],
};

/**
 * Position marks — two capitals inside a four-bladed burst.
 *
 * TYPE IS A LEGITIMATE GLYPH HERE, not a failure to draw one. The reference
 * sheet that started this work solves its own position marks exactly this way,
 * and it is the right answer: five figure illustrations distinguishable at
 * 24pt is a hard brief nobody needs to accept when the position already has a
 * two-letter name every player in the sport knows.
 *
 * THE BURST IS THE POINT, THOUGH. The first version of this glyph was the
 * letters on a plain chamfered plate, and it was correct by every rule in the
 * system and completely inert — because the vocabulary at the time had no
 * shape that could taper, so "a plate" was the most it could say. Four bowed
 * blades set at the diagonals give the mark its rotation and its energy, and
 * they sit in the corners the type does not use, so nothing is crowded.
 *
 * Blades rather than a ring: a ring closes the mark and makes it a button,
 * and the app already spends its rings on `TierMotif`.
 */
function position(code: string): Glyph {
  return {
    name: `pos-${code.toLowerCase()}`,
    keyline: 'square',
    parts: [
      {
        // Diagonals only — 45° off the axes, so the blades frame the letters
        // instead of pointing at them.
        d: radial(4, (_, deg) => spoke(C, C, 5, 11, deg + 45, 1.6, 1.2)),
        role: 'constant',
      },
    ],
    label: code,
  };
}

export const posQB = position('QB');
export const posRB = position('RB');
export const posWR = position('WR');
export const posTE = position('TE');
export const posPK = position('PK');

/**
 * A burst — eight bowed blades around a centre.
 *
 * The set's "something happened" mark: a pull, a reward, a milestone landing.
 * It is also the clearest demonstration of what `radial` plus `taper` buys —
 * eight calls to one primitive, and the result has motion in it, which nothing
 * built from rectangles ever did.
 *
 * `diagonal` keyline because the blades on the axes reach the full radius, so
 * it measures corner to corner like the gem does.
 */
export const burst: Glyph = {
  name: 'burst',
  keyline: 'diagonal',
  parts: [{ d: radial(8, (_, deg) => spoke(C, C, 3, 10.5, deg, 1.4, 0.9)) }],
};

/**
 * A flame — three tongues, and the streak glyph for a run on a heater.
 *
 * Deliberately ASYMMETRIC. A symmetrical flame reads as a leaf or a spade;
 * what makes fire read as fire is that the tongues disagree about where they
 * are going. The bows alternate sign for exactly that reason.
 */
export const flame: Glyph = {
  name: 'flame',
  keyline: 'portrait',
  parts: [
    { d: taper(11, 21, 13.5, 3, 4.5, 1.5) },
    { d: taper(9, 20, 8, 9.5, 2.5, -1), opacity: 0.55 },
    { d: taper(15, 20.5, 16.5, 10, 2.5, 1), opacity: 0.55 },
  ],
};

/**
 * The top tier, redrawn — a shield carrying a laurel and a star.
 *
 * Kept beside `tier-diamond` rather than replacing it so the two constructions
 * can be compared in the gallery: this is what the vocabulary can say now, and
 * the diamond is what it could say before.
 */
export const tierLaurel: Glyph = {
  name: 'tier-laurel',
  keyline: 'portrait',
  parts: [
    { d: TIER_SHIELD },
    { d: star(C, 12, 5, 4.5, 2), role: 'knockout' },
    { d: taper(8, 18.5, 6.5, 9.5, 1.4, -1.2), role: 'knockout' },
    { d: taper(16, 18.5, 17.5, 9.5, 1.4, 1.2), role: 'knockout' },
  ],
};

/** The whole set, in the order the gallery and the lint walk it. */
export const GLYPHS: Glyph[] = [
  tierBronze,
  tierSilver,
  tierGold,
  tierDiamond,
  tierLaurel,
  burst,
  flame,
  pack,
  cards,
  fixture,
  live,
  gem,
  posQB,
  posRB,
  posWR,
  posTE,
  posPK,
];
