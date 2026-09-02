/**
 * Shapes and pure helpers for the Collection tab.
 *
 * Kept separate from the screen so the filter/sort logic is testable without
 * mounting a FlatList, and so the Supabase row shape is coerced in exactly one
 * place. Every column on the `my_collection` view is typed nullable (Postgres
 * cannot prove otherwise through a join), so normalisation is not optional.
 */
import type { PlayerCardModel } from '@/components/cards';
import { TierOrder, type CardTier } from '@/constants/theme';
import type { Database } from '@/lib/database.types';

/** Exactly the columns the screen selects, straight off the generated types. */
export type CollectionViewRow = Pick<
  Database['public']['Views']['my_collection']['Row'],
  | 'id'
  | 'card_id'
  | 'player_name'
  | 'position_abbreviation'
  | 'team_abbreviation'
  | 'injury_status'
  | 'tier'
  | 'career_fp'
  | 'lineup_starts'
  | 'tier_floor_fp'
  | 'next_tier_at'
  | 'next_tier_label'
  | 'season'
  | 'acquired_at'
  | 'sell_value'
  | 'fp_per_game'
  | 'in_set'
  | 'pos_rank'
  | 'pos_pool'
>;

/** One owned card instance, with every null resolved to something renderable. */
export type CollectionCard = {
  /** card_instances.id — the copy you own. */
  id: string;
  /** cards.id — the catalogue entry. NOT the player id; see use-collection.ts. */
  cardId: string | null;
  playerName: string;
  position: string | null;
  team: string | null;
  injuryStatus: string | null;
  tier: CardTier;
  careerFp: number;
  lineupStarts: number;
  tierFloorFp: number | undefined;
  nextTierAt: number | null;
  nextTierLabel: string | undefined;
  season: number | null;
  /** Epoch ms. 0 when the view gave us nothing, which sorts oldest-last. */
  acquiredAt: number;
  /**
   * Coins this copy sells for, right now.
   *
   * (what the player is worth + what this copy has earned) x its tier, priced
   * by the server and never re-derived here — see the header of
   * 20260902060000. It MOVES: the player half is recomputed weekly off the
   * season so far, so this is a current price rather than a constant.
   */
  sellValue: number;
  /**
   * Where the player stands at his position — the 3 of "WR3" — out of
   * `posPool`. Null when he has no value row yet, which is a real state: 40% of
   * the set had no prior-season production to rank.
   */
  posRank: number | null;
  posPool: number | null;
  /**
   * The PLAYER's fantasy points per scored game this season — NOT the card's.
   * Null until he has a scored game. Deliberately not a projection: the
   * provider sells none and this app fabricates none.
   */
  fpPerGame: number | null;
  /**
   * Another copy of this same printed card is already committed to a set.
   *
   * A fact about the PLAYER, not about this copy: this one is still held, still
   * sellable, still startable. What has gone is the slot it might have filled.
   *
   * NOT "ineligible", and the grid must not draw it as such. A card can belong
   * to a team set and to today's daily at once, so a player already in one may
   * still be commitable to the other — `card_actions.can_commit` is the only
   * thing that answers that, and it is asked of a selection rather than of
   * every cell. See the migration's note.
   */
  inSet: boolean;
};

/** Lineup-eligible positions, in the order the lineup screen lists them. */
export const PositionOrder = ['QB', 'RB', 'WR', 'TE', 'PK'] as const;
export type Position = (typeof PositionOrder)[number];

export type PositionFilter = 'ALL' | Position;
export type TierFilter = 'ALL' | CardTier;

/**
 * WHAT YOU ARE TRYING TO DECIDE, as opposed to what the card happens to be.
 *
 * Position and tier narrow by ATTRIBUTE, and between them they were the whole
 * of this screen's toolkit — which is the wrong toolkit for the job the screen
 * is actually for. Nobody opens their collection thinking "show me my wide
 * receivers". They open it holding twenty-nine cards and thirty slots, and the
 * two questions they have are "what can I get rid of" and "what finishes a
 * set". Neither was askable, so it was answered by scanning the grid by eye.
 *
 * These three are those questions. Each one is a fact the app already knows and
 * was keeping to itself until the moment of a confirmation dialog:
 *
 *   spare    — you hold more than one copy of this player, and this is not the
 *              one you would keep. Derived here, from the ids. See `spareIds`.
 *
 *   set      — at least one set would take this copy right now. That is
 *              `card_actions.can_commit`, which is the server's own conjunction
 *              and cannot be derived on the client. See `use-offers`.
 *
 *   starting — standing in a lineup you have not played. These are the cards
 *              that CANNOT be acted on, and being able to see them is what
 *              makes the rest safe to sweep. See `use-starters`.
 *
 * `ALL` is the absence of the filter and has no chip of its own: the three are
 * a single value, so pressing the active one releases it. A fourth "ALL" chip
 * beside the position row's own would have been two of them in one strip.
 */
