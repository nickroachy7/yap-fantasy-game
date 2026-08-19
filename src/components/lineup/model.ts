/**
 * Everything the lineup screen knows about a card, and the pure functions that
 * turn raw rows into it.
 *
 * Pure and separate from the screen for the same reason as `lib/injury.ts`:
 * the week's decision is made out of these derivations, so they need to be
 * readable on their own and not buried in JSX.
 */
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
  /** Which season's card this is. Must match the slate or `set_lineup` rejects it. */
  season: number | null;
  form: SeasonForm | null;
  game: GameContext | null;
};

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
