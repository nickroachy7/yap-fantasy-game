/**
 * Shape and coercion for the `player_market` RPC — community ownership of one
 * player, for the DIRECTORY profile.
 *
 * Same boundary discipline as `profile.ts`: the RPC returns `Json`, so every
 * field is untyped and nullable here and nowhere else. The screen reads plain
 * numbers.
 *
 * The distinction this file exists to preserve is MINTED vs HELD. Selling is a
 * soft delete, so a copy that has been sold still exists in the table and still
 * resolves for historical lineups — but nobody has it. Collapsing the two into
 * one "how many exist" number would quietly overstate scarcity for every player
 * anyone has ever dumped, and scarcity is the whole proposition of the screen.
 */
import type { CardTier } from '@/constants/theme';
import type { Json } from '@/lib/database.types';

export type MarketTotals = {
  /** Every copy ever pulled, sold ones included. */
  minted: number;
  /** Copies somebody still holds. */
  held: number;
  sold: number;
  owners: number;
  /** Held copies that have started at least once — i.e. that are being played. */
  started: number;
  totalFp: number;
  /** Null when nothing is held, rather than a zero that reads as "all bad". */
  avgFp: number | null;
};

export type MarketTier = {
  tier: CardTier;
  copies: number;
  owners: number;
  /** Best career_fp at this tier. Null when nobody holds one. */
  bestFp: number | null;
};

/** The single highest-earning copy in the game. Null until one has earned. */
export type MarketTop = {
  displayName: string;
  isYou: boolean;
  tier: CardTier;
  careerFp: number;
  lineupStarts: number;
  season: number | null;
  acquiredAt: string | null;
};

export type MarketYours = {
  copies: number;
  bestFp: number;
  bestTier: CardTier;
  /** Competition rank of your best copy among every held copy. */
  bestRank: number;
};

export type MarketSeason = { season: number; held: number; minted: number };

export type PlayerMarket = {
  totals: MarketTotals;
  tiers: MarketTier[];
  top: MarketTop | null;
  yours: MarketYours | null;
  seasons: MarketSeason[];
};

type Obj = { [k: string]: Json | undefined };

const obj = (v: Json | undefined): Obj | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;

const str = (v: Json | undefined): string | null => (typeof v === 'string' ? v : null);

/** Numeric jsonb arrives as a number or a string depending on the driver. */
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
const tierOf = (v: Json | undefined): CardTier | null => {
  const s = str(v);
  return s && (TIERS as string[]).includes(s) ? (s as CardTier) : null;
};

export function parseMarket(payload: Json): PlayerMarket | null {
  const root = obj(payload);
  if (!root) return null;

  const t = obj(root.totals);
  const totals: MarketTotals = {
    minted: numOr(t?.minted, 0),
    held: numOr(t?.held, 0),
    sold: numOr(t?.sold, 0),
    owners: numOr(t?.owners, 0),
    started: numOr(t?.started, 0),
    totalFp: numOr(t?.total_fp, 0),
    avgFp: num(t?.avg_fp),
  };

  const tiers: MarketTier[] = (Array.isArray(root.tiers) ? root.tiers : [])
    .map((entry) => {
      const e = obj(entry);
      const tier = tierOf(e?.tier);
      if (!e || !tier) return null;
      return {
        tier,
        copies: numOr(e.copies, 0),
        owners: numOr(e.owners, 0),
        bestFp: num(e.best_fp),
      };
    })
    .filter((x): x is MarketTier => x !== null);

  const topRaw = obj(root.top);
  const topTier = tierOf(topRaw?.tier);
  const top: MarketTop | null =
    topRaw && topTier
      ? {
          displayName: str(topRaw.display_name) ?? 'Someone',
          isYou: topRaw.is_you === true,
          tier: topTier,
          careerFp: numOr(topRaw.career_fp, 0),
          lineupStarts: numOr(topRaw.lineup_starts, 0),
          season: num(topRaw.season),
          acquiredAt: str(topRaw.acquired_at),
        }
      : null;

  const yoursRaw = obj(root.yours);
  const yoursTier = tierOf(yoursRaw?.best_tier);
  const yours: MarketYours | null =
    yoursRaw && yoursTier
      ? {
          copies: numOr(yoursRaw.copies, 0),
          bestFp: numOr(yoursRaw.best_fp, 0),
          bestTier: yoursTier,
          bestRank: numOr(yoursRaw.best_rank, 0),
        }
      : null;

  const seasons: MarketSeason[] = (Array.isArray(root.seasons) ? root.seasons : [])
    .map((entry) => {
      const e = obj(entry);
      const season = num(e?.season);
      if (!e || season === null) return null;
      return { season, held: numOr(e.held, 0), minted: numOr(e.minted, 0) };
    })
    .filter((x): x is MarketSeason => x !== null);

  return { totals, tiers, top, yours, seasons };
}

/**
 * Share of held copies that have ever been started, 0–1.
 *
 * The one derived figure worth naming, because it separates two very different
 * players who look identical on a raw count: 40 copies nobody plays is a pack
 * filler, 40 copies that all start is a staple. Null rather than 0 when nothing
 * is held — there is no share of nothing.
 */
export function playedShare(totals: MarketTotals): number | null {
  if (totals.held <= 0) return null;
  return totals.started / totals.held;
}
