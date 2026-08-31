#!/usr/bin/env node
/**
 * Flatten a traced SVG into one absolute, transform-free path.
 *
 *   node scripts/flatten-svg-path.mjs traced.svg > clean.svg
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 *
 * `potrace` — the step that turns a generated raster icon into vector — emits
 * path data that is correct and completely unusable downstream:
 *
 *   1. RELATIVE commands (`m`, `l`, `c`), so no coordinate in the file is the
 *      coordinate it appears to be.
 *   2. Wrapped in `<g transform="translate(0,H) scale(0.1,-0.1)">`, a Y-flip
 *      that exists because potrace's origin is bottom-left and SVG's is
 *      top-left.
 *
 * Both are invisible until something tries to MEASURE the glyph. The icon
 * validator reads absolute coordinates to check the keyline and the live area;
 * handed relative data inside a flipped group it would compute confident
 * nonsense and pass a glyph that renders upside down.
 *
 * The alternative was teaching `Glyph` to carry a transform string. That
 * spreads the problem: every consumer — renderer, validator, splitter — then
 * has to remember to apply it, and the first one that forgets is a bug nobody
 * sees until it ships. Baking it once, here, means everything downstream can
 * assume the same thing about every glyph in the set.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/flatten-svg-path.mjs <traced.svg>');
  process.exit(1);
}
const svg = readFileSync(file, 'utf8');

/** The wrapping group's affine, as [a, b, c, d, e, f]. Identity if absent. */
function matrixOf(source) {
  let m = [1, 0, 0, 1, 0, 0];
  const t = source.match(/<g[^>]*transform="([^"]+)"/);
  if (!t) return m;
  const mul = (p, q) => [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3],
    p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ];
  for (const op of t[1].matchAll(/(translate|scale|matrix)\s*\(([^)]*)\)/g)) {
    const n = (op[2].match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number);
    if (op[1] === 'translate') m = mul(m, [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]);
    else if (op[1] === 'scale') m = mul(m, [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]);
    else m = mul(m, n);
  }
  return m;
}

const M = matrixOf(svg);
const apply = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
const r = (n) => Math.round(n * 1000) / 1000;

/**
 * Walk one path, converting every command to absolute and pushing it through
 * the matrix. Only the commands potrace actually emits are handled; anything
 * else is a loud failure rather than a silent wrong answer.
 */
function flatten(d) {
  const tokens = d.match(/[a-zA-Z]|-?[\d.]+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cur = [0, 0];
  let start = [0, 0];
  let cmd = '';
  const out = [];
  const num = () => Number(tokens[i++]);

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    if (C === 'M' || C === 'L') {
      const x = num();
      const y = num();
      cur = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      if (C === 'M') start = cur;
      const [px, py] = apply(cur[0], cur[1]);
      out.push(`${C}${r(px)} ${r(py)}`);
      if (C === 'M') cmd = rel ? 'l' : 'L';
    } else if (C === 'H' || C === 'V') {
      const v = num();
      cur = C === 'H'
        ? [rel ? cur[0] + v : v, cur[1]]
        : [cur[0], rel ? cur[1] + v : v];
      const [px, py] = apply(cur[0], cur[1]);
      out.push(`L${r(px)} ${r(py)}`);
    } else if (C === 'C') {
      const p = [num(), num(), num(), num(), num(), num()];
      const abs = rel
        ? [cur[0] + p[0], cur[1] + p[1], cur[0] + p[2], cur[1] + p[3], cur[0] + p[4], cur[1] + p[5]]
        : p;
      const a1 = apply(abs[0], abs[1]);
      const a2 = apply(abs[2], abs[3]);
      const a3 = apply(abs[4], abs[5]);
      out.push(`C${r(a1[0])} ${r(a1[1])} ${r(a2[0])} ${r(a2[1])} ${r(a3[0])} ${r(a3[1])}`);
      cur = [abs[4], abs[5]];
    } else if (C === 'Z') {
      out.push('Z');
      cur = start;
    } else {
      console.error(`unsupported path command "${cmd}" — refusing to guess`);
      process.exit(1);
    }
  }
  return out.join('');
}

const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => flatten(m[1]));

// Normalise into a square box whose ORIGIN IS 0,0, with the artwork centred
// and scaled to sit on its keyline.
//
// This has to happen here rather than in the importer. The renderer applies a
// single `scale()` to place an imported glyph, and scale() works about the
// origin — so a viewBox with a non-zero origin silently lands the artwork
// offset by exactly that origin. The icon lint caught this as "mass sits 3.1
// off centre" on all six hearts, which is the failure being fixed.
//
// A square-keyline glyph occupies 18 of the 24-unit box, so the artwork takes
// the central 75% here and the renderer's scale does the rest.
const KEYLINE_FRACTION = { square: 18 / 24, circle: 20 / 24, portrait: 20 / 24, landscape: 20 / 24, diagonal: 21 / 24 };
const keyline = process.argv[3] ?? 'square';
const frac = KEYLINE_FRACTION[keyline];
if (!frac) {
  console.error(`unknown keyline "${keyline}" — expected one of ${Object.keys(KEYLINE_FRACTION).join(', ')}`);
  process.exit(1);
}

const BOX = 1000;
const coords = [];
paths.forEach((p) => {
  const t = p.match(/[A-Z]|-?[\d.]+/g);
  let n = 0;
  for (const tok of t) {
    if (/[A-Z]/.test(tok)) continue;
    coords.push([n % 2 === 0 ? 'x' : 'y', Number(tok)]);
    n += 1;
  }
});
const xs = coords.filter((c) => c[0] === 'x').map((c) => c[1]);
const ys = coords.filter((c) => c[0] === 'y').map((c) => c[1]);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);
const k = (BOX * frac) / Math.max(maxX - minX, maxY - minY);
const ox = BOX / 2 - ((minX + maxX) / 2) * k;
const oy = BOX / 2 - ((minY + maxY) / 2) * k;

const placed = paths.map((p) => {
  let n = 0;
  return p.replace(/-?[\d.]+/g, (v) => {
    const out = n % 2 === 0 ? Number(v) * k + ox : Number(v) * k + oy;
    n += 1;
    return String(r(out));
  });
});

console.log(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">` +
    placed.map((d) => `<path d="${d}"/>`).join('') +
    `</svg>`,
);
console.error(`  ${paths.length} path(s), centred on the ${keyline} keyline in a ${BOX} box`);
