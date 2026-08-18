/**
 * The scoreboard's vocabulary and every pure derivation it needs.
 *
 * Separated from the screen for the same reason as `lineup/model.ts`: the
 * awkward parts of a scoreboard are all naming and bucketing — what a
 * postseason "week 5" is called, which games count as one kickoff window, what
 * to show when a game has a time but no score — and those are far easier to
 * read, and to be wrong about, in JSX.
 */
import type { PositionKey } from '@/constants/positions';

/**
 * `games.status_state` is a clean three-value field; `games.status` is a human
 * string that is variously `Final`, `Final/OT`, `TBD` or `9/27 - 1:00 PM EDT`.
 * We read the first and ignore the second, deriving the kickoff line from
 * `starts_at` instead — a timestamp we can render in the reader's own zone,
 * where the provider's string is permanently stuck in US Eastern.
 */
export type GameStatus = 'scheduled' | 'live' | 'final';

export type ScoreTeam = {
  id: string;
  abbreviation: string;
  name: string | null;
};

export type ScoreGame = {
  id: string;
  season: number;
  seasonType: number;
  week: number | null;
  home: ScoreTeam | null;
  away: ScoreTeam | null;
  homeScore: number | null;
  awayScore: number | null;
  startsAt: string | null;
  status: GameStatus;
  /** Provider's own words, kept for `final/OT` which we cannot re-derive. */
  statusText: string | null;
};

export type Leader = {
  playerId: string;
  gameId: string;
  name: string;
  position: PositionKey;
  /** The raw abbreviation, since `position` has been normalised into buckets. */
  positionLabel: string | null;
  teamAbbreviation: string | null;
  points: number;
  /** True when this user holds a card for the player. See useScores. */
  owned: boolean;
};

export function statusOf(statusState: string | null): GameStatus {
  const s = (statusState ?? '').trim().toLowerCase();
  if (s === 'final' || s === 'complete' || s === 'completed') return 'final';
  // Anything actively happening. The provider has used both spellings, and a
  // game wrongly called scheduled while it is being played is the one error
  // this screen must not make.
  if (s === 'in_progress' || s === 'inprogress' || s === 'live' || s === 'in progress') {
    return 'live';
  }
  return 'scheduled';
}

/**
 * Postseason weeks are numbered but nobody calls them that, and the numbering
 * has a hole: 2025 ran weeks 1, 2, 3 and 5 — week 4 is the Pro Bowl, which has
 * no fixtures. Printing "Week 5" for the Super Bowl would be both wrong and
 * confusing, so rounds are named.
 */
const POSTSEASON_ROUNDS: Record<number, string> = {
  1: 'Wild Card',
  2: 'Divisional',
  3: 'Conference',
  4: 'Pro Bowl',
  5: 'Super Bowl',
};

/** "Preseason Wk 3", "Week 12", "Divisional". */
export function weekLabel(seasonType: number, week: number | null): string {
  if (week === null) return seasonTypeLabel(seasonType);
  if (seasonType === 1) return `Preseason Wk ${week}`;
  if (seasonType === 3) return POSTSEASON_ROUNDS[week] ?? `Postseason Wk ${week}`;
  return `Week ${week}`;
}

export function seasonTypeLabel(seasonType: number): string {
  if (seasonType === 1) return 'Preseason';
  if (seasonType === 3) return 'Postseason';
  return 'Regular season';
}

/** Sorts a slate chronologically: preseason, then regular, then postseason. */
export function slateOrder(seasonType: number, week: number | null): number {
  return seasonType * 1000 + (week ?? 0);
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** "THU 8:00 PM". The kickoff window header. */
export function kickoffLabel(startsAt: string | null): string {
  if (!startsAt) return 'TIME TBD';
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return 'TIME TBD';
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${DAYS[d.getDay()]} ${h}:${m} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/**
 * What to print where a score would go on a game that has not started.
 *
 * The spec renders an em dash for every not-yet value and puts the projection
 * beside it. We have no projections — the provider sells none — so an unplayed
 * game shows its kickoff and nothing else rather than a dash pretending a
 * number is coming.
 */
export function scoreText(score: number | null, status: GameStatus): string {
  if (status === 'scheduled') return '';
  return score === null ? '—' : String(score);
}

export type KickoffWindow = { key: string; label: string; games: ScoreGame[] };

/**
 * Games bucketed by kickoff instant, in time order, with untimed games last.
 *
 * Bucketing on the exact timestamp rather than on the hour is deliberate: the
 * 1:00 and 1:05 windows are genuinely different windows to anyone setting a
 * lineup, and merging them under one header hides the five minutes that decide
 * whether a late swap is still legal.
 */
export function groupByKickoff(games: ScoreGame[]): KickoffWindow[] {
  const buckets = new Map<string, ScoreGame[]>();
  for (const g of games) {
    const key = g.startsAt ?? 'tbd';
    const list = buckets.get(key) ?? [];
    list.push(g);
    buckets.set(key, list);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => {
      if (a === 'tbd') return 1;
      if (b === 'tbd') return -1;
      return a.localeCompare(b);
    })
    .map(([key, list]) => ({
      key,
      label: key === 'tbd' ? 'TIME TBD' : kickoffLabel(key),
      // Within a window, order by matchup so the list is stable between polls
      // rather than reshuffling every time the server returns rows differently.
      games: [...list].sort((x, y) =>
        (x.away?.abbreviation ?? '').localeCompare(y.away?.abbreviation ?? ''),
      ),
    }));
}

/**
 * Top `limit` scorers per position, in the reading order positions.ts defines.
 *
 * Positions with nobody in them are dropped rather than rendered empty: during
 * the preseason a slate can genuinely produce no kicker rows, and an empty
 * KICKER heading reads as a bug where an absent one reads as "nothing yet".
 */
export function leadersByPosition(
  leaders: Leader[],
  order: PositionKey[],
  limit: number,
): { position: PositionKey; leaders: Leader[] }[] {
  return order
    .map((position) => ({
      position,
      leaders: leaders
        .filter((l) => l.position === position)
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
        .slice(0, limit),
    }))
    .filter((group) => group.leaders.length > 0);
}
