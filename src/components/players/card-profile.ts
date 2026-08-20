/**
 * Shape and coercion for the `card_profile` RPC — ONE owned copy.
 *
 * The type that matters here is `CardStart`: one row per week this copy was in
 * a lineup. It is the receipt behind `careerFp`, and it is the only thing in
 * the app that makes the bench rule visible rather than merely true — a card
 * earns in the weeks it started and in no others, so this list and the total
 * must always reconcile. If they ever disagree, the scoring path is wrong, not
 * the display.
 *
 * `points` is null for a start in a week that has not been swept yet, which is
 * NOT the same as a start worth nothing. The lineup screen already draws that
 * distinction and this must not flatten it: a slot in an unscored lineup holds
 * 0 because that is the column default, not because the player blanked.
 */
import type { CardTier } from '@/constants/theme';
import type { Json } from '@/lib/database.types';

export type CardIdentity = {
  id: string;
  cardId: string;
  playerId: string;
  playerName: string;
  positionAbbreviation: string | null;
  teamAbbreviation: string | null;
  injuryStatus: string | null;
  /** Which season's card this is. A card is minted per player per season. */
  season: number | null;
  rarity: string | null;
  tier: CardTier;
  careerFp: number;
  lineupStarts: number;
  /** Null until the copy has started at least once. */
  fpPerStart: number | null;
  acquiredAt: string | null;
  source: string | null;
  /** Non-null once sold. The copy still resolves; it is just no longer held. */
  soldAt: string | null;
  soldFor: number | null;
  /**
   * Non-null once committed to a set. The OTHER way a copy leaves a
   * collection, and the page has to tell them apart: a sold card was traded
   * for its full price, a committed one was burnt into a checklist for a share
   * of it and is sitting in a set the player can still open.
   */
  committedAt: string | null;
  committedFor: number | null;
  committedSetCode: string | null;
  committedSetName: string | null;
  /** Gems this copy sells for, priced by the server from its tier. */
  sellValue: number;
  tierFloorFp: number | null;
  nextTierAt: number | null;
  nextTierLabel: string | null;
};

export type CardRank = {
  /** Competition rank among held copies of the SAME player. */
  amongPlayer: number;
  playerPool: number;
  /** Competition rank among every held card in the game. */
  overall: number;
  overallPool: number;
};

export type CardStart = {
  season: number;
  seasonType: number;
  week: number | null;
  slot: string;
  /** Null when the week has not been scored yet — not a zero. */
  points: number | null;
  scored: boolean;
  /** What the whole lineup scored that week, for context on the card's share. */
  lineupTotal: number | null;
};

export type CardProfile = {
  card: CardIdentity;
  rank: CardRank;
  starts: CardStart[];
};

type Obj = { [k: string]: Json | undefined };

const obj = (v: Json | undefined): Obj | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;

const str = (v: Json | undefined): string | null => (typeof v === 'string' ? v : null);

const num = (v: Json | undefined): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const numOr = (v: Json | undefined, fallback: number): number => num(v) ?? fallback;

const TIERS: CardTier[] = ['bronze', 'silver', 'gold', 'diamond'];

export function parseCardProfile(payload: Json): CardProfile | null {
  const root = obj(payload);
  const c = obj(root?.card);
  const id = str(c?.id);
  const playerId = str(c?.player_id);
  if (!root || !c || !id || !playerId) return null;

  const tierRaw = str(c.tier);
  const tier: CardTier =
    tierRaw && (TIERS as string[]).includes(tierRaw) ? (tierRaw as CardTier) : 'bronze';

  const r = obj(root.rank);

  const starts: CardStart[] = (Array.isArray(root.starts) ? root.starts : [])
    .map((entry) => {
      const e = obj(entry);
      const season = num(e?.season);
      const slot = str(e?.slot);
      if (!e || season === null || !slot) return null;
      return {
        season,
        seasonType: numOr(e.season_type, 2),
        week: num(e.week),
        slot,
        points: num(e.points),
        scored: e.scored === true,
        lineupTotal: num(e.lineup_total),
      };
    })
    .filter((x): x is CardStart => x !== null);

  return {
    card: {
      id,
      cardId: str(c.card_id) ?? '',
      playerId,
      playerName: str(c.player_name) ?? 'Unknown player',
      positionAbbreviation: str(c.position_abbreviation),
      teamAbbreviation: str(c.team_abbreviation),
      injuryStatus: str(c.injury_status),
      season: num(c.season),
      rarity: str(c.rarity),
      tier,
      careerFp: numOr(c.career_fp, 0),
      lineupStarts: numOr(c.lineup_starts, 0),
      fpPerStart: num(c.fp_per_start),
      acquiredAt: str(c.acquired_at),
      source: str(c.source),
      soldAt: str(c.sold_at),
      soldFor: num(c.sold_for),
      committedAt: str(c.committed_at),
      committedFor: num(c.committed_for),
      committedSetCode: str(c.committed_set_code),
      committedSetName: str(c.committed_set_name),
      sellValue: numOr(c.sell_value, 0),
      tierFloorFp: num(c.tier_floor_fp),
      nextTierAt: num(c.next_tier_at),
      nextTierLabel: str(c.next_tier_label),
    },
    rank: {
      amongPlayer: numOr(r?.among_player, 1),
      playerPool: numOr(r?.player_pool, 1),
      overall: numOr(r?.overall, 1),
      overallPool: numOr(r?.overall_pool, 1),
    },
    starts,
  };
}

/**
 * Progress through the CURRENT tier, 0–1.
 *
 * Measured from the tier's own floor rather than from zero, so the bar fills
 * across the tier the card is actually in. Measuring from zero makes every
 * silver card look nearly empty and every diamond look full, which says
 * something true about career totals and nothing at all about "how close am I".
 *
 * Null at the top tier: there is no next threshold, so there is no progress
 * toward one, and a full bar there would imply a level that does not exist.
 */
export function tierProgress(card: CardIdentity): number | null {
  if (card.nextTierAt === null) return null;
  const floor = card.tierFloorFp ?? 0;
  const span = card.nextTierAt - floor;
  if (span <= 0) return null;
  return Math.min(1, Math.max(0, (card.careerFp - floor) / span));
}

/**
 * "Top 4%" — where this copy sits in a pool, as a percentile.
 *
 * Rounded UP so a card can never be described as better than it is, and
 * floored at 1 so rank 1 of 500 reads "top 1%" rather than "top 0%".
 */
export function percentile(rank: number, pool: number): number | null {
  if (pool <= 1) return null;
  return Math.max(1, Math.ceil((rank / pool) * 100));
}
