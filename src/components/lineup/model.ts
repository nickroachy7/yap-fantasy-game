/**
 * Everything the lineup screen knows about a card, and the pure functions that
 * turn raw rows into it.
 *
 * Pure and separate from the screen for the same reason as `lib/injury.ts`:
 * the week's decision is made out of these derivations, so they need to be
 * readable on their own and not buried in JSX.
 */
import { POSITION_ORDER } from '@/constants/positions';
import type { CardTier } from '@/constants/theme';

export type Slate = { season: number; season_type: number; week: number };

export type SlotConfig = { slot: string; eligible_positions: string[]; display_order: number };

/** Where a player's team is this week. Null when the team is idle (bye). */
export type GameContext = {
  opponent: string | null;
  home: boolean;
  startsAt: string | null;
};

/** Season production, derived from stat_lines x fantasy_points. */
export type SeasonForm = {
  seasonFp: number;
  gamesPlayed: number;
  fpPerGame: number;
  /** Points per game, oldest first, capped to the last few. */
  recent: number[];
  /**
   * THIS week's points for the player, or null when his game has not been
   * scored — which is every row before kickoff, and is not the same as a
   * nought. It is the PLAYER's line, not the card's credit: a starter's row
   * shows what the contest actually awarded the slot (`savedPoints`), and this
   * is what fills the same column for a card on the bench, whose game is being
   * played whether or not you started him.
   */
  weekFp: number | null;
};

export type LineupCard = {
  /** card_instance id — the value `set_lineup` wants. Never the player id. */
  id: string;
  playerId: string | null;
  name: string;
  position: string | null;
  team: string | null;
  injuryStatus: string | null;
  tier: CardTier;
  /**
   * The CARD's earned points, which drive its tier. Deliberately not the same
   * number as `season.seasonFp`: career_fp only accrues in weeks the card was
   * actually started, so a great player you never played reads as bronze.
   */
  careerFp: number;
  /**
   * Career FP at which this card promotes, and what it promotes TO — straight
   * from `tier_thresholds` via `my_collection`, never recomputed here. Both are
   * null at diamond, where there is no next tier.
   */
  nextTierAt: number | null;
  nextTierLabel: string | null;
  /** Which season's card this is. Must match the slate or `set_lineup` rejects it. */
  season: number | null;
  form: SeasonForm | null;
  game: GameContext | null;
};

/**
 * "1/200 to Silver Tier" — how far this copy is from promotion.
 *
 * The numerator is the card's OWN earned total rather than its progress within
 * the current tier, because 200, 750 and 2500 are the thresholds the game
 * states and the ones an owner learns. Measuring inside the tier instead would
 * print a denominator (550 from silver to gold) that appears nowhere in the
 * rules and that nobody could check.
 *
 * FLOORED, not rounded: a card on 199.7 has not promoted, and "200/200 to
 * Silver Tier" beside a bronze chip reads as a bug in the promotion trigger.
 *
 * Null at diamond — there is no tier above it, so there is no distance to one.
 */
export function tierProgressLabel(card: LineupCard): string | null {
  if (card.nextTierAt === null || !card.nextTierLabel) return null;
  const next = card.nextTierLabel;
  const titled = next.charAt(0).toUpperCase() + next.slice(1).toLowerCase();
  return `${Math.floor(card.careerFp)}/${Math.round(card.nextTierAt)} to ${titled} Tier`;
}

/** How many games the FORM column shows. Five is a month of NFL football. */
export const FORM_GAMES = 5;

/**
 * Ceiling the FORM bars are drawn against.
 *
 * Fixed rather than per-row: scaling each player's bars to their own best game
 * makes every row look identical, which defeats the point of putting the column
 * next to eight other players. 30 FP is roughly a very good week for a skill
 * player, so most bars land inside the band and monsters clip at full height.
 */
export const FORM_CEILING = 30;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * "Sun 1:05p" — hand-formatted because the column is 62pt wide and
 * `toLocaleString()` renders "8/23/2026, 1:05:00 PM" there, which truncates to
 * the half that carries no information.
 */
