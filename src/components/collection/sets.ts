/**
 * Shapes and pure helpers for the Sets segment.
 *
 * Kept apart from the screen for the same reason `types.ts` is: the ordering
 * rules below are the whole of what makes this page readable at 37 rows, and
 * they should be testable without mounting a list. Every column on `my_sets`
 * is typed nullable — Postgres cannot prove otherwise through a view — so
 * normalisation is not optional.
 *
 * WHAT A SET IS, RESTATED HERE BECAUSE THE CLIENT MUST NOT INVENT A SECOND
 * DEFINITION: a set is a named group of cards, and you complete it by
 * COMMITTING `required` distinct members out of `totalCards`. Committing burns
 * the card — it leaves the collection permanently, cannot be started or sold
 * again, and pays back a share of its sell value on the way out. The server
 * decides every number here (see the migration header for the arithmetic), and
 * nothing in this file recomputes one: a client that derives its own
 * completion rule will eventually disagree with the server, and the
 * disagreement will be a player pressing Claim and reading an error.
 *
 * TWO COUNTS, TWO QUESTIONS, AND THEY MUST NOT BE CONFLATED.
 *   committed — slots filled. Progress, and it only ever rises.
 *   ready     — members you HOLD whose slot is still empty. What you can do
 *               about it today. A page showing only the first is a progress
 *               bar with no lever attached.
 *
 * A SET PAYS ALONG THE WAY, not only at the end. A team ladder has six rewards
 * on it — a tenth, a quarter, two fifths, a half, three quarters and all of the
 * requirement — each claimable once. A TEAM set's requirement is its whole
 * roster, thirty-odd cards and a multi-season chase, so without the ladder the
 * only visible reward would be one nobody ever reaches. The rungs are what make
 * constant progress worth something.
 *
 * "RUNG" IS THIS FILE'S WORD, NOT THE PLAYER'S. It reads well in code, where a
 * ladder is the obvious metaphor, and it tested badly on screen — players did
 * not know what a rung was. Every player-facing string says REWARD instead. Do
 * not let the internal name leak back into copy.
 *
 * THREE SHAPES, AND THE PAGE IS ORGANISED BY HOW LONG YOU HAVE.
 *
 *   DAILY        three cards of one position, out of the whole pool, so it is
 *                always clearable from spares. One reward, gone at midnight.
 *                This is the faucet.
 *   WEEKLY       three cards, any position, every one SILVER OR BETTER. Tier is
 *                earned by starting a card and cannot be bought, so this is the
 *                only set junk cannot clear — and the only one with a
 *                `minTier`. One reward, gone Monday.
 *   SEASON LONG  a club's whole roster, six rewards on the way up, the last of
 *                them a multi-season chase. This is the chase.
 *
 * The family that used to try to be both faucet and chase — six cards out of a
 * pool of hundreds — is retired, and the note on `SetFamily` says why.
 */
import { positionColors } from '@/constants/positions';
import { teamWash } from '@/constants/teams';
import type { Database } from '@/lib/database.types';

/**
 * `position` is RETIRED and kept only so an old row still normalises.
 *
 * It asked for six cards out of a pool of hundreds, which is a quota rather
 * than a checklist, and five of them paying at every quarter turned this tab
 * into a trickle. The migration deactivates every one of them, so nothing the
 * server sends will carry it — but a client that could not name it would
 * silently relabel any that survived as a team set, which is worse than a
 * dead branch. The DAILY family took over the job it was doing badly.
 */
export type SetFamily = 'team' | 'position' | 'daily' | 'weekly';

/**
 * The tier floor a set puts on the COPY you commit, or null for no floor.
 *
 * Only the weekly has one. It is what stops a set being satisfied with junk:
 * tier is earned by starting a card and cannot be bought, so a floor of
 * 'silver' asks for cards you have actually played rather than cards you
 * happen to hold. The server enforces it in `commit_card_to_set` and applies it
 * everywhere a copy is counted or priced; the client's job is only to explain
 * it and to stop the autofill proposing something that would be refused.
 */
export type TierFloor = 'bronze' | 'silver' | 'gold' | 'diamond';

const TIER_ORDER: Record<TierFloor, number> = { bronze: 1, silver: 2, gold: 3, diamond: 4 };

