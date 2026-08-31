/**
 * Everything a contest SAYS about itself, in one place.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 *
 * A contest is described on three surfaces — the lobby, the card over its
 * lineup, and its own sheet — and until now each of them wrote its own
 * sentences. "Top 3 win" was a string literal in the lobby row and nowhere
 * else, so the card above the lineup you were about to file could not say how
 * that lineup would be judged. Worse, `my_contest_cards` decided W/L by the
 * MEDIAN for every contest while settlement used the real rule, so the card
 * could show a win the run recorded as a loss.
 *
 * Those are the same bug at two depths: the same question answered in more than
 * one place. The database fix was to make `contest_results` the only answer to
 * "did I win" (`20260826020000`); this file is the same fix for the words.
 *
 * NOTHING HERE RENDERS. It maps a contest to strings and numbers, so that a
 * component's job is layout and a reader's job is never to reconcile two
 * descriptions of one thing.
 */

import { MIN_ENTRANTS, type Result } from '@/components/lineup/field';

/** How a contest decides a winner. Mirrors `public.contest_win_condition`. */
export type WinCondition = 'median' | 'top_n';

/**
 * The facts every surface prices a contest from.
 *
 * Structural rather than one of the two row types, deliberately: `Contest` (the
 * lobby) and `MyContest` (an entry) are different reads with different lifetimes
 * and neither should have to become the other to be described.
 */
export type ContestTerms = {
  formatName: string;
  slotCount: number;
  entryFeeGems: number;
  heartsAtRisk: number;
  heartsOnWin: number;
  winCondition: WinCondition;
  winRank: number | null;
  /** Gems collected so far that will be paid back out. Grows with the field. */
  prizePool: number;
  entrants: number;
  maxEntrants?: number | null;
};

/* ------------------------------------------------------------------ how */

/**
 * How it is won, in the fewest words that are still true.
 *
 * "Beat the median" is even money and reads as such. "Top 3 win" does not, and
 * is meant not to — most of that field loses, which is exactly what a player is
 * being asked to price a heart against.
 *
 * The rank is stated WITH the field size wherever the field is known, for the
 * same reason every rank in this codebase is: "top 3" of four entrants and
 * "top 3" of forty are different offers wearing one phrase.
 *
 * IT TAKES THE OPPONENT FOR THE SAME REASON `opponentOf` EXISTS. A duel is won
 * by beating one named person, and a head that said "Beat the median" over a
 * scoreboard reading YOU against @calvin would be the card disagreeing with
 * itself — which is the exact class of bug this file was written to end. One
 * question, one answer, whichever surface is asking.
 */
export function winLine(t: ContestTerms, duel?: Duel | null): string {
  if (duel) return `Beat ${duel.handle}`;
  if (t.winCondition === 'top_n' && t.winRank !== null) {
    return t.entrants > t.winRank
      ? `Top ${t.winRank} of ${t.entrants} win`
      : `Top ${t.winRank} win`;
  }
  return 'Beat the median';
}

/**
 * ONE OPPONENT, WHATEVER THE FORMAT — the right-hand side of the scoreboard.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS REPLACED `markOf`
 * ---------------------------------------------------------------------------
 *
 * `markOf` answered "where do I draw the line on the bar", which is a question
 * about a graphic. That was the right question while the card was a figure over
 * an axis, and it is the wrong one now: the card is a SCOREBOARD, and every
 * format it can ever draw is the same sentence with a different noun in it.
 *
 *     beat the median   you  vs  the community's middle
 *     top n             you  vs  the score at the cut
 *     head to head      you  vs  another manager
 *
 * So the model answers "who am I playing" instead, and the band draws two
 * totals side by side without ever learning what kind of contest it is in.
 * Adding a head-to-head format is then a branch HERE and a graphic there —
 * nothing about the scoreboard itself changes, which is the whole point.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS STILL FIXES
 * ---------------------------------------------------------------------------
 *
 * The card once drew the median on every contest and labelled it MEDIAN,
 * including on a `top_n` contest where the median decides nothing. A player
 * could sit comfortably above the middle of a field that pays three and be
 * sixth — reading a threshold that could not win them anything, in the one
 * place they would look to find out whether they were winning. Under `top_n`
 * the opponent is the CUT: the lowest score still inside the paying places,
 * computed by `my_contest_cards`. Null until enough of the field has scored to
 * have one, which is the same condition the median has.
 */
