/**
 * Everything the lineup screen knows about a card, and the pure functions that
 * turn raw rows into it.
 *
 * Pure and separate from the screen for the same reason as `lib/injury.ts`:
 * the week's decision is made out of these derivations, so they need to be
 * readable on their own and not buried in JSX.
 */
import { statusOf, type GameStatus } from '@/components/scores/scoreboard';
import { POSITION_ORDER } from '@/constants/positions';
import type { CardTier } from '@/constants/theme';

export type Slate = { season: number; season_type: number; week: number };

export type SlotConfig = { slot: string; eligible_positions: string[]; display_order: number };

/** Where a player's team is this week. Null when the team is idle (bye). */
export type GameContext = {
  opponent: string | null;
  home: boolean;
  startsAt: string | null;
  /**
   * Whether that game is ahead, being played, or over.
   *
   * The row could not previously tell the three apart, because this hook only
   * ever selected `starts_at` from `games` — so a blank in the points column
   * meant both "has not played" and "played and scored nothing", and a number
   * that was still climbing looked exactly like a settled one.
   *
   * `GameStatus` and `statusOf` come from the scoreboard rather than being
   * defined again here. They already carry the one thing that is easy to get
   * wrong — the provider spells in-progress more than one way, and a game
   * called scheduled while it is being played is the error that matters most.
   */
  status: GameStatus;
  /**
   * The provider's own words for the status: `Final/OT`, or a quarter and a
   * clock while the game is on. Kept because we cannot re-derive either, and
   * the clock is the difference between "these points are live" and "these
   * points are live and there are eleven minutes left".
   */
  statusText: string | null;
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
 *
 * STRUCTURALLY TYPED rather than taking a `LineupCard`, because the collection
 * card says the same sentence about the same copy and must not say it in
 * slightly different words. Three fields is the whole input.
 *
 * `short` drops both "Tier" and the "to", giving "1284/2500 Diamond".
 *
 * MEASURED, because this is the one line on a collection cell that does not
 * fit. The cell has 96pt of content at three-across on a 375pt phone, and the
 * tier letter in front of the phrase takes 12 of it. The full form measures
 * 102.9 at 9pt against the worst case — a gold card, whose next tier is the
 * longest word of the four. Dropping "Tier" alone still leaves 102.9; dropping
 * the "to" as well and setting it at 8pt gives 82.1 against 84 available.
 *
 * Both words are pure connective tissue: the slash already says the number is a
 * position within a total, and a tier name after it can only mean the tier it
 * is counting towards. Truncating instead would have eaten the tier NAME, which
 * is the informative half — "1284/2500 to Di…" tells you less than the short
 * form does in less space.
 */
export function tierProgressLabel(
  card: { careerFp: number; nextTierAt: number | null; nextTierLabel?: string | null },
  options?: { short?: boolean },
): string | null {
  if (card.nextTierAt === null || !card.nextTierLabel) return null;
  const next = card.nextTierLabel;
  const titled = next.charAt(0).toUpperCase() + next.slice(1).toLowerCase();
  const span = `${Math.floor(card.careerFp)}/${Math.round(card.nextTierAt)}`;
  return options?.short ? `${span} ${titled}` : `${span} to ${titled} Tier`;
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

/**
 * A game's state, decided from the clock as well as from the feed.
 *
 * `statusOf` alone trusts the provider to say `in_progress`, and the scoreboard
 * already carries a note that it spells that more than one way. What neither of
 * them can survive is a spelling we have not seen — and we have not seen ANY of
 * them: every stored row is `final` or `scheduled` today, because the only
 * in-progress values we have ever held were overwritten by the next sweep. So
 * the vocabulary this depends on is, strictly speaking, unverified.
 *
 * A clock is not. A game that has kicked off and is not final is being played,
 * whatever the feed calls it, and that fact needs no vocabulary at all. The feed
 * still wins when it says `live` or `final` — it knows about delays and it knows
 * the moment the whistle goes, and both of those are things a start time cannot
 * tell you. The clock only fills the gap where the feed is still saying
 * `scheduled` about a game that started an hour ago.
 *
 * The asymmetry is deliberate: this can promote `scheduled` to `live` but never
 * demote `final` back to it. Calling a finished game live re-opens a result that
 * had settled, which is the worse of the two errors.
 */
export function resolveStatus(statusState: string | null, startsAt: string | null): GameStatus {
  const feed = statusOf(statusState);
  if (feed !== 'scheduled') return feed;
  if (!startsAt) return feed;
  const t = Date.parse(startsAt);
  return Number.isFinite(t) && t <= Date.now() ? 'live' : feed;
}

/**
 * What the fixture line says about the state of the game, or null before it
 * starts — where the kickoff time is already the answer and a second label
 * saying "scheduled" would only repeat it.
 *
 * Prefers the provider's own words while a game is live, because "Q3 04:22" is
 * strictly more than "LIVE" tells you and it is the sentence a reader is
 * already holding in their head from the broadcast. Falls back to the bare word
 * when the feed gives us nothing usable — which includes the case where the
 * status string is still the pre-game placeholder (`8/21 - 7:00 PM EDT`),
 * spotted by the date it opens with rather than by trusting status_state alone.
 */
export function liveLabel(game: GameContext | null): string | null {
  if (!game) return null;
  if (game.status === 'final') return game.statusText?.toLowerCase().startsWith('final')
    ? game.statusText.toUpperCase()
    : 'FINAL';
  if (game.status !== 'live') return null;
  const text = game.statusText?.trim();
  const usable = text && !/^\d{1,2}\/\d{1,2}\b/.test(text) && !/^tbd$/i.test(text);
  return usable ? text!.toUpperCase() : 'LIVE';
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
