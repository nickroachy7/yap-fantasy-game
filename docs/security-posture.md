# Security posture

What the Supabase database linter reports, which findings are accepted by
design, and which are real. Written 2026-08-19, after the linter caught a
regression nothing in the repo had noticed.

Check it yourself: Supabase dashboard → Advisors → Security.

---

## The one that was real: `player_directory` ran as SECURITY DEFINER

`player_directory` was created (`20260818070000`) with an explicit
`with (security_invoker = on)` and a comment saying why. The stats addon
(`20260818170000`) later widened the column list with a plain
`create or replace view … as`.

**`CREATE OR REPLACE VIEW` preserves the name and the grants but not the
reloptions.** The option was dropped, and the view ran as SECURITY DEFINER from
that migration until `20260819090000` put it back.

Impact was limited — `player_directory` is reference data (who exists, what they
scored), and no ownership is exposed through it. But `anon` holds SELECT on
anything created in `public` by default, so for that window an unauthenticated
request could read the directory. The view next door, `my_collection`, is the
one where the same slip would have exposed every tester's collection.

Two things changed:

1. `alter view public.player_directory set (security_invoker = on)` — an `alter`
   rather than a third copy of the 40-column body, which would have been free to
   drift from the one in `20260818170000`.
2. `anon` revoked from both views, so the grant and the policy are two
   independent reasons rather than one.

### The invariant, and where it is enforced

> Every view in `public` carries `security_invoker=on`.

Asserted in two places, both of which fail loudly:

- **At migration time** — `20260819090000` ends with a `DO` block that raises if
  any view in `public` lacks the option, so a replay fails rather than drifting.
- **In the suite** — `supabase/tests/view_security.test.sql`, picked up
  automatically by `npm run test:sql`.

The test asserts the *property*, not a list of view names, so a view added next
month is covered the moment it lands.

Its last assertion is the one worth understanding. Rather than trusting the
flag, it grants `anon` SELECT back inside the transaction and proves
`security_invoker` + RLS still return zero rows on their own. Grants and RLS are
two layers, and a test that only ever checks them together cannot tell you which
one is load-bearing. It was negative-tested: flipping the option off inside a
subtransaction does make assertion 1 fire.

---

## Accepted by design: forty-six SECURITY DEFINER functions callable by `authenticated`

The linter warns that a signed-in user can call these over `/rest/v1/rpc/…`.
That is the intent — it is the whole server-authoritative design. Every one of
them is a surface deliberately narrower than the tables underneath, and every
one is revoked from `anon` and pinned to `search_path = public, pg_temp`.