const isTier = (v: string | null): v is TierFloor => v !== null && v in TIER_ORDER;

/** One rung. `paid` is null until it is claimed, and is what actually landed. */
export type Milestone = {
  pct: number;
  /** Slots needed, resolved against this set's requirement by the server. */
  cards: number;
  /** What it pays today. */
  coins: number;
  reached: boolean;
  claimed: boolean;
  paid: number | null;
};

const num0 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * `my_sets.milestones` is jsonb, so it is `unknown` until proven otherwise —
 * the same discipline `PackShelf` applies to `packs.guaranteed_positions`. A
 * malformed rung is dropped rather than drawn as a row of zeroes.
 */
function parseMilestones(raw: unknown): Milestone[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m) => ({
      pct: num0(m.pct),
      cards: num0(m.cards),
      coins: num0(m.coins),
      reached: m.reached === true,
      claimed: m.claimed === true,
      paid: typeof m.paid === 'number' ? m.paid : null,
    }))
    .filter((m) => m.pct > 0)
    .sort((a, b) => a.pct - b.pct);
}

/** Exactly the columns the screen selects, straight off the generated types. */
export type SetViewRow = Database['public']['Views']['my_sets']['Row'];

export type CardSet = {
  id: string;
  /** The claim RPC's handle: 'team-buf-2026'. */
  code: string;
  name: string;
  family: SetFamily;
  /** A division for a team set, the date for a daily. */
  subtitle: string | null;
  season: number | null;
  /** Distinct members needed. The bar, not the size of the set. */
  required: number;
  /** How many cards are in the set at all. */
  totalCards: number;
  /** Slots filled. Monotonic — a committed card can never come back out. */
  committed: number;
  /** Members you hold whose slot is still open: what you could commit now. */
  ready: number;
  /** Share of a copy's sell value paid when it is committed. Server-set. */
  commitPayoutPct: number;
  /** Lowest tier a copy may be to fill a slot here. Null on every family but weekly. */
  minTier: TierFloor | null;
  /** Every rung on this set's ladder, in order. */
  milestones: Milestone[];
  /** What the whole ladder pays, at today's prices. */
  totalReward: number;
  /** Reached and unpaid — the only figure here that is a call to action. */
  claimableCoins: number;
  /** What has actually landed. Frozen at each claim, so it can differ. */
  claimedCoins: number;
  /** Slots the next unreached rung wants. Null once the ladder is finished. */
  nextAt: number | null;
  /** What that rung pays. */
  nextReward: number | null;
  complete: boolean;
  sortOrder: number;
};

/**
 * Three states, and the middle one is the only one that can be acted on.
 *
 * `ready` is now "there are coins on the table" rather than "the set is
 * finished" — a rung crossed at a quarter of a team roster is claimable while
 * the set itself is nowhere near done, and that is the common case rather than
 * the edge one. `claimed` therefore means the whole ladder is behind you, which
 * on a team set means the entire roster.
 */
export type SetStatus = 'claimed' | 'ready' | 'progress';

const isFamily = (v: string | null): v is SetFamily =>
  v === 'team' || v === 'position' || v === 'daily' || v === 'weekly';

const num = (v: number | null): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function normaliseSet(row: SetViewRow): CardSet {
  return {
    id: row.set_id ?? '',
    code: row.code ?? '',
    name: row.name ?? 'Unnamed set',
    // The view can only emit values the table's CHECK allows; the fallback is
    // a type-level formality, not an expected branch.
    family: isFamily(row.family) ? row.family : 'team',
    subtitle: row.subtitle,
    season: row.season,
    // Floored at 1 rather than 0: a required_count of 0 would make every set
    // complete on load, which is the one wrong answer worth guarding against.
    required: Math.max(1, num(row.required_count)),
    totalCards: num(row.total_cards),
    committed: num(row.committed),
    ready: num(row.ready),
    commitPayoutPct: num(row.commit_payout_pct),
    minTier: isTier(row.min_tier) ? row.min_tier : null,
    milestones: parseMilestones(row.milestones),
    totalReward: num(row.total_reward),
    claimableCoins: num(row.claimable_coins),
    claimedCoins: num(row.claimed_coins),
    nextAt: row.next_at == null ? null : num(row.next_at),
    nextReward: row.next_reward == null ? null : num(row.next_reward),
    complete: row.complete === true,
    sortOrder: num(row.sort_order),
  };
}

