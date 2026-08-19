#!/usr/bin/env node
// Runs every SQL suite in supabase/tests/*.test.sql through psql.
//
//   node scripts/run-sql-tests.mjs                 # all suites
//   node scripts/run-sql-tests.mjs rls sell        # only suites whose name matches
//   node scripts/run-sql-tests.mjs --skip-without-db   # exit 0 if there is no DATABASE_URL
//
// Suites are discovered from the directory, not from a list, so a new
// *.test.sql file is picked up with no change here.

import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEST_DIR = join(ROOT, 'supabase', 'tests');

const args = process.argv.slice(2);
const skipWithoutDb = args.includes('--skip-without-db');
const filters = args.filter((a) => !a.startsWith('-'));

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (COLOR ? `\u001b[${code}m${s}\u001b[0m` : String(s));
const bold = wrap(1);
const red = wrap(31);
const green = wrap(32);
const yellow = wrap(33);

// Never let a password reach the log, whichever side printed it.
function redact(text) {
  return String(text).replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1<redacted>@');
}

function notReady(reason, help) {
  const lines = [
    '',
    skipWithoutDb ? yellow(`SKIPPED: SQL suites — ${reason}`) : red(`SQL suites cannot run — ${reason}`),
    '',
    help,
    '',
  ];
  process.stdout.write(lines.join('\n'));
  process.exit(skipWithoutDb ? 0 : 1);
}

const NO_DATABASE_URL_HELP = `The SQL suites talk to a real Postgres. Point DATABASE_URL at the Supabase
database and re-run:

  export DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
  npm run test:sql

Get that string from the Supabase dashboard: Project Settings -> Database ->
Connection string -> URI. Use the session pooler (port 5432), not the
transaction pooler (6543) — every suite runs inside one transaction.

Running them against the live project is safe: each suite is BEGIN ... ROLLBACK,
so nothing it writes survives. See docs/testing.md.`;

const NO_PSQL_HELP = `psql is not on PATH. It ships with the Postgres client tools:

  brew install libpq && brew link --force libpq     # client only
  brew install postgresql@16                        # or the full server

Then confirm with:  command -v psql`;

if (!process.env.DATABASE_URL) notReady('DATABASE_URL is not set', NO_DATABASE_URL_HELP);

const psqlProbe = spawnSync('psql', ['--version'], { encoding: 'utf8' });
if (psqlProbe.error || psqlProbe.status !== 0) notReady('psql is not installed', NO_PSQL_HELP);
const psqlVersion = (psqlProbe.stdout || '').trim();

if (!existsSync(TEST_DIR)) {
  process.stdout.write(red(`\nNo test directory at ${TEST_DIR}\n\n`));
  process.exit(1);
}

let suites = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith('.test.sql'))
  .sort()
  .map((f) => join(TEST_DIR, f));

if (filters.length > 0) {
  suites = suites.filter((f) => filters.some((needle) => basename(f).includes(needle)));
  if (suites.length === 0) {
    process.stdout.write(red(`\nNo *.test.sql matched: ${filters.join(', ')}\n\n`));
    process.exit(1);
  }
}

if (suites.length === 0) {
  process.stdout.write(yellow(`\nNo *.test.sql files in ${TEST_DIR}\n\n`));
  process.exit(0);
}

process.stdout.write(`\n${bold(`Running ${suites.length} SQL suite(s)`)} with ${psqlVersion}\n\n`);

const failures = [];
let passed = 0;

for (const file of suites) {
  const name = basename(file, '.test.sql');
  const started = Date.now();
  const run = spawnSync(
    'psql',
    [process.env.DATABASE_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-f', file],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  if (run.error) {
    failures.push({ name, file, output: redact(run.error.message) });
    process.stdout.write(`  ${red('FAIL')}  ${name}  (${secs}s)\n`);
    continue;
  }

  const output = redact(`${run.stdout || ''}${run.stderr || ''}`).trim();

  if (run.status === 0) {
    passed += 1;
    process.stdout.write(`  ${green('PASS')}  ${name}  (${secs}s)\n`);
    // The suites report what they proved via RAISE NOTICE; echo those lines.
    for (const line of output.split('\n')) {
      if (/^(NOTICE|OK|PASS)/i.test(line.trim())) {
        process.stdout.write(`        ${line.trim()}\n`);
      }
    }
  } else {
    failures.push({ name, file, output });
    process.stdout.write(`  ${red('FAIL')}  ${name}  (${secs}s, psql exit ${run.status})\n`);
  }
}

for (const f of failures) {
  process.stdout.write(`\n${red(bold(`--- FAILED: ${f.name}`))}\n`);
  process.stdout.write(`${f.file}\n\n`);
  process.stdout.write(`${f.output || '(no output from psql)'}\n`);
  process.stdout.write(`${red('--- end ')}${red(f.name)}\n`);
}

const summary = `${passed} passed, ${failures.length} failed (${suites.length} suite${suites.length === 1 ? '' : 's'})`;
process.stdout.write(`\n${failures.length ? red(bold(summary)) : green(bold(summary))}\n\n`);
process.exit(failures.length ? 1 : 0);
