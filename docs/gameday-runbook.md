# Gameday runbook — preseason week 3

**Opener: Thursday 2026-08-20, 8:00 PM ET / 2026-08-21 00:00 UTC.**

This is one of two remaining rehearsals for live scoring. Week 4 (Aug 27–29) is
the other, and after Aug 29 there is no live NFL data until Sept 9. If something
fails silently on week 3, the cost is a whole window.

Every query below was run read-only against the live project
(`ygrmsleanavyewfbhlth`) on **2026-08-19 05:43 UTC**, and the answer shown is the
real one. Times are UTC unless marked ET.

---

## The clock

| ET | UTC | Games |
|---|---|---|
| Thu Aug 20, 8:00 PM | Fri Aug 21 00:00 | LV @ HOU — **the opener** |
| Thu Aug 20, 10:00 PM | Fri Aug 21 02:00 | SF @ LAC |
| Fri Aug 21, 7:00–9:00 PM | Fri 23:00 – Sat 01:00 | NYJ @ PIT, CAR @ JAX, GB @ DEN |
| Sat Aug 22, 12:00 PM – 10:00 PM | Sat 16:00 – Sun 02:00 | 10 games — the heavy day |
| Sun Aug 23, 8:00 PM | Mon Aug 24 00:00 | SEA @ TEN — last kickoff |

Three derived moments that matter:

- **2026-08-20 23:00** — `current_slate()` flips to week 3. It looks one hour
  ahead of the first kickoff on purpose. Nothing else happens: `slate_is_live()`
  is still false and **no provider call is made.**
- **2026-08-21 00:00** — first kickoff. From the next sweep onward the sweep
  calls the provider **every minute** (raised from five in 20260821150000, once
  the lineup screen started rendering live points and the cadence became the
  feature rather than a background detail).
- **~2026-08-24 06:00** — six hours past the last kickoff. The sweep stands down
  only if every week-3 game has `status_state = 'final'`. See failure mode F3.

## How the machine works

`cron.job` runs `select public.gameday_sweep();` **every minute**, forever.
Each tick:

1. `current_slate()` — most recent week to have kicked off (+1h lookahead).
   Null → `{"skipped":"no slate"}`.
2. `slate_is_live()` — is a game in that week in progress, or finished within
   six hours? False → `{"skipped":"nothing live"}` and **no HTTP call**.
3. `net.http_post` to `ingest-stats` with
   `{season, seasonType, weeks:[week], finalOnly:false}`. **pg_net is async** —
   this returns a request id immediately and the rows land before the next tick.
4. `score_week(season, season_type, week)` **in the same transaction**, against
   whatever is already ingested.

Because 3 is async and 4 is not, **scoring always lags ingestion by one tick.**
A five-minute gap between stats appearing and points moving is normal.

`score_week` is idempotent by recomputation, not increment: it rewrites
`lineup_slots.points` from source rows, re-sums `lineups.total_points`, and
re-sums `card_instances.career_fp` over every slot the card has ever filled.
Running it ten times gives the same answer as running it once, which is what
makes the 5-minute overlap harmless.

---

## Pre-flight — run these Thursday, before 8pm ET

### P1. Is the week 3 fixture list loaded, with the right kickoff times?

```sql
select g.starts_at, vt.abbreviation as away, ht.abbreviation as home,
       g.status, g.status_state
  from public.games g
  left join public.teams ht on ht.id = g.home_team_id
  left join public.teams vt on vt.id = g.visitor_team_id
 where g.season = 2026 and g.season_type = 1 and g.week = 3
 order by g.starts_at, g.external_id;
```

**Good answer: 16 rows, every one `scheduled`, both team abbreviations non-null.**
First row `2026-08-21 00:00:00+00 | LV | HOU | 8/20 - 8:00 PM EDT | scheduled`,
last row `2026-08-24 00:00:00+00 | SEA | TEN | 8/23 - 8:00 PM EDT | scheduled`.

Read the `status` text against `starts_at` — it is the vendor's own local-time
string and is the cheapest check that the UTC conversion is right (00:00 UTC =
8:00 PM EDT). Fewer than 16 rows, or a null team, means run `ingest-stats` for
week 3 by hand before Friday: a game we do not have cannot be scored.

### P2. Is `gameday-sweep` scheduled — *and has it actually run*?

Being scheduled is not the same as having run. `sync-reference-nightly` was
"verified running" for a day while having never executed once.

