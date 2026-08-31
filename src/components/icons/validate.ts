/**
 * THE LINT. What makes `system.ts` a system rather than a style guide.
 *
 * ---------------------------------------------------------------------------
 * WHY A VALIDATOR AND NOT A DOCUMENT
 * ---------------------------------------------------------------------------
 *
 * The house rules already existed in prose, in five component headers, written
 * clearly and at length by someone who meant them. They still drifted, because
 * prose cannot fail a build. `TabIcon`'s own header carries the confession:
 * it stated the project had no `react-native-svg` for nine days after the
 * dependency landed, and nobody noticed, "because a comment that states a fact
 * about the repo has nothing checking it."
 *
 * This is the thing that checks. Every rule below is one that, broken, makes a
 * glyph look wrong beside its neighbours in a way that is genuinely hard to
 * name by eye — which is exactly the class of error worth automating, and
 * exactly the class that sank the first attempts at this set.
 *
 * It is deliberately geometric. It cannot tell you a glyph is ugly or that a
 * football reads as an egg; no linter can. It tells you the glyph disagrees
 * with the other twenty-three, which is the failure that actually breaks a set.
 */
import {
  GRID,
  KEYLINE,
  LIVE,
  SNAP,
  STROKE,
  type Glyph,
  type Part,
} from './system';

export type Finding = {
  glyph: string;
  rule: string;
  detail: string;
  severity: 'error' | 'warning';
};

/**
 * Every coordinate a path visits, in draw order.
 *
 * `authored` marks the ones a human actually typed — command endpoints and
 * control points. The others are computed curve extrema, which belong in the
 * bounds but must never be snap-checked: the widest point of a quadratic lands
 * wherever the maths puts it, and demanding it sit on the half-unit grid would
 * fail every correctly drawn blade in the set.
 */
type Pt = { x: number; y: number; authored: boolean; control?: boolean };

function points(d: string): Pt[] {
  const out: Pt[] = [];
  // Commands carry their numbers positionally; we only need the pairs that are
  // absolute coordinates, which for the vocabulary in `system.ts` is all of
  // them — every builder emits absolute commands on purpose so this stays
  // parseable without implementing a full path interpreter.
  const re = /([MLHVAQC])([^A-Za-z]*)/g;
  let cursor: Pt = { x: 0, y: 0, authored: true };
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const cmd = m[1];
    const nums = (m[2].match(/-?\d*\.?\d+/g) ?? []).map(Number);
    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        cursor = { x: nums[i], y: nums[i + 1], authored: true };
        out.push(cursor);
      }
    } else if (cmd === 'H') {
      for (const x of nums) {
        cursor = { x, y: cursor.y, authored: true };
        out.push(cursor);
      }
    } else if (cmd === 'V') {
      for (const y of nums) {
        cursor = { x: cursor.x, y, authored: true };
        out.push(cursor);
      }
    } else if (cmd === 'Q') {
      // A quadratic's control point is NOT on the curve, so measuring it would
      // report a blade far fatter than it is drawn and fail the keyline check
      // on a glyph that is correct. The exact extremum is closed form, so use
      // it: per axis, t* = (p0 - p1) / (p0 - 2p1 + p2), taken only when it
      // lands inside the segment.
      for (let i = 0; i + 3 < nums.length; i += 4) {
        const [cxp, cyp, ex, ey] = [nums[i], nums[i + 1], nums[i + 2], nums[i + 3]];
        const p0 = cursor;
        for (const [p0v, p1v, p2v, axis] of [
          [p0.x, cxp, ex, 'x'],
          [p0.y, cyp, ey, 'y'],
        ] as const) {
          const denom = p0v - 2 * p1v + p2v;
          if (Math.abs(denom) > 1e-9) {
            const t = (p0v - p1v) / denom;
            if (t > 0 && t < 1) {
              const v = (1 - t) * (1 - t) * p0v + 2 * (1 - t) * t * p1v + t * t * p2v;
              out.push(
                axis === 'x'
                  ? { x: v, y: p0.y, authored: false }
                  : { x: p0.x, y: v, authored: false },
              );
            }
          }
        }
        cursor = { x: ex, y: ey, authored: true };
        out.push(cursor);
        // The control point is authored, so it IS snap-checked — a handle off
        // the grid is still an unreadable number. It is flagged `control` so
        // `boundsOf` drops it, because it steers the curve from outside and
        // never lies on it.
        out.push({ x: cxp, y: cyp, authored: true, control: true });
      }
    } else if (cmd === 'C') {
      // Imported artwork is almost entirely cubics — the Figma round-trip
      // returns 30-70 of them per icon — so measuring only their endpoints
      // would under-report a glyph's true bounds and let it fail the keyline
      // check for the wrong reason. Cubic extrema are the roots of the
      // derivative, a plain quadratic; both control points are flagged
      // `control` so they never widen the bounds themselves.
      for (let i = 0; i + 5 < nums.length; i += 6) {
        const c1 = { x: nums[i], y: nums[i + 1] };
        const c2 = { x: nums[i + 2], y: nums[i + 3] };
        const e = { x: nums[i + 4], y: nums[i + 5] };
        const p0 = cursor;
        for (const [v0, v1, v2, v3, axis] of [
          [p0.x, c1.x, c2.x, e.x, 'x'],
          [p0.y, c1.y, c2.y, e.y, 'y'],
        ] as const) {
          const A = 3 * (-v0 + 3 * v1 - 3 * v2 + v3);
          const B = 6 * (v0 - 2 * v1 + v2);
          const Cc = 3 * (v1 - v0);
          const roots: number[] = [];
          if (Math.abs(A) < 1e-9) {
            if (Math.abs(B) > 1e-9) roots.push(-Cc / B);
          } else {
            const disc = B * B - 4 * A * Cc;
            if (disc >= 0) {
              const r = Math.sqrt(disc);
              roots.push((-B + r) / (2 * A), (-B - r) / (2 * A));
            }
          }
          for (const t of roots) {
            if (!(t > 0 && t < 1)) continue;
            const u = 1 - t;
            const v =
              u * u * u * v0 + 3 * u * u * t * v1 + 3 * u * t * t * v2 + t * t * t * v3;
            out.push(
              axis === 'x'
                ? { x: v, y: p0.y, authored: false }
                : { x: p0.x, y: v, authored: false },
            );
          }
        }
        cursor = { x: e.x, y: e.y, authored: true };
        out.push(cursor);
        out.push({ x: c1.x, y: c1.y, authored: true, control: true });
        out.push({ x: c2.x, y: c2.y, authored: true, control: true });
      }
    } else if (cmd === 'A') {
      // An arc's last two numbers are its endpoint; the radii and flags before
      // them are not positions and must not be measured as if they were.
      for (let i = 0; i + 6 < nums.length; i += 7) {
        cursor = { x: nums[i + 5], y: nums[i + 6], authored: true };
        out.push(cursor);
      }
    }
  }
  return out;
}

