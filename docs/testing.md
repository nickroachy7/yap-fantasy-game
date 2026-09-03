# Running the tests

```bash
npm test
```

That is the whole thing: typecheck, lint, the Deno unit tests, then the SQL
suites. It exits non-zero if anything fails, so "is it green?" is one command
and one exit code.

The SQL suites are the only part that needs setup. Without `DATABASE_URL` they
**skip with a notice and `npm test` still passes** — that is the normal state on
a fresh clone. It is no longer the state in CI: since 2026-09-03 the workflow
runs them against the live project on every push to `main`, and both shipping
jobs wait on the result. See [CI](#ci). Skipped is still not passed, so on a
clone without the env var, run them for real before you trust a green `npm test`.

| Command | What it runs |
|---|---|
| `npm test` | everything, SQL suites skipped if there is no `DATABASE_URL` |
| `npm run test:unit` | the Deno unit suites |
| `npm run test:sql` | the SQL suites — **fails** if there is no `DATABASE_URL` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |
| `npm run check:functions` | `deno check` over the Edge Functions |
| `npm run smoke:provider` | hits the live balldontlie API — not part of `npm test` |

Both runners discover their files from `supabase/tests/`, so a new
`*.test.sql` or `*.test.ts` is picked up the moment it lands. Nothing to
register.

## The unit tests

`npm run test:unit` runs every `supabase/tests/*.test.ts` under Deno — the same
runtime the Edge Functions deploy to, so the scoring code is tested exactly as
it ships. No database, no network, ~40ms.

- **`scoring.test.ts`** (13 tests) — `scoreStatLine` against `SCORING_RULES_V1`:
  full PPR, the three per-game bonuses at their thresholds, negative totals,
  two-decimal rounding, and that a string or a null from the feed cannot poison
  a week. Also that the rules are data — a different ruleset gives a different
  answer.
- **`injury.test.ts`** (10 tests) — `injuryWeight` / `injuryAbbr` over every one
  of the nine designations the live feed actually emits. If the provider adds a
  tenth, add it to the `FEED` array first and watch this fail.

`provider_smoke.ts` is *not* a unit test and is not in the run: it calls the
real balldontlie API, so it needs a key and a network, and it fails for reasons
that have nothing to do with our code. Run it deliberately with
`npm run smoke:provider`.

## The SQL suites

These are the ones that prove the server is actually authoritative. Each is a
scripted attack from an `authenticated` role — the shape a tester with `curl`
and a JWT would use — followed, where it matters, by the happy path. Both halves
count: a `set_lineup()` that rejected every input would pass the attack half on
its own and be useless.

| Suite | What it proves |
|---|---|
| `rls_isolation` | User A cannot read B's roster, wallet, or ledger, cannot mint coins, and cannot write game state at all. |
| `lineup_abuse` | `set_lineup()` blocks 6/6 attacks (locked week, foreign card, wrong position, duplicate card, invented slot, kicker in FLEX), **and** the legitimate path writes 8 slots and replaces them on resubmit rather than adding a second lineup. |
| `economy_abuse` | Coins and minting are unreachable from a client: 5/5 attacks blocked, the ledger reconciles against the balance, and all 25 minted cards trace back to a pack opening — no orphan mints. |
| `sell_card` | The only call that destroys an asset and creates currency. Eight assertions, each on the *specific* refusal reason — an earlier version "passed" because the intruder was stopped by a missing-wallet check before ownership was ever tested, which proves nothing about ownership. |
| `slate_transition` | Walks a week through approaching → kicked off → finished → cold and pins the two inversions that cost money or trust: no provider call before kickoff, and no standing down for 6h after the last one while corrections land. |
| `view_security` | Asserts the *property*, not a list, so a view added next month is covered the moment it lands: every view in `public` carries `security_invoker`, anon holds no privileges on them, no matview is directly readable, the app's own reads still work — and, with SELECT granted back inside the transaction, RLS alone still hides another user's cards. `CREATE OR REPLACE VIEW` keeps the name and the grants but drops the reloptions, which silently turned `player_directory` into SECURITY DEFINER for a day. |

### Running them

```bash
export DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
npm run test:sql
```

The connection string is in the Supabase dashboard: Project Settings → Database
→ Connection string → URI. Use the **session pooler (port 5432)**, not the
transaction pooler (6543) — every suite is one long transaction and the
transaction pooler will not hold it.

To run a single suite, pass any part of its name:

```bash
node scripts/run-sql-tests.mjs slate          # slate_transition only
node scripts/run-sql-tests.mjs rls sell       # two of them
```

`npm run test:sql` prints `PASS`/`FAIL` per suite, the full psql output for
anything that failed, and a `N passed, M failed` line at the end.

### The thing everyone gets wrong

**These are not local tests.** There is no test database and no fixture loader.
The suites read the real 968 card templates, the real players, the real
`scoring_rules` row — that is the point, they test the deployed schema. So
`DATABASE_URL` has to point at the actual Supabase Postgres, and the first
reaction to that is usually "I am not running an abuse suite against
production."

You can. Every suite is `begin;` … `rollback;` with no `commit` anywhere —
verified, file by file, across the whole directory. Everything they insert
(test users in `auth.users`, cards, lineups, ledger rows, granted privileges,
shifted kickoff times) is discarded when psql disconnects, and a failed
assertion `raise`s, which aborts the transaction and rolls it back just the
same. There is no path where a suite leaves a row behind.

Two corollaries worth knowing:

- `slate_transition` works by *moving games in time*, not by moving the clock —
  `now()` is fixed for a transaction. Every timestamp is relative to `now()`, so
  the suite does not rot after a date passes, and the shifted kickoffs never
  survive the rollback.
- Because it is one transaction per suite, a suite left half-run (Ctrl-C,
  dropped connection) rolls back too. There is nothing to clean up by hand.

## CI

`.github/workflows/ci.yml` runs on push and PR to `main`: Node from `.nvmrc`,
`npm ci` with the npm cache, then typecheck, lint, the icon-set lint and the
Deno unit tests — the `check` job.

**The SQL suites run too, in their own `sql` job, and both shipping jobs wait on
it.** They did not until 2026-09-03, and the argument for wiring them in is the
thing that happened that day: a price change made buying a pack to dump it
profitable — free coins, unbounded — and it was invisible to typecheck, lint and
every unit test. It shipped. `card_prices.test.sql` had been asserting against it
all along, on somebody's laptop.

Three things about that job are worth knowing before you change it:

- **It talks to the real project**, because the alternative does not exist. The
  migration chain does not replay from scratch (it breaks at
  `20260818045000_my_collection_view.sql`), and the suites assert against a real
  league anyway — 976 priced players, the live `packs` rows, real games walked
  through a real week. Every suite is `begin … rollback`, which is the property
  the whole directory is built on; nothing it writes survives.
- **Pushes to `main` only, one at a time.** Not PRs: secrets are not exposed to
  fork PRs, so there the job could only fail for an infrastructure reason, and a
  gate that fails for infrastructure reasons is a gate people learn to ignore.
  The serialisation is because `slate_transition` takes row locks on `games`
  inside its transaction, and the gameday sweep runs every minute.
- **A missing `DATABASE_URL` secret is a SKIP, not a failure** (`--skip-without-db`).
  So a fork is not broken by the job's existence — but skipped is not passed, and
  the log says which it was.

The secret is the session-pooler URI (port **5432**), the same string this file
tells you to export locally. The transaction pooler on 6543 hands out a different
backend per statement, so `begin` and its `rollback` land in different sessions;
the job checks for that explicitly and fails with an explanation rather than
letting the suites break in ways that look like the code.

**When the database is unreachable, nothing ships.** That is the cost of the
gate, stated plainly: re-run the job once it is back.