```sql
select jobid, jobname, schedule, active from cron.job order by jobid;
```
```
2 | sync-reference-nightly | 15 9 * * *   | true
3 | gameday-sweep          | * * * * *    | true
```

```sql
select j.jobname,
       count(*) as runs,
       count(*) filter (where d.status = 'succeeded') as succeeded,
       count(*) filter (where d.status <> 'succeeded') as not_succeeded,
       max(d.start_time) as last_run
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
 group by j.jobname order by j.jobname;
```
```
gameday-sweep          | 334 | 334 | 0 | 2026-08-19 05:40:00+00
sync-reference-nightly |   1 |   1 | 0 | 2026-08-18 09:15:00+00
```

**Good answer: `last_run` within the last minute and `not_succeeded` = 0.**

**Know the limit of this table.** `return_message` for every sweep is the string
`1 row` — pg_cron records that the statement returned a row, not *what* it
returned. `cron.job_run_details` proves the sweep **ran**; it can never tell you
whether it fired the provider or short-circuited. For that, see D2.

### P3. Are the Vault secrets present?

The sweep decrypts both inline. A missing one makes the header null and the
Edge Function answers `403 forbidden` — a failure that looks nothing like a
scoring bug.

```sql
select name, description, length(decrypted_secret) as len, updated_at
  from vault.decrypted_secrets
 where name in ('anon_key','sync_secret') order by name;
```
```
anon_key    | Publishable key used by scheduled jobs … | 208 | 2026-08-18 01:18:01+00
sync_secret | Shared secret proving a sync request …   |  64 | 2026-08-18 01:18:01+00
```

**Good answer: two rows. `sync_secret` is 64 hex chars; `anon_key` is a
`sb_publishable_…` key, 208 chars.** Select the length, never the value.

### P4. Will `current_slate()` return week 3 as kickoff approaches?

Right now, two days out:

```sql
select (select row_to_json(c) from public.current_slate() c)  as current_slate,
       (select row_to_json(u) from public.upcoming_slate() u) as upcoming_slate,
       public.slate_is_live()                                 as slate_is_live,
       now() as utc_now;
```
```
current_slate  {"season":2026,"season_type":1,"week":2}
upcoming_slate {"season":2026,"season_type":1,"week":3}
slate_is_live  false
utc_now        2026-08-19 05:43:32+00
```

That is correct and is the shape to expect until Thursday 23:00. **These two
functions answer different questions and must not be conflated** — `current_slate`
is "which week am I ingesting and scoring?" (most recent kickoff), `upcoming_slate`
is "which week can a lineup still be submitted for?" (next kickoff ahead).
Using `current_slate` for both is what made the lineup screen permanently locked.

To see the whole arc without waiting, evaluate both definitions at chosen
timestamps (read-only — it changes nothing):

```sql
with weeks as (
  select g.season, g.season_type, g.week, min(g.starts_at) as first_kick
    from public.games g where g.week is not null group by 1,2,3
), t(at) as (values
  (timestamptz '2026-08-20 22:55:00+00'),
  (timestamptz '2026-08-20 23:00:00+00'),
  (timestamptz '2026-08-21 00:05:00+00')
)
select t.at,
       (select w.season || '/' || w.season_type || '/wk' || w.week from weeks w
         where w.first_kick <= t.at + interval '1 hour'
         order by w.first_kick desc limit 1) as current_slate_at_t,
       exists (
         select 1 from public.games g
          where (g.season, g.season_type, g.week) = (
                  select w.season, w.season_type, w.week from weeks w
                   where w.first_kick <= t.at + interval '1 hour'
                   order by w.first_kick desc limit 1)
            and g.starts_at <= t.at
            and (g.status_state is distinct from 'final'
                 or g.starts_at > t.at - interval '6 hours')
       ) as slate_is_live_at_t
  from t order by t.at;
```
```
2026-08-20 22:55+00 | 2026/1/wk2 | false     <- still last week, asleep
2026-08-20 23:00+00 | 2026/1/wk3 | false     <- slate flips, still asleep
2026-08-21 00:05+00 | 2026/1/wk3 | true      <- first sweep that calls the provider
```

The middle row is the important one: the slate becomes week 3 an hour early, and
the *only* thing standing between that and paying for 12 provider calls an hour
on a quiet Thursday afternoon is `slate_is_live()`.

### P5. Are the `pg_net` responses coming back 200?

