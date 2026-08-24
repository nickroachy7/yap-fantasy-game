/**
 * Turning a selection of cards into the calls that spend them.
 *
 * Pure, and apart from the component for the same reason `sets.ts` is apart
 * from its screen: the routing below is the whole of what makes a mixed
 * selection safe to confirm, and it should be readable — and eventually
 * testable — without mounting a grid.
 *
 * ---------------------------------------------------------------------------
 * WHY "ADD TO SETS" NEEDS ROUTING AT ALL
 * ---------------------------------------------------------------------------
 *
 * `commit_cards_to_set` takes ONE set and a list of cards. A selection out of
 * the inventory is not one set's worth of cards — it is twenty spares off
 * fourteen different clubs — so something has to decide which set each card is
 * going to before any call can be made. That decision is here, it is made from
 * what the server said, and it is shown to the player before anything burns.
 *
 * THE RULES, IN ORDER, AND EACH ONE EXISTS BECAUSE THE SERVER WOULD OTHERWISE
 * REFUSE THE CALL:
 *
 *   1. Only cards with a set that can actually take them. `canCommit` is the
 *      server's own conjunction — not full, not already holding this player.
 *
 *   2. One set per card, and it is the FIRST the server listed. `card_actions`
 *      orders dailies ahead of team sets, so a card that fits both goes to the
 *      one that expires at midnight. Sending it to both would be sending the
 *      same card twice.
 *
 *   3. DEDUPED BY card_id, NOT BY COPY. A set slot is a PLAYER, so three copies
 *      of one man fill it once and the other two would come back refused as
 *      "already in this set". Ticking all three is a reasonable thing for a
 *      player to do; sending all three is not.
 *
 *   4. Cheapest first inside each set. `commit_cards_to_set` processes the array
 *      front to back and refuses the tail once the requirement is met, so the
 *      order decides WHICH of your cards survive a set that fills up mid-call.
 *      Its own note asks callers to send their cheapest first; this is that.
 *
 * WHAT IS NOT DECIDED HERE: whether any of it happens. This returns a plan,
 * the plan is what the confirmation names, and the caller runs it.
 *
 * ---------------------------------------------------------------------------
 * WHY THE INPUTS ARE STRUCTURAL RATHER THAN THE APP'S OWN TYPES
 * ---------------------------------------------------------------------------
 *
 * This file imports nothing. It took `CollectionCard` and `CardActions`
 * directly at first, which reads better and cost the module its tests: those
 * types reach `theme.ts`, `theme.ts` imports `global.css`, and the Deno runner
 * the unit suites use cannot follow a stylesheet. The choice was a suite for
 * the one piece of this feature with no server to defer to, or two named
 * imports.
 *
 * It is also the better contract. The planner needs four fields off a card and
 * three off a set; asking for whole objects was overstating what it reads.
 * These are structural, so `CollectionCard` and `CardActions` satisfy them
 * without a cast and the call site still type-checks — drop `canCommit` from
 * the server's answer and the inventory screen stops compiling, which is the
 * protection that actually matters.
 */

/** One set, as much of it as the routing looks at. */
export type PlannableSet = {
  code: string;
  name: string;
  /** Gems the commit pays. The server's figure; never recomputed here. */
  pays: number;
  /** The server's own conjunction: not full, not already holding this player. */
  canCommit: boolean;
  /** This player is already in this set — the reason that is not "no set". */
  slotFilled: boolean;
};

/** What `card_actions` said about one copy, as much of it as the routing looks at. */
export type PlannableActions = {
  burnsThisCopy: boolean;
  sets: PlannableSet[];
};

/** One held copy, as much of it as the routing looks at. */
export type PlannableCard = {
  /** card_instances.id — how the offers are keyed. */
  id: string;
  /** cards.id — what `commit_cards_to_set` takes. Null is unplannable. */
  cardId: string | null;
  sellValue: number;
  careerFp: number;
};

/** One set's worth of a selection: what to send, and what it is worth. */
export type CommitLeg = {
  setCode: string;
  setName: string;
  /** `cards.id` values, cheapest first. What `commit_cards_to_set` takes. */
  cardIds: string[];
  /** Gems this leg pays, summed from the server's per-card figures. */
  gems: number;
};