export function statusOf(set: CardSet): SetStatus {
  if (set.claimableCoins > 0) return 'ready';

  return set.complete ? 'claimed' : 'progress';
}

/** 0–1, clamped. Drawn as a bar, so it must never exceed its track. */
export function progressOf(set: CardSet): number {
  return Math.max(0, Math.min(1, set.committed / set.required));
}

/**
 * How many more slots this set still needs. Never negative: the server refuses
 * a commit at or above the bar, so `committed` cannot exceed `required` — but
 * a clamp here costs nothing and a "-1 to go" would be unexplainable.
 */
export function remainingOf(set: CardSet): number {
  return Math.max(0, set.required - set.committed);
}

/**
 * Cards you hold that could go in RIGHT NOW — capped at what the set still
 * needs, because the server refuses the commit that would take it past the bar.
 * Holding nine candidates for a set that needs two is two actions, not nine,
 * and saying otherwise would promise a button that errors.
 *
 * Gated on the REQUIREMENT rather than on `statusOf`, because a set can now be
 * claimable and unfinished at the same time — a team at 8 of 32 has a rung to
 * collect and twenty-four slots still open.
 */
export function actionableOf(set: CardSet): number {
  return Math.min(set.ready, remainingOf(set));
}

/**
 * The four states a set can be in from where the player is standing, and the
 * only four worth sieving a list of thirty-three by.
 *
 * NAMED FOR THE LIST, not for a set: `SetChecklist` already exports a
 * `SetFilter` that sieves the CARDS inside one set, and two types called the
 * same thing meaning different things is a mistake waiting on whoever imports
 * both — the gallery does.
 *
 * THEY ARE THE STATES THE MODEL ALREADY HAS, not new ones invented for a chip
 * row: `READY` is `statusOf`'s ready, `CLAIMED` is its claimed, and `CAN_ADD`
 * is `actionableOf` being non-zero. A filter that needed its own rules would be
 * a second opinion about what a set is doing, and the row and the card would
 * eventually disagree.
 *
 * NOT FILTERED BY FAMILY, deliberately, though it is the obvious other axis.
 * The list already draws Daily, Weekly and Season long as separate titled
 * sections, so a chip per family would hide headings the reader can already
 * see — where these four cut ACROSS all three and answer the question a chip
 * row is for: what can I do something about right now.
 */
export type SetListFilter = 'ALL' | 'READY' | 'CAN_ADD' | 'CLAIMED';

/** Whether one set belongs under one filter. */
function matchesFilter(set: CardSet, filter: SetListFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'READY') return statusOf(set) === 'ready';
  if (filter === 'CLAIMED') return statusOf(set) === 'claimed';

  /* CAN_ADD is about your COLLECTION, not the set's progress, which is why it
     is the one that cannot be read off `statusOf`. A set can be claimable and
     addable at once, so the two overlap on purpose — these are lenses, not a
     partition. */
  return actionableOf(set) > 0;
}

export function filterSets(sets: CardSet[], filter: SetListFilter): CardSet[] {
  return filter === 'ALL' ? sets : sets.filter((set) => matchesFilter(set, filter));
}

/** How many sets each filter would leave on screen. */
export function setCountsOf(sets: CardSet[]): Record<SetListFilter, number> {
  let ready = 0;
  let canAdd = 0;
  let claimed = 0;
  for (const set of sets) {
    if (statusOf(set) === 'ready') ready += 1;
    else if (statusOf(set) === 'claimed') claimed += 1;
    if (actionableOf(set) > 0) canAdd += 1;
  }

  return { ALL: sets.length, READY: ready, CAN_ADD: canAdd, CLAIMED: claimed };
}

/** The next rung, or null once every one is behind you. */
export function nextMilestone(set: CardSet): Milestone | null {
  return set.milestones.find((m) => !m.reached) ?? null;
}

/**
 * Progress towards the NEXT RUNG, 0–1, rather than towards the whole set.
 *
 * A team set is its club's entire roster, so a bar measured against completion
 * sits at 3% for most of a season and says nothing a player can use. Measured
 * against the rung in front of them it moves every time they commit a card,
 * which is the only honest way to draw a target nobody reaches. Full when the
 * ladder is done.
 */