```sql
select id, status_code, timed_out, error_msg, created,
       left(content::text, 200) as content
  from net._http_response order by id desc limit 5;
```
```
16 | 200 | false | null | 2026-08-18 09:15:00+00 |
   {"ok":true,"teams":32,"players":3003,"injuries_reported":334,"injuries_applied":330,"ms":5535}
15 | 200 | false | null | 2026-08-18 05:59:53+00 |
   {"ok":true,"season":2024,…,"stat_lines":13860,"scored":13860,"rules_version":1,"ms":39683}
```

**Good answer: every recent row `status_code = 200`, `timed_out = false`,
`error_msg` null.** The newest row being from Aug 18 is correct — nothing has
been live since, so `gameday_sweep` has made no HTTP call at all.

**`pg_net.ttl` is `6 hours`.** This is a live view, not an audit log. Anything
you want from Saturday night must be read by Sunday morning. If a question
arises later, `stat_lines.ingested_at` and `lineups.scored_at` are the durable
record.

### P6. Is there anything to score?

The one check that is not about plumbing. A perfectly healthy sweep against a
week nobody has a lineup for proves nothing.

```sql
select ls.slot, p.first_name || ' ' || p.last_name as player,
       p.position_abbreviation as pos, t.abbreviation as team, ls.points,
       exists (select 1 from public.games g
                where g.season=2026 and g.season_type=1 and g.week=3
                  and (g.home_team_id = t.id or g.visitor_team_id = t.id)) as has_wk3_game,
       (select count(*) from public.stat_lines sl
         where sl.player_id = p.id and sl.season=2026 and sl.season_type=1) as preseason_lines_so_far
  from public.lineups l
  join public.lineup_slots ls on ls.lineup_id = l.id
  join public.card_instances ci on ci.id = ls.card_instance_id
  join public.cards c on c.id = ci.card_id
  join public.players p on p.id = c.player_id
  left join public.teams t on t.id = p.team_id
 where l.season = 2026 and l.season_type = 1 and l.week = 3
 order by ls.slot;
```
```
QB   Patrick Mahomes      QB  KC   0.00  true  0
RB1  Nicholas Singleton   RB  TEN  0.00  true  1
RB2  Carson Steele        RB  PHI  0.00  true  1
WR1  Jaxon Smith-Njigba   WR  SEA  0.00  true  0
WR2  Xavier Legette       WR  CAR  0.00  true  1
TE   Theo Johnson         TE  NYG  0.00  true  1
FLEX Malik Nabers         WR  NYG  0.00  true  0
K    Ryan Fitzgerald      PK  CAR  0.00  true  2
```

**Good answer: eight slots, `has_wk3_game` true on all eight.** It is.

Note the last column. Mahomes, Smith-Njigba and Nabers have not recorded a
single preseason stat line — established starters usually do not play. Expect a
**low** week-3 total driven by the kicker, the depth backs and Legette. Low is
fine. **Zero across all eight would mean the pipeline never connected**, so it
matters that at least five of the eight have already produced rows this
preseason.

### P7. Is the deployed `ingest-stats` the one with the zero-rows fix?

The deployed function is **version 3**, and its source matches
`supabase/functions/ingest-stats/index.ts` exactly — including the branch that
returns 200 with `no stat lines yet` unless a *targeted game is already final*.
That fix is what stops it crying wolf on every sweep between kickoff and the
provider's first box score. If anyone redeploys before Friday, re-check it.

Optional, from the laptop: `npm run smoke:provider` proves the balldontlie key
and response shape independently of the database, and
`npm run test:sql slate` walks week 3 through approaching / live / finished /
cold inside a rolled-back transaction.

---

## During the game

### D1. Is the sweep still ticking?

```sql
select d.runid, d.start_time, d.status, left(d.return_message, 80) as msg
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
 where j.jobname = 'gameday-sweep'
 order by d.start_time desc limit 6;
```
```
335 | 2026-08-19 05:40:00+00 | succeeded | 1 row
334 | 2026-08-19 05:35:00+00 | succeeded | 1 row
333 | 2026-08-19 05:30:00+00 | succeeded | 1 row
…
```

Healthy: a row every minute on the clock, `succeeded`, `1 row`. Sick: a
gap, or `failed` with a real message in `return_message` (that column *is*
populated on error, just never on success).

### D2. Did it actually call the provider, and what came back?

