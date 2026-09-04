/**
 * The contests you are IN this week, each with its own field.
 *
 * One row per card in the carousel, in the order the carousel draws them: the
 * free contest first, because it is the one nobody chose to be in and the one
 * with the season riding on it.
 *
 * The `field` here is deliberately NOT `median_record`'s. That function is
 * free-contest-only and must stay that way — the season's opponent cannot move
 * when somebody opens a side contest — so `my_contest_cards()` computes a
 * distribution per contest instead. Same shape, different question. See
 * `20260825070000`.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useLoader, type Load } from '@/hooks/use-loader';
import { sessionCache } from '@/lib/session-cache';
import { supabase } from '@/lib/supabase';
import type { FieldWeek } from '@/components/lineup/field';
import type { ContestTerms, Forecast, PayoutCurve, WinCondition } from './contest-model';

export type MyContest = {
  id: string;
  code: string;
  kind: 'free' | 'lobby' | 'friendly';
  name: string;
  formatCode: string;
  formatName: string;
  slotCount: number;
  entryFeeCoins: number;
  /**
   * Null while the entry is being COMPOSED — the contest is chosen and no
   * lineup exists yet, because the fee is taken by the first submission.
   * The board reads it to know whether it is entering or editing.
   */
  lineupId: string | null;
  /** Slots occupied, not whether the lineup is legal. */
  filled: number;
  /** This contest's own distribution, shaped for `ContestCard`. */
  field: FieldWeek;

  /**
   * HOW THIS CONTEST IS WON, which the card had no way of knowing.
   *
   * It drew the median as its mark on every contest, including `top_n` ones
   * where the median decides nothing — a player above the middle of a field
   * that pays three could be sixth and read it as winning. `cut` is the line
   * that actually matters there: the lowest score still inside the paying
   * places. Null under `median`, where the median IS the line, and null under
   * `top_n` until enough of the field has scored to have one.
   */
  winCondition: WinCondition;
  winRank: number | null;
  /** For `top_pct`: the share of the field that wins, as a whole percent. */
  winPct: number | null;
  /** For `target`: the score to beat. Arrives in `cut` as well — see below. */
  targetPoints: number | null;
  /** How the pool is divided among the winners. */
  payoutCurve: PayoutCurve;
  /** Coins per fantasy point. The game's baseline, identical on every row. */
  scoreRate: number;
  /**
   * THE NUMBER TO BEAT, whatever produces it.
   *
   * The lowest score still inside the paying places under `top_n` and
   * `top_pct`, and the TARGET itself under `target` — the server puts all three
   * in this one column (`20260901040000`) precisely so the scoreboard draws you
   * against a number without learning which kind it is.
   */
  cut: number | null;

  /** Coins collected by this contest that will be paid back out. */
  prizePool: number;
  podiumCoins: number;
  /**
   * This contest belongs to a week the board has already moved past, and is
   * being shown so the result does not vanish the moment the slate rolls.
   *
   * NOT EDITABLE, and the board must branch on it: the lineup underneath the
   * carousel is the CURRENT week's, so drawing the editor under a card from
   * last week would put a finished contest's standing over a different week's
   * slots — the exact mismatch the carousel exists to prevent. See
   * `20260830030000` for the window, which is "until there is new football"
   * rather than a duration.
   */
  recap: boolean;
  /**
   * WHICH WEEK THIS CONTEST BELONGS TO, in four characters or so.
   *
   * Needed because a lobby contest is named after its FORMAT, so the carousel
   * can hold two cards both titled "Flex Three" — this week's, which you enter,
   * and last week's, which you read — with nothing on either saying which is
   * which. Swiping between them was the reported confusion, and the fix has to
   * sit next to the name, because the name is what makes them look identical.
   */
  weekLabel: string;
  /** The same week set as a phrase, for a line rather than a chip. See `weekTitleOf`. */
  weekTitle: string;
  /**
   * What YOU are owed out of it — null until the week is final and the places
   * are decided.
   *
   * Deliberately not a running "you would win 60". That is a projection, and
   * the same rule that keeps `PROJ` a dash on every card in this app applies
   * with more force to a number denominated in coins.
   */
  myPrize: number | null;
  /**
   * WHAT THE CARDS IN THIS ENTRY WERE PAID, summed — `award_score_coins` at 1.5
   * a point times each card's tier multiplier, plus any position bonus.
   *
   * A different payment from `myPrize` and, on the free contest, the only one
   * there is: a contest with no fee has no pool, so nothing can be redistributed
   * out of it, and what a free entry actually earns is this. The settled card's
   * EARNED column would otherwise be empty on the one contest every player is in.
   *
   * NULL UNTIL THE PAYOUT HAS RUN, never zero. A week is final for a while
   * before `award_score_coins` reaches it, and a nought drawn in that window
   * reports a week as having earned nothing at the moment a player is looking to
   * find out what it earned. See `wonTokens`.
   */
  myCoins: number | null;

  /**
   * WHERE YOUR ENTRY IS HEADING — what the slots have banked, plus the
   * provider's projection for every player who has not kicked off yet.
   *
   * `20260903210000` computes it, and the arithmetic is deliberately the one
   * that CONVERGES: pre-game it is a pure projection, on a Sunday it is what has
   * happened plus what is still expected, and once the week is final it equals
   * `field.myPoints` exactly, because nothing is left to project. That is what
   * makes it safe to draw beside a real score.
   *
   * NULL IS A WEEK NOBODY FORECAST, which today means the whole preseason — the
   * provider publishes projections for the regular season only. The card draws
   * the dash it drew for its entire life before this.
   */
  myProjected: number | null;
  /**
   * The same for the rest of the field, as a distribution.
   *
   * NULL UNLESS EVERY ENTRY IN THE CONTEST IS FORECAST — the server refuses to
   * publish half a distribution, because a cut taken over the four entrants who
   * happen to have projections, in a field of twenty-four, is a number shaped
   * like a threshold that means nothing. See `Forecast`.
   */
  projField: Forecast | null;
};