export function rungProgressOf(set: CardSet): number {
  const next = nextMilestone(set);
  if (!next) return 1;

  const floor = [...set.milestones].reverse().find((m) => m.reached)?.cards ?? 0;
  const span = next.cards - floor;
  if (span <= 0) return 1;

  return Math.max(0, Math.min(1, (set.committed - floor) / span));
}

export type SetsSummary = {
  sets: number;
  /** Claimed. Permanent — see statusOf. */
  claimed: number;
  /** Sets with a rung to collect — the only number that is a call to action. */
  ready: number;
  /** Coins sitting on the table right now, across every set. */
  coinsWaiting: number;
  /** Cards in your collection that could be committed somewhere today. */
  toCommit: number;
};

export function summariseSets(sets: CardSet[]): SetsSummary {
  let claimed = 0;
  let ready = 0;
  let coinsWaiting = 0;
  let toCommit = 0;

  for (const set of sets) {
    const status = statusOf(set);
    if (status === 'claimed') claimed += 1;
    else if (status === 'ready') {
      ready += 1;
      coinsWaiting += set.claimableCoins;
    }
    toCommit += actionableOf(set);
  }

  /* NOT a count of distinct cards. One duplicate can be the open slot in two
     different sets — a Bills receiver sits in both the Bills set and the wide
     receivers set — so this counts SLOTS you could fill, which is the number
     of actions available rather than the number of cards they would cost. The
     label on screen says "slots" for exactly that reason. */
  return { sets: sets.length, claimed, ready, coinsWaiting, toCommit };
}

/**
 * Every set with coins waiting, biggest first.
 *
 * The claim-all button's list, and it is derived here rather than in the panel
 * for the reason everything else in this file is: `statusOf` is the definition
 * of ready, and a second filter written next to a button is how a screen starts
 * disagreeing with its own summary strip. `summariseSets` counts exactly these.
 */
export function claimableSets(sets: CardSet[]): CardSet[] {
  return sets
    .filter((s) => statusOf(s) === 'ready')
    .sort((a, b) => b.claimableCoins - a.claimableCoins || a.sortOrder - b.sortOrder);
}

export type SetSection = {
  key: string;
  title: string;
  /** One quiet line under the heading. Never a rule the server does not hold. */
  note?: string;
  sets: CardSet[];
};

/**
 * THREE SECTIONS, NAMED FOR THEIR CLOCK.
 *
 * They used to be named for their CONTENTS — "Today", "By position", "By team" —
 * which described what was in each pile and left the reader to work out what
 * separated them. What actually separates them is how long you have: a daily is
 * gone at midnight, a weekly on Monday, and a team set is the thing you are
 * still chasing in December. That is also the order of urgency, so naming them
 * for the clock puts the list in the order a player should read it.
 *
 * "Season long" rather than "By team" for the same reason. A club is the SUBJECT
 * of that set, not the commitment it asks for, and the subject is already on
 * every row.
 */
const FAMILY_TITLE: Record<SetFamily, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  position: 'By position',
  team: 'Season long',
};

const FAMILY_NOTE: Record<SetFamily, string> = {
  daily: 'Three of one position, out of whatever you are holding. Gone at midnight.',
  weekly: 'Three cards you have actually played, silver or better. Gone Monday.',
  position: 'Retired. Nothing new is offered here.',
  team: "A club's whole roster. It pays six times on the way up, and the last one is a chase.",
};

/**
 * The ordering, which is the whole readability of a 37-row page.
 *
 * READY FIRST, INSIDE ITS OWN SECTION. A set with coins waiting is money on the
 * table and cannot be left in alphabetical position among thirty-one others —
 * but it used to be LIFTED OUT into a section of its own at the top, and that
 * bought the visibility at the cost of the thing the page is for.
 *
 * Three sections named for a clock only work if a set is in the section its
 * clock belongs to. A weekly hoisted into "ready to claim" is a weekly the
 * reader cannot find under Weekly, and the count under each heading stops
 * describing the family. So a ready set now rises to the top of its OWN
 * section, which gets the same visibility without moving anything out of the
 * structure — and the claim-all button in the panel above covers the case the
 * lifted section was really for, which is collecting several at once without
 * hunting for them.
 *
 * WITHIN A FAMILY: closest to done first, so the page answers "what am I near"
 * without reading every row. Claimed sets sink to the bottom — they are
 * finished business, and keeping them in progress order would put a set you
 * completed in September permanently above one you are two cards from now.
 *
 * ACTIONABILITY BREAKS THE TIE BEFORE sort_order DOES. Thirty-two team sets sit
 * at 0/6 for most of a season, and among thirty-two identical bars the ones
 * worth seeing are the ones you are holding cards for. The server's
 * `sort_order` (divisions together, clubs alphabetical inside them) is the last
 * word, which is what stops rows shuffling for any other reason.
 */
