#!/usr/bin/env node
// Parallel work lanes — one git worktree per Claude session, merged and gated
// before a single push.
//
//   node scripts/lanes.mjs new <name>        # branch + worktree, ready for a session
//   node scripts/lanes.mjs list              # every lane, and what it has waiting
//   node scripts/lanes.mjs land [name...]    # merge lanes into main, gate, then push
//   node scripts/lanes.mjs drop <name>       # remove a landed lane
//
// Why this exists: two sessions in ONE checkout share one set of files, so the
// second write wins and the first session's edits vanish with no conflict and
// no warning. Nothing merges them because there is nothing to merge — it is one
// pile. A worktree per session gives each one a real branch, which is the thing
// git already knows how to blend.
//
// Lanes live OUTSIDE the repo, as siblings. A worktree nested inside would be
// walked by Metro and by `expo start`, which then finds two copies of every
// package and dies on duplicate-module collisions.

import { spawnSync } from 'node:child_process';
import { existsSync, cpSync, symlinkSync, readdirSync, rmdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LANE_HOME = resolve(ROOT, '..', `${basename(ROOT)}-lanes`);
const TRUNK = 'main';

// Gitignored, so a fresh worktree has none of them. The first two are generated
// (`npx expo customize tsconfig.json` rewrites them) but copying takes seconds
// rather than a minute. `.env.local` is SYMLINKED, not copied: one source of
// truth, so a var added in the main checkout is live in every lane at once.
const CLONE = ['node_modules', '.expo', 'expo-env.d.ts'];
const LINK = ['.env.local'];

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (COLOR ? `[${code}m${s}[0m` : String(s));
const bold = wrap(1);
const dim = wrap(2);
const red = wrap(31);
const green = wrap(32);
const yellow = wrap(33);
const cyan = wrap(36);

function die(msg, ...rest) {
  console.error(`\n${red('✗')} ${msg}`);
  for (const line of rest) console.error(`  ${line}`);
  console.error('');
  process.exit(1);
}

function git(args, { cwd = ROOT, quiet = true } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function gitOrDie(args, opts) {
  const r = git(args, opts);
  if (!r.ok) die(`git ${args.join(' ')} failed`, r.err || r.out);
  return r.out;
}

const isDirty = (cwd) => git(['status', '--porcelain'], { cwd }).out.length > 0;
const countAhead = (branch) => git(['rev-list', '--count', `${TRUNK}..${branch}`]).out || '0';

// `git worktree list --porcelain` emits one stanza per tree, blank-line separated.
function lanes() {
  return gitOrDie(['worktree', 'list', '--porcelain'])
    .split('\n\n')
    .map((stanza) => {
      const path = /^worktree (.+)$/m.exec(stanza)?.[1];
      const branch = /^branch refs\/heads\/(.+)$/m.exec(stanza)?.[1];
      return path ? { path, branch, name: basename(path) } : null;
    })
    .filter((w) => w && w.path !== ROOT && w.branch);
}

function findLane(name) {
  const open = lanes();
  const w = open.find((l) => l.name === name || l.branch === name);
  if (!w) die(`No lane named ${bold(name)}.`, `Open ones: ${open.map((l) => l.name).join(', ') || '(none)'}`);
  return w;
}

const migrationsOn = (ref) =>
  new Set(
    git(['ls-tree', '--name-only', ref, 'supabase/migrations/'])
      .out.split('\n')
      .filter(Boolean)
      .map((p) => basename(p)),
  );

// Migration files are timestamped BY HAND, so two lanes working the same day
// both reach for the same slot. A duplicate prefix means one file silently
// shadows the other; a migration sorting before one already on the trunk gets
// applied after the migrations it was written to precede.
function migrationTrouble(baseline) {
  const dir = join(ROOT, 'supabase', 'migrations');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  const problems = [];

  const byStamp = new Map();
  for (const f of files) {
    const stamp = f.slice(0, 14);
    byStamp.set(stamp, [...(byStamp.get(stamp) || []), f]);
  }
  for (const [stamp, group] of byStamp) {
    if (group.length > 1) problems.push(`duplicate timestamp ${stamp} — ${group.join(', ')}`);
  }

  const newestLanded = [...baseline].sort().pop()?.slice(0, 14);
  if (newestLanded) {
    for (const f of files) {
      if (baseline.has(f)) continue;
      if (f.slice(0, 14) <= newestLanded) {
        problems.push(`${f} sorts at or before ${newestLanded}, already on ${TRUNK} — it will apply out of order`);
      }
    }
  }
  return problems;
}

// ── new ──────────────────────────────────────────────────────────────────────
function cmdNew(name) {
  if (!name) die('Usage: node scripts/lanes.mjs new <name>');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) die('Lane names are lowercase letters, digits and dashes.');

  const path = join(LANE_HOME, name);
  if (existsSync(path)) die(`${path} already exists.`, `Drop it first: ${bold(`node scripts/lanes.mjs drop ${name}`)}`);

  // Remembers how you resolved a conflict and replays it when the same one
  // reappears. Lanes re-merge the same hunks often enough that this pays off.
  git(['config', 'rerere.enabled', 'true']);

  if (isDirty(ROOT)) {
    console.log(
      `\n${yellow('!')} ${bold(TRUNK)} has uncommitted changes. A lane branches from your last ` +
        `COMMIT,\n  so that work stays here and is not carried in.`,
    );
  }

  console.log(`\n${cyan('→')} branching ${bold(name)} off ${TRUNK}…`);
  gitOrDie(['worktree', 'add', '-b', name, path, 'HEAD']);

  for (const item of CLONE) {
    const src = join(ROOT, item);
    if (!existsSync(src)) continue;
    process.stdout.write(`${cyan('→')} cloning ${item}… `);
    // -c is an APFS copy-on-write clone: it shares blocks with the original, so
    // 782 MB of node_modules lands in ~10s and costs almost no extra disk. Falls
    // back to a real copy on any filesystem that cannot clone.
    const r = spawnSync('cp', ['-c', '-R', src, join(path, item)], { stdio: 'pipe' });
    if (r.status !== 0) cpSync(src, join(path, item), { recursive: true });
    console.log(green('done'));
  }

  for (const item of LINK) {
    if (existsSync(join(ROOT, item))) symlinkSync(join(ROOT, item), join(path, item));
  }

  console.log(
    `\n${green('✓')} lane ${bold(name)} ready\n\n` +
      `  ${bold(`cd ${path}`)}\n` +
      `  ${bold('claude')}\n\n` +
      `${dim('  Commit in the lane as you go — land only moves committed work.')}\n` +
      `${dim('  JS only: ios/ is not cloned, so a native rebuild happens in the main checkout.')}\n`,
  );
}

// ── list ─────────────────────────────────────────────────────────────────────
function cmdList() {
  const open = lanes();
  if (!open.length) {
    console.log(`\n${dim('No lanes open.')} Start one: ${bold('node scripts/lanes.mjs new <name>')}\n`);
    return;
  }
  console.log('');
  for (const lane of open) {
    const ahead = countAhead(lane.branch);
    const state = [
      ahead === '0' ? dim('nothing to land') : green(`${ahead} commit${ahead === '1' ? '' : 's'} to land`),
      isDirty(lane.path) ? red('uncommitted work') : null,
    ]
      .filter(Boolean)
      .join(dim(' · '));
    console.log(`  ${bold(lane.name.padEnd(18))} ${state}`);
    console.log(`  ${dim(lane.path)}\n`);
  }
}

// ── land ─────────────────────────────────────────────────────────────────────
function cmdLand(names, { push }) {
  if (isDirty(ROOT)) {
    die(
      `${bold(TRUNK)} has uncommitted changes.`,
      'Landing merges into main, and a dirty tree blends unrelated work into the same push.',
      'Commit or stash here first.',
    );
  }

  const chosen = names.length ? names.map(findLane) : lanes();
  if (!chosen.length) die('No lanes to land.');

  // Checked for every lane before merging any, so a late failure cannot leave
  // half the lanes merged.
  for (const lane of chosen) {
    if (isDirty(lane.path)) {
      die(
        `Lane ${bold(lane.name)} has uncommitted changes.`,
        'Landing merges COMMITS, so that work would be left behind silently.',
        `Commit it: ${bold(`git -C ${lane.path} add -A && git -C ${lane.path} commit`)}`,
      );
    }
  }

  console.log(`\n${cyan('→')} fetching origin…`);
  git(['fetch', 'origin', TRUNK]);
  const behind = countAhead(`origin/${TRUNK}`);
  if (behind !== '0') {
    if (!git(['merge', '--ff-only', `origin/${TRUNK}`]).ok) {
      die(`${TRUNK} has diverged from origin.`, 'Reconcile that first — lanes merge onto current main.');
    }
    console.log(dim(`  fast-forwarded ${behind} commit(s) from origin`));
  }

  const baseline = migrationsOn(`origin/${TRUNK}`);
  const landed = [];

  for (const lane of chosen) {
    const ahead = countAhead(lane.branch);
    if (ahead === '0') {
      console.log(dim(`  ${lane.name}: nothing to land, skipping`));
      continue;
    }
    process.stdout.write(`${cyan('→')} merging ${bold(lane.name)} (${ahead})… `);
    if (!git(['merge', '--no-ff', '-m', `Land lane ${lane.name}`, lane.branch]).ok) {
      console.log(red('conflict'));
      const files = git(['diff', '--name-only', '--diff-filter=U']).out.split('\n').filter(Boolean);
      console.error(
        `\n${red('✗')} ${bold(lane.name)} conflicts with what is already on ${TRUNK}:\n\n` +
          files.map((f) => `    ${f}`).join('\n') +
          `\n\n  The merge is left in progress. Hand it to a session here:\n\n` +
          `    ${bold('claude')} ${dim(`"resolve the in-progress merge of lane ${lane.name},`)}\n` +
          `    ${dim('keeping both sides’ intent, then run npm test"')}\n\n` +
          `  Or back out: ${bold('git merge --abort')}` +
          (landed.length ? dim(`  (${landed.map((l) => l.name).join(', ')} already merged, not yet pushed)`) : '') +
          '\n',
      );
      process.exit(1);
    }
    console.log(green('ok'));
    landed.push(lane);
  }

  if (!landed.length) {
    console.log(`\n${dim('Nothing was landed.')}\n`);
    return;
  }

  const problems = migrationTrouble(baseline);
  if (problems.length) {
    console.error(`\n${red('✗')} migration ordering is broken after the merge:\n`);
    for (const p of problems) console.error(`    ${p}`);
    console.error(
      `\n  Two lanes writing migrations the same day pick the same slot. Renumber the\n` +
        `  later one so it sorts last, commit, and re-run land.\n` +
        `  Undo these merges: ${bold(`git reset --hard origin/${TRUNK}`)}\n`,
    );
    process.exit(1);
  }

  // The gate. Git merged the TEXT cleanly, which is not the same as the blended
  // result working — each lane passed alone and can still fail together. This is
  // CI's `check` job run BEFORE the push rather than after, because a green push
  // goes straight to testers' phones as an OTA update.
  console.log(`\n${cyan('→')} gating the blend ${dim('(typecheck · lint · unit)')}…\n`);
  if (spawnSync('npm', ['test'], { cwd: ROOT, stdio: 'inherit' }).status !== 0) {
    console.error(
      `\n${red('✗')} the blend fails the suite. Each lane passed alone; together they do not.\n\n` +
        `  Fix it here on ${TRUNK} and commit, or undo: ${bold(`git reset --hard origin/${TRUNK}`)}\n`,
    );
    process.exit(1);
  }

  console.log(`\n${green('✓')} landed ${landed.map((l) => bold(l.name)).join(', ')} — suite green\n`);

  if (push) {
    console.log(`${cyan('→')} pushing…\n`);
    if (!git(['push', 'origin', TRUNK], { quiet: false }).ok) die('push failed');
    console.log(`\n${green('✓')} pushed. CI publishes the OTA update and redeploys the site.\n`);
  } else {
    console.log(
      `  Ready to ship: ${bold(`git push origin ${TRUNK}`)}\n\n` +
        `${dim('  That push ships an OTA update to testers and redeploys the site.')}\n` +
        `${dim('  Native changes (native-code deps, app.json native keys, SDK bumps) still')}\n` +
        `${dim('  need an Xcode archive — see AGENTS.md.')}\n`,
    );
  }

  console.log(dim(`  Clean up: ${landed.map((l) => `node scripts/lanes.mjs drop ${l.name}`).join(' && ')}\n`));
}

// ── drop ─────────────────────────────────────────────────────────────────────
function cmdDrop(name) {
  if (!name) die('Usage: node scripts/lanes.mjs drop <name>');
  const lane = findLane(name);

  const ahead = countAhead(lane.branch);
  if (ahead !== '0') {
    die(
      `Lane ${bold(name)} has ${ahead} commit(s) not on ${TRUNK}.`,
      `Land it first, or discard the work: ${bold(`git worktree remove --force ${lane.path}`)}`,
    );
  }
  if (isDirty(lane.path)) die(`Lane ${bold(name)} has uncommitted changes.`, 'Commit or discard them first.');

  gitOrDie(['worktree', 'remove', lane.path]);
  git(['branch', '-d', lane.branch]);
  // Only succeeds once the last lane is gone; other lanes keep it non-empty.
  try {
    rmdirSync(LANE_HOME);
  } catch {}
  console.log(`\n${green('✓')} dropped ${bold(name)}\n`);
}

// ── dispatch ─────────────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith('-'));
const args = rest.filter((a) => !a.startsWith('-'));

switch (cmd) {
  case 'new':
    cmdNew(args[0]);
    break;
  case 'list':
    cmdList();
    break;
  case 'land':
    cmdLand(args, { push: flags.includes('--push') });
    break;
  case 'drop':
    cmdDrop(args[0]);
    break;
  default:
    console.log(
      `\n${bold('lanes')} — one worktree per session, blended and gated before a single push\n\n` +
        `  ${bold('new <name>')}      branch + worktree, node_modules cloned, ready for a session\n` +
        `  ${bold('list')}            every lane and what it has waiting\n` +
        `  ${bold('land [name...]')}  merge lanes into ${TRUNK}, check migrations, run the suite\n` +
        `  ${bold('    --push')}      …and push when it is green\n` +
        `  ${bold('drop <name>')}     remove a landed lane\n`,
    );
    process.exit(cmd ? 1 : 0);
}