type Row = {
  win_condition: WinCondition;
  win_rank: number | null;
  win_pct: number | string | null;
  target_points: number | string | null;
  payout_curve: PayoutCurve;
  score_rate: number | string | null;
  cut: number | string | null;
  prize_pool: number | string | null;
  podium_coins: number | string | null;
  my_prize: number | string | null;
  /* OPTIONAL, and that is the point: `20260831040000` adds this column and CI
     ships JS without running `db push`, so the update can land on a database
     that does not send it yet. Absent reads as null, which is the same "still
     settling" the real pre-payout state draws. */
  my_coins?: number | string | null;
  /* OPTIONAL for the same reason `my_coins` is: CI publishes JS without running
     `db push`, so this update has to survive landing on a database where
     `20260903210000` has not been applied. Absent reads as null, which is the
     "this week is not forecast" state the card already knows how to draw. */
  my_projected?: number | string | null;
  proj_low?: number | string | null;
  proj_median?: number | string | null;
  proj_high?: number | string | null;
  proj_cut?: number | string | null;
  proj_rank?: number | string | null;
  recap: boolean | null;
  contest_id: string;
  code: string;
  kind: 'free' | 'lobby' | 'friendly';
  name: string;
  format_code: string;
  format_name: string;
  slot_count: number;
  entry_fee_coins: number;
  season_type: number;
  week: number;
  lineup_id: string | null;
  filled: number;
  entrants: number | string;
  low: number | string | null;
  median: number | string | null;
  average: number | string | null;
  high: number | string | null;
  final: boolean | null;
  my_points: number | string | null;
  my_rank: number | string | null;
  ahead: number | string | null;
  result: string | null;
};

/**
 * The week, short enough for a chip in the card's head.
 *
 * `season_type` is the NFL's own: 1 preseason, 2 regular, 3 post. Abbreviated
 * rather than spelled out because this sits in a 20pt row beside a contest name
 * that must not be truncated to make room for it.
 */
function weekLabelOf(seasonType: number, week: number): string {
  if (seasonType === 1) return `PRE ${week}`;
  if (seasonType === 3) return `PLAYOFF ${week}`;
  return `WEEK ${week}`;
}

/**
 * The same week, set as a phrase rather than as a chip.
 *
 * TWO FORMS BECAUSE THERE ARE TWO VOICES. `weekLabelOf` is cut for the card's
 * head — capitals, abbreviated, sitting in a 20pt row beside a contest name it
 * must not crowd, which is the app's voice for a stamped fact. This one is read
 * as words: it sits on the lineup rail beside a back arrow, in a line a person
 * reads rather than scans, and `WEEK 1` there is a heading shouting inside a
 * sentence.
 *
 * Spelled out for the same reason. `PRE 4` is fine as a stamp next to a contest
 * that says what it is; standing alone as the only thing naming the week the
 * board is on, it should say the word.
 */
export function weekTitleOf(seasonType: number, week: number): string {
  if (seasonType === 1) return `Preseason ${week}`;
  if (seasonType === 3) return `Playoff ${week}`;
  return `Week ${week}`;
}

/**
 * numeric(10,2) and bigint both arrive as strings depending on how the driver
 * renders them, and a string here silently breaks every comparison the card
 * makes — the same trap `parseFieldWeeks` documents.
 */
const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