export function groupSets(sets: CardSet[]): SetSection[] {
  const sections: SetSection[] = [];

  /* DAILY, WEEKLY, SEASON LONG — shortest clock first, which is both the order
     of urgency and the order the sections are named for. Burying the two that
     expire under thirty-two team rows would hide the only rows with a deadline.
     Position sits at the end only for rows that predate its retirement; the
     server sends none, so in practice this is three sections. */
  for (const family of ['daily', 'weekly', 'team', 'position'] as const) {
    const rest = sets.filter((s) => s.family === family);
    if (rest.length === 0) continue;

    sections.push({
      key: family,
      title: FAMILY_TITLE[family],
      note: FAMILY_NOTE[family],
      sets: rest.sort(byProgressThenOrder),
    });
  }

  return sections;
}

/**
 * Inside a section: THREE BANDS, IN THE ORDER OF WHAT THE PLAYER CAN DO.
 *
 *   1. READY      coins already earned, sitting uncollected. Biggest sum first.
 *   2. CAN ADD    you are holding a card that fits an open slot. Something to
 *                 do right now, and doing it is what produces band 1.
 *   3. the rest   nothing to act on, so ordered by how close it is.
 *
 * Claimed sets sink under all three — finished business, and leaving them in
 * progress order would put a set completed in September permanently above one
 * you are two cards from now.
 *
 * WHY "CAN ADD" IS A BAND AND NOT A TIEBREAK. It used to be the third
 * consideration inside band 3, below nearness to the next reward — so a set you
 * were holding four cards for could sit below one you can do nothing about,
 * because the second happened to be nearer its next rung. Nearness is
 * information; holding a card that fits is an ACTION, and the page is sorted by
 * what you can do about it. Nearness still orders within each band.
 *
 * The chip row's CAN_ADD filter reads the same `actionableOf`, so the band and
 * the chip cannot disagree about what "can add" means.
 */
function byProgressThenOrder(a: CardSet, b: CardSet): number {
  /* Band 1. This is what replaced the lifted "ready to claim" section; see
     `groupSets`. */
  const aReady = statusOf(a) === 'ready';
  const bReady = statusOf(b) === 'ready';
  if (aReady !== bReady) return aReady ? -1 : 1;
  if (aReady && bReady) return b.claimableCoins - a.claimableCoins || a.sortOrder - b.sortOrder;

  const aDone = statusOf(a) === 'claimed';
  const bDone = statusOf(b) === 'claimed';
  if (aDone !== bDone) return aDone ? 1 : -1;

  /* Band 2. `actionableOf` is already capped at what the set still needs, so a
     set that cannot take another card never lands here however many spares are
     held for it. */
  const aCan = actionableOf(a) > 0;
  const bCan = actionableOf(b) > 0;
  if (aCan !== bCan) return aCan ? -1 : 1;

  /* Within a band: nearness to the NEXT REWARD, not to completion. Thirty-two
     team sets all sit within a few per cent of each other on completion for a
     whole season; what separates them is which one is one card from paying.
     Then how many cards you are holding for it, then the server's order. */
  return (
    rungProgressOf(b) - rungProgressOf(a) ||
    actionableOf(b) - actionableOf(a) ||
    a.sortOrder - b.sortOrder
  );
}

