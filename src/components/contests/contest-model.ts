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
export type WinCondition = 'median' | 'top_n' | 'top_pct' | 'target';

/**
 * How the pool is DIVIDED once the winners are known. Mirrors
 * `public.contest_payout_curve`.
 *
 * Deliberately independent of `WinCondition`, because the two answer different
 * questions and a lobby with any shape needs both. "Top third wins" is a
 * double-up when it pays `flat` and a tournament when it pays `steep`, and those
 * are different products sharing one rule for deciding who won.
 */
export type PayoutCurve = 'flat' | 'linear' | 'steep' | 'winner_take_all';

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
  entryFeeCoins: number;
  heartsAtRisk: number;
  heartsOnWin: number;
  winCondition: WinCondition;
  winRank: number | null;
  /** For `top_pct`: the share of the field that wins, as a whole percent. */
  winPct: number | null;
  /** For `target`: the score an entry has to reach. Known before kickoff. */
  targetPoints: number | null;
  /** How the pool is split among the winners. */
  payoutCurve: PayoutCurve;
  /**
   * COINS PER FANTASY POINT, BEFORE THE CARD'S TIER MULTIPLIER — the game's
   * baseline, and the same number on every contest in the lobby.
   *
   * It is a property of the game and not of the row, and it is carried on the
   * row anyway. That is the fix for how it used to read: the rate was printed
   * on the free contest alone (it was the only row with no pool to print
   * instead), so the one universal thing in the reward column looked like the
   * free contest's perk. Every row states it now, identically, which is what
   * makes it read as scenery rather than as a differentiator.
   *
   * Never hardcoded here. `score_rate()` is the server's own number, carried
   * down by `contest_lobby` and `my_contest_cards` so the app cannot advertise
   * a rate the payout does not use — see `20260901010000`.
   */
  scoreRate: number;
  /** Coins collected so far that will be paid back out. Grows with the field. */
  prizePool: number;
  /**
   * A MINTED weekly pot paid to the top finishers by rank, flat rather than
   * per-entrant. Nought on every contest funded by fees.
   *
   * It is a separate field from `prizePool` and not folded into it because the
   * two are different money answering to different rules: `prizePool` is a
   * share of what the ledger collected and moves as people enter, this is a
   * fixed figure the game puts up. The card happens to draw them in the same
   * place, which is a presentation decision and not a reason to merge them —
   * `contest_payouts` and `contest_podium_payouts` split them by different
   * rank rules and would disagree about a combined number.
   */
  podiumCoins: number;
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

  /* A TARGET IS THE ONLY CONDITION THAT DOES NOT MENTION THE FIELD, because it
     is the only one that does not depend on it. It also reads the same on the
     Tuesday a contest opens as on the Sunday it settles, which none of the
     others do. */
  if (t.winCondition === 'target' && t.targetPoints !== null) {
    return `Beat ${points(t.targetPoints)}`;
  }

  const places = payingPlaces(t);

  /* THE SHARE IS STATED AS PLACES ONCE THERE IS A FIELD TO COUNT. "Top 50%" is
     the rule and "Top 2 of 5 win" is the offer, and a player deciding whether
     to spend a heart is buying the second one. Before the field is playable
     there are no places to name, so the percentage stands alone. */
  if (t.winCondition === 'top_pct' && t.winPct !== null) {
    return places !== null && t.entrants >= MIN_ENTRANTS
      ? `Top ${places} of ${t.entrants} win`
      : `Top ${t.winPct}% win`;
  }

  if (t.winCondition === 'top_n' && t.winRank !== null) {
    /* "TOP 1 WIN" IS NOT A SENTENCE. One place is a different offer and reads
       as one: against a capped field of two it is a person, and otherwise it is
       first or nothing. The Duel is the first contest to pay a single place. */
    if (t.winRank === 1) {
      return t.maxEntrants === 2 ? 'Beat your opponent' : 'First place only';
    }
    return t.entrants > t.winRank
      ? `Top ${t.winRank} of ${t.entrants} win`
      : `Top ${t.winRank} win`;
  }
  return 'Beat the median';
}

