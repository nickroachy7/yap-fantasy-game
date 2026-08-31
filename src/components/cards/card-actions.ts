/**
 * What you can do with a card you hold, as the server reports it.
 *
 * WHY THIS IS ITS OWN MODULE. It began inside `use-pull-actions`, because the
 * pack reveal was the only thing that asked. The card profile now offers the
 * same two exits on the same terms, and a screen importing its types and its
 * reader out of the pack-opening hook would be depending on a feature it has
 * nothing to do with — the next edit to the reveal would be an edit to the
 * profile by accident. The RPC is about a CARD, not about a pack, and so is
 * this.
 *
 * WHAT STAYED BEHIND: `Disposition`, which is a record of what the player did
 * during one pack opening. That genuinely is the reveal's.
 *
 * EVERY FIGURE HERE IS THE SERVER'S. `card_actions` reports what selling pays,
 * which sets a card can still fill, and what committing to each pays — all read
 * out of the tables `sell_card` and `commit_card_to_set` decide against.
 * Nothing in this file recomputes one; see the migration's note for why. A
 * client that derived the payout would eventually print a number that is not
 * the number that lands, and a button that computed its own eligibility would
 * eventually offer a commit the server refuses after the player had decided.
 */
import { supabase } from '@/lib/supabase';

/** One set a card could still be committed to. */
export type CardActionSet = {
  code: string;
  name: string;
  family: string;
  subtitle: string | null;
  /** Coins this commit pays, priced by the server off the copy that would burn. */
  pays: number;
  committed: number;
  required: number;
  /** This player is already in this set — his slot cannot take a second copy. */
  slotFilled: boolean;
  /** The set has met its requirement, so a further commit buys nothing. */
  setComplete: boolean;
  /**
   * The lowest tier a copy may be to fill a slot here, or null for no floor.
   *
   * ONLY THE WEEKLY HAS ONE, and it is carried this far for one reason: it is
   * the THIRD way a set can refuse a card, and the two the UI already knew
   * about — the slot is taken, the set is full — are both about the SET. This
   * one is about the copy, so a screen that did not have it would explain a
   * floored refusal with whichever of the other two it happened to reach for
   * and be wrong about the player's own collection.
   */
  minTier: string | null;
  /**
   * Whether the copy being asked about is the one THIS set would burn.
   *
   * Differs from `CardActions.burnsThisCopy`, which asks the same question of
   * the collection with no set in mind. They part company exactly on a floored
   * set: the cheapest copy you hold and the cheapest copy this set will accept
   * are not the same card, and the profile is looking at one specific copy.
   */
  burnsThisCopy: boolean;
  /** The one field a button binds to. Never re-derived from the others above. */
  canCommit: boolean;
};

/**
 * Why a set will not take this card, as a two-word label and a sentence.
 *
 * HERE RATHER THAN IN THE COMPONENT because there are now three reasons and
 * they are not interchangeable — one is something the player already did, one
 * is about the set, and one is about which copy they are holding. A ternary
 * chain in a view is where the third one gets folded into the second and the
 * screen starts telling people a set is full when their card is simply too
 * junior. It also means the wording is readable without a session.
 *
 * ORDER MATTERS. A slot already filled is checked first because it is the only
 * one that is good news, and a full set before a floor because a set that
 * cannot take ANY card is a better explanation than one about this copy.
 */
export function commitBlockedBy(
  set: CardActionSet,
  playerName: string,
): { label: string; body: string; done: boolean } {
  if (set.slotFilled) {
    return {
      label: 'ALREADY IN SET',
      body: `${set.name} already has ${playerName}. This copy is still yours — you can sell it or start it.`,
      done: true,
    };
  }

  if (set.setComplete) {
    return {
      label: 'SET IS FULL',
      body: `${set.name} has met its requirement, so it cannot take another card. This copy is still yours to sell or start.`,
      done: false,
    };
  }

  if (set.minTier) {
    return {
      label: `NEEDS ${set.minTier.toUpperCase()}`,
      /* Says what to DO about it, which the other two cannot: a tier is earned
         by starting the card, so this refusal has a way out that the player
         controls. */
      body: `${set.name} only takes ${set.minTier} copies or better, and yours is not there yet. Start ${playerName} in your lineup and this copy will climb.`,
      done: false,
    };
  }

  return {
    label: 'CANNOT ADD',
    body: `${set.name} cannot take this card right now. This copy is still yours to sell or start.`,
    done: false,
  };
}