/**
 * WHICH CARDS A FILL BURNS, AND WHO DECIDES.
 *
 * The player does. `autofillSelection` only proposes — it seeds a selection the
 * player then edits on the checklist, and `planFor` totals up whatever they
 * actually left ticked. Nothing is burnt until they submit that selection, and
 * the server burns exactly the array it is handed (see `commit_cards_to_set`).
 *
 * That split is why the autofill can afford to be opinionated. It is a starting
 * point rather than a verdict, so its rules can protect the common case without
 * ever being the last word:
 *
 *  1. BRONZE ONLY, UNLESS THE SET HAS A FLOOR. A copy above bronze is one you
 *     have STARTED — tier is earned, never assigned — so a card that arrived by
 *     pressing one button should not be one you have been playing. They are
 *     still selectable by hand, and `planFor` names any that are, because
 *     choosing to burn one is a real decision and deserves restating before it
 *     happens.
 *
 *     A WEEKLY INVERTS THIS AND THE INVERSION IS THE WHOLE POINT OF IT. Its
 *     floor is silver, so bronze-only would propose nothing at all, every time,
 *     on the one set built to ask for cards you have played. Where a floor
 *     exists the server has already sieved the candidates down to copies that
 *     qualify — `commit_tier` on every row is the copy it would really burn —
 *     so the rule becomes simply "the cheapest that qualify", and rule 2 and 3
 *     below still order them. What it must never do is propose a copy the
 *     server would refuse: that is a button that errors, which this function
 *     exists to prevent.
 *  2. DUPLICATES FIRST. Committing a spare costs you nothing you could still
 *     start; committing your only copy costs you the player. When candidates
 *     outnumber slots, the spares should be the ones proposed.
 *  3. CHEAPEST, THEN LEAST PRODUCTIVE, then card id — so the same collection
 *     always proposes the same cards and the list does not reshuffle under a
 *     player who is halfway through editing it.
 *  4. CAPPED at the slots actually left, which is also the ceiling the
 *     checklist holds manual selection to. The server refuses the commit that
 *     would pass the requirement, so anything above the cap is a refusal in
 *     waiting.
 */
export type FillCandidate = {
  card_id: string;
  player_name: string;
  held: number;
  commit_value: number;
  commit_tier: string | null;
  committed: boolean;
  season_fp: number | null;
};

/** Selectable at all: in the set, not already filled, and you hold a copy. */
export function isAddable(m: FillCandidate): boolean {
  return !m.committed && m.held > 0;
}

export function autofillSelection(
  candidates: FillCandidate[],
  remaining: number,
  minTier: TierFloor | null = null,
): string[] {
  /* Above the floor is decided by the SERVER, which is why this compares
     against `commit_tier` — the tier of the copy that would actually be burnt,
     already chosen under the same floor — rather than re-deriving which of your
     copies qualifies. A second opinion about that here is the divergence this
     file's header keeps warning about. */
  const eligible = (m: FillCandidate): boolean => {
    if (!isAddable(m)) return false;
    if (minTier === null) return m.commit_tier === 'bronze';

    return m.commit_tier !== null && TIER_ORDER[m.commit_tier as TierFloor] >= TIER_ORDER[minTier];
  };

  return candidates
    .filter(eligible)
    .sort(
      (a, b) =>
        b.held - a.held ||
        a.commit_value - b.commit_value ||
        (a.season_fp ?? 0) - (b.season_fp ?? 0) ||
        a.card_id.localeCompare(b.card_id),
    )
    .slice(0, Math.max(0, remaining))
    .map((m) => m.card_id);
}

export type FillPlan = {
  /** In the order the server should process them. */
  cardIds: string[];
  cards: number;
  /** Coins the whole batch pays back. */
  coins: number;
  /** Of those, how many are the only copy you hold of that player. */
  singles: number;
  /**
   * Selected copies above bronze, NAMED. A count would do for the rest of this
   * — thirty names in a dialog is a wall — but these are cards the player has
   * started, deliberately ticked, and about to destroy. One or two names is
   * exactly the right amount of friction.
   */
  precious: { name: string; tier: string }[];
};

/** What the current selection adds up to. Order follows the autofill's. */
export function planFor(candidates: FillCandidate[], selected: readonly string[]): FillPlan {
  const chosen = new Set(selected);
  const taken = candidates
    .filter((m) => chosen.has(m.card_id) && isAddable(m))
    .sort(
      (a, b) =>
        b.held - a.held ||
        a.commit_value - b.commit_value ||
        (a.season_fp ?? 0) - (b.season_fp ?? 0) ||
        a.card_id.localeCompare(b.card_id),
    );

  return {
    cardIds: taken.map((m) => m.card_id),
    cards: taken.length,
    coins: taken.reduce((sum, m) => sum + m.commit_value, 0),
    singles: taken.filter((m) => m.held === 1).length,
    precious: taken
      .filter((m) => m.commit_tier !== null && m.commit_tier !== 'bronze')
      .map((m) => ({ name: m.player_name, tier: m.commit_tier as string })),
  };
}