This is the question `cron.job_run_details` cannot answer. **A new
`net._http_response` row every minute is the proof the sweep fired.**

```sql
select id, status_code, timed_out, created, left(content::text, 300) as content
  from net._http_response order by id desc limit 6;
```

Healthy, before the first box score is published:

```json
{"ok":true,"note":"no stat lines yet — no targeted game has finished",
 "season":2026,"season_type":1,"weeks":[3],"games_seen":16,"games_targeted":16,"ms":…}
```

**This is a 200 and it is correct.** It will be the answer for the first several
sweeps of every gameday. Do not treat it as a failure.

Healthy, once a game is final:

```json
{"ok":true,"season":2026,"season_type":1,"weeks":[3],
 "games_seen":16,"games_ingested":16,"stat_lines":N,"stat_lines_skipped":M,
 "scored":N,"rules_version":1,"ms":…}
```

`stat_lines` and `scored` **must be equal** — that equality is the guard against
a truncated read-back. `stat_lines_skipped` is non-zero and benign: those are
provider rows for players we hold no `players` row for. The 2025 regular-season
backfill skipped 1407 of 17,777 the same way.

Sick: `status_code` 403 (secret), 502 (shape drift — F2), 500, or `timed_out = true`
(F4). Or: no new rows at all while a game is in progress (F8).

### D3. Are stat lines landing, and are they all scored?

```sql
select count(*) as stat_lines,
       count(fp.stat_line_id) as scored,
       count(*) - count(fp.stat_line_id) as unscored,
       max(sl.ingested_at) as last_ingest
  from public.stat_lines sl
  left join public.fantasy_points fp
         on fp.stat_line_id = sl.id and fp.rules_version = 1
 where sl.season = 2026 and sl.season_type = 1 and sl.week = 3;
```

Right now this returns all zeros — week 3 has not been played. The shape of a
good answer is week 2, which is fully ingested:

```
stat_lines 1502 | scored 1502 | unscored 0 | last_ingest 2026-08-18 01:29:43+00
```

**`unscored` must be 0.** Any other number is the 1000-row cap (F6) or a failed
`fantasy_points` upsert. Note week 2 produced **1502** rows from 16 games — week 3
will be the same order, comfortably over the 1000-row cap, so this query is the
one that would catch a truncation.

### D4. Are the games flipping to `final`?

```sql
select status_state, count(*) as games, max(updated_at) as last_update
  from public.games
 where season = 2026 and season_type = 1 and week = 3
 group by status_state order by status_state;
```

Now: `scheduled | 16 | 2026-08-18 04:26:33+00`. As the weekend runs, games should
move to `final` within minutes of each whistle, and `last_update` should track
the most recent sweep. If nothing ever reaches `final`, see F3.

### D5. Are `lineup_slots.points` moving?

```sql
select ls.slot, p.last_name, t.abbreviation as team, ls.points,
       l.total_points, l.scored_at
  from public.lineups l
  join public.lineup_slots ls on ls.lineup_id = l.id
  join public.card_instances ci on ci.id = ls.card_instance_id
  join public.cards c on c.id = ci.card_id
  join public.players p on p.id = c.player_id
  left join public.teams t on t.id = p.team_id
 where l.season = 2026 and l.season_type = 1 and l.week = 3
 order by ls.slot;
```

`scored_at` should advance **every minute** from the first kickoff onward,
*even while every `points` is still 0.00* — an empty rescore is a clean no-op by
design, and a moving `scored_at` with static points is exactly right before any
box score exists.

**`scored_at` is not "this week is finished".** The sweep stamps it on every
pass, so it is non-null from the first snap. `finalized_at` on the same row is
the column that means the week is over, and it is set only once every game in
the week has `status_state = 'final'`. If you are checking whether a week has
closed, check that one. Baseline: one lineup, 8 slots, `total_points` 0.00,
`scored_at` 2026-08-18 03:06:22+00.

Then the leaderboard, which is what a tester would see:

```sql
select * from public.leaderboard(2026, 1::smallint, 3, 10);
```
```
1 | e1c60623-… | nickroachy | 0.00 | 1
```

### D5b. Is the median contest tracking?

The contest card at the top of the lineup screen scores everybody against the
field's median, and every figure on it is derived from the same `lineups` rows
D5 just checked — so if `total_points` is moving, this moves with it.

```sql
select * from public.median_record(2026, 1::smallint);
```