/** What a single copy can be turned into right now. */
export type CardActions = {
  cardInstanceId: string;
  /** The PRINTED card, which is what `commit_card_to_set` takes. */
  cardId: string;
  sellValue: number;
  /**
   * Still in the collection — not sold, not burnt into a set.
   *
   * NOT the same question as `sellable`, and callers need both: a card standing
   * in an unscored lineup cannot be sold and is very much still yours, while a
   * card that filled a set slot is gone and must stop being offered anything.
   */
  held: boolean;
  sellable: boolean;
  /**
   * Whether committing would burn THIS copy or an older, cheaper one.
   *
   * `commit_card_to_set` always takes the least valuable copy you hold, so on a
   * player you already own the card that goes is not the card in front of you.
   * Every surface that offers a commit has to say so rather than imply
   * otherwise — on the card's own profile most of all, where the whole screen
   * is about this one copy.
   */
  burnsThisCopy: boolean;
  sets: CardActionSet[];
};

/** The jsonb `card_actions` returns, before it is given names this app uses. */
type ActionRow = {
  card_instance_id?: string;
  card_id?: string;
  sell_value?: number;
  held?: boolean;
  sellable?: boolean;
  burns_this_copy?: boolean;
  sets?: {
    code?: string;
    name?: string;
    family?: string;
    subtitle?: string | null;
    pays?: number;
    committed?: number;
    required?: number;
    slot_filled?: boolean;
    set_complete?: boolean;
    min_tier?: string | null;
    burns_this_copy?: boolean;
    can_commit?: boolean;
  }[];
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function normalise(raw: ActionRow): CardActions | null {
  if (!raw.card_instance_id || !raw.card_id) return null;

  return {
    cardInstanceId: raw.card_instance_id,
    cardId: raw.card_id,
    sellValue: num(raw.sell_value),
    held: raw.held === true,
    sellable: raw.sellable === true,
    burnsThisCopy: raw.burns_this_copy === true,
    sets: (raw.sets ?? [])
      .filter((s) => !!s.code)
      .map((s) => ({
        code: s.code as string,
        name: s.name ?? 'Unnamed set',
        family: s.family ?? 'team',
        subtitle: s.subtitle ?? null,
        pays: num(s.pays),
        committed: num(s.committed),
        required: Math.max(1, num(s.required)),
        slotFilled: s.slot_filled === true,
        setComplete: s.set_complete === true,
        minTier: typeof s.min_tier === 'string' ? s.min_tier : null,
        burnsThisCopy: s.burns_this_copy === true,
        canCommit: s.can_commit === true,
      })),
  };
}

/**
 * Asks the server what these cards can become, keyed by card_instance_id.
 *
 * A FAILURE RETURNS AN EMPTY MAP RATHER THAN THROWING. The cards are already
 * yours and every screen that calls this is correct without it — it just has no
 * buttons on it. Surfacing a failed read as an error would tell the player
 * something went wrong with their card, which is not what happened.
 */
export async function readCardActions(ids: string[]): Promise<Map<string, CardActions>> {
  const next = new Map<string, CardActions>();
  if (ids.length === 0) return next;

  try {
    const { data, error } = await supabase.rpc('card_actions', { p_card_instance_ids: ids });
    if (error) return next;

    for (const row of (Array.isArray(data) ? data : []) as ActionRow[]) {
      const action = normalise(row);
      if (action) next.set(action.cardInstanceId, action);
    }
  } catch {
    // A dropped connection reaches here as a thrown TypeError rather than as
    // supabase's `error`, and it is the same non-event: no offers, no alarm.
  }
  return next;
}
