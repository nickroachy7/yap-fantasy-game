/**
 * The run: hearts, record, and what a death would leave you.
 *
 * WHY THIS IS A PARSER AND NOT A HOOK. The run is read in three places that
 * cannot share a fetch — the header draws it on every tab, the lobby prices
 * contests against it, and the death screen is a route of its own — so the
 * shape lives here and each caller brings its own load. `PlayerContext` owns
 * the one the chrome uses; see the note there about why coins and hearts are
 * the same kind of state.
 *
 * `my_run()` returns a single JSON object rather than a row, so there is no
 * PostgREST column mapping to keep in step. That is deliberate on the SQL side
 * (20260825180000): the run is one thing, and a client that read it as a table
 * would be handling an array that can only ever have one element in it.
 */

export type Run = {
  id: string;
  hearts: number;
  /**
   * The ceiling a run can heal to. NOT a pip count — see the header on
   * `Hearts` for why drawing headroom made a new run look damaged. It is a
   * sentence the run panel says, and nothing else.
   */
  maxHearts: number;
  /**
   * The most hearts this run has ever held, and the number of pips the chrome
   * draws. Anything between `hearts` and this is a heart the run LOST, which is
   * what makes a broken pip drawable at all. Grows on healing, never narrows.
   */
  rack: number;
  /**
   * Hearts riding on contests that have not settled. The number that turns
   * "should I enter this too" from a guess into a decision: three hearts with
   * two already staked is one heart of room, not three.
   */
  wagered: number;
  /** How many entries those hearts are spread across. */
  wageredIn: number;
  wins: number;
  losses: number;
  /** Null while the run is live. */
  endedAt: string | null;
  /**
   * True exactly when the death screen is owed an answer: the run is over and
   * the carry has not been taken. Nothing with hearts on it can be entered
   * until it clears, and `current_run` will not start a new run over it.
   */
  awaitingCarry: boolean;
  /** Cards this run's wins let you keep through the wipe. */
  carrySlots: number;
  /** The next rung, so a live run can be told what another win or two buys. */
  nextRung: { atWins: number; cardSlots: number } | null;
  heldCards: number;
  /**
   * How many cards the run took. Non-zero only on a death screen, and it is the
   * size of the pool the carry is picked from — `heldCards` is near-zero there
   * by construction, because the wipe already ran.
   */
  lostCards: number;
};

type RunJson = {
  id: string;
  hearts: number;
  max_hearts: number;
  rack: number;
  wagered: number;
  wagered_in: number;
  wins: number;
  losses: number;
  ended_at: string | null;
  awaiting_carry: boolean;
  carry_slots: number;
  next_rung: { at_wins: number; card_slots: number } | null;
  held_cards: number;
  lost_cards: number;
};

export function parseRun(data: unknown): Run | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as RunJson;
  if (!r.id) return null;
  return {
    id: r.id,
    hearts: Number(r.hearts ?? 0),
    maxHearts: Number(r.max_hearts ?? 0),
    /* Falls back to hearts held, never to the ceiling: a missing rack must draw
       no damage rather than inventing some. */
    rack: Number(r.rack ?? r.hearts ?? 0),
    wagered: Number(r.wagered ?? 0),
    wageredIn: Number(r.wagered_in ?? 0),
    wins: Number(r.wins ?? 0),
    losses: Number(r.losses ?? 0),
    endedAt: r.ended_at ?? null,
    awaitingCarry: Boolean(r.awaiting_carry),
    carrySlots: Number(r.carry_slots ?? 0),
    nextRung: r.next_rung
      ? { atWins: Number(r.next_rung.at_wins), cardSlots: Number(r.next_rung.card_slots) }
      : null,
    heldCards: Number(r.held_cards ?? 0),
    lostCards: Number(r.lost_cards ?? 0),
  };
}

/**
 * ---------------------------------------------------------------------------
 * THREE SENTENCES WITH NOBODY LEFT TO SAY THEM — `recordOf`, `wageredLine` AND
 * `nextRungLine` — KEPT ANYWAY
 * ---------------------------------------------------------------------------
 *
 * All three were written for the contests sheet's run panel, and that panel is
 * a one-row rail now: the rack, and how many hearts are free to stake. The
 * record, what is riding and what the next rung buys did not survive the cut —
 * see `RunRail` for the argument, which is that the Entered tab answers "what
 * is riding" with the actual contests, and the other two are true without ever
 * being urgent.
 *
 * They are kept because they are the WORDING of facts this game still turns on,
 * and the ladder in particular is the only thing standing between a death and
 * losing everything — a run should be able to see the next rung without dying
 * first, and the day that goes back on a screen it should go back in these
 * words rather than in a second set written from scratch. `parseRun` produces
 * everything they read.
 *
 * If they are still unused when the profile grows a run section, that is the
 * screen they belong on. If that never happens, delete them; an unused export
 * is only worth its comment for so long.
 */

/**
 * "3-1" — the run's record, or null before it has one.
 *
 * Null rather than "0-0" on a fresh run: a record of nothing is not a fact
 * worth drawing, and a zero on a death-adjacent screen reads as a score.
 */
export function recordOf(run: Run): string | null {
  if (run.wins === 0 && run.losses === 0) return null;
  return `${run.wins}-${run.losses}`;
}

/**
 * WHAT THE RUN IS HOLDING, and how much of it can still be spent.
 *
 * "3 hearts · 1 free to stake". The count is the headline of the run panel and
 * the free half is the half that changes what you do next: three hearts with
 * two already riding is one heart of room, and a lobby priced in hearts cannot
 * be read without that subtraction having been done for you.
 *
 * ALL STAKED IS A STATE, NOT A NOUGHT. "0 free to stake" invites the reader to
 * check the arithmetic; the words say the same thing and say it as a condition
 * they are in.
 */
export function heartsLine(run: Run): string {
  const held = run.hearts === 1 ? '1 heart' : `${run.hearts} hearts`;
  if (run.wagered <= 0) return held;
  const free = run.hearts - run.wagered;
  if (free <= 0) return `${held} · all staked`;
  return `${held} · ${free} free to stake`;
}

/**
 * What is currently on the line, as a phrase, or null when nothing is.
 *
 * SAID IN CONTESTS, NOT IN HEARTS, because the rack beside it is already saying
 * it in hearts — the words are there to name WHERE the stake is, which the pips
 * cannot. It does not repeat the word either: `heartsLine` sits directly above
 * it and has just spent it twice, so this is "2 riding on 2 contests" rather
 * than "2 hearts riding on 2 contests" — the unit is established by the line
 * above and by the pips beside it.
 */
export function wageredLine(run: Run): string | null {
  if (run.wagered <= 0 || run.wageredIn <= 0) return null;
  const where = run.wageredIn === 1 ? 'a contest' : `${run.wageredIn} contests`;
  return `${run.wagered} riding on ${where}`;
}

/**
 * What another win would buy, as a sentence, or null when there is nothing left
 * to climb to.
 *
 * The ladder is the only thing standing between a death and losing everything,
 * so a live run should be able to see the next rung WITHOUT dying first. Said
 * in cards rather than percentages because cards is what it pays in — see the
 * header on 20260825110000 for why it could never have been a percentage.
 */
export function nextRungLine(run: Run): string | null {
  if (!run.nextRung) return null;
  const away = run.nextRung.atWins - run.wins;
  if (away <= 0) return null;
  const wins = away === 1 ? '1 more win' : `${away} more wins`;
  const cards = run.nextRung.cardSlots === 1 ? '1 card' : `${run.nextRung.cardSlots} cards`;
  return `${wins} and a death keeps ${cards}`;
}
