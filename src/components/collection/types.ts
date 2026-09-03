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

/**
 * SORTING SURVIVED THE FILTERS, and only just: `sortCards` has one caller left,
 * which asks for career FP descending and never changes its mind.
 *
 * The key and the direction stay parameters rather than being folded into the
 * function, because the ORDER is the collection's one remaining editorial
 * decision and a screen that wants a different one should be able to say so
 * without reopening this file.
 *
 * What went with the chips is everything that LABELLED them — `SortLabels`,
 * `SORT_OPTIONS`, `SortDefaultDir`, and the position, tier and job vocabularies
 * beside them. A table of captions for controls nobody draws reads as a feature
 * to the next person in here, and costs an afternoon to disprove.
 */
export type SortKey = 'fp' | 'tier' | 'starts' | 'name' | 'recent';
export type SortDir = 'asc' | 'desc';

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
