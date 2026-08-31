# Card rarity and pack odds — what was measured, and what was chosen

Closes build plan task 13. Applied 2026-08-19 as
`20260819100000_assign_card_rarity.sql` and
`20260819101000_validate_standard_pack_odds.sql`.

Before this, all 968 season-2026 cards were `rarity='common'`,
`rarity_source='fallback'`. That is not a cosmetic detail: `open_pack()` rolls a
band from `packs.odds`, looks for a card in it, and falls through to *any
mintable card* when the band is empty. With every card common, that fallback
fired on every single pull — the odds column existed but did nothing, and pack
pulls were uniform.

---

## The two axes, which are not the same axis

| | `cards.rarity` | `card_instances.tier` |
| :--- | :--- | :--- |
| Means | how hard the player is to **pull** | what your copy has **earned** |
| Set by | `assign_card_rarity()`, from prior-season production | `career_fp` accruing from lineup starts |
| Scale | common → legendary | bronze → diamond |
| Shared? | one value per template, league-wide | per copy; two owners diverge |

A common card that starts every week outgrows a legendary that sits on the
bench. Nothing in this work touches tier.

---

## Signal: 2025 production, not DFS salary

The plan named DFS salary bands as primary with 2025 season stats as the
documented fallback. The DFS route was **measured and rejected** — salary is
flat in preseason, so it carries almost no ordering information at the exact
moment we need to ship. This is the documented fallback, promoted.

Two production numbers exist and they are not interchangeable:

- **exact** — per-game `stat_lines` scored into `fantasy_points`. Includes the
  three per-game yardage bonuses (+3 at 300 pass / 100 rush / 100 rec).
- **base** — `season_base_points()` over season totals. Linear terms only; a
  threshold crossed in a single game is invisible in a season sum.

We prefer exact, coalescing to base.

**Measured, and worth knowing: the base fallback fires for exactly zero cards.**
Every card whose player has a 2025 `player_season_stats` row also has 2025
per-game stat lines, at all five positions. The coalesce is kept because it
costs nothing and a future season could be banded before its game logs are
backfilled — but today it is dead code. Do not read it as "we blend two
sources".

Other choices, stated so they can be argued with:

- **Regular season only** (`season_type = 2`). Postseason would quietly reward
  playing for a good team, which is not what scarcity means.
- **Season total, not per-game rate.** This is a season-long collection game
  where a card is started week after week, so availability is genuinely part of
  what a template is worth. A rate stat is also violently noisy at the bottom of
  the sample — one 25-point afternoon would outrank a season-long starter.

---

## Ranked within position group. This was checked, not assumed.

Banding the 575 cards that have a 2025 signal on one **global** list by fantasy
points produces:

| pos | legendary | epic |
| :-- | --: | --: |
| PK | 0 | 0 |
| TE | 0 | 1 |
| QB | 4 | 12 |
| RB | 5 | 10 |
| WR | 3 | 6 |

Two of the five positions can never produce a top-band card under a global
ranking, **at any threshold**, because the best kicker in the league (171.0 FP)
cannot out-score a mid-tier quarterback. That is not scarcity, it is a unit
mismatch. Ranking within `players.position_abbreviation` fixes it. Kickers are
`PK`, not `K`.

Cuts are fractions of each position's *signal pool* — top 3% legendary, 10%
epic, 25% rare, 50% uncommon — chained through `greatest()` so a small pool
cannot collapse a band or invert the ladder. Ties break on `card_id`, which is
what makes a re-run land on the same answer instead of reshuffling.

---

## Realised bands

968 mintable cards, season 2026:

| pos | pool with signal | legendary | epic | rare | uncommon | common | total |
| :-- | --: | --: | --: | --: | --: | --: | --: |
| WR | 218 | 7 | 15 | 33 | 54 | 289 | 398 |
| TE | 123 | 4 | 9 | 18 | 31 | 146 | 208 |
| RB | 126 | 4 | 9 | 19 | 31 | 138 | 201 |
| QB | 77 | 3 | 5 | 12 | 19 | 81 | 120 |
| PK | 31 | 2 | 2 | 4 | 8 | 25 | 41 |
| **all** | **575** | **20** | **40** | **86** | **143** | **679** | **968** |

Band floors (lowest 2025 FP in the band) — a sanity check that the ladder means
something:

