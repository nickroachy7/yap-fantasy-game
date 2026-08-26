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
 */
export function winLine(t: ContestTerms): string {
  if (t.winCondition === 'top_n' && t.winRank !== null) {
    return t.entrants > t.winRank
      ? `Top ${t.winRank} of ${t.entrants} win`
      : `Top ${t.winRank} win`;
  }
  return 'Beat the median';
}

/**
 * The mark the bar should draw, which is NOT always the median.
 *
 * THE BUG THIS REPLACES: the card drew the median on every contest and labelled
 * it, including on a `top_n` contest where the median decides nothing. A player
 * could sit comfortably above the middle of a field that pays three and be
 * sixth — reading a threshold that could not win them anything, in the one
 * place they would look to find out whether they were winning.
 *
 * Under `top_n` the line is the CUT: the lowest score still inside the paying
 * places, computed by `my_contest_cards`. It is null until enough of the field
 * has scored to have one, which is the same condition the median has.
 */
export function markOf(
  t: Pick<ContestTerms, 'winCondition' | 'winRank'>,
  field: { median: number; cut: number | null },
): { value: number | null; label: string } {
  if (t.winCondition === 'top_n' && t.winRank !== null) {
    return { value: field.cut, label: ordinal(t.winRank).toUpperCase() };
  }
  return { value: field.median, label: 'MEDIAN' };
}

const ORDINALS = ['0TH', '1ST', '2ND', '3RD'] as const;

function ordinal(n: number): string {
  if (n > 0 && n < ORDINALS.length) return ORDINALS[n];
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/* ----------------------------------------------------------------- seats */

/**
 * How full it is.
 *
 * `max_entrants` is nullable and is null on every contest that exists — a cap
 * on a four-tester beta is a way to discover the lobby is empty rather than
 * full (`20260825050000`). So this degrades to a bare count rather than
 * inventing a denominator, and says nothing at all when nobody has entered:
 * "0 in" is a fact that makes a contest look dead when it is merely early.
 */
export function seatsLine(t: ContestTerms): string | null {
  if (t.maxEntrants != null) return `${t.entrants} of ${t.maxEntrants} in`;
  if (t.entrants > 0) return `${t.entrants} in`;
  return null;
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
export type TradeLine = { text: string; heart?: boolean; tone?: 'positive' };

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
     this app does not sell them. */
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
          : 'Gem pool, once entries start',
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