export function opponentOf(
  t: Pick<ContestTerms, 'winCondition' | 'winRank'>,
  against: { median: number; cut: number | null; duel?: Duel | null },
): Opponent {
  /* A REAL PERSON BEATS EVERY DERIVED LINE. Where there is one there is nothing
     to derive: you are playing them, not the field they happen to sit in. */
  if (against.duel) {
    return { label: against.duel.handle, value: against.duel.points, shape: 'duel' };
  }
  if (t.winCondition === 'top_n' && t.winRank !== null) {
    return { label: `THE CUT · ${ordinal(t.winRank)}`, value: against.cut, shape: 'field' };
  }
  return { label: 'COMMUNITY', value: against.median, shape: 'field' };
}

/**
 * The other manager, on a format that has one.
 *
 * NULL EVERYWHERE TODAY, and deliberately a shape rather than a stub. No
 * head-to-head contest exists — see the note on `opponentOf` — so nothing
 * constructs one of these outside the kit's fixtures. What it buys now is that
 * the card cannot be written in a way that assumes its opponent is a number
 * with no name, which is exactly how the previous version came to have no seat
 * for a person in it.
 */
export type Duel = { handle: string; points: number | null };

/**
 * Who the scoreboard's right-hand column is, and which graphic goes under it.
 *
 * `shape` is the ONLY thing the band branches on. A field puts you somewhere in
 * a distribution and the rail draws that; a duel has no distribution to be in
 * and draws a tug-of-war from level. Everything above the graphic — both
 * labels, both totals, the margin — is identical in the two cases.
 */
export type Opponent = {
  /** `COMMUNITY`, `THE CUT · 3RD`, or a manager's handle. */
  label: string;
  /** Their total, or null while there is nothing to compare against. */
  value: number | null;
  shape: 'field' | 'duel';
};

const ORDINALS = ['0TH', '1ST', '2ND', '3RD'] as const;


