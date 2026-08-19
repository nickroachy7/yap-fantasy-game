#!/usr/bin/env node
// Runs every Deno unit suite in supabase/tests/*.test.ts.
//
//   node scripts/run-deno-tests.mjs
//
// Discovered from the directory, so a new *.test.ts is picked up with no change
// here. provider_smoke.ts is deliberately not matched: it hits the live
// balldontlie API and belongs to `npm run smoke:provider`.

import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEST_DIR = join(ROOT, 'supabase', 'tests');

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (COLOR ? `\u001b[${code}m${s}\u001b[0m` : String(s));
const red = wrap(31);
const yellow = wrap(33);

const probe = spawnSync('deno', ['--version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) {
  process.stdout.write(
    [
      '',
      red('Unit tests cannot run — deno is not installed.'),
      '',
      'The scoring and injury suites are Deno, the same runtime the Edge',
      'Functions run on, so they test the code exactly as deployed. Install it:',
      '',
      '  brew install deno            # or: curl -fsSL https://deno.land/install.sh | sh',
      '',
      'Then confirm with:  deno --version',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

if (!existsSync(TEST_DIR)) {
  process.stdout.write(red(`\nNo test directory at ${TEST_DIR}\n\n`));
  process.exit(1);
}

const suites = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => relative(ROOT, join(TEST_DIR, f)));

if (suites.length === 0) {
  process.stdout.write(yellow(`\nNo *.test.ts files in ${TEST_DIR}\n\n`));
  process.exit(0);
}

const run = spawnSync('deno', ['test', ...suites], { stdio: 'inherit', cwd: ROOT });
process.exit(run.status === null ? 1 : run.status);
