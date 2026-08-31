/**
 * Checks every glyph against the icon construction system.
 *
 *   npm run icons:lint
 *
 * Deno rather than node because these are TypeScript modules with no build
 * step, and deno is already required by `npm run test:unit` — so this adds a
 * script, not a toolchain.
 *
 * Deliberately importable-free of `Icon.tsx`: the renderer pulls in
 * react-native and the `@/` alias, and the lint has no business needing either.
 * The system, the glyphs and the validator are plain data and plain functions
 * precisely so this stays a two-import script.
 *
 * THIS FILE IS EXCLUDED FROM `tsconfig.json`. It is the only Deno source
 * outside `supabase/`, and Deno wants the `.ts` extensions on its imports that
 * the app's own tsc config forbids. Excluding one file is the small price; the
 * alternative was filing an icon linter under `supabase/` to inherit that
 * directory's existing exclusion, which would be a worse lie about where it
 * belongs. The modules it imports are still fully typechecked by the app.
 */
import { GLYPHS } from '../src/components/icons/glyphs.ts';
import { validateSet } from '../src/components/icons/validate.ts';

const findings = validateSet(GLYPHS);
const errors = findings.filter((f) => f.severity === 'error');
const warnings = findings.filter((f) => f.severity === 'warning');

const isTty = Deno.stdout.isTerminal();
const wrap = (code: number) => (s: string) => (isTty ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = wrap(31);
const yellow = wrap(33);
const green = wrap(32);
const dim = wrap(2);

for (const f of [...errors, ...warnings]) {
  const tag = f.severity === 'error' ? red('error') : yellow('warn ');
  console.log(`${tag} ${f.glyph}  ${dim(f.rule)}  ${f.detail}`);
}

const n = GLYPHS.length;
if (errors.length === 0 && warnings.length === 0) {
  console.log(green(`\n${n} glyphs, all clean.\n`));
} else {
  console.log(
    `\n${n} glyphs — ${errors.length} error(s), ${warnings.length} warning(s).\n`,
  );
}

// Warnings do not fail. They are the judgement calls — optical centring, a
// keyline overrun a glyph may have earned — and a lint that blocks a push on a
// judgement call gets switched off within a week.
Deno.exit(errors.length > 0 ? 1 : 0);
