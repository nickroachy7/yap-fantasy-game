# Sleeper UI spec — what we took, what we left, and why

Source: `sleeperuispec.md`, a captured inventory of Sleeper's web app (league
`Dynasty Reloaded`, 2026-08-18). It was handed over as a **reference for
component and data placement**, not as a template to reproduce.

That distinction does most of the work below. Sleeper is a *league* app: twelve
humans, a commissioner, a waiver wire, a draft and a trade market. Yap Fantasy
is a *card* game: one player against a global board, acquiring through packs.
Roughly half of Sleeper's surface area describes machinery we do not have, and
building the shape of it around a different meaning would be worse than not
building it.

---

## Taken

| Spec | Where it landed |
| :--- | :--- |
| §10 repeated primitives | `constants/positions.ts`, `ui/PositionBadge`, `ui/StatusChip`, `ui/EmptyState`, `ui/DropdownChip` |
| §1.3 position badge, incl. multi-cell flex grid | `ui/PositionBadge` — `FLEX` renders three cells (R/W/T) in position colours |
| §1.2 week selector chip + 3-column grid popover | `ui/DropdownChip`, used by Scores |
| §4.2 / §1.5 grouped stat headers | `groups` prop on the existing `ui/DataTable` — see the note below |
| §4.2 results row | `cards/PlayerRow` — rebuilt tall, with a position-aware stat strip |
| §7 Game Center | `/lineup/scores` — week picker, schedule grouped by kickoff, game detail, position-grouped leaders |
| §5 Trend | `/cards/trend` — reinterpreted, see below |
| §3.5 Scoring settings | `/leaderboard/scoring` |
| §1.5 player rankings strip | `POS RANK` tile on the player page |
| §1.5 career heat map | `players/CareerTable`, shaded column-relative — now the summary inside Game log rather than its own tab |
| §1.5 transaction history | `players/CardHistory` — reinterpreted, see below |
| §2.2 / §4.2 / §5 ownership block | `players/CommunityPanel` + the `COPIES HELD` tile — reinterpreted as counts, see below |
| §1.5 player page, second variant | `/card/<card_instance_id>` — `CardStanding`, `StartLog` |
| §1.5 hero identity band | `players/PlayerHero` — shared by both profiles; type and bio row, no photo/logo (unlicensed) |
| §1.5 per-season game log sections | `players/GameLogTab` — career table folded in above the per-game sections |
| §10 empty-state shape | `ui/EmptyState`, replacing four divergent hand-rolled copies |

**Note on the grouped headers.** They were added for a Cards table that has
since been replaced: the directory is now a list of tall rows with a per-player
stat strip rather than a wide table, so nothing in the product passes `groups`
today. The feature works and is exercised in `/kit`, but it is currently kept
on spec rather than on demand — the career table is the plausible future
consumer.

Two were deliberately re-pointed rather than copied:

- **Trend** measures *production*, not add/drop volume. Sleeper's number is a
  waiver-wire signal; we have no waiver wire. Ours is week-over-week change in
  fantasy points, with players absent from either week excluded rather than
  scored as zero. See `components/trend/movers.ts`.
- **Transaction history** became **Your cards**. There are no adds, trades or
  drafts to list. The equivalent question — what is my relationship to this
  player — is answered by the card instances you hold, when each arrived, and
  what each has *earned*, which is not the same as what the player has scored.
  It is now a set of LINKS into the card profile rather than a place to act;
  selling moved there, where the copy being sold is actually shown.
- **Ownership** became **counts, not percentages** — see the reversal below.

One decoration was added that the spec does not have: leaders and movers carry a
green dot when you own a card for that player. It replaces Sleeper's "which
manager rosters him", which is the same idea aimed at the only other party in
this game — you.

---

## Not taken

### 1. There is no second player

No leagues, no leaguemates, no commissioner. Everything below presumes them.

- §0.4 League Chat rail in full — message stream, rich trade/poll cards, hover
  reaction toolbar, pinned messages, `•••` overflow, composer with GIF and
  attachments
- §9.1 Direct Messages, §9.2 Inbox and @mentions, friends list, block
- §0.5 user profile card (Friend / Message / Block)
- §1.1 head-to-head header, win-probability bar, `VS` medallion
- §3.1 weekly matchups feed, §3.2 standings — **we have a global leaderboard
  instead**, which is the same job for a game with no divisions
- §3.2 playoff bracket, consolation bracket, `King (Last Place)`
- §2.6 Propose Trade board, §6 Trades screen, trade block, §6.3 Trade Offer
  modal, §2.5 My Trades
