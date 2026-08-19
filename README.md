# Yap Fantasy

An NFL collectible-card fantasy game. You open packs to acquire player cards,
set an eight-slot lineup each week, and the server locks it at the week's first
kickoff, scores it from real stat lines, and ranks everyone on one global
leaderboard. It is a **season-long collection** game, not daily fantasy: a card
you own accumulates career fantasy points and climbs Bronze → Silver → Gold →
Diamond, so two people holding the same player have independently-valued cards.

One codebase, two targets: iOS and web, from the same expo-router routes.

## Stack

| | |
|---|---|
| Client | Expo SDK 57, React Native 0.86, React 19.2, expo-router 57 (typed routes) |
| Web | react-native-web 0.21, `expo export` to a static site (`output: "static"`) |
| Backend | Supabase — Postgres + RLS, Edge Functions (Deno), `pg_cron` + `pg_net` |
| Data | balldontlie NFL API, ingested server-side only |

Everything the client can do to its own data is an RPC. There are no write
policies on `lineups`, `card_instances` or `gems_ledger` — `set_lineup`,
`open_pack`, `sell_card` and `score_week` are the only paths in, and each has an
abuse suite in `supabase/tests/`.

## Running it

Node is pinned to **22.x** (`engines.node`, `.nvmrc` = 22.23.2). On a Mac with
Homebrew node installed, `nvm use` alone loses — prefix explicitly:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
```

```bash
npm install
cp .env.example .env.local     # then fill in both values
npm run web                    # http://localhost:8081
npm run ios                    # native build + simulator
```

`.env.example` holds only the two client-safe values. The balldontlie key is
deliberately not among them: it lives in Supabase Edge Function secrets and must
never reach the browser bundle. Add `BALLDONTLIE_API_KEY` to `.env.local` only if
you want to run `npm run smoke:provider`, which hits the vendor from your laptop.

**Two Mac gotchas that will cost you an afternoon:**

- **The project path must contain no spaces.** The directory was renamed from
  `Yap Fantasy` to `yap-fantasy` because the space broke *every* iOS build —
  Expo/CocoaPods script phases split the path at it (`is a directory:
  /Users/nickroach/Yap`) and `prebuild` regenerates them, so patching is useless.
- **CocoaPods needs a UTF-8 locale.** With `LANG` unset, Ruby defaults to
  ASCII-8BIT and `pod install` dies inside `unicode_normalize`. Export
  `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` before any pod or native build command.

Checks: `npm test` (typecheck + lint + unit + SQL suites), or individually
`npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:sql`.
The SQL suites need a `DATABASE_URL` and each runs inside a rolled-back
transaction, so they are safe to point at a live database.

Ignore `npm run reset-project` — it is leftover `create-expo-app` scaffolding
that moves the app aside and gives you a blank one.

## Layout

```
src/app/                expo-router routes — the file tree is the URL structure
  (app)/                signed-in app: lineup · collection · players · leaderboard · profile
  (app)/player/[id]     player profile (the footballer), a sibling of the tabs
  (app)/card/[id]       card profile (one copy you own) — same surface, and the
                        param is the card_instance id, never the player id
  (auth)/login          magic link, with email+password as a secondary path
  legal/                /legal/privacy + /legal/support — public, App Review reads them cold
  preview · gallery · kit   dev galleries (see below)
src/components/
  shell/                Sidebar, Screen, AppHeader, ActionBar, SectionNav, sections.ts
  ui/                   shared primitives: DataTable, Panel, Tabs, Chip, PositionBadge, EmptyState…
  lineup/ collection/ cards/ players/ leaderboard/ scores/ scoring/ trend/ account/
  dev/                  fixtures shared by the galleries so they cannot disagree
src/lib/                supabase client, generated database.types.ts, paged.ts, injury.ts
src/constants/          theme.ts (colours, type scale, ContentMeasure), positions.ts
src/context/            AuthContext, PlayerContext
src/hooks/              use-color-scheme, use-theme
supabase/
  migrations/           schema, RLS, RPCs — applied in filename order
  functions/            Deno: ingest-stats, sync-reference, sync-cards, sync-season-stats
  tests/                *.test.sql abuse suites + Deno unit tests
  cron_setup.sql        scheduled jobs; NOT a migration — it references Vault secrets
docs/                   deploy, gameday runbook, spec coverage
```

Navigation differs by platform on purpose: web ≥900px gets a persistent left
rail listing every sub-page; mobile gets bottom tabs plus an action bar. One
navigator either way — the tab bar is hidden on wide rather than swapped for a
drawer, which would remount every screen.

## Three rules that keep biting

1. **Run `npm run gen:types` after every migration.** Stale types surface as
   confusing TypeScript errors on unrelated lines — the hand-written original
   was eight migrations behind and silently hid a column.
2. **PostgREST caps `.select()` at 1000 rows, silently.** No error, no
   indication it truncated. Page every unbounded read with `fetchAllPages` from
   `src/lib/paged.ts`, and give it a sort key that is unique or has a unique
   tiebreak. This has already shipped once as a real bug: a job scored 1000 of
   1584 rows and returned HTTP 200.
3. **The app is dark-only, on every platform.** Any component reading
   `useColorScheme` must import it from `@/hooks/use-color-scheme`, never from
   `react-native`. The hook returns the constant `'dark'`; `Colors.light` is
   kept and typed only so a future toggle stays a one-file change.

## Dev galleries

All three are outside the auth gate and gated behind `__DEV__`, because
`expo export` emits every route and they would otherwise ship as public pages.

- `/preview` — card treatments at every `CardSizes` entry, at the inventory's
  real geometry.
- `/gallery` — the real `Sidebar` + `Screen` with fixture data. Resize the
  window to cross the 900px breakpoint; it prints the live width and which
  branch is rendering.
- `/kit` — the shared `components/ui` primitives and their states.

## Docs

- [`docs/DEPLOY.md`](docs/DEPLOY.md) — Vercel web deploy, env vars, Supabase
  redirect URL configuration.
- [`docs/testing.md`](docs/testing.md) — what `npm test` runs and how to point
  the SQL suites at a database.
- [`docs/gameday-runbook.md`](docs/gameday-runbook.md) — what to run and what to
  look at while live scoring is happening.
- [`docs/sleeper-spec-coverage.md`](docs/sleeper-spec-coverage.md) — which parts
  of the Sleeper UI reference were taken, which were not, and why.
- `docs/Yap_Fantasy_Build_Plan.xlsx` — the 35-task plan; the source of truth for
  scope, milestones and what is explicitly deferred.