| pos | legendary ≥ | epic ≥ | rare ≥ | uncommon ≥ |
| :-- | --: | --: | --: | --: |
| WR | 252.3 | 203.4 | 116.4 | 49.1 |
| RB | 375.3 | 239.3 | 143.0 | 58.3 |
| TE | 189.4 | 164.5 | 88.7 | 30.7 |
| QB | 351.0 | 308.8 | 212.9 | 74.3 |
| PK | 160.0 | 148.0 | 134.0 | 115.0 |

The 20 legendaries are McCaffrey, Bijan Robinson, Gibbs, Jonathan Taylor (RB);
Josh Allen, Stafford, Drake Maye (QB); Puka Nacua, Smith-Njigba, St. Brown,
Ja'Marr Chase, Pickens, Olave, Zay Flowers (WR); McBride, Pitts, Kelce, Fannin
(TE); Jason Myers, Fairbairn (PK). Face validity is the point of listing them.

---

## Rookies and players with no 2025 production

**393 of 968 cards (40.6%) have no 2025 signal at all.** None of them have a
2025 `player_season_stats` row either, and only 73 of the 393 have *any* prior
season — so the bulk are genuine rookies and camp bodies.

They are assigned **common**, explicitly by rule:

- **Not legendary.** We have no evidence they are good. Promoting a rookie on
  draft position would be fabricating a signal we do not have — the provider
  serves no projections, no depth charts and no rankings, so there is nothing to
  guess from.
- **Not left alone.** Leaving them on `'fallback'` would mean 40% of the pool
  still routed through `open_pack`'s empty-band escape hatch, which is the
  behaviour this work exists to end.

So absence of production is itself treated as the signal, and these cards carry
`rarity_source='season_stats'` like everything else. **`rarity_source` records
which rule set the band, not whether a number was found.**

The known cost: a genuinely good 2026 rookie is a common card all season. See
*Still open* below.

---

## Pack odds: validated, deliberately unchanged

These weights shipped in August as inert decoration. Populating the bands is the
first moment they do anything, so they were checked rather than assumed.

| band | cards | % of pool | pack odds | odds ÷ population |
| :-- | --: | --: | --: | --: |
| common | 679 | 70.1% | 70% | 1.00 |
| uncommon | 143 | 14.8% | 20% | 1.35 |
| rare | 86 | 8.9% | 7% | 0.79 |
| epic | 40 | 4.1% | 2.5% | 0.61 |
| legendary | 20 | 2.1% | 0.5% | 0.24 |

The right-hand column is the test, and it descends monotonically. That is what a
rarity system is *for*: the better the band, the harder the odds suppress it
relative to how many such cards exist. A ratio that rose with band quality would
mean the "rare" tiers were easier to hit than chance.

Nothing was clearly wrong, so **nothing was changed**. The guidance is that you
can always grant more and never claw back; loosening odds on a hunch is how you
end up clawing back.

The specific trap this was checked against: a 0.5% roll is a different promise
depending on how many cards sit behind it. Legendary is **20** cards, not 8 — a
legendary pull is 1-of-20 elite players, which is a coherent chase. At 8 it would
have been a lottery on named individuals and 0.5% would have been too tight.

---

## Simulated pull experience

200,000 simulated standard packs against the realised bands, plus the closed
form. They agree. Read-only — no cards were minted.

Per pack (5 cards, 100 coins):

- **41.0%** contain at least one rare-or-better
- **14.2%** contain at least one epic-or-better
- **2.45%** contain a legendary → **~41 packs (4,100 coins) to expect one**
- 59.0% are entirely common/uncommon

Cumulatively, against the real faucet (500-coin signup grant, 250/week):

| after | seen rare+ | seen epic+ | seen legendary | expected legendaries |
| :-- | --: | --: | --: | --: |
| 1 pack | 41.0% | 14.1% | 2.5% | 0.03 |
| 5 packs — the signup grant | 92.8% | 53.3% | 11.8% | 0.13 |
| 10 packs — ~2 weeks | 99.5% | 78.2% | 22.2% | 0.25 |
| 20 packs — ~6 weeks (beta) | 100% | 95.2% | 39.4% | 0.50 |
| 45 packs — full season | 100% | 99.9% | 67.6% | 1.13 |