| Function | Why it must be definer |
| :--- | :--- |
| `open_pack` | Mints cards and debits coins. There is **no INSERT policy** on `card_instances`, `coins_ledger` or `coin_balances`, so this function is the only path a card is ever created. RNG and coin maths never leave the server. |
| `set_lineup` | Computes the lock time server-side and writes `lineup_slots`. A client-trusted clock is the attack. |
| `sell_card` | The only call that destroys an asset and creates currency in one transaction. |
| `leaderboard` | A *global* board has to read every user's score across RLS. Reading one row per user is exactly what the function is narrowed to. |
| `player_profile` | Reads `player_season_ranks`, a materialized view. Matviews cannot carry RLS, so it is revoked from `authenticated` (`20260818130000`) and reachable only through this function — one player wide. |
| `player_game_log` | Same reason. |
| `median_record` | The weekly contest is *everybody against the field's median*, so the median has to be computed across every user's `lineups` row — which RLS scopes to its owner. An invoker-rights version would take the median of the caller's single row and return a confidently wrong number. What crosses the boundary is aggregates (`entrants`, `low`, `median`, `average`, `high`) plus the caller's own line, keyed on `auth.uid()`. No user ids, no display names — strictly less than `leaderboard` already exposes. |
| `card_profile` | One card instance wide, and it reads the same rank matview `player_profile` does. |
| `player_market` | Counts copies of one player across `card_instances`, which is RLS-scoped to its owner — so an invoker-rights version would report every count as 1. Counts and one maximum; nothing that names an owner. |
| `player_card_market` | The same answer for the whole directory in one scan, deliberately narrower than `player_market`. Same boundary. |
| `claim_set_reward` | Pays a set reward. Like `open_pack`, it is the only path that writes `set_completions`, `coin_balances` and `coins_ledger`, none of which has an INSERT policy. |
| `commit_card_to_set` | Burns a card permanently and pays for it. Same reasoning: the burn and the payout must be one server-side transaction. |
| `commit_cards_to_set` | The batch form of the same call, and the same boundary. |
| `board_best_week` | Reads every user's `lineups` rows to find each one's highest week. RLS scopes that table to its owner, so an invoker-rights version would rank the caller alone — and would look completely normal doing it. Exposes a display name, a week and a score, which is what `leaderboard` already publishes. |
| `board_record` | Grades every user against the field's weekly median. It computes the same medians `median_record` does, across the same RLS-scoped rows, and differs only in publishing names against results rather than the caller's own line. |
| `board_collection` | Aggregates `card_instances`, which is RLS-scoped to its owner, so an invoker-rights version would report the caller's shelf as the whole community's. Counts and a coin valuation; nothing about which specific cards anybody holds. |
| `board_cards` | The highest-scoring held copies across every user's `card_instances`. Exposes the owner's display name, the player, the tier and the score. It also returns `card_instances.id`, which is inert to anyone but the owner — `card_profile` filters on `auth.uid()`, so another user's id opens nothing. |
| `board_sets` | Aggregates `set_milestone_claims` and committed `card_instances`, both RLS-scoped. Counts and coin totals only. |
| `contest_lobby` | Counts entries in every contest on the slate, which means counting other people's `lineups` rows, and prices each one against the caller's wallet. An invoker-rights version would show a lobby where every contest looked empty. Returns aggregates and one boolean per row; no user is ever named. |
| `my_contest_cards` | The same boundary for the contests you are in, plus each one's own distribution (`low`, `median`, `average`, `high`) and cut. Keyed on `auth.uid()`. |
| `contest_field` | Names the field: display name, score, place, result, prize, and whether that lineup has locked. This is the one definer here whose *purpose* is publishing other people's rows, so the column list is the access control — nothing about anybody's collection, wallet or run crosses it. |
| `contest_lineup` | An entrant's slots. It takes a contest and a user as arguments rather than reading `auth.uid()`, which makes it the widest read in this table and the one to think hardest about before changing. Until `20260830010000` it refused unless every card in that lineup had kicked off; that reveal rule was traded away deliberately so the contest page has people in it during the days anybody is deciding. It still returns nothing but a lineup: slot, player, club, tier, points. |
| `leave_contest` | Deletes a lineup and refunds the fee in one transaction, and refuses once any card has started. Keyed on `auth.uid()`; a contest code is not an authorisation. |
| `friend_request`, `friend_accept`, `friend_decline`, `friend_remove` | The four verbs that change a friendship. `friendships` has a SELECT policy and **no write policy at all**, so these are the only path a row is created, answered or deleted — and each invariant they hold is one a client-side write could not be trusted with: one row per pair whichever way it was asked, a mutual ask resolving to an accept rather than a unique-violation, and *only the addressee* answering (a requester accepting their own request would make the ask and the friendship the same call). Each takes one user id and reads `auth.uid()` for the other end. |
| `friend_link` | One word — where two managers stand with each other — read from `friendships`, whose policy scopes rows to their two participants. Called by every reader below and by nothing else directly. Its answer about a pair the caller is not in is `none`, which is also what a stranger should be told. |
| `my_friends`, `my_friend_requests` | Both keyed on `auth.uid()`, and both cross RLS only to reach the *other* participant's `profiles` row plus the board figures beside it. Nothing a friend list shows is narrower than what the boards already publish. |
| `find_managers` | The directory: display name, join date, held-card count, and where the caller stands with each. It reads every profile, which `profiles`' own policy already allows any signed-in user to do (`20260818010000` — the global leaderboard needs display names); definer is for the card count over RLS-scoped `card_instances` and for `friend_link`. Never returns the caller. |
| `manager_profile` | One account wide, and the one definer here whose *purpose* is being pointed at somebody else. Every figure it returns is a figure one of the five community boards already publishes about every account — points, best week, record, collection value, tier counts, set rungs — re-cut by person instead of by rank, which is what makes the column list the access control. **No email, no wallet, no run, no lineup.** `friends.test.sql` asserts against a contact-detail column appearing here later. |
| `contest_entrants`, `contest_payouts`, `contest_prize_pool`, `locked_cards`, `game_config_value` | Helpers the functions above call. A nested call runs as the DEFINER, so `authenticated` holds the grant only because the client reads two of them directly. |