/** Uppercase throughout: every caller sets it in a 9pt micro label. */
function ordinal(n: number): string {
  if (n > 0 && n < ORDINALS.length) return ORDINALS[n];
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}TH`;
  switch (n % 10) {
    case 1:
      return `${n}ST`;
    case 2:
      return `${n}ND`;
    case 3:
      return `${n}RD`;
    default:
      return `${n}TH`;
  }
}

/* ------------------------------------------------------------------ fill */

/**
 * HOW FULL IT IS, AND WHETHER THAT IS ENOUGH.
 *
 * This replaced `seatsLine`, which said "12 in" and stopped there. A count on
 * its own is a fact without a scale: "1 in" looks like a quiet contest and is
 * actually a contest that CANNOT BE SCORED — `median_record` needs two entries
 * to have a middle, so a field of one settles as nothing whatever you score in
 * it. That is the single most useful thing the head can say about a young
 * contest and the old line could not say it.
 *
 * So the line always carries the count and, where the contest is short of
 * playable, what it is short BY. Three cases and they are ordered by how much
 * the reader can act on:
 *
 *   capped     "12 of 20 entries" — the denominator is the contest's own.
 *              Every contest that exists has a null cap (`20260825050000`), so
 *              this is the branch that waits for the format to grow one.
 *   short      "Needs 2 entries" — under `MIN_ENTRANTS` and therefore
 *              unscoreable whatever anybody scores. It states the REQUIREMENT
 *              rather than the count, because at nought or one entrant the
 *              count is not information and what the contest is waiting for
 *              is. The remedy is other people, so the sentence is about them
 *              rather than about you.
 *   playable   "12 entries" — nothing to add. A contest past the minimum with
 *              no cap has no target to be measured against, and inventing one
 *              ("12 entries, aiming for 20") would be a number the game does
 *              not hold.
 *
 * IT SAYS "ENTRIES" BECAUSE "IN" DID NOT SAY ANYTHING. This read "12 in" and
 * "1 in · 1 more to play", and at a glance nobody could tell what was in what —
 * twelve cards? twelve gems? twelve minutes? The noun costs six characters in a
 * slot that has room for them and turns a number into a fact.
 *
 * AND EVERY STRING IS UNDER ~18 CHARACTERS, WHICH IS A REQUIREMENT RATHER THAN
 * A STYLE. This sits in the head's second row beside the win condition, which
 * does not give way — so a long line here does not wrap, it CLIPS. Measured on
 * a 375pt phone there is room for about eighteen characters beside
 * "WIN CONDITION Beat the median", and two drafts of this line have already
 * been lost to it: "No entries yet · 2 more to play" became "No entries yet ·
 * 2 …" and "0 of 2 entries to play" became "0 of 2 entries to p…" — both times
 * dropping the half that says what the contest is waiting for, in the one state
 * where that is the only thing worth saying. Anything added here has to be
 * counted, not eyeballed.
 *
 * NEVER SILENT. `seatsLine` returned null on an empty contest, on the argument
 * that "0 in" makes a contest look dead when it is merely early — which was
 * true of a bare count and is not true of a line that says what it is waiting
 * for. The head reserves this row's height either way, so a null here bought
 * nothing and cost the one state where the reader most needs telling.
 */
export function fillLine(t: ContestTerms): string {
  if (t.maxEntrants != null) {
    return t.entrants >= t.maxEntrants
      ? `Full · ${t.maxEntrants} entries`
      : `${t.entrants} of ${t.maxEntrants} entries`;
  }
  if (t.entrants < MIN_ENTRANTS) {
    if (t.entrants === 0) return `Needs ${MIN_ENTRANTS} entries`;
    const short = MIN_ENTRANTS - t.entrants;
    return `Needs ${short} more ${short === 1 ? 'entry' : 'entries'}`;
  }
  return `${t.entrants} ${t.entrants === 1 ? 'entry' : 'entries'}`;
}

/**
 * What the contest asks of your ROSTER. Not how it is won — see `winLine`.
 *
 * ---------------------------------------------------------------------------
 * THE WIN CONDITION USED TO BE APPENDED HERE, AND IT GOT CUT OFF
 * ---------------------------------------------------------------------------
 *
 * This returned "Full Roster · 8 cards · Beat the median" and the card printed
 * it on a line it shared with the seat count, beside a two-line head with a
 * countdown in it. There was not room. On every entered card before lock — the
 * state a week spends five of its seven days in — it rendered as
 *
 *     Full Roster · 8 cards · Beat the med…   26…
 *
 * so the single most important term of a contest, the one that says what you
 * have to DO, was the string chosen to be truncated. And it was not a width
 * bug to be fixed with a smaller font: three facts of different rank were
 * competing for one line because they had been joined into one string, and
 * nothing downstream could tell which of them to protect.
 *
 * So they are separate now, and the card places them by rank: this stays in
 * the head where it is scenery, and `winLine` leads the TRADE band, where it
 * is the condition on everything in the reward column and cannot be clipped.
 *
 * THE FORMAT NAME IS DROPPED WHERE IT IS THE CONTEST'S OWN NAME. Every lobby
 * contest is named after its format — "Flex Three · 3 cards", under a heading
 * that already says Flex Three — so the first half of this line was a word the
 * reader had just read. It survives on the free contest, which is called
 * "Preseason Week 4" and really is a Full Roster.
 */
export function formatLine(t: ContestTerms, name?: string): string {
  const cards = `${t.slotCount} card${t.slotCount === 1 ? '' : 's'}`;
  const sameName =
    name !== undefined && name.trim().toLowerCase() === t.formatName.trim().toLowerCase();
  return sameName ? cards : `${t.formatName} · ${cards}`;
}

/* ------------------------------------------------------------ the trade */

/**
 * One line of the risk or reward column.
 *
 * `heart` is what makes the glyph appear beside it. It is a mark a reader stops
 * on where a sentence is a thing they skim past, which is the whole reason the
 * stake is drawn on the row rather than left to the contest page to disclose
 * after the tap.
 */
export type TradeLine = { text: string; heart?: boolean; tone?: 'positive' | 'negative' };

/**
 * WHAT YOU PUT UP.
 *
 * Ordered gems-then-hearts because that is the order they are felt: the gems
 * go the moment you file, the heart only if you lose. A contest that risks
 * neither says so in a word rather than showing an empty column.
 */
export function riskLines(t: ContestTerms): TradeLine[] {
  const lines: TradeLine[] = [];
  if (t.entryFeeGems > 0) lines.push({ text: `${t.entryFeeGems} gems` });
  if (t.heartsAtRisk > 0) {
    lines.push({ text: t.heartsAtRisk === 1 ? '1 heart' : `${t.heartsAtRisk} hearts`, heart: true });
  }
  if (lines.length === 0) lines.push({ text: 'Nothing' });
  return lines;
}

/**
 * WHAT YOU CAN TAKE, DENOMINATED IN GEMS.
 *
 * ---------------------------------------------------------------------------
 * A REWARD HAS TO BE IN A CURRENCY THE PLAYER KEEPS SCORE IN
 * ---------------------------------------------------------------------------
 *
 * This column used to end with "Career FP on 3 cards", on the argument that
 * tier is the real reason to enter — which it is, and which is why the fee is
 * priced the way it is. But career_fp is not a thing anybody has a balance of.
 * It accrues invisibly, it pays off weeks later in a tier threshold, and next
 * to "40 gems" on the risk side it read as the small print rather than as the
 * other half of a trade. A reward column where the risk is a number and the
 * reward is a concept is not a comparison a reader can make.
 *
 * So: gems, always, and the tier argument moved to the contest sheet's prose
 * where there is room to actually make it.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE GEMS COME FROM, AND WHY IT CANNOT BE A FLAT PRIZE
 * ---------------------------------------------------------------------------
 *
 * Where there is an entry fee, from the POOL those fees collected — 25% of
 * them, see `20260826020000`. That is redistribution and it is safe.
 *
 * Where there is no fee there is no pool, and this is the line to be careful
 * about: a fixed gem prize on a contest that collects nothing could only ever
 * be MINTED, which is the one thing the economy forbids outright and the exact
 * inversion the entry fee exists to prevent. The free contest still pays gems —
 * every entry does — but through `award_score_gems`, at 1.5 a point times the
 * card's tier multiplier (1.0 bronze to 1.4 diamond). "From 1.5 gems a point"
 * is the floor and it is a real, earned number rather than an advertised one.
 *
 * A PAID CONTEST EARNS THAT TOO and does not say so here. Naming both would put
 * two gem lines in a column that is trying to answer one question, and the pool
 * is the part that is specific to THIS contest. The score rate is the baseline
 * every entry gets, worth naming only where there is nothing more specific.
 */
export function rewardLines(t: ContestTerms, prize: number | null = null): TradeLine[] {
  const lines: TradeLine[] = [];

  /* A SETTLED PRIZE REPLACES THE POOL, because the pool has stopped being a
     question. Never a running "you would win 60" — that is a projection and
     this app does not sell them.

     EVERY LINE HERE FITS ON ONE. The trade band reserves a fixed number of
     single-line rows so the card's height cannot move — see `TRADE_LINES` in
     `ContestCard` — so a string that needs two is a string that gets clipped.
     "Gem pool, once entries start" was that string, and it is "Share of the
     pool" now: the same sentence as the funded case rather than a separate
     apology for an empty one. */
  if (prize !== null && prize > 0) {
    lines.push({ text: `Won ${prize} gems`, tone: 'positive' });
  } else if (t.entryFeeGems > 0) {
    const top = topPrize(t);
    lines.push({
      text:
        t.prizePool > 0
          ? top !== null
            ? `Up to ${top} gems`
            : `Share of ${t.prizePool} gems`
          : 'Share of the pool',
    });
  } else {
    lines.push({ text: 'From 1.5 gems a point' });
  }

  if (t.heartsOnWin > 0) {
    lines.push({ text: t.heartsOnWin === 1 ? '+1 heart' : `+${t.heartsOnWin} hearts`, heart: true });
  }

  return lines;
}

/**
 * What the WINNER takes, when the split has a top place to speak of.
 *
 * `top_n` weights by place — `win_rank + 1 - rnk`, so top three is 3:2:1 — and
 * the first share is therefore `2 / (n + 1)` of the pool. Kept in step with
 * `contest_payouts` by being the same arithmetic, not the same constant.
 *
 * Null under `median`, and that is not a gap. A median contest pays everybody
 * who beat the middle an equal share, so what one winner takes depends entirely
 * on how many others also won — a number that does not exist until the week is
 * over. "Share of the pool" is the whole truth available in advance.
 */
export function topPrize(t: ContestTerms): number | null {
  if (t.winCondition !== 'top_n' || t.winRank === null || t.prizePool <= 0) return null;
  return Math.floor((t.prizePool * 2) / (t.winRank + 1));
}

/* --------------------------------------------------------- the settlement */

/**
 * WHAT A FINISHED WEEK ACTUALLY DID, which is a different question from the
 * trade and needs a different pair of columns.
 *
 * ---------------------------------------------------------------------------
 * THE TRADE BAND WAS IN THE WRONG TENSE ON EVERY RECAP CARD
 * ---------------------------------------------------------------------------
 *
 * `riskLines` and `rewardLines` describe an OFFER: what you will put up, what
 * you could take. That is right up to the final whistle and stops being right
 * the moment there is an answer. A settled card drew
 *
 *     RISK                REWARD
 *     ♥ 1 heart           From 1.5 gems a point
 *
 * over a scoreboard reading 28.0 to 16.2 with the week already gone — a heart
 * described as still riding when it had been kept, and a rate quoted as an
 * inducement to enter a contest nobody can enter. Both facts were knowable and
 * neither was drawn anywhere on the card.
 *
 * So the third band changes tense with the week. Same geometry, same two
 * columns, same fixed rows — `STAKED` and `EARNED` where `RISK` and `REWARD`
 * were, and past-tense values in them. THAT IS THE CARD'S FINISHED STATE, and
 * it is why the board no longer needs a bordered note underneath saying so:
 * a card written in the past tense is a card that has stopped asking for a
 * decision, which is the whole of what the note was there to explain.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES NOT REDERIVE
 * ---------------------------------------------------------------------------
 *
 * `result` is settlement's own — `contest_results`, through `my_contest_cards`
 * — for the reason at the top of this file: the median is not how every
 * contest is won and a second opinion here would be the exact divergence this
 * file exists to close. A NULL result is not a loss. A field too small to be a
 * contest never settles at all, and nothing moved either way.
 */
export type Settlement = {
  /** W, L, T — or null where the field was too small to be a contest. */
  result: Result | null;
  /**
   * What the CARDS in this entry were paid, summed.
   *
   * Not the prize: this is `award_score_gems` at 1.5 a point times each card's
   * tier multiplier, which every entry earns and which is the only payment a
   * free contest ever makes. Null until the payout has run — never a zero, for
   * the reason on `EntryLineup`.
   */
  gems: number | null;
};

/**
 * WHAT IT COST, now that the answer is known.
 *
 * The gems went at submission and do not come back, so they read exactly as
 * they did on the offer. The heart is the line that changes: `hearts_delta` is
 * `-hearts_at_risk` on a loss and nothing at all otherwise, which is the whole
 * of what settlement does to a run (see `20260825170000`).
 *
 * A NULL RESULT PASSES NO VERDICT, and this is the case to be careful about.
 * The band turns over when the WEEK is final, and `settle_run_hearts` runs
 * after that — so there is an interval where the games are done and nothing
 * has been decided, and a contest whose field was too small to score never
 * decides at all. Neither is a heart kept and neither is a heart lost, so
 * neither gets a word: the line reverts to the bare noun the offer carried,
 * and gains its verdict when there is one to gain.
 *
 * COLOURED IN BOTH DIRECTIONS, which is why `TradeLine` grew a second tone. A
 * kept heart is the good half of this receipt and the only place the card can
 * say so; a lost one is the whole reason a run ends, and it must not be drawn
 * in the same ink as the entry fee beside it.
 */
export function stakeLines(t: ContestTerms, s: Settlement): TradeLine[] {
  const lines: TradeLine[] = [];
  if (t.entryFeeGems > 0) lines.push({ text: `${t.entryFeeGems} gems` });
  if (t.heartsAtRisk > 0) {
    const noun = t.heartsAtRisk === 1 ? '1 heart' : `${t.heartsAtRisk} hearts`;
    if (s.result === 'L') lines.push({ text: `${noun} lost`, heart: true, tone: 'negative' });
    else if (s.result !== null) {
      lines.push({ text: `${noun} kept`, heart: true, tone: 'positive' });
    } else lines.push({ text: noun, heart: true });
  }
  if (lines.length === 0) lines.push({ text: 'Nothing' });
  return lines;
}

/**
 * WHAT CAME BACK, in the order of what a reader would be sorry to lose.
 *
 * Three things can be paid and the band has room for two, so the order is the
 * ranking and it is deliberate:
 *
 *   1. THE PRIZE, where there is one. It is specific to this contest, it is
 *      the largest figure on the card, and it is the thing entering was for.
 *   2. THE HEART, where the contest heals and the entry won. Hearts are the
 *      scarcest thing in the game and the only place they come from is here.
 *   3. THE CARD GEMS. The baseline every entry earns — and the one line that
 *      is restated in full directly underneath, one figure per row of the
 *      lineup, which is what makes it the safe one to drop.
 *
 * On the free contest, which is the contest every player is in, there is no
 * prize and usually no heal, so the card gems are the whole of it — and they
 * are the sum of the per-row figures below. That closure is the point: a
 * player can read the total on the card and then see which cards made it.
 *
 * THE QUALIFIER APPEARS ONLY WHEN IT IS NEEDED. With a prize on the line above
 * it, a bare "42 gems" would be a second unexplained sum next to a first one;
 * on its own there is nothing to tell it apart from, and the shorter string is
 * the one that cannot be clipped.
 *
 * AND "STILL SETTLING" IS NOT "NOTHING". `award_score_gems` runs after the
 * week completes, so there is a real interval — minutes, and longer if a
 * provider is slow — where the scores are final and nothing has been paid.
 * That is the state a player refreshing on a Tuesday morning is most likely to
 * catch, and reporting it as a week that earned nothing would be the worst
 * available lie.
 */
export function takeLines(
  t: ContestTerms,
  s: Settlement,
  prize: number | null = null,
): TradeLine[] {
  const lines: TradeLine[] = [];
  const paid = prize !== null && prize > 0;

  if (paid) lines.push({ text: `Won ${prize} gems`, tone: 'positive' });
  if (t.heartsOnWin > 0 && s.result === 'W') {
    lines.push({
      text: t.heartsOnWin === 1 ? '+1 heart' : `+${t.heartsOnWin} hearts`,
      heart: true,
      tone: 'positive',
    });
  }
  if (s.gems !== null && s.gems > 0) {
    lines.push({ text: paid ? `${s.gems} gems from cards` : `${s.gems} gems` });
  }

  if (lines.length === 0) lines.push({ text: s.gems === null ? 'Still settling' : 'Nothing' });
  return lines;
}