export type CommitPlan = {
  legs: CommitLeg[];
  /** Distinct players going in. NOT the number of copies ticked. */
  cards: number;
  /** What the whole plan pays at today's prices. */
  gems: number;
  /**
   * Selected copies the plan cannot use, and it is THREE numbers because they
   * are three different pieces of news. Reported separately because collapsing
   * them is what produced "0 added — 3 skipped, no set has a slot open for
   * these" over a selection whose cards were all already in their sets: true of
   * none of them, and the one thing the player would have wanted to know.
   *
   *   alreadyIn  a set this card belongs to already holds this player;
   *   noSet      no set it belongs to can take it, for any other reason —
   *              including belonging to no active set at all;
   *   duplicate  a second copy of a player already going in on THIS run.
   */
  alreadyIn: number;
  noSet: number;
  duplicate: number;
  /**
   * The ticked copies no leg is taking — the three counts above, as cards.
   *
   * Kept rather than merely counted so the run can OFFER them: a selection that
   * a set will not take is very often a selection worth selling, and the player
   * has already said these are spare by ticking them. Without the ids that
   * offer would mean asking them to pick the same cards again.
   */
  leftovers: PlannableCard[];
  /** True when any leg burns a copy other than the one that was ticked. */
  anySpare: boolean;
};

export function planCommits(
  selected: PlannableCard[],
  actions: Map<string, PlannableActions>,
): CommitPlan {
  /* Cheapest first, globally, so the dedupe below keeps the cheapest copy of a
     player and each leg is already in the order the server wants. Career FP
     breaks a tie on price, which is what separates two bronzes. */
  const order = [...selected].sort(
    (a, b) => a.sellValue - b.sellValue || a.careerFp - b.careerFp,
  );

  const byCode = new Map<string, CommitLeg>();
  const takenCards = new Set<string>();
  const leftovers: PlannableCard[] = [];
  let alreadyIn = 0;
  let noSet = 0;
  let duplicate = 0;
  let anySpare = false;

  for (const card of order) {
    const can = actions.get(card.id);
    const target = can?.sets.find((s) => s.canCommit);
    if (!can || !target || !card.cardId) {
      // Which KIND of "cannot", because they read completely differently. A
      // slot already filled is the common case on a spare and is good news the
      // player has forgotten; anything else is the shrug.
      if (can?.sets.some((s) => s.slotFilled)) alreadyIn += 1;
      else noSet += 1;
      leftovers.push(card);
      continue;
    }
    if (takenCards.has(card.cardId)) {
      duplicate += 1;
      leftovers.push(card);
      continue;
    }
    takenCards.add(card.cardId);
    if (!can.burnsThisCopy) anySpare = true;

    const leg = byCode.get(target.code) ?? {
      setCode: target.code,
      setName: target.name,
      cardIds: [],
      gems: 0,
    };
    leg.cardIds.push(card.cardId);
    leg.gems += target.pays;
    byCode.set(target.code, leg);
  }

  const legs = [...byCode.values()].sort((a, b) => a.setName.localeCompare(b.setName));

  return {
    legs,
    cards: legs.reduce((n, l) => n + l.cardIds.length, 0),
    gems: legs.reduce((n, l) => n + l.gems, 0),
    alreadyIn,
    noSet,
    duplicate,
    leftovers,
    anySpare,
  };
}

/** What selling the ticked copies pays, from the per-card prices already loaded. */
export function sellTotal(selected: { sellValue: number }[]): number {
  return selected.reduce((n, card) => n + card.sellValue, 0);
}

/**
 * The most copies one action may carry.
 *
 * `commit_cards_to_set` and `sell_cards` both refuse past 64, and they refuse
 * with a Postgres error rather than a sentence — so the selection is capped
 * here instead, where it can be a number on screen rather than a failure after
 * the fact. The two server ceilings are deliberately identical for this reason;
 * see the note on `sell_cards`.
 */
export const SELECTION_MAX = 64;
