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
import { injuryWeight } from '@/lib/injury';

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
  /** Gems this copy sells for. Priced by the server from its tier. */
  sellValue: number;
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
/** Whether cards their designation rules out this week are shown at all. */
export type AvailabilityFilter = 'ALL' | 'AVAILABLE';
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
 * "Blocking" is the only weight that hides a card, and it comes from
 * `injuryWeight()` rather than a status list written here — Questionable is the
 * most common designation in the feed, and filtering it out would silently
 * empty a lot of people's grids.
 */
export function isAvailable(c: CollectionCard): boolean {
  return injuryWeight(c.injuryStatus) !== 'blocking';
}

export function matchesAvailability(c: CollectionCard, filter: AvailabilityFilter): boolean {
  return filter === 'ALL' || isAvailable(c);
}

/** Lower-cased once by the caller, so a keystroke does not re-lower every row. */
export function matchesQuery(c: CollectionCard, needle: string): boolean {
  if (!needle) return true;

  return (
    c.playerName.toLowerCase().includes(needle) ||
    (c.team?.toLowerCase().includes(needle) ?? false) ||
    (c.position?.toLowerCase().includes(needle) ?? false)
  );
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
  /** Designation rules them out this week. */
  unavailable: number;
  /** Designation makes them a question mark — Questionable, DTD, limited. */
  uncertain: number;
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
  let unavailable = 0;
  let uncertain = 0;
  let sellValue = 0;
  /* Seeded from `TierOrder` rather than filled as tiers are met, so every tier
     has a key whether or not the collection contains one. See the field. */
  const byTier = Object.fromEntries(TierOrder.map((t) => [t, 0])) as Record<CardTier, number>;

  for (const c of cards) {
    players.add(c.cardId ?? c.playerName);
    if (c.team) teams.add(c.team);
    sellValue += c.sellValue;
    if (c.tier) byTier[c.tier] += 1;
    const weight = injuryWeight(c.injuryStatus);
    if (weight === 'blocking') unavailable += 1;
    else if (weight === 'advisory') uncertain += 1;
  }

  return {
    cards: cards.length,
    players: players.size,
    duplicates: cards.length - players.size,
    teams: teams.size,
    unavailable,
    uncertain,
    sellValue,
    byTier,
  };
}
