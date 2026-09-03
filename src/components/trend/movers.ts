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
 * So the movement is production, not popularity: how a player did in the most
 * recent completed week against how he did in the one before. That is a real,
 * checkable fact, it is what a card owner actually wants before spending coins,
 * and it needs no data we do not already hold.
 *
 * ---------------------------------------------------------------------------
 * PLACES, NOT POINTS, AND WHY IT CHANGED
 * ---------------------------------------------------------------------------
 *
 * The delta used to be `after - before` in fantasy points: "+24.4". It is the
 * change in RANK now: "+63", meaning he passed sixty-three players.
 *
 * A points delta measures a man against himself, which is the wrong yardstick
 * for a board called Trending. Scoring moves league-wide from week to week —
 * a high-scoring Sunday lifts everybody's delta and a defensive one flattens
 * it — so the same +24.4 means something different in each pair of weeks, and
 * the whole board inflates and deflates for reasons that have nothing to do
 * with the players on it. A rank change is measured against the FIELD, which
 * is what "trending" has always meant: he is worth more this week because he
 * is now ahead of people he was behind.
 *
 * It also reads better. "Up 63 places" is a fact a manager can act on without
 * knowing what a good weekly fantasy total looks like; "+24.4" requires that
 * knowledge before it says anything at all.
 *
 * NOT THE MARKET'S RANK, and this is a limit rather than a choice.
 * `player_rankings` is the consensus board and it is the obvious thing to
 * diff — but it holds ONE ROW per player and season, overwritten in place by
 * `sync-fantasy`, so there is no previous value to subtract. Diffing it needs
 * a history table and several weeks of it accumulating before the first honest
 * number. This ranks what we hold: the two weeks of scoring already read for
 * this screen.
 *
 * ---------------------------------------------------------------------------
 * THE POOL IS THE SAME IN BOTH WEEKS, WHICH IS WHAT MAKES THE NUMBER MEAN
 * ANYTHING
 * ---------------------------------------------------------------------------
 *
 * Both ranks are taken over the SAME set: the players present in both weeks who
 * clear `minimum`. Ranking each week within its own scorers would have been the
 * obvious implementation and would quietly lie — the pools differ in size and
 * membership, so a player could hold station and appear to move, or move and
 * appear to hold. Over one fixed pool, "+12" means he passed twelve of exactly
 * the same men.
 *
 * TIES SHARE A PLACE (standard competition ranking). Two players on identical
 * points are not ordered, and breaking that tie by name would manufacture a
 * place change out of the alphabet.
 *
 * WHAT IT REFUSES TO SAY
 *
 * A player who appears in only one of the two weeks is EXCLUDED rather than
 * scored against zero. A bye, an inactive, or a stat line we have not swept yet
 * all look identical from here, and a plunge down the board against a player
 * who was resting is a lie the screen would be telling confidently.
 */
import type { Leader } from '@/components/scores/scoreboard';
import type { PositionKey } from '@/constants/positions';

export type Mover = {
  playerId: string;
  name: string;
  position: PositionKey;
  positionLabel: string | null;
  teamAbbreviation: string | null;
  /** Points in the earlier of the two weeks. The evidence, not the measure. */
  before: number;
  /** Points in the more recent week. */
  after: number;
  /** Place in the shared pool in the earlier week. 1 is top. */
  rankBefore: number;
  /** Place in the shared pool in the more recent week. */
  rankAfter: number;
  /**
   * `rankBefore - rankAfter`: PLACES GAINED, positive for a climb.
   *
   * Subtracted that way round because ranks run the wrong way for arithmetic —
   * moving from 40th to 12th is an improvement and a decrease, and a board
   * where rising is negative would have to apologise for itself in every
   * caption.
   */
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
 * Standard competition ranking over one week's points, for a fixed pool.
 *
 * Equal points share a place and the next player skips — 1, 2, 2, 4 — which is
 * what "competition ranking" means and what keeps a tie from inventing
 * movement. See the header.
 */
function placeByPlayer(
  ids: string[],
  pointsOf: (id: string) => number,
): Map<string, number> {
  const order = [...ids].sort((a, b) => pointsOf(b) - pointsOf(a));
  const places = new Map<string, number>();
  let place = 0;
  let previous: number | null = null;
  order.forEach((id, index) => {
    const points = pointsOf(id);
    /* The place is the INDEX, not a running counter, so a tie shares a place
       and the player after them takes the one their count implies. */
    if (previous === null || points !== previous) place = index + 1;
    previous = points;
    places.set(id, place);
  });
  return places;
}

/**
 * Movers, sorted by places gained, descending. The caller takes the head for
 * risers and the tail for fallers rather than this function sorting twice.
 *
 * `minimum` drops the long tail of players who scored nothing much in either
 * week — and it matters MORE now than it did for a points delta, because a
 * rank change amplifies exactly the noise it was written to remove. Two
 * third-stringers swapping 0.0 and 3.1 are worth nothing as points and can be
 * worth forty places, since the bottom of a scoring board is a hundred players
 * separated by fractions. The floor is applied BEFORE the ranking, so those
 * players are not in the pool at all rather than being ranked and discarded —
 * otherwise they would still be displacing the ones that count.
 */
export function computeMovers(
  recent: Leader[],
  previous: Leader[],
  minimum: number,
): Mover[] {
  const after = totalByPlayer(recent);
  const before = totalByPlayer(previous);

  /* THE SHARED POOL, settled before either ranking is taken. Present in both
     weeks and worth starting in at least one of them. */
  const pool: string[] = [];
  for (const [playerId, a] of after) {
    const b = before.get(playerId);
    // Present in both weeks, or we say nothing. See the header.
    if (!b) continue;
    if (Math.max(a.points, b.points) < minimum) continue;
    pool.push(playerId);
  }

  const placesAfter = placeByPlayer(pool, (id) => after.get(id)!.points);
  const placesBefore = placeByPlayer(pool, (id) => before.get(id)!.points);

  const out: Mover[] = pool.map((playerId) => {
    const a = after.get(playerId)!;
    const b = before.get(playerId)!;
    const rankAfter = placesAfter.get(playerId)!;
    const rankBefore = placesBefore.get(playerId)!;
    return {
      playerId,
      name: a.row.name,
      position: a.row.position,
      positionLabel: a.row.positionLabel,
      teamAbbreviation: a.row.teamAbbreviation,
      before: b.points,
      after: a.points,
      rankBefore,
      rankAfter,
      delta: rankBefore - rankAfter,
      owned: a.row.owned,
    };
  });

  // Name breaks ties so the order is stable between renders rather than
  // reshuffling every player who moved by exactly zero places.
  out.sort((x, y) => y.delta - x.delta || x.name.localeCompare(y.name));
  return out;
}

/**
 * "+12" / "−3" / "0". The sign is the point, so it is always printed.
 *
 * A WHOLE NUMBER, because a place is one. It formatted to a decimal while the
 * delta was fantasy points; "+12.0 places" would be a number pretending to a
 * precision that does not exist.
 *
 * The minus is U+2212, not a hyphen: it is the same width as the plus, so a
 * column of these does not go ragged wherever a faller appears.
 */
export function deltaText(delta: number): string {
  const places = Math.round(delta);
  return `${places > 0 ? '+' : places < 0 ? '−' : ''}${Math.abs(places)}`;
}
