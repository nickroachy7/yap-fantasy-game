/**
 * WHAT THE PLAYERS BOARD IS SHOWING: the order, and the narrowing.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------
 *
 * Players used to be three routes — Search, Trend and Top — under a section
 * nav. They were never three screens. All three read the same directory
 * through `useDirectoryBoard`, all three drew the same `PlayerRow` through
 * `PlayerList`, and by the end the only thing that distinguished them was one
 * sort key and one filter each:
 *
 *     Search  points descending, fixed        narrowed by a typed query
 *     Trend   week-over-week delta            narrowed by position, up/down
 *     Top     the market's consensus rank     narrowed by position
 *
 * The trend board had already admitted it. It found a handful of qualifying
 * movers in preseason and PADDED ITSELF OUT with every remaining player in the
 * directory sorted by season points — which is to say it was the whole pool
 * with a different first page, and said so in its own comments.
 *
 * Three routes for three sort keys cost a permanent strip of navigation above
 * every visit, and it made each board's narrowing unreachable from the other
 * two: you could not ask for "the receivers who play on Sunday, by value"
 * without picking which of three pages was least wrong to start from.
 *
 * So the ORDER became a control and the pages became one board. What each page
 * used to be is preserved exactly — `market` is Top, `trend` descending is
 * Trend's Up and ascending is its Down — because they were good answers, and
 * the board still OPENS on one of them rather than on an empty form. That is
 * the property `leaders.tsx` argued for and the thing a merge could most
 * easily have thrown away: a board answers before you touch it.
 *
 * ---------------------------------------------------------------------------
 * THE PURE HALF, DELIBERATELY
 * ---------------------------------------------------------------------------
 *
 * Nothing here imports React or Supabase. The board's editorial decisions —
 * which orders are offered, what each one measures, what a filter means —
 * are values and pure functions, so they can be read in one sitting and tested
 * without a renderer. The screen supplies the data and the state; this decides
 * what comes out.
 *
 * `search.tsx` builds its list through `buildBoard` too, on the same query
 * matcher, so the takeover and the board cannot drift into two ideas of what
 * "matches" means. It is the only caller that passes a query — see there.
 */
import type { PosFilter } from './PositionFilter';
import type { DirectoryPlayer } from './player-directory';

/* -------------------------------------------------------------------------- *
 * ORDER
 * -------------------------------------------------------------------------- */

/**
 * The orders the board offers, AND THE NUMBER EACH ONE PUTS ON THE ROW.
 *
 * ---------------------------------------------------------------------------
 * WHY THOSE ARE ONE DECISION AND NOT TWO
 * ---------------------------------------------------------------------------
 *
 * They were two. There was an ORDER control and, beside it, a LENS control
 * choosing what the figure column and the tray showed — Value, Rank, Form. It
 * lasted about an hour of looking at it, because the two lists were the same
 * list: Market rank was Rank, Season points and Points per game were Form,
 * Card value was Value. Two controls, one vocabulary, spelled differently.
 *
 * Worse than the duplication was the state it allowed. Ordering by card value
 * while the rows printed points per game gave a board sorted by a number it
 * would not show — the exact fault the old trend page confessed to in its own
 * comments and accepted because it had no way out. Splitting the controls made
 * that reachable in five of the six orders instead of one.
 *
 * So the order carries its own measure. Pick "Card value" and the list is
 * ordered by price AND the price is the number beside every name; pick
 * "Trending" and the row prints the change it is sorted by, which retires that
 * apology rather than inheriting it. One press, one coherent board, and the
 * second row of chrome is gone with the second control.
 *
 * WHAT IS NOT LOST, because it looks like it should be. The price stays visible
 * under every other measure: `RowFigure` draws a figure over a coin line, which
 * is the pair the collection row has always drawn. So "order by form, read the
 * price" — the one genuine reason to want the controls apart — is what the row
 * does anyway. See `figureFor`.
 *
 * ---------------------------------------------------------------------------
 * THE SIX
 * ---------------------------------------------------------------------------
 *
 * `market` and `trend` are two of the three PAGES this board used to be. The
 * other four are the columns the old directory table sorted by, which survived
 * the table's removal as a dead export and are live again.
 *
 * WHAT IS NOT HERE: position, team and college. All three are FILTERS — position
 * as chips, team in the facet menu, college matched by the search takeover — and
 * an order that duplicates a filter is a second way to do something the screen
 * already does.
 */
/**
 * The comparator a board is sorted by. Four, and they are not what the menu
 * shows — see `ORDERS`.
 */
export type BoardSort = 'market' | 'trend' | 'points' | 'perGame';

export type SortDir = 'asc' | 'desc';