export type JobFilter = 'ALL' | 'spare' | 'set' | 'starting';
export type SortKey = 'fp' | 'tier' | 'starts' | 'name' | 'recent';
export type SortDir = 'asc' | 'desc';

export const SortLabels: Record<SortKey, string> = {
  fp: 'Career FP',
  tier: 'Tier',
  starts: 'Starts',
  name: 'Name',
  recent: 'Acquired',
};

/** The same labels in reading order, as the shared sort strip wants them. */
export const SORT_OPTIONS: { key: SortKey; label: string }[] = (
  Object.keys(SortLabels) as SortKey[]
).map((key) => ({ key, label: SortLabels[key] }));

/**
 * The direction each key is worth reading FIRST. Pressing "Name" and getting
 * Z–A, or "Career FP" and getting your worst card, reads as a broken control
 * rather than a choice — so the direction follows the key and the toggle then
 * flips it from there.
 */
export const SortDefaultDir: Record<SortKey, SortDir> = {
  fp: 'desc',
  tier: 'desc',
  starts: 'desc',
  name: 'asc',
  recent: 'desc',
};

const isTier = (v: string | null): v is CardTier =>
  v !== null && (TierOrder as readonly string[]).includes(v);

const num = (v: number | string | null): number => {
  if (v === null) return 0;
  const n = typeof v === 'number' ? v : Number(v);

  return Number.isFinite(n) ? n : 0;
};

export function normaliseRow(row: CollectionViewRow): CollectionCard {
  const acquired = row.acquired_at ? Date.parse(row.acquired_at) : NaN;

  return {
    id: row.id ?? '',
    cardId: row.card_id,
    playerName: row.player_name ?? 'Unknown player',
    position: row.position_abbreviation?.toUpperCase() ?? null,
    team: row.team_abbreviation?.toUpperCase() ?? null,
    injuryStatus: row.injury_status,
    // The view can only emit values from the card_tier enum; the fallback is a
    // type-level formality, not an expected branch.
    tier: isTier(row.tier) ? row.tier : 'bronze',
    careerFp: num(row.career_fp),
    lineupStarts: num(row.lineup_starts),
    tierFloorFp: row.tier_floor_fp == null ? undefined : num(row.tier_floor_fp),
    nextTierAt: row.next_tier_at == null ? null : num(row.next_tier_at),
    nextTierLabel: row.next_tier_label?.toUpperCase(),
    season: row.season,
    acquiredAt: Number.isNaN(acquired) ? 0 : acquired,
    sellValue: Number(row.sell_value ?? 0),
    // Null-preserving, like fpPerGame below: "not ranked" is not "ranked last",
    // and the card must not draw an unranked rookie as the worst player alive.
    posRank: row.pos_rank == null ? null : num(row.pos_rank),
    posPool: row.pos_pool == null ? null : num(row.pos_pool),
    // Null-preserving: "no scored games yet" is not "averages nothing", and
    // the card draws the two differently.
    fpPerGame: row.fp_per_game == null ? null : num(row.fp_per_game),
    inSet: row.in_set === true,
  };
}

/**
 * `CollectionCard` -> what `PlayerCard` draws.
 *
 * A PURE PROJECTION OF ONE ROW, and it is now the whole model rather than most
 * of it. Everything here comes off the collection row: a name, a club, a
 * position, a tier, a career total — facts about a copy you hold.
 *
 * It used to be most-of-it because the card also took a `matchup`, which is a
 * fact about a Sunday arriving from a different read on a different cadence, so
 * `InventoryCard` spread it on at the call site. The card does not draw a
 * fixture any more (see the note there) and the grid does not read the schedule
 * at all, which is what closed the gap: one row in, one model out.
 */
export function toCardModel(c: CollectionCard): PlayerCardModel {
  return {
    playerName: c.playerName,
    positionAbbreviation: c.position,
    teamAbbreviation: c.team,
    injuryStatus: c.injuryStatus,
    tier: c.tier,
    careerFp: c.careerFp,
    tierFloorFp: c.tierFloorFp,
    nextTierAt: c.nextTierAt,
    nextTierLabel: c.nextTierLabel,
  };
}

/**
 * Takes the SHARED filter value, not this file's own.
 *
 * The inventory draws the Players boards' `PositionFilter` component now, whose
 * value is a `PosFilter` — the five positions, `ALL`, and `other`. `other` is
 * the key the palette gives a position it has no colour for; it is never in
 * `POS_FILTERS`, so it cannot be selected, and if it somehow were it would
 * match nothing, which is the honest answer for "positions we do not model".
 */
export function matchesPosition(c: CollectionCard, filter: PositionFilter | 'other'): boolean {
  return filter === 'ALL' || c.position === filter;
}

export function matchesTier(c: CollectionCard, filter: TierFilter): boolean {
  return filter === 'ALL' || c.tier === filter;
}

