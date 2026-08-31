#!/usr/bin/env node
/**
 * Turn an SVG — exported from Figma, a generator, or any drawing tool — into a
 * `Glyph` you can paste into `src/components/icons/glyphs.ts`.
 *
 *   node scripts/svg-to-glyph.mjs helmet.svg team-helmet portrait
 *   node scripts/svg-to-glyph.mjs helmet.svg team-helmet portrait --clip
 *
 * Arguments: <file> <glyph-name> [keyline] where keyline is one of
 * square | circle | portrait | landscape | diagonal (default: square).
 *
 * ---------------------------------------------------------------------------
 * WHAT IT FIXES, AND WHY EACH ONE MATTERS
 * ---------------------------------------------------------------------------
 *
 * A drawing tool's export is not a glyph, and the three differences are all
 * silent failures rather than errors:
 *
 *   1. THE BACKGROUND PLATE. Anything generated on a coloured ground exports
 *      with a full-canvas rectangle behind the art. Left in, the icon renders
 *      as a solid square and the drawing is invisible inside it. Detected as a
 *      path whose bounds are the whole canvas, and dropped.
 *
 *   2. BAKED FILLS. `fill="black"` on the path overrides the colour the
 *      renderer passes, so the icon ignores the theme and disappears in one
 *      scheme. Stripped — `Icon.tsx` supplies the fill.
 *
 *   3. THE CANVAS SIZE. Figma hands back a 2048 viewBox. Rather than rewrite
 *      every coordinate (lossy, and it would fight the optical corrections
 *      that make hand-drawn work good), the glyph records `source` and the
 *      renderer scales it once. See `Glyph.source`.
 *
 * `--clip` marks every path after the first as a `knockout`, which is what you
 * want when the drawing uses interior cut-outs rather than separate shapes.
 * Check the result in `/kit`; it is a guess either way.
 */
import { readFileSync } from 'node:fs';

const [file, name, keyline = 'square'] = process.argv.slice(2);
const clip = process.argv.includes('--clip');

if (!file || !name) {
  console.error('usage: node scripts/svg-to-glyph.mjs <file.svg> <glyph-name> [keyline] [--clip]');
  process.exit(1);
}

const svg = readFileSync(file, 'utf8');

const vbMatch = svg.match(/viewBox="([\d.\-\s]+)"/);
if (!vbMatch) {
  console.error('No viewBox on the <svg> element — cannot size the glyph.');
  process.exit(1);
}
const [, , vbW, vbH] = vbMatch[1].trim().split(/\s+/).map(Number);
if (Math.abs(vbW - vbH) > 0.01) {
  console.error(`viewBox is ${vbW}x${vbH}. Glyphs must be square — re-export on a square frame.`);
  process.exit(1);
}

const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"[^>]*>/g)].map((m) => m[1]);
if (paths.length === 0) {
  console.error('No <path> elements. Flatten the artwork to paths before exporting.');
  process.exit(1);
}

/** Rough bounds from every number pair, enough to spot a full-canvas plate. */
function spans(d) {
  const n = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return {
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

const kept = paths.filter((d) => {
  const { w, h } = spans(d);
  const isPlate = w >= vbW * 0.98 && h >= vbH * 0.98;
  if (isPlate) console.error(`  · dropped a full-canvas background plate`);
  return !isPlate;
});

if (kept.length === 0) {
  console.error('Everything looked like a background plate. Check the export.');
  process.exit(1);
}

// `source` is simply the artwork's box: `flatten-svg-path.mjs` has already
// centred the drawing on its keyline inside a 0,0-origin square, so the
// renderer's single scale() is all that is left to do.
const source = vbW;

const parts = kept
  .map((d, i) => {
    const role = clip && i > 0 ? ", role: 'knockout'" : '';
    return `    { d: '${d.replace(/'/g, "\\'")}'${role} },`;
  })
  .join('\n');

console.error(`  · ${kept.length} path(s), box ${vbW} -> source ${source} (${keyline} keyline)`);
console.log(`
export const ${name.replace(/[-\s](.)/g, (_, c) => c.toUpperCase())}: Glyph = {
  name: '${name}',
  keyline: '${keyline}',
  source: ${source},
  parts: [
${parts}
  ],
};
`);