`my_points`, `my_rank`, `ahead` and `result` are all **null when read as
`postgres`**, and that is correct rather than a fault: they are scoped to
`auth.uid()`, which a superuser session does not have. To see a real manager's
line, set the claim first:

```sql
set local request.jwt.claims = '{"sub":"<user uuid>","role":"authenticated"}';
select * from public.median_record(2026, 1::smallint);
```

What to expect during the week:

- `entrants` counts lineups **with at least one slot**. A manager who opened the
  screen and picked nobody is not in the field and does not drag the median down.
- `low`/`median`/`high` are live and will all be 0.00 until the first box score
  lands — the whole field genuinely is on nought. The card draws that as "—"
  rather than as a score, using `high > 0` as the test for whether anybody has
  played; `low` and `high` are the two ends of its bar, and `median` the mark on
  it.
- `result` stays **null until every fixture in the week is `final`**. A W
  appearing mid-Sunday would be wrong, and this is the guard against it.
- `entrants < 2` also yields a null result: one manager is their own median.
  Through the beta this is the normal state, not a fault.

The invariant worth spot-checking once the week closes: wins and losses across
the whole base must balance. `supabase/tests/median_contest.test.sql` asserts it
by walking nine synthetic managers, and it is the property the contest rests on.

### D6. Manual kick

If a tick is missed or you want to force one:

```sql
select public.gameday_sweep();
```

It writes — that is the point. It is safe to run repeatedly; `score_week` is
idempotent and the ingest upserts. Unlike the cron path, **this shows you the
return value**, so it is also the fastest way to see what the sweep decided:

```json
{"season":2026,"season_type":1,"week":3,"ingest_request":42,"scored":{…}}
```
or `{"skipped":"nothing live","season":2026,"week":3}`.

**It cannot force an ingest outside a live window, and that is usually the
window you want.** `gameday_sweep` checks `slate_is_live()` before it makes any
HTTP call, so between the six-hour correction cut-off and the next kickoff it
returns `{"skipped":"nothing live"}` no matter how many times you run it. Every
reason you would reach for a manual kick — a missed scheduler window, a provider
outage that cleared too late, a redeploy that had to land before the data could
— falls in exactly that gap.

### D7. Backfill a week that is not live

```sql
select public.backfill_week(2026, 1::smallint, 3);
```

`gameday_sweep`'s body without the liveness gate and with the week named rather
than derived. Same endpoint, same `finalOnly:false`, same secrets, same
`score_week` — a backfill that reached the database by a different route than
the sweep could produce a state the sweep cannot, and then there would be two
things to debug instead of one. It files its row under `outcome = 'backfill'`
rather than `'swept'`, so a hole in `sweep_log` still means the scheduler
missed.

**Run it twice.** `net.http_post` is async: it queues the request and returns an
id, so the `score_week` at the end of the first call scores what the PREVIOUS
fetch left behind, not the one it just fired. Wait for the response, then call
again — the second call ingests nothing new and scores what the first fetched.

```sql
select public.backfill_week(2026, 1::smallint, 3);          -- note ingest_request
select ingest_status, ingest_body->>'stat_lines'            -- ~20s later
  from public.sweep_log where ingest_request_id = <id>;
select public.backfill_week(2026, 1::smallint, 3);          -- now score it
```

Worth doing before and after: the fingerprint tells you whether anything
actually changed, which `stat_lines` counts alone will not if a correction
replaced a value rather than adding a row.

```sql
select count(*), round(sum(fp.points),2),
       md5(string_agg(sl.player_id::text||':'||fp.points::text, ',' order by sl.player_id))
  from public.stat_lines sl join public.fantasy_points fp on fp.stat_line_id = sl.id
 where sl.season=2026 and sl.season_type=1 and sl.week=3;
```

Run on 2026-08-21 against the two games from the night before — last ingested at
07:55, ten hours cold — it moved 191 lines / 327.82 points to 192 / 336.52. The
sweep would have picked the same correction up at the next kickoff; the point of
having this is not needing to wait for one.

**Never schedule it.** The gate it removes is the only thing standing between
this project and polling an empty Tuesday at the provider's expense.

### D8. Change the scoring rules

Rules are versioned data, and `fantasy_points` is keyed by version, so a change
is a **recompute against stored `stat_lines.raw`** and never a re-ingest. The
order matters, because `score_week` joins on the ACTIVE version and activating
one that has not been computed resolves every lineup to zero:

