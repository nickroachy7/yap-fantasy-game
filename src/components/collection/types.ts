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
};

/** Lineup-eligible positions, in the order the lineup screen lists them. */
export const PositionOrder = ['QB', 'RB', 'WR', 'TE', 'PK'] as const;
export type Position = (typeof PositionOrder)[number];

export type PositionFilter = 'ALL' | Position;
export type TierFilter = 'ALL' | CardTier;
export type SortKey = 'fp' | 'name' | 'recent';

export const SortLabels: Record<SortKey, string> = {
  fp: 'Career FP',
  name: 'Name',
  recent: 'Recent',
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
  };
}

/** Presentational view-model for <PlayerCard>. The card never touches Supabase. */
export function toCardModel(c: CollectionCard): PlayerCardModel {
  return {
    playerName: c.playerName,
    positionAbbreviation: c.position,
    teamAbbreviation: c.team,
    tier: c.tier,
    careerFp: c.careerFp,
    lineupStarts: c.lineupStarts,
    tierFloorFp: c.tierFloorFp,
    nextTierAt: c.nextTierAt,
    nextTierLabel: c.nextTierLabel,
  };
}

export function matchesPosition(c: CollectionCard, filter: PositionFilter): boolean {
  return filter === 'ALL' || c.position === filter;
}

export function matchesTier(c: CollectionCard, filter: TierFilter): boolean {
  return filter === 'ALL' || c.tier === filter;
}

/**
 * Sorting is done client-side even though the query is already ordered: the
 * order must not silently change meaning when the query changes, and `name` /
 * `recent` would otherwise each cost a round trip.
 */
export function sortCards(cards: CollectionCard[], key: SortKey): CollectionCard[] {
  const out = [...cards];

  out.sort((a, b) => {
    if (key === 'name') {
      return a.playerName.localeCompare(b.playerName) || b.careerFp - a.careerFp;
    }
    if (key === 'recent') {
      return b.acquiredAt - a.acquiredAt || b.careerFp - a.careerFp;
    }

    return b.careerFp - a.careerFp || a.playerName.localeCompare(b.playerName);
  });

  return out;
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
