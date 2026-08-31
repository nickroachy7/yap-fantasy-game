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

/**
 * IMPORTED ARTWORK. Drawn elsewhere, refined in Figma, brought in by
 * `scripts/svg-to-glyph.mjs` — see that script for what it strips and why.
 *
 * This is the glyph that proves the harness works on art it did not compose:
 * 34 cubic curve segments in one continuous outline, in its own 2048 space,
 * still measured against the same keyline as everything above and still
 * tinting from the `color` prop. The composed primitives cannot draw this and
 * were never going to.
 */
export const teamHelmet: Glyph = {
  name: 'team-helmet',
  keyline: 'square',
  source: 2048,
  parts: [
    { d: 'M968.157 317.521C1183.26 310.762 1406.82 414.376 1541.38 582.123C1563.71 609.618 1584.05 638.673 1602.24 669.064C1628.43 712.842 1686.31 830.174 1680.45 879.767C1676.87 910.006 1654.67 936.814 1625.24 944.949C1601.64 951.47 1575.07 946.109 1550.8 946.069C1467.03 945.93 1374.23 958.6 1306.37 1011.82C1252.96 1053.71 1221.84 1124.2 1238.85 1191.75C1243.7 1211.02 1255.63 1229.46 1263.44 1247.79C1286.43 1301.69 1297.06 1362.58 1290.04 1420.89C1332.13 1439.76 1342.57 1461.1 1373.68 1489.41C1414.31 1525.36 1461.54 1557.12 1513.47 1573.9C1534.89 1580.82 1566.67 1589.89 1583.84 1570.11C1591.22 1561.61 1595.03 1549.6 1598.92 1539.19C1616 1493.47 1623.25 1445.07 1627.26 1396.64C1628.6 1380.77 1627.69 1356.2 1631.04 1341.76C1633.93 1329.19 1640.05 1317.59 1648.79 1308.1C1662.39 1293.35 1681.32 1284.63 1701.38 1283.88C1721.27 1283.32 1740.94 1291.41 1755.55 1304.91C1787 1333.96 1780.04 1382.28 1775.17 1421.13C1763.67 1512.95 1732.08 1618.41 1665.63 1685.95C1663.94 1687.62 1662.2 1689.24 1660.43 1690.82C1626.75 1720.71 1585.58 1731.46 1541.4 1727.72C1423.35 1717.71 1311.27 1649.14 1234.84 1561.89C1182.44 1628.77 1096.4 1667.18 1013.98 1669.75C919.666 1672.7 839.155 1636.66 776.798 1567.48C767.614 1557.29 739.217 1535.35 727.49 1527.72C656.492 1481.51 564.917 1464.77 481.269 1468.66C466.471 1469.33 451.723 1470.84 437.096 1473.18C400.084 1478.73 366.751 1483.26 336.487 1455.1C325.105 1444.58 317.062 1430.96 313.357 1415.91C306.602 1388.86 311.713 1352.16 306.258 1321.8C301.172 1287.59 293.779 1253.38 286.597 1219.53C235.1 976.828 285.479 723.836 459.923 541.132C597.831 396.694 769.548 323.928 968.157 317.521Z' },
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
  teamHelmet,
];