- §0.2 gear menu — invite link, co-owners, previous leagues
- §9.4 create-league wizard
- §3.4 league settings block — team count, waiver type, trade deadline, IR slots

### 2. There is no such economy

Acquisition is packs. There is no wire and no draft.

- §2.5 My Waivers, §4.3 Add Player modal and its roster-full drop flow
- §8 draft board in full — snake grid, player pool with need fractions, queue,
  auto-pick, draft chat, present mode
- §9.3 Mock Drafts
- §2.2 `DRAFT PICKS` roster section; draft picks as tradeable assets

### 3. The provider does not sell it

Verified 404s against balldontlie NFL, recorded in the project's infra notes.
These are not a tier upgrade away — they are absent from the API.

- **Projections.** The single most pervasive element in the spec: `PROJ`
  columns, the `-` over projection pattern in every player row, projected team
  totals, win probability. **Nothing in the app fabricates one.** Where Sleeper
  shows a projection we show either a real past number or nothing.
- §1.5 depth chart rail; §1.5 defensive and special-teams depth groupings
- §1.5 `LATEST NEWS` with bylines
- Weather / condition glyphs on kickoff lines

### 4. Licensing

We hold no rights to likenesses, club marks or jerseys. This is already the
established rule for card art; the spec's chrome leans on it heavily.

- Player headshots everywhere — roster rows, chat cards, trade chips, draft
  cells, leader rows
- §1.5 team-coloured hero band with cut-out player photo and logo watermark
- §7 game banner with tinted team halves and watermarked helmets → replaced with
  an abbreviation-and-score banner
- Helmet logos in the schedule column; §4.1 NFL-team logo grid

### 5. Real, but meaningless at this scale

- ~~`OWN %`, `START %`, `Rostered 56%` (§2.2, §4.2, §5).~~ **Built, as counts.**
  Both halves of the original objection were real and both were answerable:

  The aggregate now exists — `player_market()`, `security definer` because
  `card_instances` is RLS-scoped to its owner, exposing counts plus exactly one
  display name (the holder of the best copy) on the same reviewed basis as
  `leaderboard()`.

  The scale objection was answered by dropping the percentage rather than by
  waiting for users. "12 copies held by 3 people" is exactly as true at three
  users as at thirty thousand, where "Rostered 100%" is noise at one scale and
  information at the other. The one percentage kept — *ever started* — is
  always printed with the fraction it came from (`78%` over `21 of 27`), so it
  cannot be read without its denominator.
- §4.1 `LEAGUEMATE` filter — same reason as §1.

### 6. Declined on design grounds

These were buildable. Each was a judgement call, so each is recorded rather
than quietly dropped.

- **§2.3 select-then-dim lineup editing.** Genuinely good: select a slot, dim
  the ineligible, click a bright row to swap. But our lineup already solves the
  same problem the other way — tap a slot, get a list filtered to legal cards,
  with the bench showing each card's destination slot. That is a *different*
  right answer, not a worse one, and the screen was rebuilt two commits ago.
  Swapping it would be churn dressed as a feature.
- **§0.1 collapsed icon rail with hover-expand.** Our sidebar is already a
  persistent 236pt rail. Collapsing it to 72px and hiding the labels behind
  hover trades discoverability for width we are not short of, and hover is not
  a gesture that exists on the phone build.
- **§2.4 player nicknames.** Charming, and it lives in a Team Settings modal
  for a league identity we do not have. Reconsider if cards ever get a
  personalisation surface of their own.
- **§4.1 NFL-teams filter grid.** Without logos it is a grid of text
  abbreviations, and the directory's search box already matches on team. It
  would be a second way to do one thing. Worth revisiting as a proper faceted
  filter, not as a logo wall.
- **§1.5 player "document tab" chip and `⌘U` global search.** Real value — fast
  player-to-player comparison without losing your place. It is a router and
  overlay change rather than a component, so it is its own piece of work.
- **§9.5 settings under marketing chrome.** The account screen already covers
  this, and dropping the app shell for a marketing header mid-session is a
  Sleeper-specific artefact of their web stack, not a pattern to copy.

---

## Follow-ups worth taking

1. ~~Global ownership percentage, once the user base makes it meaningful.~~
   Done as `players/CommunityPanel`, in counts rather than percentages (§5).
2. Player-to-player comparison overlay with a keyboard shortcut (§1.5).
3. Faceted directory filters — team, rookie, bye week (§4.1), if search proves
   insufficient.
4. `/leaderboard/scoring` currently reads the active ruleset only. When a second
   version ships, it should be able to show which ruleset scored a given week.