1. Insert the new version with `is_active = false` (a migration).
2. Recompute against it — `POST /rescore {"version":N}`, no provider call.
   32,812 lines took 7.9s.
3. Activate it (a second migration, which refuses to run if step 2 has not
   finished).
4. `score_week` each week that has lineups, so `career_fp` and `settled_fp`
   catch up.
5. `select public.refresh_player_season_ranks();` — the matview stores
   `season_base_points`, which reads the active ruleset.

Diff the two versions before activating. Everything should be explainable:

```sql
select pl.position_abbreviation, count(*), round(sum(v2.points - v1.points),1)
  from public.stat_lines sl
  join public.players pl on pl.id = sl.player_id
  join public.fantasy_points v1 on v1.stat_line_id = sl.id and v1.rules_version = 1
  join public.fantasy_points v2 on v2.stat_line_id = sl.id and v2.rules_version = 2
 where v2.points <> v1.points group by 1 order by 2 desc;
```

### D9. The provider scores the week now — v3, and what changed operationally

As of 2026-09-02 `fantasy_points` under **rules v3** is not computed by us at
all. It is balldontlie's own `ppr` total, pulled by the `sync-fantasy` edge
function from `/fantasy/weekly_stats`. See
`20260903020000_the_provider_scores_the_week.sql` for the argument; the short
version is that `/stats` does not emit distance-bucketed field goals, so no
version of our engine can score a kicker correctly from anything we store.

**D8 step 2 does not apply to v3.** There is nothing to recompute — `POST
/rescore {"version":3}` would score v3 with our engine against our raw and
produce exactly the wrong number, silently. The equivalent step is a **sync**:

```
POST /sync-fantasy {"season": 2025, "mode": "points"}
```

Every other step of D8 is unchanged, including the two that are easy to forget:
`score_week` each week that has lineups, then
`select public.refresh_player_season_ranks();`.

**Coverage is a feature, not a shortfall.** The provider scores only
fantasy-relevant positions. Measured on the 2025 regular season: QB, RB, WR, TE,
PK and FB are at **100%**; LB, CB, DT, S, DE and P are at **0%**. Those have no
lineup slot and our own v2 ruleset already scored them at zero, so a defensive
line reading as unscored under v3 is correct. Do not treat the raw ratio
(6,113 points against 16,370 stat lines) as a failed run — check it by position:

```sql
select coalesce(p.position_abbreviation,'(none)') as pos, count(*) as lines,
       count(*) filter (where v3.points is not null) as with_v3
  from public.stat_lines sl
  join public.players p on p.id = sl.player_id
  left join public.fantasy_points v3
         on v3.stat_line_id = sl.id and v3.rules_version = 3
 where sl.season = 2025 and sl.season_type = 2
 group by 1 order by lines desc;
```

**`unknownPlayers` in the response is expected and is about OUR table.** It
counts provider-scored players with no row in `players` — the long tail the
reference sync has not picked up. It is worth watching for a jump, not for being
non-zero.

**Preseason is never scored by the provider.** `/fantasy/weekly_stats?season=2026
&week=2` is empty and always will be; the endpoint is regular-season only
(`week` 1–18). 2026 preseason stat lines therefore carry no v3 points, and those
game logs read as unscored under v3. That was accepted knowingly — the slate had
already rolled to 2026 regular week 1 when v3 was activated.

**Projections come from the same function**, `mode: "projections"`, and land in
`projections` rather than `fantasy_points`. A week the provider has not published
returns nothing and is reported in `weeksWithNoProjection` — not an error. The
board draws `PROJ —` for any player with no row, which is what that dash has
always meant.

---

## Failure modes

### F1. Provider returns zero stat lines

**Symptom:** `{"ok":true,"note":"no stat lines yet — no targeted game has finished",
"games_seen":16,"games_targeted":16}`, sweep after sweep.

**This is almost certainly correct — do not panic and do not touch anything.**
The sweep calls with `finalOnly:false`, so it targets all 16 games including ones
that kick off days later. Between 00:00 UTC Friday and the vendor publishing the
first box score, zero rows is the right answer. This used to raise a 502 on every
sweep and was fixed on Aug 18 for exactly this weekend.

**First move:** confirm no week-3 game is `final` yet (D4). If one is, this
response is impossible and you are actually in F2.

### F2. Provider shape drift