function boundsOf(parts: Part[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  // Control points are excluded: a quadratic's handle sits well outside the
  // curve it steers, and counting it would report a blade as half again as
  // wide as it is drawn.
  const all = parts.flatMap((p) => points(p.d)).filter((p) => !p.control);
  if (all.length === 0) return null;
  return {
    minX: Math.min(...all.map((p) => p.x)),
    minY: Math.min(...all.map((p) => p.y)),
    maxX: Math.max(...all.map((p) => p.x)),
    maxY: Math.max(...all.map((p) => p.y)),
  };
}

/**
 * How close a glyph has to come to filling its keyline.
 *
 * A glyph measurably smaller than its keyline is the "one icon looks shrunk"
 * bug, and it is invisible until you see it in a row. 82% is loose enough that
 * a legitimately airy composition passes and tight enough to catch a glyph
 * that was simply drawn small.
 */
const FILL_FLOOR = 0.82;

export function validateGlyph(g: Glyph): Finding[] {
  const found: Finding[] = [];
  const err = (rule: string, detail: string) =>
    found.push({ glyph: g.name, rule, detail, severity: 'error' });
  const warn = (rule: string, detail: string) =>
    found.push({ glyph: g.name, rule, detail, severity: 'warning' });

  if (g.parts.length === 0) {
    err('empty', 'a glyph with no parts');
    return found;
  }

  // ---- every coordinate on the half-unit grid --------------------------
  // Waived for imported artwork: see `Glyph.source`. Hand-drawn curves carry
  // their optical corrections in exactly these decimals.
  for (const part of g.source ? [] : g.parts) {
    for (const p of points(part.d)) {
      if (!p.authored) continue;
      for (const [axis, v] of [['x', p.x], ['y', p.y]] as const) {
        if (Math.abs(v / SNAP - Math.round(v / SNAP)) > 1e-9) {
          err('snap', `${axis}=${v} is not on the ${SNAP} grid`);
        }
      }
    }
  }

  const b = boundsOf(g.parts);
  if (!b) return found;

  // ---- inside the live area -------------------------------------------
  // Skipped for a glyph that declares it bleeds, so the exception is a
  // decision recorded in the glyph rather than a silent pass.
  if (!g.bleeds) {
    const sc = g.source ? GRID / g.source : 1;
    if (
      b.minX * sc < LIVE.min ||
      b.minY * sc < LIVE.min ||
      b.maxX * sc > LIVE.max ||
      b.maxY * sc > LIVE.max
    ) {
      err(
        'live-area',
        `extends to (${b.minX},${b.minY})-(${b.maxX},${b.maxY}), outside ${LIVE.min}..${LIVE.max}` +
          ' — set `bleeds: true` if that is intended',
      );
    }
  }

  // ---- fills its keyline ----------------------------------------------
  // The rule the first attempt at this set had no way to state, and the reason
  // a hand-drawn glyph could look wrong beside its neighbours for no nameable
  // reason. See KEYLINE in `system.ts`.
  // Imported art is measured after scaling into the 24 box, so one keyline
  // governs composed and drawn glyphs alike.
  const k = g.source ? GRID / g.source : 1;
  const key = KEYLINE[g.keyline];
  const w = (b.maxX - b.minX) * k;
  const h = (b.maxY - b.minY) * k;
  const along = Math.max(w / key.w, h / key.h);
  if (along < FILL_FLOOR) {
    err(
      'keyline',
      `fills ${(along * 100) | 0}% of the ${g.keyline} keyline (${key.w}x${key.h}); ` +
        `drawn ${w}x${h}. Grow it, or declare the keyline it actually belongs to`,
    );
  }
  // Overrunning is the same failure as undershooting, in the other direction,
  // and it needs the same two-tier treatment. A glyph half a unit proud of its
  // keyline may well have earned it — an optical correction, a terminal that
  // wants to breathe — so that is a judgement call and warns. A glyph a fifth
  // bigger than its keyline has not earned anything; it is in the wrong family
  // and is about to make every neighbour look undersized.
  //
  // This threshold exists because the first version of this file warned on
  // both, and a test that declared a 21-unit diamond to be a square keyline
  // came back clean. A lint whose worst failure is a warning is a lint that
  // gets scrolled past.
  const over = Math.max(w / key.w, h / key.h);
  if (over > 1.08) {
    err(
      'keyline',
      `is ${(over * 100) | 0}% of the ${g.keyline} keyline (${key.w}x${key.h}) at ${w}x${h} — ` +
        'it belongs to a different keyline, or it is drawn too big',
    );
  } else if (w > key.w + 0.5 || h > key.h + 0.5) {
    warn(
      'keyline',
      `overruns the ${g.keyline} keyline (${key.w}x${key.h}) at ${w}x${h} — ` +
        'it will read slightly heavier than the rest of the set',
    );
  }

  // ---- centred in the box ----------------------------------------------
  // Optical centring is a judgement call, so this is a warning; being a whole
  // unit off is not a judgement call, so the threshold is one unit.
  const offX = ((b.minX + b.maxX) / 2) * k - GRID / 2;
  const offY = ((b.minY + b.maxY) / 2) * k - GRID / 2;
  if (Math.abs(offX) > 1 || Math.abs(offY) > 1) {
    warn('centre', `mass sits ${offX.toFixed(1)},${offY.toFixed(1)} off centre`);
  }

  // ---- complexity, which is a proxy for "was this traced from noise" ----
  //
  // A drawn UI icon is a few hundred coordinates. Sleeper's, measured from
  // their live site, run 270-450; the hearts in this set run 68-374. A glyph
  // reporting tens of thousands is not a detailed drawing, it is a tracer that
  // found a speckle field — a soft glow around the source art dithers at the
  // threshold and each speck becomes its own path.
  //
  // This rule exists because two whole groups shipped into the set at 18,000
  // and 24,000 coordinates and passed every other check: they were correctly
  // sized, correctly centred, correctly on-grid and visibly scratchy. Geometry
  // alone could not see it, but a coordinate count can.
  const coords = g.parts.reduce(
    (n, part) => n + (part.d.match(/-?\d*\.?\d+/g)?.length ?? 0),
    0,
  );
  if (coords > 5000) {
    err(
      'complexity',
      `${coords} coordinates across ${g.parts.length} paths — this is traced ` +
        'noise, not artwork. Regenerate the source with clean flat edges',
    );
  } else if (coords > 1500) {
    warn(
      'complexity',
      `${coords} coordinates across ${g.parts.length} paths — heavy for an ` +
        'icon (the set runs a few hundred); check its edges are not ragged',
    );
  }

  // ---- stroke weights come from the scale ------------------------------
  for (const part of g.parts) {
    if (part.stroke && !(part.stroke in STROKE)) {
      err('stroke', `unknown weight "${part.stroke}"`);
    }
  }

  // ---- the state convention --------------------------------------------
  // A glyph made entirely of constant parts cannot show focus at all, which
  // silently breaks the hollow/solid idiom the whole tab bar depends on.
  const stateful = g.parts.filter((p) => (p.role ?? 'stateful') === 'stateful');
  if (stateful.length === 0 && !g.label) {
    err('state', 'no stateful part, so the glyph cannot show focus');
  }

  // ---- labels ----------------------------------------------------------
  if (g.label && g.label.length > 2) {
    err('label', `"${g.label}" is ${g.label.length} characters; the box holds two`);
  }

  return found;
}

/** Validate a whole set. This is what the gallery and the script both call. */
export function validateSet(glyphs: Glyph[]): Finding[] {
  const findings = glyphs.flatMap(validateGlyph);

  // A duplicate name is not a drawing error but it breaks React keys and makes
  // the report ambiguous, so it is caught here rather than by eye.
  const seen = new Set<string>();
  for (const g of glyphs) {
    if (seen.has(g.name)) {
      findings.push({
        glyph: g.name,
        rule: 'unique',
        detail: 'two glyphs share this name',
        severity: 'error',
      });
    }
    seen.add(g.name);
  }

  return findings;
}