/**
 * What a submission is about to do, as a sentence.
 *
 * Lives beside the plan rather than in the dialog because it is the same
 * decision described twice — the plan says what burns, this says so out loud —
 * and a warning that drifts from the rule it warns about is worse than none. It
 * is also the only way to look at the wording without a session: the dialog is
 * behind the auth gate, this is a pure function.
 *
 * COUNTS, NOT NAMES, with one exception. Thirty player names is a wall nobody
 * reads; what a player needs is how many, what it pays, and how many are their
 * ONLY copy of that player. The exception is a copy above bronze, which is
 * named — see `precious`.
 */
export function fillWarning(set: CardSet, plan: FillPlan): string {
  /* Singular throughout when it is one card. A selection can legitimately be
     one, and "they leave your collection ... every one of them" over a single
     card reads as a bug in the sentence. */
  const one = plan.cards === 1;

  const parts = [
    `This burns ${plan.cards} ${one ? 'copy' : 'copies'} and pays ${plan.coins} coins.`,
    one
      ? 'It leaves your collection for good — it cannot be started in a lineup or sold again.'
      : 'They leave your collection for good — they cannot be started in a lineup or sold again.',
  ];

  if (plan.singles === 0) {
    parts.push(one ? 'It is a duplicate.' : 'Every one of them is a duplicate.');
  } else if (plan.singles === plan.cards) {
    parts.push(
      one
        ? 'It is your only copy of that player.'
        : 'Every one of them is your only copy of that player.',
    );
  } else {
    parts.push(
      `${plan.singles} of them ${plan.singles === 1 ? 'is your only copy' : 'are your only copies'} of that player.`,
    );
  }

  /* Named, because a card above bronze is one this player has been starting.
     "THAT INCLUDES" ONLY WHEN IT IS A SUBSET. On an unfloored set these are the
     exceptions — the autofill would never have picked them, so they are in the
     batch because somebody ticked them, and singling them out is the warning.
     On a weekly every copy is above bronze by the set's own rule, so the same
     sentence would be listing the entire selection back under a word that says
     "and also", which reads as a bug in the sentence. */
  if (plan.precious.length > 0) {
    const named = plan.precious.map((p) => `your ${p.tier} ${p.name}`);
    const list =
      named.length === 1
        ? named[0]
        : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
    parts.push(
      plan.precious.length === plan.cards ? `That is ${list}.` : `That includes ${list}.`,
    );
  }

  /* The rung, and only ever the NEXT one. A team ladder totals thousands of
     coins almost none of which is reachable this season; quoting the total
     beside a pile you are about to burn would be advertising a number the
     player will not see. */
  if (set.nextAt !== null && set.nextReward !== null) {
    const gap = set.nextAt - set.committed;
    parts.push(
      gap <= plan.cards
        ? `It reaches the next reward, worth ${set.nextReward.toLocaleString()} coins.`
        : `That leaves it ${gap - plan.cards} short of the next reward, worth ${set.nextReward.toLocaleString()} coins.`,
    );
  }

  return parts.join(' ');
}

/**
 * The rule, as one sentence, for the top of a set's checklist.
 *
 * HERE RATHER THAN IN THE SHEET because it is the one piece of copy in this
 * feature that has to agree with the server exactly — how many cards, whether
 * there is a deadline, whether a bronze counts — and a ternary buried in a
 * header five hundred lines into a component is where that agreement goes to
 * rot. It also means the wording can be read, and changed, without a session.
 *
 * IT COUNTS THE REWARDS RATHER THAN NAMING THEM. The team ladder said "pays at
 * every quarter of the way" for as long as it had four rewards at 25/50/75/100
 * and went silently wrong the moment it had six. `milestones.length` is the
 * same fact taken from the data the server sent, so re-tuning a ladder cannot
 * leave a sentence behind describing the old one.
 *
 * THE FLOOR IS STATED IN PLAIN WORDS, not as a tier name on its own. "Silver or
 * better" means nothing to somebody who has not worked out that tier is earned
 * by starting a card, and that is precisely the player who needs to be told —
 * so the sentence says what it takes to get one.
 */