**Symptom:** HTTP **502** with
`{"error":"zero stat lines despite completed games — provider shape may have drifted",
"games_targeted":16,"games_final":N}`.

This is the real alarm: a game finished and the vendor gave us nothing back.

**First move:** run `npm run smoke:provider` from the laptop — it hits
`/games` and `/stats` directly and prints the raw shape. Either the vendor is
late (retry in ten minutes; the sweep does this for you) or the payload changed.
If it changed, the only file that knows the vendor exists is
`supabase/functions/_shared/balldontlie.ts` — the mapping in `listStatLines` is
where to look. Remember `season_type` is a required `/stats` param and preseason
is `1`.

### F3. Games never reach `status_state = 'final'`

**Symptom:** D4 still shows 16 `scheduled` hours after the last whistle, and the
sweep is still calling the provider on Monday.

`slate_is_live()` is `starts_at <= now() AND (status_state <> 'final' OR
starts_at > now() - 6h)`. The six-hour stand-down only engages once games are
marked final. If the vendor never flips them, **the sweep keeps paying for 12
calls an hour** until `current_slate()` moves on to week 4 at 2026-08-27 22:00 —
roughly 3.5 days of pointless calls. Not catastrophic at 600 req/min, but it
means the correction-window logic was never actually exercised, which is half of
what this rehearsal is for.

**First move:** check the vendor's own `status` string on those rows (P1). If it
reads final but `status_state` does not, the mapping in `listGames`
(`statusState: g.status_state`) is the suspect. Do not hand-patch `games` —
that hides the bug going into week 4.

### F4. `pg_net` timeout

**Symptom:** `net._http_response` row with `timed_out = true`, or an `error_msg`,
or no response row for a request that was made.

The sweep sets `timeout_milliseconds := 120000`. The 2025 regular-season
backfill — 272 games, 16,370 stat lines — finished in 34.4s, so 120s is generous
for 16 games. A timeout means the vendor is stalling, not that we are slow.

**First move:** nothing. The next tick is a minute away and the ingest is
idempotent, so a dropped call self-heals. Only act if three consecutive sweeps
time out; then check `select count(*) from net.http_request_queue` (should be 0
at rest — it is now) for a backed-up worker, and `select net.worker_restart();`
if it is not draining.

### F5. Sweep runs but `score_week` scores nothing

**Symptom:** `stat_lines` are landing (D3) but every `lineup_slots.points` stays
0.00 and `lineups.total_points` does not move.

Three causes, in the order worth checking:

1. **Nobody has a lineup for this week.** `score_week` returns
   `slots_scored: 0`. Check P6.
2. **Season/season\_type/week mismatch.** The join in `score_week` requires
   `stat_lines.season = lineups.season`, `season_type`, and `week` to match
   exactly. Preseason is `season_type = 1`; a lineup written with the default `2`
   will never find a stat line. This exact class of bug made the leaderboard
   render empty for the whole preseason (it hardcoded `p_season_type: 2`).
   ```sql
   select season, season_type, week, count(*) from public.lineups group by 1,2,3;
   select season, season_type, week, count(*) from public.stat_lines
    where season = 2026 group by 1,2,3;
   ```
3. **`rules_version` mismatch.** `score_week` joins `fantasy_points` on the
   *active* rules version. `select version, is_active from public.scoring_rules;`
   → `1 | true`. If a v2 ships mid-weekend, every stat line needs re-scoring
   under it before points appear.

A card whose player did not play correctly resolves to 0, not to a missing row —
the LEFT JOINs are deliberate, so 0.00 for a starter who sat is right.

### F6. The 1000-row cap silently truncates a scoring pass

**Symptom:** none. HTTP 200, a clean-looking response, an under-scored week.
This has already happened once: 1000 of 1584 rows scored, 200 OK.

Week 2 alone was 1502 stat lines. Week 3 will be similar, so every read-back in
this path crosses the cap on the very first live weekend.

**How you would catch it:** the `unscored` column in D3 being non-zero, or
`stat_lines != scored` in the ingest response body (D2). `ingest-stats` also
guards it explicitly and returns **HTTP 500** with
`{"error":"scored fewer lines than ingested — a read-back was truncated",
"stat_lines":…,"scored":…}` — if you see that, the guard did its job.