**The first thirty minutes** — free starter pack plus five packs from the signup
grant — is near-certain to show a rare, a coin-flip for an epic, and leaves
legendary a real chase. That is the intended shape.

Duplicate pressure is not a problem at any band: over a full season (~45 packs,
225 cards) a player draws ~157 commons from 679, ~16 rares from 86, ~5.6 epics
from 40 and ~1.1 legendaries from 20.

**Position coverage is unaffected**, which matters because this is the one place
the two axes could have collided. Weighting by rarity leaves the position mix of
a pack essentially identical to the old uniform draw:

| pos | per-card, weighted | per-card, uniform | ≥1 per pack, weighted | ≥1 per pack, uniform |
| :-- | --: | --: | --: | --: |
| WR | 41.15% | 41.12% | 92.94% | 92.92% |
| TE | 21.52% | 21.49% | 70.22% | 70.17% |
| RB | 20.77% | 20.76% | 68.78% | 68.77% |
| QB | 12.37% | 12.40% | 48.33% | 48.41% |
| PK | 4.20% | 4.24% | **19.29%** | **19.46%** |

The bands are built within position, so they carry roughly the position mix of
the whole set. Rarity neither creates nor fixes the kicker-coverage problem;
`packs.guaranteed_positions` remains the mechanism for that.

---

## Still open — decisions for Nick, not for the migration

### 1. The free starter pack is now more generous than the paid one

This is the one finding that should be looked at before kickoff.

`open_pack()`'s guaranteed-position path selects `order by random()` with **no
rarity filter**. The starter pack's `card_count` (8) is exactly consumed by its
`guaranteed_positions`, so *every* card it deals comes from that path and
`packs.odds` is never consulted. While all cards were common this was invisible.
Now:

| | per card | ≥1 legendary | ≥1 epic+ |
| :-- | --: | --: | --: |
| Starter pack (free, 8 cards, uniform) | 2.32% | **17.2%** | 41.8% |
| Standard pack (100 coins, 5 cards, weighted) | 0.50% | 2.45% | 14.2% |

The free once-per-user pack is **4.6× more generous per card** than the pack you
pay for. Arguments both ways: it is a strong onboarding hook and cannot be
farmed (`once_per_user`), but it undercuts the paid pack on day one and it is
plainly not a decision anyone made — it is a side effect of `odds` being `{}`.

Not fixed here, deliberately: the fix belongs in `open_pack()`, which is outside
this task's remit, and it changes onboarding feel rather than correctness.
Options are (a) leave it as an intentional hook, (b) have the guaranteed path
roll rarity within the position, (c) give `starter` its own stingier odds and
make the guaranteed path honour them.

### 2. Legendary kickers

Ranking within position means every position gets a full ladder, so a legendary
kicker exists and is worth far less in lineup points than a legendary receiver.
That is *correct* for a scarcity axis — he genuinely is the scarcest kicker — but
capping PK at, say, rare is defensible. Left as-is deliberately.

### 3. Rookies stay common all season unless we re-band

`assign_card_rarity()` is re-runnable precisely so this can be revisited once
2026 games have been played. But re-banding mid-season changes what is scarce
*underneath people who already collected*, and `card_instances` does not snapshot
rarity at mint (the column was dropped), so a re-band retroactively rewrites how
impressive every existing collection looks. That is a product call and was not
made here.

### 4. `rarity_updated_at` is per-card, by design

The function writes only rows whose band actually moved, so a no-op re-run
touches nothing and the column keeps meaning "when this card's band last
changed" rather than "when the job last ran".

---

## Running it

```sh
# admin only — revoked from anon and authenticated
select public.assign_card_rarity(2026);              -- bands 2026 on 2025 production
select public.assign_card_rarity(2026, 2024);        -- or name the production season

# tests
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rarity.test.sql
```

The suite flattens every card back to common/fallback first and proves the
function rebuilds from there — asserting against bands that were already correct
would pass even if the function body were deleted. It then checks idempotency
(a second run must change 0 rows), that no mintable card is left on `fallback`,
that every position spans more than one band, that PK and TE specifically reach
legendary, that the ladder is monotone in production at every position and every
adjacent band pair, that no card without prior-season production was promoted
above common, and that tier was not touched. Everything runs inside a
transaction that is rolled back.