export function setRule(set: CardSet): string {
  const gone = 'A card added to a set is gone from your collection for good.';
  const pays =
    set.milestones.length > 1 ? `and it pays ${set.milestones.length} times on the way up` : '';

  if (set.family === 'daily') {
    return `Add any ${set.required} of these ${set.totalCards.toLocaleString()} cards before midnight and the set pays out. ${gone}`;
  }

  if (set.family === 'weekly') {
    const floor = set.minTier
      ? ` Every one has to be ${set.minTier} or better, which means a card you have started enough to level up — a copy straight out of a pack will not do.`
      : '';

    return `Add any ${set.required} cards before Monday and the set pays out.${floor} ${gone}`;
  }

  if (set.family === 'team') {
    return `A complete set is all ${set.totalCards} ${set.name} cards, ${pays || 'and it pays along the way'}. ${gone}`;
  }

  return `Add ${set.required} of these ${set.totalCards} cards to complete the set, ${pays || 'and it pays on the last one'}. ${gone}`;
}

/**
 * The colour to wash a set's checklist header with.
 *
 * Every sheet in the app is coloured by what it is ABOUT — a card profile by
 * its tier, a player profile by his club — and a checklist was the one left
 * over, so it opened as a plain dark panel while its siblings did not. It has
 * a subject like the others; it just took a moment to notice what.
 *
 * The set's `code` is the subject, and it is already structured:
 * `team-buf-2026`, `daily-rb-2026-08-20`, `position-qb-2026` — family, key,
 * then when. A team set is about a club and takes the club's wash; a daily or
 * position set is about a position and takes the accent that position wears on
 * every other screen in the app.
 *
 * Parsed from the code rather than taken from a column because the code IS the
 * identifier the claim RPC uses, so it cannot drift from what the set is. Null
 * for anything unrecognised, which draws no wash rather than a guess.
 *
 * A WEEKLY HAS NO SUBJECT TO TAKE A COLOUR FROM, and that is the honest answer
 * rather than a gap. Its code is `weekly-2026-08-24` — a date, no club and no
 * position — because it accepts any card at any position from any team. Where
 * the others parse a subject out of segment 1 this one would find '2026', so it
 * returns null and the sheet draws plain, which is what every set did before
 * washes existed.
 */
export function setTone(set: Pick<CardSet, 'code' | 'family'>): string | null {
  if (set.family === 'weekly') return null;

  const key = set.code.split('-')[1];
  if (!key) return null;
  if (set.family === 'team') return teamWash(key);
  return positionColors(key, 'dark').accent;
}

/**
 * The warning shown when a card about to be burned belongs to someone the
 * player is currently starting.
 *
 * WHY IT IS SEPARATE FROM `fillWarning`. That one states the terms of the act —
 * what it costs, what it leaves, how close it gets you. This is about a
 * different screen: the lineup loses a starter and gains an empty slot. Folded
 * into the same paragraph it became the fourth sentence of five and read as
 * more small print; on its own, in the warning tone, it is the thing the reader
 * did not already know.
 *
 * PHRASED AS "IF", NOT "WILL", AND THAT IS PRECISION RATHER THAN HEDGING. The
 * server burns the lowest-earning copy you hold (`commit_candidate`), so a
 * player holding a spare may well keep the one on the field. The checklist
 * cannot tell which without reimplementing that ordering, and a second copy of
 * that rule is the exact divergence this codebase keeps paying for. The result
 * notice afterwards says what actually happened.
 *
 * The kicked-off case is not mentioned. It is refused server-side rather than
 * warned about, and naming a rule that stops the act inside a dialog offering
 * to do it would be describing two different outcomes at once.
 */
export function lineupWarning(names: readonly string[]): string | null {
  if (names.length === 0) return null;

  const listed =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  const one = names.length === 1;

  return one
    ? `${listed} is in your lineup right now. If the copy that gets added is the one starting, they leave the lineup and the slot is left empty for you to refill.`
    : `${listed} are in your lineup right now. Any of them whose starting copy gets added leaves the lineup, and the slot is left empty for you to refill.`;
}