export type MyContestsState = {
  contests: MyContest[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};
/** One entry row, in the shape the carousel and the shelves read. Lifted out of
    the hook so the cache below and the hook share one mapping. */
function rowsToMine(rows: Row[]): MyContest[] {
  return rows.map((r) => ({
    id: r.contest_id,
    code: r.code,
    kind: r.kind,
    name: r.name,
    formatCode: r.format_code,
    formatName: r.format_name,
    slotCount: Number(r.slot_count),
    entryFeeCoins: r.entry_fee_coins,
    weekLabel: weekLabelOf(Number(r.season_type), Number(r.week)),
    weekTitle: weekTitleOf(Number(r.season_type), Number(r.week)),
    lineupId: r.lineup_id,
    filled: Number(r.filled ?? 0),
    field: {
      week: Number(r.week),
      entrants: Number(r.entrants ?? 0),
      low: num(r.low) ?? 0,
      median: num(r.median) ?? 0,
      average: num(r.average) ?? 0,
      high: num(r.high) ?? 0,
      final: Boolean(r.final),
      myPoints: num(r.my_points),
      myRank: num(r.my_rank),
      ahead: num(r.ahead),
      result: (r.result as FieldWeek['result']) ?? null,
    },
    winCondition: r.win_condition,
    winRank: r.win_rank === null || r.win_rank === undefined ? null : Number(r.win_rank),
    winPct: num(r.win_pct),
    targetPoints: num(r.target_points),
    payoutCurve: r.payout_curve ?? 'flat',
    scoreRate: num(r.score_rate) ?? 0,
    cut: num(r.cut),
    prizePool: num(r.prize_pool) ?? 0,
    podiumCoins: num(r.podium_coins) ?? 0,
    myPrize: num(r.my_prize),
    /* Absent on an install talking to a database without
       `20260831040000`, which `num` reads as null — the same "still
       settling" line the real pre-payout state draws, which is the right
       thing for both. */
    myCoins: num(r.my_coins),
    myProjected: num(r.my_projected),
    /* ALL FIVE OR NONE. The server nulls them together — a field is either
       wholly forecast or not forecast at all — and this reads them the same
       way, so a partially-migrated server cannot produce a distribution with a
       hole in it. `cut` and `myRank` are legitimately null INSIDE a forecast:
       a median contest has no cut, and neither does a field of one. */
    projField:
      r.proj_low === null || r.proj_low === undefined
        ? null
        : {
            low: Number(r.proj_low),
            median: num(r.proj_median) ?? 0,
            high: num(r.proj_high) ?? 0,
            cut: num(r.proj_cut),
            myRank: num(r.proj_rank),
          },
    recap: Boolean(r.recap),
  }));
}

/**
 * YOUR ENTRIES, HELD BETWEEN VISITS — the same problem `lobbyCache` solves, on
 * the other half of the sheet. `LobbyView` unmounts when a contest opens over
 * it, so Entered and Recent came back empty and refilled from the network.
 *
 * Keyed by the contest being COMPOSED (`includeCode`), because that argument
 * changes what the RPC returns; two different codes are two different answers
 * and must not share a slot.
 *
 * Seeded to be shown, invalidated before every read so it is never stale — see
 * `lobbyCache` for why `read` alone is not enough.
 */
const mineCache = sessionCache<string, MyContest[]>(async (key) => {
  const { data, error } = await supabase.rpc('my_contest_cards', {
    p_include: key === '' ? undefined : key,
  });
  if (error) throw new Error(error.message);
  return rowsToMine((data ?? []) as Row[]);
});

/** Forget every entry list. Registered in `forgetUserData`: these are yours. */
export function invalidateMyContests(): void {
  mineCache.invalidate();
}



export function useMyContests(includeCode?: string): MyContestsState {
  /* Seeded from memory so the shelves come back drawn — see `mineCache`. */
  const [contests, setContests] = useState<MyContest[] | null>(
    () => mineCache.peek(includeCode ?? '') ?? null,
  );

  const load = useCallback<Load>(async (live) => {
    const key = includeCode ?? '';
    mineCache.invalidate(key);
    try {
      const rows = await mineCache.read(key);
      if (!live()) return null;
      setContests(rows);
    } catch (err) {
      if (!live()) return null;
      return err instanceof Error ? err.message : 'Could not load your contests.';
    }
    return null;
  }, [includeCode]);

  const { loading, error, reload } = useLoader(load);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { contests, loading, error, reload };
}

/**
 * An entry, as the terms every surface describes it from. See
 * `termsOfContest` — same reason, other read.
 *
 * `entrants` comes off the FIELD here rather than off a count, because that is
 * the number this read actually has and the number the card is placing you
 * inside. `maxEntrants` is deliberately absent: a card over a lineup you have
 * already filed has no use for how many seats are left.
 */
export function termsOfEntry(c: MyContest): ContestTerms {
  return {
    formatName: c.formatName,
    slotCount: c.slotCount,
    entryFeeCoins: c.entryFeeCoins,
    winCondition: c.winCondition,
    winRank: c.winRank,
    winPct: c.winPct,
    targetPoints: c.targetPoints,
    payoutCurve: c.payoutCurve,
    scoreRate: c.scoreRate,
    prizePool: c.prizePool,
    podiumCoins: c.podiumCoins,
    entrants: c.field.entrants,
    maxEntrants: null,
  };
}
