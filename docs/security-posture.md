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

## Accepted by design: six SECURITY DEFINER functions callable by `authenticated`

The linter warns that a signed-in user can call these over `/rest/v1/rpc/…`.
That is the intent — it is the whole server-authoritative design. Every one of
them is a surface deliberately narrower than the tables underneath, and every
one is revoked from `anon` and pinned to `search_path = public, pg_temp`.

| Function | Why it must be definer |
| :--- | :--- |
| `open_pack` | Mints cards and debits gems. There is **no INSERT policy** on `card_instances`, `gems_ledger` or `gem_balances`, so this function is the only path a card is ever created. RNG and gem maths never leave the server. |
| `set_lineup` | Computes the lock time server-side and writes `lineup_slots`. A client-trusted clock is the attack. |
| `sell_card` | The only call that destroys an asset and creates currency in one transaction. |
| `leaderboard` | A *global* board has to read every user's score across RLS. Reading one row per user is exactly what the function is narrowed to. |
| `player_profile` | Reads `player_season_ranks`, a materialized view. Matviews cannot carry RLS, so it is revoked from `authenticated` (`20260818130000`) and reachable only through this function — one player wide. |
| `player_game_log` | Same reason. |

Eight further definer functions (`gameday_sweep`, `score_week`,
`apply_injuries`, `grant_weekly_gems`, `award_score_gems`,
`refresh_player_season_ranks`, `handle_new_user`, `verify_sync_secret`) are
callable by **neither** `anon` nor `authenticated`. They run from cron, from
triggers, or from an Edge Function holding the sync secret. The linter does not
flag them, correctly.

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

## Open, and it needs a dashboard click

**Leaked password protection is disabled.** Supabase Auth can check new
passwords against HaveIBeenPwned. Email+password exists as a secondary sign-in
path alongside magic link, so this applies to real accounts.

Enable at: Authentication → Policies → Password strength. It cannot be set by
migration — it is auth config, not schema.

Worth doing before testers sign up, not after.

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
