/**
 * Renders every raster brand asset from the one vector source.
 *
 *   npm run brand
 *
 * The outputs are COMMITTED, not built on deploy. They change about as often as
 * the logo does — which is to say almost never — and generating them at build
 * time would put a 40MB native canvas binding into the Vercel install for seven
 * files that are byte-identical between deploys. `@napi-rs/canvas` is a
 * devDependency and exists for this script alone; nothing in `src/` imports it.
 *
 * ── Why this reads the component instead of holding its own copy ────────────
 *
 * The path data has to exist twice: once as JSX the app renders, once as
 * something a canvas can fill. A hand-kept duplicate is the exact shape of
 * divergence that bit the old repo more than once, so the copy is made
 * mechanically at render time — this script parses the `const NAME = '…'`
 * declarations and the two viewBoxes straight out of `YapLogo.tsx`. That
 * component is the single source of truth for the mark. If it changes, re-run
 * this script and the PNGs follow. They cannot silently drift.
 *
 * ── What each asset is for, and why it is drawn the way it is ───────────────
 *
 * ICON is square and full-bleed. iOS and Android both mask app icons to their
 * own shape, so baking a corner radius in gets it rounded twice — a visibly
 * thinner, darker edge on the device.
 *
 * FAVICON *is* rounded, for the opposite reason: nothing masks it. It sits raw
 * on browser chrome, and the ink ground is what keeps the lime legible when
 * that chrome is white.
 *
 * SPLASH is drawn with BLACK cutouts, not ink. It lands on the splash screen's
 * own `backgroundColor` (#000000 in app.json), and the cutouts have to match
 * the surface they sit on or the bot's face reads as a grey smear. See the
 * header of `YapLogo.tsx`.
 *
 * ANDROID FOREGROUND keeps well inside a safe zone. Adaptive icons are cropped
 * to a shape the OEM picks, and only the middle ~66% of the canvas is
 * guaranteed to survive; a mark sized to the full square loses its ears.
 *
 * ANDROID MONOCHROME knocks the face out rather than painting it. Themed icons
 * are tinted from the wallpaper — every opaque pixel becomes one flat colour —
 * so a face painted ink would vanish into the body and leave a blob.
 *
 * OG is the one asset with type on it, because it is the only one a human reads
 * at full size: it is what Discord and iMessage unfurl when the link gets sent
 * round. Poppins is embedded from `scripts/brand-fonts/` — those two files are
 * for this script only and are never bundled into the app.
 */
import { createCanvas, GlobalFonts, Path2D } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoFile = (rel) => resolve(root, rel);

/** Mirrored from `Brand` in src/constants/theme.ts. */
const LIME = '#C7F53D';
const INK = '#101114';
/** The splash screen's own backgroundColor, from app.json. */
const SPLASH_GROUND = '#000000';

const TAGLINE = 'Open packs. Set your lineup. Win the week.';

/* ------------------------------------------------------------------------- *
 * Reading the mark out of the component that owns it
 * ------------------------------------------------------------------------- */

function readLogo() {
  const src = readFileSync(repoFile('src/components/brand/YapLogo.tsx'), 'utf8');

  // Filtered to the four-number form rather than trusted, so a viewBox that
  // parses short becomes a missing box — which the guard below refuses — rather
  // than a NaN that silently draws the mark somewhere off-canvas.
  const boxes = [...src.matchAll(/viewBox="([\d.\s-]+)"/g)]
    .map((m) => (m[1] ?? '').trim().split(/\s+/).map(Number))
    .filter((ns) => ns.length === 4 && ns.every(Number.isFinite))
    .map(([x, y, w, h]) => ({ x, y, w, h }));

  // Order is the component's own: the full lockup first, then the mark alone.
  const [lockup, mark] = boxes;

  const paths = Object.fromEntries(
    [...src.matchAll(/^const ([A-Z_]+) =\n {2}'([^']+)';$/gm)].map((m) => [m[1], m[2]]),
  );

  const need = [
    'BOT',
    'BOT_FACE',
    'WORDMARK_Y',
    'WORDMARK_A',
    'WORDMARK_A_COUNTER',
    'WORDMARK_P',
    'WORDMARK_P_COUNTER',
  ];
  const missing = need.filter((k) => !paths[k]);
  if (!lockup || !mark || missing.length) {
    throw new Error(
      `YapLogo.tsx did not parse as expected — boxes: ${boxes.length}, missing paths: ${
        missing.join(', ') || 'none'
      }. The component's shape changed; update the patterns above.`,
    );
  }

  return { lockup, mark, paths };
}

const { lockup, mark, paths } = readLogo();

/**
 * The mark as a flat draw list. `tone` is which of the two colours a shape
 * takes, resolved per-asset — that indirection is the whole point of the
 * component being two-tone rather than flattened.
 */
const MARK_SHAPES = [
  { tone: 'lime', d: paths.BOT },
  { tone: 'ink', d: paths.BOT_FACE },
];

const LOCKUP_SHAPES = [
  ...MARK_SHAPES,
  { tone: 'lime', d: paths.WORDMARK_Y },
  { tone: 'lime', d: paths.WORDMARK_A },
  { tone: 'ink', d: paths.WORDMARK_A_COUNTER },
  { tone: 'lime', d: paths.WORDMARK_P },
  { tone: 'ink', d: paths.WORDMARK_P_COUNTER },
];

/* ------------------------------------------------------------------------- *
 * Drawing
 * ------------------------------------------------------------------------- */

/**
 * Draws a lockup centred in `box`, scaled to fit, with the two tones resolved.
 *
 * `knockout` swaps the ink pass for a real erase (`destination-out`) instead of
 * a fill — which is what the monochrome icon needs and nothing else does.
 */
