/**
 * Which copies you hold a better one of.
 *
 * ---------------------------------------------------------------------------
 * IT IS THE SERVER'S BURN ORDER, NOT A GUESS AT ONE
 * ---------------------------------------------------------------------------
 *
 * `commit_candidate` decides which of your copies a commit consumes, and it is
 * the only thing that decides it — a caller cannot name a different one. Its
 * order is `career_fp asc, acquired_at asc, id asc`: least earned first, oldest
 * to break the tie. So the LAST copy in that ordering is the one a commit would
 * never reach, and every copy before it is one the server itself considers
 * expendable.
 *
 * This reproduces that ordering exactly, and the exactness is the whole value.
 * Rank by tier, by sell value, by whichever card looked better on the grid, and
 * the Spares chip marks a copy the server would keep while hiding one it would
 * burn — which turns "select all of these and dump them" from a safe sweep into
 * a way to lose your best card by accident.
 *
 * SO THE ORDER MATTERS AS MUCH AS THE MEMBERSHIP. Filtered to Spares, the grid
 * holds precisely the copies a bulk commit would eat, in the sequence it would
 * eat them.
 *
 * GROUPED BY card_id — the printed card — because that is what a set slot and a
 * commit are both keyed on, and it is the unit `summarise` counts duplicates
 * in. Two seasons of the same footballer are two cards and neither is the
 * other's spare. A row with no card_id falls back to the name, matching that
 * function; such a row cannot be committed anyway.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A FILE AND NOT THREE LINES IN `types.ts`
 * ---------------------------------------------------------------------------
 *
 * `bulk.ts` argues this at length and the argument is unchanged: `types.ts`
 * reaches `theme.ts`, `theme.ts` imports `global.css`, and the Deno runner the
 * unit suites use cannot follow a stylesheet. A rule that has to agree with a
 * SQL `ORDER BY` in another repository directory is exactly the rule worth
 * pinning with a test, so it lives where a test can reach it — importing
 * nothing, taking the four fields it reads rather than a whole card.
 *
 * `CollectionCard` satisfies `RankableCard` structurally, so the call site
 * still type-checks and `types.ts` re-exports this under its own name.
 */

/** One held copy, as much of it as the ranking looks at. */
export type RankableCard = {
  /** card_instances.id — the copy. */
  id: string;
  /** cards.id — the printed card. Null falls back to the name. */
  cardId: string | null;
  playerName: string;
  /** commit_candidate's first sort key. */
  careerFp: number;
  /** Its tiebreak, as epoch ms. */
  acquiredAt: number;
};

export function spareIds(cards: readonly RankableCard[]): Set<string> {
  const groups = new Map<string, RankableCard[]>();
  for (const c of cards) {
    const key = c.cardId ?? c.playerName;
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }

  const spare = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    /* commit_candidate's own ORDER BY, term for term. The keeper is the tail,
       so everything before it is spare — and in the order it would be spent. */
    const ranked = [...group].sort(
      (a, b) =>
        a.careerFp - b.careerFp || a.acquiredAt - b.acquiredAt || a.id.localeCompare(b.id),
    );
    for (const c of ranked.slice(0, -1)) spare.add(c.id);
  }

  return spare;
}
