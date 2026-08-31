#!/usr/bin/env node
/**
 * Split a generated row of icons into per-icon crop boxes.
 *
 *   node scripts/split-icon-row.mjs sheet.png 5
 *
 * Prints one `WxH+X+Y` geometry per line, ready to feed straight to
 * `magick ... -crop <geometry>`.
 *
 * ---------------------------------------------------------------------------
 * WHY THE OBVIOUS VERSION DOES NOT WORK
 * ---------------------------------------------------------------------------
 *
 * The naive split is: find every run of columns containing ink, call each run
 * an icon. That worked for the hearts because every heart is one connected
 * mass. It fails the moment an icon is made of separate pieces — a fan of
 * cards, three circles in a huddle, a sword held off a heart by a gap — because
 * the gaps INSIDE an icon look exactly like the gaps BETWEEN icons. A five-icon
 * sheet came back reporting six, and a naive cut would have sliced one icon in
 * half and merged two others.
 *
 * So the count is an input, not a guess. The row is evenly spaced by
 * construction, which means the N-1 widest gaps are the real boundaries and
 * every narrower gap is internal to an icon. Sorting gaps and keeping the
 * largest N-1 is robust to whatever the artwork does inside its own box.
 */
import { execFileSync } from 'node:child_process';

const [file, countArg] = process.argv.slice(2);
const N = Number(countArg);
if (!file || !Number.isInteger(N) || N < 1) {
  console.error('usage: node scripts/split-icon-row.mjs <sheet.png> <icon-count>');
  process.exit(1);
}

// A 1-bit bitmap is the cheapest thing to reason about, and `magick` is already
// a dependency of the tracing step.
const pbm = execFileSync(
  'magick',
  // 88%, not 50%. Several generated sheets carry a soft glow around each icon;
  // at 50% that halo thresholds to solid white and the whole row merges into
  // one blob. A high cut keeps only the icon itself, and sheets without a glow
  // are unaffected by it.
  [file, '-colorspace', 'gray', '-threshold', '88%', 'pbm:-'],
  { maxBuffer: 1 << 28 },
);

const header = /^P4\s+(\d+)\s+(\d+)\s/.exec(pbm.subarray(0, 64).toString('latin1'));
if (!header) {
  console.error('could not read the bitmap header — is this a PNG?');
  process.exit(1);
}
const W = Number(header[1]);
const H = Number(header[2]);
const off = header[0].length;
const rowBytes = (W + 7) >> 3;

// Column ink profile. In P4 a set bit is BLACK; the icons are white on black,
// so an icon pixel is a CLEAR bit.
const ink = new Array(W).fill(0);
for (let y = 0; y < H; y += 1) {
  const base = off + y * rowBytes;
  for (let x = 0; x < W; x += 1) {
    if (((pbm[base + (x >> 3)] >> (7 - (x & 7))) & 1) === 0) ink[x] += 1;
  }
}

// Runs of inked columns, ignoring specks.
const runs = [];
let start = -1;
for (let x = 0; x <= W; x += 1) {
  const on = x < W && ink[x] > 0;
  if (on && start < 0) start = x;
  else if (!on && start >= 0) {
    if (x - start > W * 0.005) runs.push([start, x]);
    start = -1;
  }
}

// When icons are drawn close enough to touch there is no empty column between
// them, so there are fewer ink runs than icons and the gap method has nothing
// to cut on. Fall back to cutting at the FAINTEST column near each expected
// boundary: the row is evenly spaced by construction, so the true seams sit
// close to the even divisions, and the thinnest ink there is the seam.
if (runs.length < N) {
  const first = runs[0][0];
  const last = runs[runs.length - 1][1];
  const pitch = (last - first) / N;
  const seams = [];
  for (let i = 1; i < N; i += 1) {
    const centre = first + pitch * i;
    const lo = Math.max(first + 1, Math.round(centre - pitch * 0.25));
    const hi = Math.min(last - 1, Math.round(centre + pitch * 0.25));
    let best = lo;
    for (let x = lo; x <= hi; x += 1) if (ink[x] < ink[best]) best = x;
    seams.push(best);
  }
  const bounds = [first, ...seams, last];
  for (let i = 0; i < N; i += 1) {
    const x0 = bounds[i];
    const x1 = bounds[i + 1];
    let y0 = H;
    let y1 = 0;
    for (let y = 0; y < H; y += 1) {
      const base = off + y * rowBytes;
      for (let x = x0; x < x1; x += 1) {
        if (((pbm[base + (x >> 3)] >> (7 - (x & 7))) & 1) === 0) {
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          break;
        }
      }
    }
    console.log(`${x1 - x0}x${y1 - y0 + 1}+${x0}+${y0}`);
  }
  console.error(`  ${N} icons cut at faintest seams (only ${runs.length} ink runs)`);
  process.exit(0);
}

// Keep the N-1 widest gaps as the cuts; everything else is internal to an icon.
const gaps = [];
for (let i = 1; i < runs.length; i += 1) gaps.push({ i, size: runs[i][0] - runs[i - 1][1] });
const cuts = new Set(
  gaps.sort((a, b) => b.size - a.size).slice(0, N - 1).map((g) => g.i),
);

const groups = [];
let cur = [runs[0]];
for (let i = 1; i < runs.length; i += 1) {
  if (cuts.has(i)) {
    groups.push(cur);
    cur = [];
  }
  cur.push(runs[i]);
}
groups.push(cur);

// Vertical extent is measured per group, so a short wide icon is not padded
// with the full sheet height before it is squared off downstream.
for (const g of groups) {
  const x0 = g[0][0];
  const x1 = g[g.length - 1][1];
  let y0 = H;
  let y1 = 0;
  for (let y = 0; y < H; y += 1) {
    const base = off + y * rowBytes;
    for (let x = x0; x < x1; x += 1) {
      if (((pbm[base + (x >> 3)] >> (7 - (x & 7))) & 1) === 0) {
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        break;
      }
    }
  }
  console.log(`${x1 - x0}x${y1 - y0 + 1}+${x0}+${y0}`);
}
console.error(`  ${groups.length} icons from ${runs.length} ink runs`);