function drawLogo(ctx, shapes, viewBox, box, { lime, ink, knockout = false } = {}) {
  const scale = Math.min(box.w / viewBox.w, box.h / viewBox.h);
  const w = viewBox.w * scale;
  const h = viewBox.h * scale;

  ctx.save();
  ctx.translate(box.x + (box.w - w) / 2, box.y + (box.h - h) / 2);
  ctx.scale(scale, scale);
  ctx.translate(-viewBox.x, -viewBox.y);

  for (const shape of shapes) {
    if (shape.tone === 'ink' && knockout) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = shape.tone === 'lime' ? lime : ink;
    }
    ctx.fill(new Path2D(shape.d));
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const written = [];

function emit(rel, canvas) {
  const out = repoFile(rel);
  mkdirSync(dirname(out), { recursive: true });
  const buf = canvas.toBuffer('image/png');
  writeFileSync(out, buf);
  written.push([rel, `${canvas.width}×${canvas.height}`, `${(buf.length / 1024).toFixed(1)} KB`]);
}

/* ------------------------------------------------------------------------- *
 * The assets
 * ------------------------------------------------------------------------- */

/** App icon — square, full-bleed. The OS masks it; see the header. */
{
  const size = 1024;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, size, size);
  // 62% of the square. The mark is wide, so this is set by width, and it leaves
  // the corners clear of whatever radius the platform mask ends up using.
  const inset = size * 0.19;
  drawLogo(ctx, MARK_SHAPES, mark, { x: inset, y: 0, w: size - inset * 2, h: size }, {
    lime: LIME,
    ink: INK,
  });
  emit('assets/images/icon.png', canvas);
}

/** Favicon — rounded, because nothing else will round it. */
{
  const size = 256;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  roundedRect(ctx, 0, 0, size, size, size * 0.22);
  ctx.fillStyle = INK;
  ctx.fill();
  const inset = size * 0.16;
  drawLogo(ctx, MARK_SHAPES, mark, { x: inset, y: 0, w: size - inset * 2, h: size }, {
    lime: LIME,
    ink: INK,
  });
  emit('assets/images/favicon.png', canvas);
}

/** Apple touch icon for the web app — square, iOS rounds it itself. */
{
  const size = 180;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, size, size);
  const inset = size * 0.17;
  drawLogo(ctx, MARK_SHAPES, mark, { x: inset, y: 0, w: size - inset * 2, h: size }, {
    lime: LIME,
    ink: INK,
  });
  emit('public/apple-touch-icon.png', canvas);
}

/** Splash — transparent ground, cutouts matching the splash background. */
{
  const w = 512;
  const h = Math.round(w / (mark.w / mark.h));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  drawLogo(ctx, MARK_SHAPES, mark, { x: 0, y: 0, w, h }, { lime: LIME, ink: SPLASH_GROUND });
  emit('assets/images/splash-icon.png', canvas);
}

/** Android adaptive foreground — inside the safe zone. */
{
  const size = 1024;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  // Only the middle ~66% survives every OEM mask, so the mark is drawn into
  // 54% and the rest is deliberate air.
  const safe = size * 0.54;
  drawLogo(
    ctx,
    MARK_SHAPES,
    mark,
    { x: (size - safe) / 2, y: (size - safe) / 2, w: safe, h: safe },
    { lime: LIME, ink: INK },
  );
  emit('assets/images/android-icon-foreground.png', canvas);
}

/** Android adaptive background — flat ink, so the tile matches the app icon. */
{
  const size = 1024;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, size, size);
  emit('assets/images/android-icon-background.png', canvas);
}

/** Android themed icon — silhouette with the face erased, not filled. */
{
  const size = 1024;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const safe = size * 0.54;
  drawLogo(
    ctx,
    MARK_SHAPES,
    mark,
    { x: (size - safe) / 2, y: (size - safe) / 2, w: safe, h: safe },
    { lime: '#000000', ink: null, knockout: true },
  );
  emit('assets/images/android-icon-monochrome.png', canvas);
}

/** Open Graph card — the link preview, and the only asset with type on it. */
{
  GlobalFonts.registerFromPath(repoFile('scripts/brand-fonts/Poppins-Bold.ttf'), 'PoppinsBrand');
  GlobalFonts.registerFromPath(
    repoFile('scripts/brand-fonts/Poppins-Medium.ttf'),
    'PoppinsBrandMedium',
  );

  const w = 1200;
  const h = 630;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  // A flat ink field reads as a black rectangle at thumbnail size in a Discord
  // feed. The gradient is slight — five steps of lightness — but it is enough
  // to make the card look like a surface rather than a hole.
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#16181C');
  bg.addColorStop(1, INK);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // The lockup sits above centre so the tagline below it lands on the optical
  // middle rather than under it.
  drawLogo(ctx, LOCKUP_SHAPES, lockup, { x: 0, y: h * 0.2, w, h: h * 0.34 }, {
    lime: LIME,
    // The gradient is behind the counters here, so neither end matches exactly.
    // The midpoint is the least-wrong single value, and at this size the
    // difference is under a shade.
    ink: '#131519',
  });

  ctx.fillStyle = '#C6CABF';
  ctx.font = '34px PoppinsBrandMedium';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(TAGLINE, w / 2, h * 0.72);

  ctx.fillStyle = LIME;
  ctx.font = '22px PoppinsBrand';
  ctx.fillText('yapfantasy.com', w / 2, h * 0.855);

  emit('public/og.png', canvas);
}

/* ------------------------------------------------------------------------- */

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nRendered ${written.length} assets from src/components/brand/YapLogo.tsx\n`);
for (const [rel, dims, size] of written) {
  console.log(`  ${pad(rel, 44)} ${pad(dims, 12)} ${size}`);
}
console.log('');
