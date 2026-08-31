/**
 * "Do this to all of them" — worked out before a single write is sent.
 *
 * WHY THE SWEEP IS PLANNED AND NOT JUST FIRED
 *
 * A pack is mostly spares, and clearing one card at a time is eight decisions
 * about cards that are all the same decision. So the bar offers two buttons
 * that act on the whole pack — and the moment a button acts on eight cards, the
 * player has to be told what it is about to do in one sentence BEFORE it does
 * it. That sentence is this file: it names the count and the gems, and the
 * sweep that follows is exactly the plan it described.
 *
 * IT ALSO HAS TO NOT ASK FOR THE IMPOSSIBLE. `card_actions` answers about each
 * card ON ITS OWN, so two Bills cards in one pack are both told the Bills set
 * will take them — and it will take one. Firing both means the second is
 * refused, which is a round trip spent to learn something the client already
 * knew. The plan therefore keeps its own tally of what it has already spent:
 *
 *   ONE SLOT PER PRINTED CARD PER SET. A set has a slot for a PLAYER, so a
 *   second copy of him cannot fill it however many you pulled.
 *   NO MORE THAN A SET STILL NEEDS. `required - committed`, counted down as
 *   the plan assigns, so a sweep never commits a card into a set that was one
 *   short.
 *
 * The server is still the authority — every refusal it raises is reported —
 * but the plan is what stops the client walking into refusals it can see.
 *
 * THE TWO BUTTONS DO NOT OVERLAP, and that is the safety property that matters.
 * `sells` is what is LEFT after `commits`, so "sell the spares" can never sell
 * a card a set wanted. A player who presses sell without pressing add loses
 * nothing they were being offered; the cards a set can use are still there.
 *
 * A KEPT CARD IS IN NEITHER, and that is the third answer the reveal owes a
 * player. The two buttons act on the whole pack, so until now the only way to
 * hold one card back was to decline both and clear the other seven by hand —
 * which is the eight decisions the sweep exists to spare you. `kept` is the
 * player saying "not this one" and it is read here, in the one place that
 * decides what a sweep touches, rather than filtered out of the two plans
 * afterwards. Keeping is not an act on the card: nothing is written, the card's
 * own buttons still work, and the flag dies with the pull.
 *
 * IT ALSO FREES THE SLOT IT WAS GOING TO FILL. Keeping your one Bills card
 * takes it out of the loop below BEFORE `room` and `taken` are counted, so the
 * duplicate in the same pack takes that set slot instead. A keep that quietly
 * cost you the commit as well would be a worse trade than the player agreed to.
 *
 * BEST-PAYING SET WINS, when more than one will take a card. There is no
 * reading of "add all" under which the player wanted the cheaper one, and a
 * sweep that stopped to ask which set would not be a sweep. Ties break on code
 * so the plan is the same every time it is built from the same answer.
 */
import type { CardActions } from './card-actions';
import type { Pulled } from './PackShelf';
import type { Disposition } from './use-pull-actions';

export type PlannedCommit = {
  cardInstanceId: string;
  player: string;
  setCode: string;
  setName: string;
  pays: number;
  /** The commit would burn an older copy, leaving this card where it is. */
  spare: boolean;
};

export type PlannedSell = {
  cardInstanceId: string;
  player: string;
  gems: number;
};

export type Sweep = {
  commits: PlannedCommit[];
  sells: PlannedSell[];
  /** What the commits pay, in total. */
  commitGems: number;
  /** What the sells pay, in total. */
  sellGems: number;
  /** How many distinct sets the commits touch — the sentence needs it. */
  setCount: number;
  /**
   * How many cards the player is holding back, still in hand.
   *
   * Counted here rather than off the set itself, because a kept card that was
   * then sold by hand is no longer being held back from anything — and the
   * sentence on the bar would be naming a card that is gone.
   */
  kept: number;
};

export const EMPTY_SWEEP: Sweep = {
  commits: [],
  sells: [],
  commitGems: 0,
  sellGems: 0,
  setCount: 0,
  kept: 0,
};

/**
 * What is still open on a card: not spent, still held, still offered something.
 *
 * `disposed` is checked as well as `held`, because the two answer different
 * questions and a sweep needs both. A commit that burnt a SPARE copy leaves
 * this card held and sellable — but the player has already dealt with it, and a
 * sweep that then sold it would be acting twice on one decision.
 *
 * `kept` is the third way a card is spoken for, and it is the only one the
 * player can take back.
 */
function open(
  id: string,
  actions: Map<string, CardActions>,
  disposed: Map<string, Disposition>,
  kept: Set<string>,
) {
  if (disposed.has(id) || kept.has(id)) return null;
  const action = actions.get(id);
  if (!action || !action.held) return null;
  return action;
}

export function planSweep(
  pulled: Pulled[],
  actions: Map<string, CardActions>,
  disposed: Map<string, Disposition>,
  kept: Set<string>,
): Sweep {
  const commits: PlannedCommit[] = [];
  const sells: PlannedSell[] = [];

  /** How many more cards each set can still take, counted down as we assign. */
  const room = new Map<string, number>();
  /** `${setCode}:${cardId}` already assigned — a player fills one slot. */
  const taken = new Set<string>();

  const claimed = new Set<string>();

  for (const p of pulled) {
    const action = open(p.card_instance_id, actions, disposed, kept);
    if (!action) continue;

    const offers = action.sets
      .filter((s) => s.canCommit)
      .filter((s) => !taken.has(`${s.code}:${action.cardId}`))
      .filter((s) => {
        if (!room.has(s.code)) room.set(s.code, Math.max(0, s.required - s.committed));
        return (room.get(s.code) ?? 0) > 0;
      })
      .sort((a, b) => b.pays - a.pays || a.code.localeCompare(b.code));

    const best = offers[0];
    if (!best) continue;

    room.set(best.code, (room.get(best.code) ?? 0) - 1);
    taken.add(`${best.code}:${action.cardId}`);
    claimed.add(p.card_instance_id);
    commits.push({
      cardInstanceId: p.card_instance_id,
      player: p.player_name ?? 'This card',
      setCode: best.code,
      setName: best.name,
      pays: best.pays,
      /* THE CARD'S ANSWER, NOT THE SET'S, and the two exist separately for a
         reason: `CardActionSet.burnsThisCopy` asks which copy THIS set would
         take, which differs from the collection-wide answer exactly on a
         floored set — and a floored set cannot be committed to at all, so it is
         never in this plan. Reading the card-level flag is what keeps this
         sentence identical to the one the card's own button gives. */
      spare: action.burnsThisCopy === false,
    });
  }

  for (const p of pulled) {
    if (claimed.has(p.card_instance_id)) continue;
    const action = open(p.card_instance_id, actions, disposed, kept);
    if (!action || !action.sellable) continue;
    sells.push({
      cardInstanceId: p.card_instance_id,
      player: p.player_name ?? 'This card',
      gems: action.sellValue,
    });
  }

  return {
    commits,
    sells,
    commitGems: commits.reduce((n, x) => n + x.pays, 0),
    sellGems: sells.reduce((n, x) => n + x.gems, 0),
    setCount: new Set(commits.map((x) => x.setCode)).size,
    /* Only the ones still in hand. A card kept and then sold by hand is spent,
       and the bar must not say it is being held back from anything. */
    kept: pulled.filter((p) => {
      if (!kept.has(p.card_instance_id) || disposed.has(p.card_instance_id)) return false;
      return actions.get(p.card_instance_id)?.held === true;
    }).length,
  };
}