/**
 * One reading of an order: a comparator, a direction, and what it puts on the
 * row.
 */
export type Variant = {
  /** Two words at most. It is a segment in a compact switch. */
  label: string;
  sort: BoardSort;
  dir: SortDir;
  /** The unit under the figure — `FP`, `PLACES`. It sits in a 52pt column. */
  unit: string;
};

export type OrderSpec = {
  label: string;
  /**
   * EXACTLY TWO, because the control beside the bar is a two-segment switch and
   * a third reading would have to become a menu of its own.
   */
  variants: [Variant, Variant];
  /**
   * True for the one order that cannot be answered from the directory alone.
   *
   * The screen reads this to decide whether to pay for the schedule and the two
   * weeks of stat lines a delta needs — see `index.tsx`. Without the flag every
   * visit to the board would fund a read that most visits never use.
   */
  needsMovers?: boolean;
};

/**
 * THREE ORDERS, EACH READ TWO WAYS.
 *
 * ===========================================================================
 * WHY THE SWITCH IS NOT A DIRECTION
 * ===========================================================================
 *
 * It was. There were six menu entries and a Best/Worst-style switch that
 * reversed whichever one was active, and two of the six — Season points and
 * Points per game — were mirror images of each other. Same three numbers on
 * the row (the total, the games, the rate), same detail line, same tray; the
 * only difference was which of the two was the headline and which was the sort
 * key. Two entries in a four-entry menu spent on one subject.
 *
 * The fix came from noticing what the switch was worth on those two. Nobody
 * ranks a fantasy board by FEWEST points — "Least" and its twin were dead
 * segments — so the control was sitting there, in the right place, doing
 * nothing. It now picks WHICH READING of the order you want, and a direction is
 * simply what that means for the two orders where reversing is useful:
 *
 *     Market rank   Best      Worst        the same measure, both ends
 *     Trending      Up        Down         the same measure, both ends
 *     Scoring       Total     Per game     two measures, both descending
 *
 * One row of controls, six boards, and nothing offered that nobody wants. A
 * reader picks the subject in the bar and the reading in the switch, which is
 * one decision split the way the decision actually splits.
 *
 * IT IS NOT INCONSISTENT THAT THE THIRD ROW CHANGES COMPARATOR. The switch has
 * one job everywhere — "which of this order's two readings" — and the fact that
 * two of them happen to be the same measure reversed is a property of those
 * measures, not a promise the control ever made.
 *
 * ===========================================================================
 * WHAT WAS CUT ALTOGETHER
 * ===========================================================================
 *
 * CARD VALUE, because of what this board IS: a directory of every FOOTBALLER
 * in the game, global and outside any one manager's holdings. A price is a fact
 * about the card economy, and ordering the whole league by what a bronze copy
 * fetches asks a question about the shop while claiming to ask one about the
 * sport. The price is still the FIGURE on the market board — where it belongs,
 * since the market's rank is a valuation — it is just not a subject of its own.
 *
 * NAME, because it is not a measure. Alphabetical order answers one question,
 * "is he in here, spelled like that", and the search takeover answers it better
 * with a keyboard, from the button beside the position chips.
 *
 * ALSO NOT HERE: position, team and college. All three are FILTERS — position
 * as chips, team in the facet menu, college matched by search — and an order
 * that duplicates a filter is a second way to do something the screen already
 * does.
 */
export const ORDERS: OrderSpec[] = [
  {
    label: 'Market rank',
    variants: [
      /* `Best` is ASCENDING, because rank 1 is the top. It leads anyway — the
         switch is ordered by what a reader wants first, not by the sign. */
      { label: 'Best', sort: 'market', dir: 'asc', unit: 'COINS' },
      { label: 'Worst', sort: 'market', dir: 'desc', unit: 'COINS' },
    ],
  },
  {
    label: 'Trending',
    needsMovers: true,
    variants: [
      /* PLACES, not points. The measure is the change in RANK across the two
         weeks — how many players he passed — because a points delta measures a
         man against himself while a board called Trending is about the field.
         See the head of `movers.ts`. */
      { label: 'Up', sort: 'trend', dir: 'desc', unit: 'PLACES' },
      { label: 'Down', sort: 'trend', dir: 'asc', unit: 'PLACES' },
    ],
  },
  {
    /* `Fantasy points`. It was `Season points` while the total was the only
       reading — a name that would have contradicted half its own switch once
       `Per game` sat beside it — and then `Scoring` for about an hour, which
       fixed the contradiction by naming a verb nobody uses for a noun. This
       names the unit both readings are in, which is the thing they share. */
    label: 'Fantasy points',
    variants: [
      { label: 'Total', sort: 'points', dir: 'desc', unit: 'FP' },
      /* A DIFFERENT COMPARATOR, NOT A REVERSAL, and the difference is the point
         of keeping it: a total rewards availability — sixteen quiet games
         out-score nine good ones — and a rate rewards the thing that decides a
         start. A man who missed half a season is buried on one board and near
         the top of the other, and both are true. */
      { label: 'Per game', sort: 'perGame', dir: 'desc', unit: 'FP/G' },
    ],
  },
];

