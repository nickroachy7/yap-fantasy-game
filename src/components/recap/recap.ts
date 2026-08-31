/**
 * The week, per player — shape, parsing and the small amount of arithmetic the
 * screen is allowed to do.
 *
 * EVERY FIGURE HERE IS A READ. `award_score_coins` and `award_position_bonuses`
 * stamp what they paid onto `lineup_slots` at the moment they pay it, so this
 * module never recomputes a payout. That is not tidiness: a recap that derived
 * coins from today's tier would print a different number than the wallet
 * received the instant a card is promoted — which is precisely the week a
 * player is looking hardest at it.
 *
 * `awarded` IS NOT `coins > 0`. A week that has been scored but not yet paid, and
 * a start that was paid nothing because the player scored nothing, are different
 * states and the screen draws them differently. The RPC sends the flag rather
 * than letting the client infer it from a nullable number.
 */
import type { CardTier } from '@/constants/theme';

export type RecapCard = {
  slot: string;
  cardInstanceId: string;
  playerId: string;
  playerName: string;
  position: string | null;
  team: string | null;
  points: number;
  /** False while the week is scored but the faucet has not run yet. */
  awarded: boolean;
  /** The tier the card held GOING INTO the week — what it was paid at. */
  tierAtAward: CardTier | null;
  coinMultiplier: number | null;
  coins: number | null;
  /** Finish among everyone who scored at this position. Null if they scored nothing. */
  positionRank: number | null;
  bonusCoins: number | null;
  wasWeekMvp: boolean;
  tierNow: CardTier;
  /** Climbed since it was paid. The forward-looking half of the row. */
  promoted: boolean;
  careerFp: number;
};

export type ClosestSet = {
  code: string;
  name: string;
  family: string;
  committed: number;
  nextAt: number;
  nextReward: number;
  stillNeeded: number;
  /** Of what it still needs, how many are sitting in the collection right now. */
  readyNow: number;
};

export type RosterStatus = {
  held: number;
  cap: number;
  warnAt: number;
  overBy: number;
  isOver: boolean;
  isNear: boolean;
  remaining: number;
};

export type Recap = {
  season: number;
  seasonType: number;
  week: number;
  hasLineup: boolean;
  scored: boolean;
  finalized: boolean;
  totalPoints: number;
  rank: number | null;
  of: number | null;
  cards: RecapCard[];
  coinsPoints: number;
  coinsBonus: number;
  closestSets: ClosestSet[];
  roster: RosterStatus | null;
};

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const nullableNum = (v: unknown): number | null =>
  v === null || v === undefined ? null : num(v);

export function parseRoster(raw: unknown): RosterStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    held: num(r.held),
    cap: num(r.cap),
    warnAt: num(r.warn_at),
    overBy: num(r.over_by),
    isOver: r.is_over === true,
    isNear: r.is_near === true,
    remaining: num(r.remaining),
  };
}

/**
 * The same roster, recounted at a different held-card total.
 *
 * WHY A CLIENT EVER RECOMPUTES A SERVER FIGURE. Selling six cards moves the
 * count the instant the RPC returns, and the read that proves it is a second
 * round trip behind that. Waiting for it means the bar goes on saying "6 over
 * the limit — commit or sell 6" over a collection that no longer is, which
 * reads as the sale not having worked.
 *
 * SO IT IS AN ECHO, NOT AN AUTHORITY, and the distinction is the whole of why
 * this is allowed to exist. Nothing acts on it: the cap gate is `set_lineup`'s
 * and refuses on its own count whatever this says. It is overwritten by the
 * next `roster_status()` — which every caller of this is already awaiting when
 * it calls it — so a wrong guess survives for one round trip and then is gone.
 *
 * IT MIRRORS `roster_status()` LINE FOR LINE (20260824200700), and it has to:
 * `over_by` is a floored difference, `is_near` is a closed interval that stops
 * AT the cap rather than past it, and getting either subtly wrong would show a
 * different bar for one beat every time a card moved. `cap` and `warn_at` are
 * carried over untouched — they are configuration, and nothing the player does
 * moves them.
 */
export function recountRoster(roster: RosterStatus, held: number): RosterStatus {
  const next = Math.max(0, held);
  return {
    ...roster,
    held: next,
    overBy: Math.max(0, next - roster.cap),
    isOver: next > roster.cap,
    isNear: next >= roster.warnAt && next <= roster.cap,
    remaining: Math.max(0, roster.cap - next),
  };
}

export function parseRecap(raw: unknown): Recap | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const cards = Array.isArray(r.cards)
    ? (r.cards as Record<string, unknown>[]).map(
        (c): RecapCard => ({
          slot: String(c.slot ?? ''),
          cardInstanceId: String(c.card_instance_id ?? ''),
          playerId: String(c.player_id ?? ''),
          playerName: String(c.player_name ?? 'Unknown'),
          position: c.position ? String(c.position) : null,
          team: c.team ? String(c.team) : null,
          points: num(c.points),
          awarded: c.awarded === true,
          tierAtAward: (c.tier_at_award as CardTier | null) ?? null,
          coinMultiplier: nullableNum(c.coin_multiplier),
          coins: nullableNum(c.coins),
          positionRank: nullableNum(c.position_rank),
          bonusCoins: nullableNum(c.bonus_coins),
          wasWeekMvp: c.was_week_mvp === true,
          tierNow: (c.tier_now as CardTier) ?? 'bronze',
          promoted: c.promoted === true,
          careerFp: num(c.career_fp),
        }),
      )
    : [];

  const closestSets = Array.isArray(r.closest_sets)
    ? (r.closest_sets as Record<string, unknown>[]).map(
        (s): ClosestSet => ({
          code: String(s.code ?? ''),
          name: String(s.name ?? ''),
          family: String(s.family ?? ''),
          committed: num(s.committed),
          nextAt: num(s.next_at),
          nextReward: num(s.next_reward),
          stillNeeded: num(s.still_needed),
          readyNow: num(s.ready_now),
        }),
      )
    : [];

  return {
    season: num(r.season),
    seasonType: num(r.season_type),
    week: num(r.week),
    hasLineup: r.has_lineup === true,
    scored: r.scored === true,
    finalized: r.finalized === true,
    totalPoints: num(r.total_points),
    rank: nullableNum(r.rank),
    of: nullableNum(r.of),
    cards,
    coinsPoints: num(r.coins_points),
    coinsBonus: num(r.coins_bonus),
    closestSets,
    roster: parseRoster(r.roster),
  };
}

/** "x1.25", or nothing at all at bronze — a multiplier of one is not news. */
export function multiplierText(m: number | null): string | null {
  if (m === null || m <= 1) return null;
  return `×${m.toFixed(2).replace(/0$/, '')}`;
}

/**
 * What a positional finish is called. The ladder itself lives in
 * `position_bonus_tiers` and is tunable there; these are the words for the
 * three rungs it currently has, and anything outside them is not a finish worth
 * a line.
 */
export function finishLabel(rank: number | null, position: string | null): string | null {
  if (rank === null || rank > 10) return null;
  const pos = position ?? 'position';
  if (rank === 1) return `#1 ${pos} this week`;
  if (rank <= 3) return `#${rank} ${pos} this week`;
  return `Top 10 ${pos}`;
}