/**
 * The sell pile, named — re-exported from `spares.ts`.
 *
 * IT LIVES IN A LEAF MODULE so the Deno unit runner can reach it, which this
 * file cannot offer: `types.ts` imports `theme.ts`, `theme.ts` imports
 * `global.css`, and the runner cannot follow a stylesheet. Same trade `bulk.ts`
 * made, for the same reason, and worth making twice — the ranking has to agree
 * with a SQL `ORDER BY` in `commit_candidate`, and nothing but a test keeps two
 * files in two languages saying the same thing. See `spares.ts`.
 */
export { spareIds } from './spares';

/** What the three decision chips are asked against. See `JobFilter`. */
export type JobSets = {
  spares: Set<string>;
  /** Instance ids some set would take. Empty until the offers land. */
  commitable: Set<string>;
  starters: Set<string>;
};

export function matchesJob(c: CollectionCard, filter: JobFilter, sets: JobSets): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'spare') return sets.spares.has(c.id);
  if (filter === 'set') return sets.commitable.has(c.id);

  return sets.starters.has(c.id);
}

/** How many cards each chip would leave. Zero is an answer, so all three keys. */
export function countByJob(
  cards: CollectionCard[],
  sets: JobSets,
): Record<Exclude<JobFilter, 'ALL'>, number> {
  const counts = { spare: 0, set: 0, starting: 0 };
  for (const c of cards) {
    if (sets.spares.has(c.id)) counts.spare += 1;
    if (sets.commitable.has(c.id)) counts.set += 1;
    if (sets.starters.has(c.id)) counts.starting += 1;
  }

  return counts;
}


const byName = (a: CollectionCard, b: CollectionCard) =>
  a.playerName.localeCompare(b.playerName) || a.id.localeCompare(b.id);

const ascending: Record<SortKey, (a: CollectionCard, b: CollectionCard) => number> = {
  fp: (a, b) => a.careerFp - b.careerFp,
  tier: (a, b) => TierOrder.indexOf(a.tier) - TierOrder.indexOf(b.tier),
  starts: (a, b) => a.lineupStarts - b.lineupStarts,
  name: (a, b) => a.playerName.localeCompare(b.playerName),
  recent: (a, b) => a.acquiredAt - b.acquiredAt,
};

/**
 * Sorting is done client-side even though the query is already ordered: the
 * order must not silently change meaning when the query changes, and every key
 * other than career FP would otherwise cost a round trip.
 *
 * The tiebreak is applied AFTER the direction flip and is always ascending by
 * name then instance id. Negating it too would reshuffle every tied block on a
 * direction toggle — and with `tier` there are only four distinct values, so
 * almost everything is a tie.
 */
export function sortCards(cards: CollectionCard[], key: SortKey, dir: SortDir): CollectionCard[] {
  const cmp = ascending[key];
  const sign = dir === 'desc' ? -1 : 1;

  return [...cards].sort((a, b) => sign * cmp(a, b) || byName(a, b));
}

export function countByTier(cards: CollectionCard[]): Record<CardTier, number> {
  const counts = { bronze: 0, silver: 0, gold: 0, diamond: 0 };
  for (const c of cards) counts[c.tier] += 1;

  return counts;
}

export function countByPosition(cards: CollectionCard[]): Record<Position, number> {
  const counts = { QB: 0, RB: 0, WR: 0, TE: 0, PK: 0 };
  for (const c of cards) {
    if (c.position && c.position in counts) counts[c.position as Position] += 1;
  }

  return counts;
}

export type CollectionStats = {
  cards: number;
  /** Distinct catalogue entries — see the caveat in `summarise`. */
  players: number;
  duplicates: number;
  teams: number;
  /** What the whole collection would fetch if every copy were sold. */
  sellValue: number;
  /**
   * Copies held at each tier. EVERY tier is a key, zeros included — the summary
   * draws a cell per tier and a collection that has not pulled a diamond yet
   * must still have a diamond cell to put a nought in, or the strip changes
   * shape the day it does.
   */
  byTier: Record<CardTier, number>;
};

/**
 * The one-line collection summary.
 *
 * "Players" counts distinct card_ids, not distinct people: a card is one player
 * in one season, so the same player from two seasons is two entries. That is
 * the same unit the duplicate count uses, which is what makes "13 cards, 11
 * players, 2 duplicates" add up. Falls back to the name only when the view gave
 * us no card_id at all.
 */
export function summarise(cards: CollectionCard[]): CollectionStats {
  const players = new Set<string>();
  const teams = new Set<string>();
  let sellValue = 0;
  /* Seeded from `TierOrder` rather than filled as tiers are met, so every tier
     has a key whether or not the collection contains one. See the field. */
  const byTier = Object.fromEntries(TierOrder.map((t) => [t, 0])) as Record<CardTier, number>;

  for (const c of cards) {
    players.add(c.cardId ?? c.playerName);
    if (c.team) teams.add(c.team);
    sellValue += c.sellValue;
    if (c.tier) byTier[c.tier] += 1;
  }

  return {
    cards: cards.length,
    players: players.size,
    duplicates: cards.length - players.size,
    teams: teams.size,
    sellValue,
    byTier,
  };
}