export function kickoffLabel(game: GameContext | null): string | null {
  if (!game?.startsAt) return null;
  const d = new Date(game.startsAt);
  if (Number.isNaN(d.getTime())) return null;
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${DAY_NAMES[d.getDay()]} ${h}:${m}${h24 < 12 ? 'a' : 'p'}`;
}

/** "vs ARI" / "@ ARI" / "BYE". */
export function matchupLabel(game: GameContext | null): string {
  if (!game) return 'BYE';
  if (!game.opponent) return 'BYE';
  return game.home ? `vs ${game.opponent}` : `@ ${game.opponent}`;
}

/**
 * Compact countdown. Only two units ever show, because the tile is 18pt type in
 * a quarter of a phone's width and "2d 04h 11m 33s" does not fit there.
 * Seconds appear only in the last hour, which is when they start to matter.
 */
export function countdownLabel(msRemaining: number): string {
  const s = Math.max(0, Math.floor(msRemaining / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

/** Long form for the absolute lock time, shown once as a caption. */
export function lockCaption(lockAt: string | null, locked: boolean): string | undefined {
  if (!lockAt) return undefined;
  const d = new Date(lockAt);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${locked ? 'Locked at' : 'Locks at first kickoff,'} ${d.toLocaleString()}`;
}

export function isEligible(card: LineupCard, cfg: SlotConfig): boolean {
  return card.position != null && cfg.eligible_positions.includes(card.position);
}

/**
 * Where a bench player would go if you tapped it: the first empty slot in
 * display order it is legal for. Returning the slot rather than just a boolean
 * is what lets the bench row SHOW its destination instead of moving a player
 * somewhere the user did not choose.
 */
export function firstOpenSlotFor(
  card: LineupCard,
  slots: SlotConfig[],
  picks: Record<string, string>,
): string | null {
  for (const cfg of slots) {
    if (!picks[cfg.slot] && isEligible(card, cfg)) return cfg.slot;
  }
  return null;
}

export type SortKey = 'fp' | 'fppg' | 'name';

export function sortCards(cards: LineupCard[], key: SortKey): LineupCard[] {
  const out = [...cards];
  out.sort((a, b) => {
    if (key === 'name') return a.name.localeCompare(b.name);
    const av = key === 'fp' ? (a.form?.seasonFp ?? -1) : (a.form?.fpPerGame ?? -1);
    const bv = key === 'fp' ? (b.form?.seasonFp ?? -1) : (b.form?.fpPerGame ?? -1);
    // Name is the tiebreak so the order is stable between renders rather than
    // reshuffling every unscored player each time the list re-sorts.
    return bv - av || a.name.localeCompare(b.name);
  });
  return out;
}

/**
 * The bench's order, which is not a choice the reader makes any more.
 *
 * It had a sort bar — FP, FP/G, name — and the bar was answering a question the
 * bench does not ask. You do not scan a bench for its best card in the
 * abstract; you scan it for the best card AT A POSITION, because that is the
 * only swap the rules will let you make. Sorted by points, your three running
 * backs are scattered between eleven receivers, and finding them is the work
 * the sort was supposed to save you.
 *
 * Grouped by position they sit together, in the order the slots above them run
 * — QB, RB, WR, TE, PK, the order a fantasy manager already thinks in — so the
 * bench reads as an extension of the board rather than as a separate list.
 *
 * Season points descending WITHIN a group, so the best option at a position is
 * the top of its own run, and name as the final tiebreak so the order is stable
 * between renders rather than reshuffling every unscored player on each pass.
 * An unknown position sorts last rather than first: it is a feed anomaly, not a
 * sixth position group.
 */
export function sortByPosition(cards: LineupCard[]): LineupCard[] {
  const rank = (p: string | null) => {
    const i = POSITION_ORDER.indexOf((p ?? '').toUpperCase() as (typeof POSITION_ORDER)[number]);
    return i === -1 ? POSITION_ORDER.length : i;
  };
  return [...cards].sort(
    (a, b) =>
      rank(a.position) - rank(b.position) ||
      (b.form?.seasonFp ?? -1) - (a.form?.seasonFp ?? -1) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * A starter needs looking at when the designation says they may not play, or
 * when their team simply is not playing this week. The second case is the one
 * people actually lose weeks to, and no injury feed ever mentions it.
 */
export type Alert = { card: LineupCard; slot: string; kind: 'blocking' | 'advisory' | 'no-game' };

/**
 * Every slot a card is legal for, in display order, taken ones included.
 *
 * `firstOpenSlotFor` answers "where would a tap put him"; this answers "where
 * COULD he go", which is the question the swap sheet asks — a running back with
 * both RB slots filled still has two destinations, they just cost whoever is
 * standing in them.
 */
export function eligibleSlotsFor(card: LineupCard, slots: SlotConfig[]): SlotConfig[] {
  return slots.filter((cfg) => isEligible(card, cfg));
}
