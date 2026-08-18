/**
 * Week-over-week movement, and what it is honestly allowed to claim.
 *
 * WHY THIS IS NOT SLEEPER'S TREND
 *
 * Sleeper's trending list is add/drop volume — how many managers picked a
 * player up in the last 24 hours. That number does not exist here and cannot:
 * it is a measure of a waiver wire, and this game acquires players from packs.
 * Reproducing the SHAPE of that screen with a number that means something else
 * would be the worst of both.
 *
 * So the delta is production, not popularity: what a player scored in the most
 * recent completed week against what he scored in the one before. That is a
 * real, checkable fact, it is what a card owner actually wants before spending
 * gems, and it needs no data we do not already hold.
 *
 * WHAT IT REFUSES TO SAY
 *
 * A player who appears in only one of the two weeks is EXCLUDED rather than
 * scored against zero. A bye, an inactive, or a stat line we have not swept yet
 * all look identical from here, and "-24.6" against a player who was resting is
 * a lie the screen would be telling confidently.
 */
import type { Leader } from '@/components/scores/scoreboard';
import type { PositionKey } from '@/constants/positions';

export type Mover = {
  playerId: string;
  name: string;
  position: PositionKey;
  positionLabel: string | null;
  teamAbbreviation: string | null;
  /** Points in the earlier of the two weeks. */
  before: number;
  /** Points in the more recent week. */
  after: number;
  /** `after - before`. The column the list is sorted by. */
  delta: number;
  owned: boolean;
};

/**
 * A player can have two stat lines in one week only in data we consider
 * broken, but summing rather than picking is the safe reduction: it cannot
 * silently drop half of a doubleheader, and it matches how the season totals
 * elsewhere in the app are built.
 */
function totalByPlayer(leaders: Leader[]): Map<string, { points: number; row: Leader }> {
  const out = new Map<string, { points: number; row: Leader }>();
  for (const l of leaders) {
    const prev = out.get(l.playerId);
    out.set(l.playerId, { points: (prev?.points ?? 0) + l.points, row: prev?.row ?? l });
  }
  return out;
}

/**
 * Movers, sorted by delta descending. The caller takes the head for risers and
 * the tail for fallers rather than this function sorting twice.
 *
 * `minimum` drops the long tail of players who scored nothing much in either
 * week: without it the biggest "riser" in a preseason week is a third-string
 * receiver going from 0.0 to 3.1, which is true and useless.
 */
export function computeMovers(
  recent: Leader[],
  previous: Leader[],
  minimum: number,
): Mover[] {
  const after = totalByPlayer(recent);
  const before = totalByPlayer(previous);

  const out: Mover[] = [];
  for (const [playerId, a] of after) {
    const b = before.get(playerId);
    // Present in both weeks, or we say nothing. See the header.
    if (!b) continue;
    if (Math.max(a.points, b.points) < minimum) continue;
    out.push({
      playerId,
      name: a.row.name,
      position: a.row.position,
      positionLabel: a.row.positionLabel,
      teamAbbreviation: a.row.teamAbbreviation,
      before: b.points,
      after: a.points,
      delta: a.points - b.points,
      owned: a.row.owned,
    });
  }

  // Name breaks ties so the order is stable between renders rather than
  // reshuffling every player who moved by exactly zero.
  out.sort((x, y) => y.delta - x.delta || x.name.localeCompare(y.name));
  return out;
}

/** "+12.4" / "-3.8". The sign is the point, so it is always printed. */
export function deltaText(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)}`;
}