/**
 * HOW MANY PLACES ACTUALLY PAY, or null where that is not knowable yet.
 *
 * The same arithmetic `contest_results` and `contest_payouts` use, deliberately
 * written out again rather than shipped down as a number. It is three lines, it
 * is pure, and having it here is what lets the lobby say "Top 2 of 5 win"
 * before anybody has scored a point — a server-computed field would only exist
 * after settlement, which is exactly when a player no longer needs it.
 *
 * FLOOR, MINIMUM ONE, matching `20260901040000` exactly. If these two ever
 * disagree the lobby advertises a cut the settlement does not honour, so the
 * rule is: change one, change both, and the SQL is the one that is right.
 *
 * Null under `median` and `target` — and that is not a gap. Neither has a fixed
 * number of places: a median contest pays however many beat the middle, and a
 * target pays however many clear it. Both are answered by the week, not in
 * advance.
 */
export function payingPlaces(
  t: Pick<ContestTerms, 'winCondition' | 'winRank' | 'winPct' | 'entrants'>,
): number | null {
  if (t.winCondition === 'top_n') return t.winRank;
  if (t.winCondition === 'top_pct' && t.winPct !== null) {
    return Math.max(1, Math.floor((t.entrants * t.winPct) / 100));
  }
  return null;
}

/** A score as the game writes them: one decimal, no trailing zero noise. */
function points(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
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
  t: Pick<ContestTerms, 'winCondition' | 'winRank' | 'winPct' | 'entrants'>,
  against: { median: number; cut: number | null; duel?: Duel | null },
): Opponent {
  /* A REAL PERSON BEATS EVERY DERIVED LINE. Where there is one there is nothing
     to derive: you are playing them, not the field they happen to sit in. */
  if (against.duel) {
    return { label: against.duel.handle, value: against.duel.points, shape: 'duel' };
  }

  /* THE TARGET ARRIVES IN `cut`, from `my_contest_cards`. It is the same kind of
     thing — the number this entry has to be above — so it uses the same channel
     and the band never learns a fourth shape. The one difference is that it is
     never null: a cut waits for the field to score and a target is set before
     the week opens, which is most of why the row exists. */
  if (t.winCondition === 'target') {
    return { label: 'THE TARGET', value: against.cut, shape: 'field' };
  }

  const places = payingPlaces(t);
  if (places !== null) {
    return { label: `THE CUT · ${ordinal(places)}`, value: against.cut, shape: 'field' };
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

/**
 * THE SAME DISTRIBUTION, IN THE FUTURE TENSE.
 *
 * `FieldWeek` says where a contest's entries HAVE got to; this says where they
 * are heading. Deliberately the same three numbers plus the same cut, so the
 * scoring band can be handed either one and does not learn which — `opponentOf`
 * takes a median and a cut and does not care whether they were played or
 * projected.
 *
 * IT IS ALL OR NOTHING, and that is enforced by the server (`20260903210000`).
 * A distribution computed over the four entrants who happen to have a forecast,
 * in a contest of twenty-four, is a number with the shape of a threshold and
 * none of the meaning. Either every entry in the field is forecast or this is
 * null.
 *
 * `mine` is the exception and sits on `Entry.projected` instead: your own
 * projected finish needs nobody else's lineup, so it survives a field this
 * cannot describe.
 */
export type Forecast = {
  low: number;
  median: number;
  high: number;
  /** The projected line to beat, taken at the place the real cut is taken. */
  cut: number | null;
  /** Where you would finish if every projection landed. */
  myRank: number | null;
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
 * twelve cards? twelve coins? twelve minutes? The noun costs six characters in a
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
 * What the WINNER takes, when the split has a top place to speak of.
 *
 * THE CURVE DECIDES, not the win condition. `contest_payouts` divides the pool
 * by a weight per place, and this is that arithmetic run for place one — the
 * same expressions, not the same constants, so the two cannot drift apart when
 * a row is re-tuned from `flat` to `steep`.
 *
 * Null under `median` and `target`, and that is not a gap. Both pay everybody
 * who cleared the line an equal share, so what one winner takes depends entirely
 * on how many others also cleared it — a number that does not exist until the
 * week is over. "Share of the pool" is the whole truth available in advance.
 *
 * Under `top_pct` it is knowable as soon as anybody has entered, because the
 * places come from the field size rather than from the scores.
 */
export function topPrize(t: ContestTerms): number | null {
  if (t.prizePool <= 0) return null;

  /* One place, everything. Nothing to divide and no field to know. */
  if (t.payoutCurve === 'winner_take_all') return t.prizePool;

  const places = payingPlaces(t);
  if (places === null || places < 1) return null;

  switch (t.payoutCurve) {
    /* Every winner takes the same, so the top prize is the only prize. This is
       what makes a double-up legible: `WIN 180` on a 100 coin entry IS the
       offer, not a ceiling somebody else reaches. */
    case 'flat':
      return Math.floor(t.prizePool / places);

    /* Weights run places..1 and sum to p(p+1)/2, so first place takes
       2 / (p + 1) of the pool. Top three is 3:2:1. */
    case 'linear':
      return Math.floor((t.prizePool * 2) / (places + 1));

    /* Weights are 1, 1/2 … 1/p, so first place takes 1/H(p). Top five is 44%. */
    case 'steep': {
      let harmonic = 0;
      for (let i = 1; i <= places; i += 1) harmonic += 1 / i;
      return Math.floor(t.prizePool / harmonic);
    }
  }
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
 *     ♥ 1 heart           From 1.5 coins a point
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
   * Not the prize: this is `award_score_coins` at 1.5 a point times each card's
   * tier multiplier, which every entry earns and which is the only payment a
   * free contest ever makes. Null until the payout has run — never a zero, for
   * the reason on `EntryLineup`.
   */
  coins: number | null;
};

/**
 * IS THIS WEEK OVER, and what did it do — from an entry, in one place.
 *
 * THREE SURFACES WERE COMPUTING THIS BY HAND: the carousel over the lineup, the
 * settled card in the lobby, and the contest's own page. The expression is
 * short enough to retype and that is exactly the danger — a card reading WON in
 * one place and FINAL in another is the divergence this file exists to close,
 * and it would have arrived through a copy that forgot half of the test.
 *
 * THE TEST IS `final` AND A REAL HIGH SCORE, and the second half is not
 * belt-and-braces. `score_week` stamps `scored_at` and writes `total_points = 0`
 * whether or not a ball has been thrown, so `final` alone puts a confident WON
 * or LOST on a week that has not started. The field's best score is the only
 * honest proof that anybody played.
 *
 * NULL IS "NOT SETTLED", which is a different card rather than a worse one —
 * see `Foot`, where a null keeps the row in the present tense.
 */
export function settlementOf(entry: {
  field: { final: boolean; high: number; result: Result | null };
  myCoins: number | null;
}): Settlement | null {
  if (!entry.field.final || entry.field.high <= 0) return null;
  return { result: entry.field.result, coins: entry.myCoins };
}

/* -------------------------------------------------------------- the tokens */

/**
 * One currency, one quantity — the foot's unit of meaning.
 *
 * ---------------------------------------------------------------------------
 * WHY THE FOOT STOPPED BEING SENTENCES
 * ---------------------------------------------------------------------------
 *
 * `riskLines` and `rewardLines` return strings, and a string is the wrong shape
 * the moment a stake has more than one part. "40 coins · 1 heart" against "Up to
 * 120 coins · +1 heart · 1 pack" is 48 characters of prose in a 317pt row that
 * also has to carry two labels and a divider, and it does not fit. It nearly
 * did not fit at two parts a side, which is why the old trade band was two
 * columns with a reserved blank row in each.
 *
 * A glyph plus a number is four characters where the sentence was seventeen, so
 * five of them fit on one line with room to spare. Every currency this game has
 * or is likely to grow already owns a mark — `coin`, `heartFull`, the four
 * `pack*` glyphs, `cardBadge`, the tier marks — so the vocabulary is drawn, not
 * invented.
 *
 * ---------------------------------------------------------------------------
 * THE UNIT WORD IS ELASTIC, AND THAT IS THE LITERACY FIX
 * ---------------------------------------------------------------------------
 *
 * A bare `◆ 40` asks the reader to already know the diamond means coins. On a
 * side carrying ONE token there is room for the word, so it is printed: `◆ 40
 * coins`, `♥ 1 heart`, `◆ 1.5 a point`. On a side carrying two or three there is
 * not, and it drops to bare numbers.
 *
 * The free contest — one risk, one reward — is the contest every new player
 * meets first and the one with the most room. So the card teaches the glyphs in
 * words before it ever asks anybody to read them cold. The card decides this
 * from the length of the list, not the model; see `TokenRow`.
 *
 * `unit` is therefore advisory. `value` must stand alone.
 */
export type Token = {
  /** Which mark is drawn. `none` is a word with no glyph — "nothing". */
  kind: 'coin' | 'heart' | 'pack' | 'none';
  /** The quantity as drawn: "40", "+1", "1.5", "kept", "lost", "nothing". */
  value: string;
  /** Names the unit. Printed only where the side has room — see above. */
  unit?: string;
  /**
   * Print the unit even on a crowded side.
   *
   * For a RATE and only a rate. `◆ 120` is a hundred and twenty coins whether
   * or not the word is there, but a bare `◆ 1.5` is a coin and a half — the
   * number stops meaning anything without "a point" beside it. So the rate
   * carries a short unit it never drops, and the model gives it the long form
   * only when it is alone and there is room.
   */
  keepUnit?: boolean;
  tone?: 'positive' | 'negative';
  /** A heart that was taken, so `Heart` draws it torn rather than whole. */
  killed?: boolean;
};

/**
 * WHOSE SCORE THE DASHED LINE IS, in two or three characters.
 *
 * The scoring band's right-hand column is a constant — `TO BEAT` — because the
 * win condition is the same idea in every format: there is a number, and you
 * have to be above it. What changes is where that number comes from, and that
 * is a chip rather than a label so the constant can stay constant.
 *
 * `COMMUNITY`, `THE CUT · 3RD` and a handle were three different words for one
 * thing, and none of them said "beat this".
 */
export function beatSource(
  t: Pick<ContestTerms, 'winCondition' | 'winRank' | 'winPct' | 'entrants'>,
  duel?: Duel | null,
): string {
  if (duel) return duel.handle.toUpperCase();
  if (t.winCondition === 'target') return 'TARGET';
  const places = payingPlaces(t);
  if (places !== null) return ordinal(places);
  return 'MEDIAN';
}

/** What you put up. Coins first, then hearts — the order the foot reads. */
export function riskTokens(t: ContestTerms): Token[] {
  const out: Token[] = [];
  if (t.entryFeeCoins > 0) out.push({ kind: 'coin', value: `${t.entryFeeCoins}`, unit: 'coins' });
  if (t.heartsAtRisk > 0) {
    out.push({
      kind: 'heart',
      value: `${t.heartsAtRisk}`,
      unit: t.heartsAtRisk === 1 ? 'heart' : 'hearts',
    });
  }
  if (out.length === 0) out.push({ kind: 'none', value: 'nothing' });
  return out;
}

/**
 * WHAT YOU WIN. One label on this side now — `WIN` — where it used to be a
 * modality that changed with the contest: `UP TO`, `SHARE`, `EARNS`, `PER PT`.
 *
 * THAT COSTS THE "UP TO", and it is worth naming rather than hiding. On a
 * `top_n` contest `topPrize` is the largest share anybody takes, so `WIN ◆120`
 * states a ceiling as though it were a promise. The contest's own page carries
 * the split, and the card is not the place to spell out a prize table — but if
 * this reads as over-claiming in the hand, the honest fix is the label, not the
 * number.
 *
 * A RATE IS NOT AN AMOUNT. The free contest pays per point, so its token is
 * `1.5` with `a point` as the unit — and because that side carries exactly one
 * token, the unit always prints. A bare `◆ 1.5` would read as a coin and a half.
 */
export function winTokens(t: ContestTerms, prize: number | null = null): Token[] {
  /* WON: what settlement actually paid. Ends the question. */
  if (prize !== null && prize > 0) {
    return [{ kind: 'coin', value: `${prize}`, unit: 'coins', tone: 'positive' }];
  }

  /* THE PRIZE POOL, AS A PLAIN NUMBER UNDER A LABEL THAT NAMES IT.
     -----------------------------------------------------------------------
     This column has now been wrong three ways and they were all the same
     mistake: trying to make the token say what KIND of number it is.

       `19`                  the winner's slice of an unfunded pool, which
                             read as a bad offer rather than an empty contest
       `share of the pool`   a word where the number goes, under a label
                             already saying WIN — so the card said "win share"
       `36 pool`             a number with a noun stuck to it, which is not
                             a phrase anybody writes

     The fix is not more words in the token. It is that the LABEL is where a
     noun belongs, and this band has always had one — `RISK` / `STAKED` on the
     left, `WIN` / `WON` on the right, changing with the state. So the label
     becomes `PRIZE POOL` and the token goes back to being what every other
     token here is: a quantity with its mark. See `winLabel`.

         PRIZE POOL  ◆ 240 coins

     which is the phrase daily fantasy has used for twenty years, and reads the
     same at nought as it does at nine hundred.

     NOUGHT IS PRINTED, NOT HIDDEN. An empty contest genuinely has no pool yet,
     `fillLine` beside it already says "Needs 2 entries", and the two lines
     agree. Replacing the nought with a word is what produced `share of the
     pool`: a phrase standing in for a number it could not supply.

     IT DOES NOT COUNT YOUR OWN UNPAID ENTRY. The pool is what the ledger
     collected (`20260826020000`); adding a fee nobody has paid would be the
     client inventing one. */
  if (t.entryFeeCoins > 0) {
    return [{ kind: 'coin', value: `${t.prizePool}`, unit: 'coins' }];
  }

  /* A MINTED PODIUM READS AS A POOL, because to the player it is one: a figure
     on the table that the best finishers take. The difference between it and a
     fee-funded pool is where the coin came from, which is the game's problem
     and not something the reward column should make the reader carry.

     It is FIXED rather than growing — 700 on the weekly contest, 100 on The
     Warm-Up — so unlike the pool above it says the same number all week. */
  if (t.podiumCoins > 0) {
    return [{ kind: 'coin', value: `${t.podiumCoins}`, unit: 'coins' }];
  }

  /* The free weekly contest: no fee, so no pool, and
     `contests_free_pays_no_prize` means there can never be one. What you win is
     the W — `median_record` scores every week against the field's middle, and
     that record is the season. A word, not a quantity. */
  return [{ kind: 'none', value: 'Season record' }];
}

/**
 * THE NOUN FOR THE RIGHT-HAND SIDE, which is where a noun belongs.
 *
 * The band's labels have always been state-dependent — `RISK` becomes `STAKED`
 * once a week is settled — so this is the existing mechanism doing one more job
 * rather than a new one. It exists because `winTokens` kept trying to name its
 * own number; see the note there.
 *
 * `PRIZE POOL` only where there IS a pool to name. The free contest wins you a
 * place in the season record, and calling that a prize pool would be the card
 * inventing an economy the free contest is constitutionally barred from having.
 */
export function winLabel(t: ContestTerms, settled: boolean): string {
  if (settled) return 'WON';
  return t.entryFeeCoins > 0 || t.podiumCoins > 0 ? 'PRIZE POOL' : 'WIN';
}

/**
 * The same left-hand side once the week is over. `STAKED`, not `RISK`.
 *
 * THE HEART IS THE ONLY THING THAT CHANGES SHAPE. A fee is a fee whether you
 * won or lost, so it keeps its number; a heart either came back or did not, and
 * "1" is no longer the interesting part of it. `killed` is what makes `Heart`
 * draw the torn glyph — the same one the rack under the carousel uses — so the
 * mark and the word beside it cannot disagree.
 */
export function stakedTokens(t: ContestTerms, s: Settlement): Token[] {
  const out: Token[] = [];
  if (t.entryFeeCoins > 0) out.push({ kind: 'coin', value: `${t.entryFeeCoins}`, unit: 'coins' });
  if (t.heartsAtRisk > 0) {
    const lost = s.result === 'L';
    out.push({
      kind: 'heart',
      value: s.result === null ? `${t.heartsAtRisk}` : lost ? 'lost' : 'kept',
      tone: s.result === null ? undefined : lost ? 'negative' : 'positive',
      killed: lost,
    });
  }
  if (out.length === 0) out.push({ kind: 'none', value: 'nothing' });
  return out;
}

/**
 * What the week actually paid. `WON`, in the past tense, and no promises left.
 *
 * `s.coins` IS A SEPARATE PAYMENT FROM `prize`. The pool pays the winners; the
 * cards pay everybody by the point. A week can produce both, one, or neither,
 * and a settled contest that produced neither says so rather than drawing an
 * empty side — a blank there reads as still loading, which is the one state
 * this side must not be confused with. `Still settling` is that state and it is
 * distinct: `s.coins` is null until the payout cron has stamped the slots.
 */
export function wonTokens(
  t: ContestTerms,
  s: Settlement,
  prize: number | null = null,
): Token[] {
  const out: Token[] = [];
  const paid = prize !== null && prize > 0;

  if (paid) out.push({ kind: 'coin', value: `${prize}`, unit: 'coins', tone: 'positive' });
  if (t.heartsOnWin > 0 && s.result === 'W') {
    out.push({
      kind: 'heart',
      value: `+${t.heartsOnWin}`,
      unit: t.heartsOnWin === 1 ? 'heart' : 'hearts',
      tone: 'positive',
    });
  }
  if (s.coins !== null && s.coins > 0) {
    out.push({ kind: 'coin', value: `${s.coins}`, unit: paid ? 'from cards' : 'coins' });
  }

  if (out.length === 0) {
    out.push({ kind: 'none', value: s.coins === null ? 'still settling' : 'nothing' });
  }
  return out;
}