/** The menu entry a comparator belongs to. */
export function orderOf(sort: BoardSort): OrderSpec {
  /* Non-null: every `BoardSort` appears in exactly one order above, and both
     are closed unions, so a miss is a compile error rather than a runtime one. */
  return ORDERS.find((o) => o.variants.some((v) => v.sort === sort))!;
}

/** The reading currently on screen. */
export function variantOf(sort: BoardSort, dir: SortDir): Variant {
  const order = orderOf(sort);
  return order.variants.find((v) => v.sort === sort && v.dir === dir) ?? order.variants[0];
}

/** What the bar reads out — the order alone. The switch says the reading. */
export function sortLabel(sort: BoardSort): string {
  return orderOf(sort).label;
}

/* -------------------------------------------------------------------------- *
 * NARROWING
 * -------------------------------------------------------------------------- */

/** Does he have a game this week? `idle` is a bye or a club with no fixture. */
export type Availability = 'all' | 'playing' | 'idle';

/** Whether anybody holds a copy. See `DirectoryPlayer.market`. */
export type Circulation = 'all' | 'owned' | 'unowned';

/**
 * Five facets, and the list is short on purpose.
 *
 * The collection board grew a full vocabulary of filter chips and then DELETED
 * it for going unused — see the note on `SORT_OPTIONS` in `collection/types.ts`
 * — so the bar every facet here had to clear is "does this change a decision
 * somebody actually makes":
 *
 *   position     which pool am I shopping in. Already chips, already earned.
 *   team         the depth-chart question. "Show me every Packer" is a real
 *                errand and the search takeover answers it only by accident,
 *                through a text match on the abbreviation.
 *   availability the only facet that decides a LINEUP: a player on bye cannot
 *                be started, however good the rest of the row looks.
 *   rookies      the collector's chase. `experience` is 0 for a rookie —
 *                see `parseExperience`.
 *   circulation  the facet no other app could have. In a collection game
 *                "nobody owns one of these yet" is a reason to open a pack,
 *                and "there are forty in circulation" is a reason not to.
 *
 * WHAT WAS CONSIDERED AND CUT: age, college and games played. Age and college
 * are matched by the search takeover's query and neither orders a decision on
 * its own; games played is a fact the row already prints.
 */
export type BoardFilters = {
  pos: PosFilter;
  /** Club abbreviation, uppercase. Null is every club. */
  team: string | null;
  availability: Availability;
  rookies: boolean;
  circulation: Circulation;
  /**
   * Free text over name, club and college.
   *
   * ALWAYS EMPTY ON THE BOARD ITSELF, and that is a decision rather than an
   * oversight. Search stayed a full-screen takeover when the three routes
   * merged: it is a tool you pick up with a name in mind and put down four
   * seconds later, and the case for giving it the whole screen — no chrome, no
   * chips, keyboard up on arrival — did not weaken just because its two
   * neighbours became sort keys. The cost is stated where it lands: a search
   * result cannot inherit the board's facets or its order.
   *
   * It lives in this type anyway so that ONE function narrows the pool. Two
   * implementations of "matches" is how the board and the takeover come to
   * disagree about whether a man exists.
   */
  query: string;
};

export const NO_FILTERS: BoardFilters = {
  pos: 'ALL',
  team: null,
  availability: 'all',
  rookies: false,
  circulation: 'all',
  query: '',
};

/**
 * How many facets are set, for the badge on the filter chip.
 *
 * Position is EXCLUDED because it has its own visible control: counting it
 * would put a "1" on the filter chip for a state the reader can already see
 * spelled out in the chip row beside it. The query is excluded for the same
 * reason — where it is set, it is the entire screen.
 */
export function activeFilterCount(f: BoardFilters): number {
  return (
    (f.team === null ? 0 : 1) +
    (f.availability === 'all' ? 0 : 1) +
    (f.rookies ? 1 : 0) +
    (f.circulation === 'all' ? 0 : 1)
  );
}

/** Diacritic-insensitive, case-insensitive. Moved here whole from the table. */
export function normaliseForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Name, club or college.
 *
 * College is matched at every width, including the ones where no column shows
 * it: "every Georgia receiver" is a real thing people look for, and typing it
 * is the only way to ask.
 */