**First move:** re-run the ingest (D6, or invoke `ingest-stats` directly). It
upserts, so a re-run repairs the gap. Then find the unpaged read: in the Edge
Function every unbounded select goes through `selectAllPages`, and in the client
every one goes through `fetchAllPages` in `src/lib/paged.ts`. A bare `.select()`
on `stat_lines`, `fantasy_points`, `players` or `cards` is the bug.

### F7. `403 forbidden` from `ingest-stats`

**Symptom:** `net._http_response` shows `status_code` 403 with
`{"error":"forbidden"}`, or 401 before the function body even runs.

403 means `verify_sync_secret` rejected the `x-sync-secret` header — the Vault
`sync_secret` was rotated on one side only, or the row is missing so the header
went out null. 401 means the `anon_key` Vault secret is stale.

**First move:** re-run P3. Both secrets are read from Vault by both sides, so
rotating needs no redeploy — but it does need `vault.update_secret`, not an
insert of a second row with the same name.

### F8. No `net._http_response` rows during a live game

**Symptom:** D1 shows the cron ticking, but no new HTTP responses.

The sweep short-circuited. **First move:**

```sql
select (select row_to_json(c) from public.current_slate() c) as current_slate,
       public.slate_is_live() as live;
```

If `live` is false while a game is being played, the cause is in `games`: a
kickoff time that is wrong, or the opener already carrying
`status_state = 'final'` more than six hours after its listed start. Check P1.
If `current_slate` is not week 3 after 2026-08-20 23:00, a week's `starts_at`
values are wrong — most likely a timezone error on ingest.

---

## What "this rehearsal succeeded" means

By **Sunday 2026-08-24**, all of the following must be true. If any is not,
week 4 (Aug 27–29) has to be burned on a retry, and that is the last chance
before Sept 9.

1. `gameday-sweep` ran every minute across the whole window with zero
   `failed` rows in `cron.job_run_details`.
2. It made **no** provider call before 2026-08-21 00:00, and its first call was
   within a minute after it.
3. The pre-first-box-score sweeps returned **200** with `no stat lines yet` —
   not 502. (This is the specific regression the Aug 18 fix targets.)
4. `stat_lines` for 2026 / season\_type 1 / week 3 is in the ~1400–1600 range,
   consistent with week 2's 1502, and **`unscored` is 0** — proving the 1000-row
   cap did not truncate anything.
5. Every week-3 game reached `status_state = 'final'`, and the sweep stood down
   within about six hours of the last kickoff rather than running indefinitely.
6. `lineups.scored_at` for week 3 advanced on essentially every tick from
   kickoff onward, and `lineups.total_points` is **greater than zero** and equals
   the sum of its eight `lineup_slots.points`.
7. `card_instances.career_fp` for the eight started cards equals the sum of every
   slot each has ever filled, and `lineup_starts` is exactly 1 — running
   `score_week` several hundred times over the weekend must not have inflated
   either. This is the idempotency claim, finally tested at scale.
8. `public.leaderboard(2026, 1, 3, 10)` shows `nickroachy` with that same
   non-zero total.

### And, new for this rehearsal, the part a tester actually sees

Everything above was already true on 2026-08-21 and none of it reached the
screen, because the lineup read `upcoming_slate()` — the next week still OPEN —
and so from the first kickoff onward it showed an empty week-4 board while week
3 was being played. The plumbing passing is no longer evidence that the feature
works.

9. **The lineup screen shows week 3 while week 3 is being played.**
   `select * from public.lineup_slate();` must return week 3 with
   `in_play = true` at every point between the first kickoff and roughly twelve
   hours after the last, and week 4 with `in_play = false` after that.
10. **A started card's row moves during the game.** Watch one slot's `points` in
    `lineup_slots` climb across successive sweeps, and the same figure on the
    row. `career_fp` on that card climbs with it.
11. **A benched card's row shows the player's points and credits the card
    nothing.** This is the claim with no server-side symptom at all — the card
    simply must not appear in `lineup_slots` — so it can only be checked on
    screen.
12. **No tier moves until the week is complete.** `settled_fp` stays behind
    `career_fp` for every card started in week 3 until the last game goes final,
    and the tier chip does not change before then. If a card promotes on
    Saturday and is still promoted on Monday that is luck, not correctness —
    check `settled_fp`, not the chip.

Items 4, 6, 7 and 9–12 are the ones that cannot be checked any other way than by
playing real games. Items 1–3 and 5 are the plumbing. **If 6, 7, 9 or 10 fails,
retry on week 4 immediately** — do not spend the window on anything else.