Twenty-two further definer functions (`apply_injuries`, `assign_card_rarity`,
`award_contest_prizes`, `award_position_bonuses`, `award_score_coins`,
`backfill_week`, `contest_results`, `gameday_sweep`, `grant_weekly_coins`,
`handle_new_user`, `rebuild_card_sets`, `rebuild_daily_set`,
`rebuild_weekly_set`, `refresh_player_season_ranks`, `rotate_daily_set`,
`rotate_weekly_set`, `score_week`, `settle_run_week`, `settle_week_payouts`,
`verify_sync_secret`, `wagered_entries`, `wipe_run`) are callable by **neither**
`anon` nor `authenticated`. They run from cron, from triggers, or from an Edge
Function holding the sync secret. The linter does not flag them, correctly.

The counts in this section drift every time a feature lands without touching
this file, and they have twice: it read *ten* and *eight* against a database
holding eighteen and eleven after the sets work, and eighteen and eleven against
thirty-seven and twenty-two after the contest work. Run the query below rather
than trusting the prose.

**And run it for `anon`, which is the assertion that actually matters.** On
2026-08-30 it returned eleven rows. Every contest RPC written on August 25 and
26 — `contest_lobby`, `contest_field`, `contest_lineup`, `my_contest_cards`,
`leave_contest`, the five-argument `set_lineup`, and five helpers — carried its
`grant ... to authenticated` and not the `revoke ... from public, anon` that
every RPC before it had. Postgres grants EXECUTE to PUBLIC on a new function by
default, so eleven definer functions over RLS-hidden tables were reachable with
the publishable key that ships in the app bundle. `contest_lineup` was the
serious one: it takes its subject as an argument rather than reading
`auth.uid()`, so it answered to callers who had never signed in.

`20260830020000` revokes all eleven and ends with a `DO` block that raises if
`anon` can execute **any** definer function in `public` — the invariant is
asserted in a migration now rather than only stated here.

Verify the whole picture in one query:

```sql
select p.proname,
       has_function_privilege('anon',          p.oid, 'execute') as anon_can_call,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_can_call,
       array_to_string(p.proconfig, ', ')                        as settings
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
 order by p.proname;
```

`anon_can_call` must be **false for every row**. If it is ever true, that is a
finding, not a warning.

---

## Closed 2026-08-19: leaked password protection

**Enabled**, and confirmed by re-running the advisor — the
`auth_leaked_password_protection` warning is gone and the ten rows above are all
that remain. Supabase Auth now checks new passwords against HaveIBeenPwned's
Pwned Passwords API at sign-up and password change; it is a k-anonymity range
query, so the password never leaves Supabase, only a hash prefix.

Set at **Authentication → Providers → Email**
(`/dashboard/project/_/auth/providers?provider=Email`) — *not* under Policies,
where an earlier version of this note sent people. It is auth config, not
schema, so it cannot be set by migration.