function matchesQuery(p: DirectoryPlayer, q: string): boolean {
  if (!q) return true;
  return (
    normaliseForSearch(p.name).includes(q) ||
    normaliseForSearch(p.team ?? '').includes(q) ||
    normaliseForSearch(p.college ?? '').includes(q)
  );
}

/* -------------------------------------------------------------------------- *
 * BUILDING THE BOARD
 * -------------------------------------------------------------------------- */

export type BoardInput = {
  sort: BoardSort;
  dir: SortDir;
  filters: BoardFilters;
  /**
   * Week-over-week change by player id, for the `trend` sort. Null until the
   * reads land, and absent for the great majority of players — see below.
   */
  deltas: Map<string, number> | null;
  /** Does this club have a game this week? Only the availability facet asks. */
  playsThisWeek: (team: string | null) => boolean;
};

/**
 * Missing values sort LAST IN BOTH DIRECTIONS rather than flipping to the top
 * when you reverse. A blank is not a small number, and a board that opens with
 * forty em dashes has buried the thing you pressed for. Kept verbatim from the
 * directory table, where it was learned the hard way.
 */
function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

function valueFor(p: DirectoryPlayer, sort: BoardSort, deltas: Map<string, number> | null): number | null {
  switch (sort) {
    case 'market':
      return p.marketRank;
    case 'trend':
      /* PLACES GAINED between the two most recent completed weeks — see
         `computeMovers`, which ranks both weeks over one shared pool so the
         number counts players actually passed.
 
         ABSENT, NOT ZERO, and the distinction is the whole honesty of this
         board. A player who appears in only one of the two weeks is excluded,
         because a bye, an inactive and a stat line we have not swept yet are
         indistinguishable from here — so a plunge down the board against a man
         who was resting is a lie told confidently. Zero is a real answer and
         means he held his place; null sinks him to the bottom of both
         directions instead of putting him mid-table on a movement nobody
         measured. */
      return deltas?.get(p.playerId) ?? null;
    case 'points':
      return p.gamesPlayed > 0 ? p.seasonFp : null;
    case 'perGame':
      /* Per-game off zero games is 0/0, not 0. Ranking a man who has not played
         above one averaging 4.0 is the classic rate-stat bug. */
      return p.gamesPlayed > 0 ? p.fpPerGame : null;
  }
}

/**
 * The board: narrowed, then ordered.
 *
 * ONE PASS OVER ~1,000 ROWS held in memory, which is why the screen can afford
 * to call this on every keystroke and every chip press rather than paging the
 * server. The directory is read once per session and cached; see
 * `loadPlayerDirectory`.
 *
 * The rank the caller draws beside each name is the player's own `marketRank`,
 * NOT this list's ordinal. That reverses what stood here, and the reversal is
 * argued at `PlayerRow.rank`: an ordinal makes the left column a fact about the
 * page, so the same player carried three different numbers across three orders.
 */
export function buildBoard(players: DirectoryPlayer[], input: BoardInput): DirectoryPlayer[] {
  const { sort, dir, filters, deltas, playsThisWeek } = input;
  const q = normaliseForSearch(filters.query.trim());

  const narrowed = players.filter((p) => {
    if (filters.pos !== 'ALL' && (p.position ?? '').toUpperCase() !== filters.pos) return false;
    if (filters.team !== null && (p.team ?? '').toUpperCase() !== filters.team) return false;
    if (filters.availability !== 'all') {
      const plays = playsThisWeek(p.team);
      if (filters.availability === 'playing' ? !plays : plays) return false;
    }
    /* `experience === 0` is a rookie and `null` is a player the feed told us
       nothing about — which is not the same claim, so an unknown is excluded
       from a rookie filter rather than counted as one. */
    if (filters.rookies && p.experience !== 0) return false;
    if (filters.circulation !== 'all') {
      /* `market` is null when NOBODY holds a copy — which is a different state
         from holding zero of every tier, and the row already draws the two
         differently. See `PlayerCardMarket`. */
      const held = p.market !== null && p.market.copies > 0;
      if (filters.circulation === 'owned' ? !held : held) return false;
    }
    return matchesQuery(p, q);
  });

  return narrowed.sort((a, b) => {
    const r = compareNullable(valueFor(a, sort, deltas), valueFor(b, sort, deltas), dir);
    /* Name is the tiebreak everywhere. A preseason board has hundreds of
       players on exactly the same nothing, and an arbitrary order among them
       makes the list appear to reshuffle every time it re-renders. */
    return r !== 0 ? r : a.name.localeCompare(b.name);
  });
}