**`supabase config push` is NOT the way to manage it.** It pushes the whole
local `config.toml`, whose `[auth]` block still holds local-dev defaults
(`site_url = "http://127.0.0.1:3000"`). Production's Site URL and redirect URLs
were set by hand — see `docs/DEPLOY.md` — and pushing would overwrite both,
breaking magic-link sign-in for every tester and the `yapfantasy://` deep link.

No client change was needed: the login screen surfaces the Supabase error
message directly, and the rejection reads *"Password is known to be weak and
easy to guess, please choose a different one."*

---

## Closed 2026-08-21: `sweep_log` had no RLS — and the advisor overstated it

The advisor flagged `public.sweep_log` `rls_disabled` at **CRITICAL**, with its
standard wording: *"fully exposed to the anon and authenticated roles — anyone
with the anon key can read or modify every row."*

**That part was not true here, and it is worth recording why**, because the next
person to read this lint will need the same five minutes back. `sweep_log` has
carried `revoke all … from anon, authenticated` since the migration that created
it (`20260819200000`), and a role with no SELECT privilege is refused whether or
not RLS is on. Checked rather than reasoned about — as `anon`, both a SELECT and
an INSERT return `insufficient_privilege`. The advisor's lint tests for
`relrowsecurity`, not for reachability, so its severity assumes the default
grants that this table had already given up.

**It was still fixed** (`20260821110000`), because one mechanism is not the
posture claimed everywhere else on this page. The revoke was a single statement
in a single migration with nothing beneath it, and the first standing rule below
says that grant surface keeps re-opening by accident. Every other table in
`public` has RLS under the grant; this one now does too.

**RLS with NO policies is the terminal state, not a half-finished one.** No
policy is coming: nothing in `src/` reads this table, and a policy would invent
an access path nobody asked for. Everything that legitimately touches it is
exempt — `gameday_sweep` is definer and owned by `postgres`, which owns the
table and so bypasses its RLS; `service_role` and `postgres` both hold
BYPASSRLS. Deliberately **not** `force row level security`, which would subject
the owner to the (non-existent) policies and stop the sweep writing its own log.

**The CRITICAL lint is now an INFO lint, and that is the finish line.** The
advisor replaces `rls_disabled` with `rls_enabled_no_policy` for exactly this
shape. Expect it, and do not "fix" it by adding a policy.

Both layers are asserted separately in `sweep_log.test.sql` (5a and 5b), the
same way `view_security.test.sql` does it: 5b hands `authenticated` the SELECT
grant back inside the rolled-back transaction and proves RLS returns zero rows
on its own.

---

## Standing rules

- **Supabase's default privileges grant `anon` and `authenticated` everything
  created in `public`.** Anything that should be narrower has to be revoked
  explicitly. This has now produced two findings (`player_season_ranks`, then
  `player_directory`) — assume it will produce a third.
- **A comment claiming a surface is unreachable is not a mechanism.** Assert it,
  or it is a hope.
- **Materialized views cannot carry RLS.** A grant on one is the entire access
  control story for it.
- Re-run the advisor after **every** migration that adds a view, matview, or
  function. It is the only thing here that has caught a regression on its own.
- **Read an advisor finding's severity as a claim to check, not a fact.** The
  `sweep_log` lint said CRITICAL and "anyone with the anon key can read every
  row"; the table had been revoked from `anon` for two days. The lint was still
  worth acting on, for a reason its own text never mentioned. Confirm the
  exposure by impersonating the role before you believe the headline — and fix
  it anyway if the only thing standing is a grant.
- **A test that names a real week has an expiry date on it.** `lineup_abuse`
  hardcoded "preseason wk3 starts Aug 21 (open)" and started failing the minute
  that week kicked off, with six assertions unreachable behind a lock error that
  had nothing to do with what it tests. Suites own their weeks: synthetic
  fixtures pinned relative to `now()`, at week numbers far outside any real
  slate.
