/**
 * The five boards that are not points.
 *
 * `board.ts` next door is the POINTS board and stays that way: it has a shape
 * nothing else here has — a week scope, per-week movement, a row that expands
 * into a week-by-week breakdown — all of it bought with one RPC call per scored
 * week. None of that generalises, and trying to make it generalise is how a
 * screen ends up with one abstraction that fits nothing.
 *
 * So this file is the OTHER shape: a flat ranked table, one RPC call, no scope
 * and no expansion. Five boards fit it exactly.
 *
 * WHAT A BOARD IS HERE
 *
 * A board is a fetch plus a column list. The fetch returns the RPC's rows
 * untouched (bar normalising numbers — see below); the column list turns one
 * row into cells. Columns and cells are built from the same spec array by
 * `buildBoard`, because the classic failure of a hand-built table is a header
 * that has drifted one column out of step with its body.
 *
 * WHY THE NUMBERS ARE ALL RE-COERCED
 *
 * Every one of these RPCs returns `bigint` and `numeric` columns, and both can
 * arrive as STRINGS depending on how the driver renders them — the generated
 * types say `number` and are describing the SQL type, not the wire. A string
 * here does not throw, it sorts wrong and formats wrong ("12" + 1 = "121"), so
 * every field goes through `num()` on the way in. `board.ts` learned this the
 * same way.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No client-side sorting. Each RPC ranks in SQL and returns `rank`, so the
 * order on screen is the order the database computed and the number in the rank
 * column is that computation's own answer — not a position in an array that
 * happens to agree with it today.
 */
import { positionColors } from '@/constants/positions';
import { Colors, getTierTheme, selectionAccent, type CardTier } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/** Same ceiling and same reason as the points board. */
export const BOARD_LIMIT = 500;

export type CommunityBoardId = 'record' | 'collection' | 'cards' | 'sets';

/**
 * Every board on the screen, points included.
 *
 * `CommunityBoardId` is the five that share `fetchCommunityBoard`; this is the
 * six the READER sees. They were separate lists with separate metadata, which
 * is how the points board ended up as the only one with no title and no line
 * saying what it ranks — the tabs were built from one list and the headings
 * from the other, so adding a board to the first did not oblige anyone to
 * describe it in the second.
 */
export type BoardId = 'points' | CommunityBoardId;

/** The board ids in tab order, points excluded — it is not one of these. */
export const COMMUNITY_BOARD_IDS: CommunityBoardId[] = [
  'record',
  'collection',
  'cards',
  'sets',
];

/** Tab order. Points first: it is the board the screen opens on. */
export const BOARD_IDS: BoardId[] = ['points', ...COMMUNITY_BOARD_IDS];

/* ------------------------------------------------------------------ rows */

export type RecordEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  wins: number;
  losses: number;
  ties: number;
  weeks: number;
  win_pct: number;
  points: number;
};

export type CollectionEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  value_coins: number;
  held: number;
  /** Copies committed to sets: still counted, frozen at the tier they went in at. */
  in_sets: number;
  players: number;
  /** One count per tier. They sum to `held` — see the migration. */
  bronze: number;
  silver: number;
  gold: number;
  diamond: number;
  career_fp: number;
};

export type CardEntry = {
  rank: number;
  card_instance_id: string;
  user_id: string;
  display_name: string;
  player_id: string;
  player_name: string;
  position_abbreviation: string | null;
  team_abbreviation: string | null;
  tier: CardTier;
  career_fp: number;
  lineup_starts: number;
  /** Null when the copy has never started — no rate, which is not a rate of 0. */
  fp_per_start: number | null;
};

export type SetsEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  rungs: number;
  sets: number;
  completed: number;
  dailies: number;
  burned: number;
  coins: number;
};

/**
 * A board's rows, tagged with which board they are.
 *
 * A tagged union rather than five pieces of state, so the screen holds exactly
 * one board's data at a time and `buildBoard` narrows on the tag instead of
 * casting. The tag is also what makes a stale response detectable: rows that
 * arrive for a board you have already switched away from are discarded on
 * identity, not on a guess about their shape.
 */
export type CommunityData =
  | { id: 'record'; rows: RecordEntry[] }
  | { id: 'collection'; rows: CollectionEntry[] }
  | { id: 'cards'; rows: CardEntry[] }
  | { id: 'sets'; rows: SetsEntry[] };

/* --------------------------------------------------------------- built row */

/**
 * One number on a row's third line, with the unit that says what it is.
 *
 * THE LINE IS NOT A SENTENCE, and that is the whole point of this type. It was
 * one — `14 starts · 84.9 per start` — and set in a single tertiary grey it
 * read as a caption rather than as data: nothing on it was heavier than
 * anything else, so there was nothing for the eye to land on. The lineup row
 * next door has had the answer all along in `B 0.0 TFP 0/200 to Silver Tier`:
 * the VALUE reads at body weight in the secondary ink and the UNIT sits under
 * it in 9pt caps, so a glance down the column finds the numbers and the words
 * stay out of the way.
 *
 * Units are uppercased by the builders, never by the row: `TFP` and `Per start`
 * would otherwise be two different treatments of the same slot.
 */
export type DetailPart = {
  key: string;
  /** The figure. Tabular, secondary ink. */
  value: string;
  /** Its unit — `TFP`, `GS`, `CARDS`. 9pt caps, tertiary ink. */
  unit?: string;
  /**
   * Overrides the figure's ink where the figure carries a CATEGORY.
   *
   * The same rule the rest of the app follows: colour is the second signal and
   * never the only one. A green `2` is always followed by the word `W`, a gold
   * `790` by `COINS` — so the line survives greyscale and a red/green reader
   * loses nothing. Do not colour a figure whose unit does not already name it.
   */
  accent?: string;
};

/**
 * One entry, in the shape `BoardRow` draws: three lines and a figure.
 *
 * Every board fills the same fields, so the row component never asks which
 * board it is drawing. Where a board has nothing to say on a line it says
 * nothing — the line stays empty and the box keeps its height, so the rows
 * still form a column.
 */
export type BoardRowModel = {
  key: string;
  rank: number;
  /** Whose row it is. Drives the "you" tint and the panel above the list. */
  userId: string;
  /** Line 1: the ranked thing — a manager, or on the cards board a player. */
  name: string;
  /** Line 1, after the name, in its own colour. The cards board's position. */
  accentToken?: { text: string; color: string };
  /** Line 1, last and quietest. The cards board's club. */
  mutedToken?: string;

  /**
   * Line 3, leading it — the slot the lineup row gives its tier letter.
   *
   * The CARDS board puts the copy's own tier here, and it is the only board
   * that does. Four manager boards used to lead this line with the best tier
   * their owner held, and it read as the same letter in front of every row of
   * every board — see `buildBoard`.
   */
  tier?: CardTier;
  /** Leads line 3 with the coin glyph, where the line is about currency. */
  coin?: boolean;
  /** Line 3: everything that used to be a dropped column, as value/unit pairs. */
  detail: DetailPart[];
  /**
   * Line 3's tail — a phrase rather than a figure, set apart by a wider gap.
   * The lineup row's `0/200 to Silver Tier` occupies exactly this slot.
   */
  note?: string;
  /** Line 1, beside the rank. Only the points board has movement. */
  movement?: { places: number | null; known: boolean };
  /** The right column: the one number this board ranks by, and its unit. */
  figure: string;
  figureLabel: string;
  /**
   * The figure as a NUMBER, which is the only form a gap can be computed from.
   *
   * `figure` is already formatted — thousands-separated, or a win rate written
   * `.625` with the leading zero dropped — and parsing it back would be reading
   * a presentation to recover the fact it was made from.
   */
  value: number;
};

/**
 * How a board's rows are built.
 *
 * `scheme` is here for one reason: the cards board colours a position and a
 * tier, and both palettes are resolved per colour scheme. It is passed in
 * rather than read from a hook because this is a pure module.
 *
 * THERE IS NO `wide`. The column tables needed it — half their columns were
 * dropped on a phone — and rows of stacked lines do not: the same three lines
 * fit at every width, so every reader sees every number.
 */
type BuildOptions = {
  scheme: 'light' | 'dark';
};

/* ------------------------------------------------------------- formatting */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Null-tolerant: a numeric column that is genuinely absent stays absent. */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const oneDp = (n: number) => n.toFixed(1);

/** Whole numbers, thousands-separated: a collection can run to five figures. */
const whole = (n: number) => Math.round(n).toLocaleString();

/**
 * ".625" rather than "0.625" or "62.5%".
 *
 * The leading zero is what every league table drops. It was doing that to save
 * column width; the rows have no columns any more, and it stays because it is
 * simply how a win rate is written.
 */
const rate = (n: number) => n.toFixed(3).replace(/^0/, '');

/* ---------------------------------------------------------------- metadata */

export type BoardMeta = {
  /** Tab label. Two words at most — six of these share the strip. */
  label: string;
  /** Panel title, where there is room to be plainer. */
  title: string;
  /** Shown instead of the table when nobody qualifies yet. */
  emptyTitle: string;
  emptyBody: string;
  /** Shown in the "where you stand" panel when the caller has no row. */
  absent: string;
  /** Screen-reader phrasing for the headline value, e.g. "42.5 points". */
  unit: string;
  /**
   * Which heading this board sits under in the picker.
   *
   * Five boards rank MANAGERS and one ranks CARDS, and a flat list of six gave
   * no sign of that — so `Cards` read as a sixth way of ranking people rather
   * than as a board whose rows are a different kind of object entirely.
   */
  group: BoardGroup;
  /**
   * One sentence saying what the board ranks, read in TWO places.
   *
   * Under the board's name in the picker, where it is what a reader is
   * actually asking while the menu is open; and under the closed bar, where it
   * says what the numbers below it are numbers of.
   *
   * ONE STRING FOR BOTH, deliberately. It began as a scrolling blurb inside the
   * list, then became a two-word tag on the right of the menu row — and a tag
   * that short cannot explain a board while a sentence that long cannot sit at
   * the end of a menu row. Under the label in both places it can be the same
   * sentence, so the description a reader chose by is the description they
   * arrive at. See `BoardControls`.
   *
   * Sentence case, no full stop: it is a caption, and it is joined to the slate
   * with a middot below the bar.
   */
  description: string;
};

/** The picker's two headings, in the order they appear. */
export type BoardGroup = 'Managers' | 'Cards';

export const BOARD_GROUPS: BoardGroup[] = ['Managers', 'Cards'];

export const BOARD_META: Record<BoardId, BoardMeta> = {
  points: {
    /* TOTAL FANTASY POINTS, not "Points", and the first word is the whole
       difference. The board sums every point a scored lineup has earned across
       the season and every contest in it — a career total, not a standing in
       something — and `Points` next to `Record` and `Roster value` read as one
       more thing you could be leading. `TFP` is the abbreviation the rest of
       the game already uses for it, on the lineup row and the card profile. */
    label: 'Total fantasy points',
    title: 'Total fantasy points',
    emptyTitle: 'Nothing scored yet',
    emptyBody:
      'Scores land after a week’s games finish, so the board fills in as soon as one is scored.',
    // The points board replaces this with a sentence naming the week you should
    // be setting a lineup for — see `PointsBoard`. It is here so the record of
    // what every board says is complete in one place.
    absent: 'You have no scored lineup yet.',
    unit: 'fantasy points',
    group: 'Managers',
    description: 'every fantasy point your lineups have scored this season',
  },
  record: {
    label: 'Record',
    title: 'Record against the median',
    emptyTitle: 'No week has been graded yet',
    emptyBody:
      'A week is graded once every fixture in it is final and at least two managers entered it. Until then there is a live median but no result.',
    absent: 'You have no graded week yet. Set a lineup and it is scored against the median.',
    unit: 'win rate',
    group: 'Managers',
    description: 'your weekly score against the field median',
  },
  collection: {
    /* ROSTER VALUE, and the word is load-bearing twice over.
   
       It names the MEASURE rather than the thing — the bare noun "Collection"
       read as "biggest collection", which is the one reading it is not: thirty
       bronze duplicates lose to sixteen played cards.
   
       And it says WHICH CARDS. This board counts the cards on your roster and
       nothing else; copies committed to a set are not on it. Called "collection
       value" it competed with the Collect tab for one phrase while counting a
       different pile, which is how the same player could read 4,156 on one
       screen and 11,688 on the other with nothing anywhere saying why. Roster
       is the word the game already uses for the thirty slots this measures. */
    label: 'Roster value',
    title: 'Roster value',
    emptyTitle: 'Nobody holds a card yet',
    emptyBody: 'Every card enters the game through a pack. The first one is still out there.',
    absent: 'You hold no cards yet. Open a pack and you will appear here.',
    unit: 'coins',
    group: 'Managers',
    description: 'what the cards on your roster would sell for',
  },
  cards: {
    label: 'Cards',
    title: 'Best cards in the game',
    emptyTitle: 'No card has scored yet',
    emptyBody:
      'A copy only earns while it is in a lineup, so this board fills in from the first scored week.',
    absent: 'None of your cards has scored yet. A card earns from the week you start it.',
    unit: 'career points',
    group: 'Cards',
    description: 'the highest-scoring single copy, and who holds it',
  },
  sets: {
    label: 'Sets',
    title: 'Set progress',
    emptyTitle: 'Nobody has claimed a set reward yet',
    emptyBody:
      'A team set pays six times as you fill it, starting at a tenth of the roster. Commit cards to start collecting.',
    absent: 'You have not claimed a set reward yet.',
    unit: 'rewards',
    group: 'Managers',
    description: 'set rewards claimed and dailies cleared',
  },
};

/* ------------------------------------------------------------------ fetch */

export type FetchOptions = {
  season: number;
  seasonType: number;
  /** Cards board only. Null is every position. */
  position: string | null;
};

/**
 * One board's rows.
 *
 * Errors are thrown rather than swallowed, unlike the points board's per-week
 * enrichment: there is no partial answer to degrade to here. A board that
 * failed to load has nothing to show, and saying so is better than an empty
 * table that looks like "nobody qualifies".
 */
export async function fetchCommunityBoard(
  id: CommunityBoardId,
  { season, seasonType, position }: FetchOptions,
): Promise<CommunityData> {
  switch (id) {
    case 'record': {
      const { data, error } = await supabase.rpc('board_record', {
        p_season: season,
        p_season_type: seasonType,
        p_limit: BOARD_LIMIT,
      });
      if (error) throw new Error(error.message);
      return {
        id,
        rows: (data ?? []).map((r) => ({
          rank: num(r.rank),
          user_id: r.user_id,
          display_name: r.display_name,
          wins: num(r.wins),
          losses: num(r.losses),
          ties: num(r.ties),
          weeks: num(r.weeks),
          win_pct: num(r.win_pct),
          points: num(r.points),
        })),
      };
    }
    case 'collection': {
      const { data, error } = await supabase.rpc('board_collection', {
        p_season: season,
        p_limit: BOARD_LIMIT,
      });
      if (error) throw new Error(error.message);
      return {
        id,
        rows: (data ?? []).map((r) => ({
          rank: num(r.rank),
          user_id: r.user_id,
          display_name: r.display_name,
          value_coins: num(r.value_coins),
          held: num(r.held),
          in_sets: num(r.in_sets),
          players: num(r.players),
          bronze: num(r.bronze),
          silver: num(r.silver),
          gold: num(r.gold),
          diamond: num(r.diamond),
          career_fp: num(r.career_fp),
        })),
      };
    }
    case 'cards': {
      const { data, error } = await supabase.rpc('board_cards', {
        p_season: season,
        // Undefined rather than null: PostgREST omits the argument entirely, so
        // the SQL default (null = every position) applies.
        p_position: position ?? undefined,
        p_limit: BOARD_LIMIT,
      });
      if (error) throw new Error(error.message);
      return {
        id,
        rows: (data ?? []).map((r) => ({
          rank: num(r.rank),
          card_instance_id: r.card_instance_id,
          user_id: r.user_id,
          display_name: r.display_name,
          player_id: r.player_id,
          player_name: r.player_name,
          position_abbreviation: r.position_abbreviation,
          team_abbreviation: r.team_abbreviation,
          tier: r.tier,
          career_fp: num(r.career_fp),
          lineup_starts: num(r.lineup_starts),
          fp_per_start: numOrNull(r.fp_per_start),
        })),
      };
    }
    case 'sets': {
      const { data, error } = await supabase.rpc('board_sets', { p_limit: BOARD_LIMIT });
      if (error) throw new Error(error.message);
      return {
        id,
        rows: (data ?? []).map((r) => ({
          rank: num(r.rank),
          user_id: r.user_id,
          display_name: r.display_name,
          rungs: num(r.rungs),
          sets: num(r.sets),
          completed: num(r.completed),
          dailies: num(r.dailies),
          burned: num(r.burned),
          coins: num(r.coins),
        })),
      };
    }
  }
}

/* ------------------------------------------------------------------ build */

/** A figure and the word for what it is. See `DetailPart`. */
const part = (key: string, value: string, unit?: string, accent?: string): DetailPart => ({
  key,
  value,
  unit: unit?.toUpperCase(),
  accent,
});


function recordRows(rows: RecordEntry[], scheme: 'light' | 'dark'): BoardRowModel[] {
  const c = Colors[scheme];
  return rows.map((r) => ({
    key: r.user_id,
    rank: r.rank,
    userId: r.user_id,
    name: r.display_name,
    /* `Beat the median in 0 of 2 graded weeks` used to lead this row and it was
       the W-L-T below it written out longhand — the wins are the first figure
       and the three counts sum to the weeks. One statement of a fact per row. */
    // A win and a loss are the app's clearest positive and negative facts, and
    // this is the one board whose numbers ARE those facts. The letter beside
    // each is what carries it; the colour only makes the record scannable.
    // W-L-T is one fact in three tokens, so it survives whole. The points total
    // does not: it is the POINTS board's figure, restated on a board that ranks
    // by win rate, where it can only be read as a second ranking.
    detail: [
      part('w', String(r.wins), 'w', r.wins > 0 ? c.positive : undefined),
      part('l', String(r.losses), 'l', r.losses > 0 ? c.negative : undefined),
      part('t', String(r.ties), 't'),
    ],
    figure: rate(r.win_pct),
    figureLabel: 'PCT',
    value: r.win_pct,
  }));
}

/**
 * The tiers a roster is made of, in ladder order.
 *
 * ONE ENTRY PER TIER rather than a loop over `TierOrder`, because the RPC
 * returns four named columns and this is the seam where a column becomes a
 * letter. If a fifth tier is ever added, the compiler finds this list through
 * `CollectionEntry` rather than leaving a tier silently uncounted.
 */
const ROSTER_TIERS: { key: CardTier; letter: string; of: (r: CollectionEntry) => number }[] = [
  { key: 'bronze', letter: 'b', of: (r) => r.bronze },
  { key: 'silver', letter: 's', of: (r) => r.silver },
  { key: 'gold', letter: 'g', of: (r) => r.gold },
  { key: 'diamond', letter: 'd', of: (r) => r.diamond },
];

function collectionRows(rows: CollectionEntry[], scheme: 'light' | 'dark'): BoardRowModel[] {
  return rows.map((r) => ({
    key: r.user_id,
    rank: r.rank,
    userId: r.user_id,
    name: r.display_name,
    /* THE TIER SPREAD, which is the story `30 CARDS` could not tell. A roster
       of thirty bronze duplicates and a roster of thirty cards played up to
       gold are the same count and a different game — tier is earned by
       STARTING a card, so the spread is the one line that says whether a shelf
       has been played or hoarded. The counts sum to `held`, so the total is
       still on the row, spelled out.
   
       ZERO TIERS ARE OMITTED rather than printed. Nothing has tiered up yet, so
       every row would otherwise end in `0 S · 0 G · 0 D` — three quarters of
       the line reserved for a number that is not there. A tier appears the week
       someone earns it, which is also the week it becomes worth reading.
   
       The count carries its tier's colour and its tier's letter, so the line
       survives greyscale and a reader who cannot separate bronze from gold
       still has the initial. */
    detail: ROSTER_TIERS.filter((t) => t.of(r) > 0).map((t) =>
      part(t.key, whole(t.of(r)), t.letter, getTierTheme(t.key, scheme).colors.accent),
    ),
    figure: whole(r.value_coins),
    figureLabel: 'COINS',
    value: r.value_coins,
  }));
}

function cardRows(rows: CardEntry[], scheme: 'light' | 'dark'): BoardRowModel[] {
  return rows.map((r) => {
    return {
      // The COPY is the ranked thing, so the copy's id is the row's identity.
      // Two copies of one player are two rows and must not collide.
      key: r.card_instance_id,
      rank: r.rank,
      userId: r.user_id,
      name: r.player_name,
      // Name, position, club — the lineup row's first line exactly, because it
      // is the same object being named.
      accentToken: r.position_abbreviation
        ? {
            text: r.position_abbreviation.toUpperCase(),
            color: positionColors(r.position_abbreviation, scheme).accent,
          }
        : undefined,
      mutedToken: r.team_abbreviation ? `— ${r.team_abbreviation.toUpperCase()}` : undefined,
      tier: r.tier,
      // The tier mark leads this line, so the tier's NAME is not repeated here
      // — what is left is what the copy has actually done.
      detail: [
        part('starts', whole(r.lineup_starts), 'gs'),
        ...(r.fp_per_start === null ? [] : [part('avg', oneDp(r.fp_per_start), 'per start')]),
      ],
      /* WHOSE copy it is — on a board of cards that is the leaderboard part,
         and it is the row's door to a manager. It sat on its own line and now
         ends this one, in the tail slot a phrase belongs in. `profileOn` moved
         with it; see `BoardRow`. */
      note: `Held by ${r.display_name}`,
      figure: oneDp(r.career_fp),
      figureLabel: 'FP',
      value: r.career_fp,
    };
  });
}

function setRows(rows: SetsEntry[], scheme: 'light' | 'dark'): BoardRowModel[] {
  const coinAccent = selectionAccent(scheme);
  return rows.map((r) => ({
    key: r.user_id,
    rank: r.rank,
    userId: r.user_id,
    name: r.display_name,
    // Dailies are counted apart from rungs everywhere, including here — see
    // the note on board_sets.
    // Coins are the app's one currency and they are gold wherever they appear —
    // the masthead balance, the profile's coin flow, and now here.
    coin: true,
    // Dailies and what they paid. `BURNT` was the third and is the one to lose:
    // it is a cost already implied by the rungs this board ranks by.
    detail: [
      // `3 of 36 team sets completed` as a figure. A manager with no set yet
      // reads `0/0 SETS`, which is the same shape as everybody else's row
      // rather than a sentence only they get.
      part('done', `${whole(r.completed)}/${whole(r.sets)}`, 'sets'),
      part('daily', whole(r.dailies), 'dailies'),
      part('coins', whole(r.coins), 'coins', r.coins > 0 ? coinAccent : undefined),
    ],
    figure: whole(r.rungs),
    figureLabel: 'RUNGS',
    value: r.rungs,
  }));
}

export function buildBoard(
  data: CommunityData,
  seasonType: number,
  { scheme }: BuildOptions,
): BoardRowModel[] {
  switch (data.id) {
    /* NO TIER MARK ON A MANAGER BOARD. Four of these rows used to open their
       detail line with the best tier their owner held, via `withTopTier`. It
       read as a `B` in front of every row in the game — the same letter on
       every line of every board, because almost nothing has been tiered up yet
       — which is a mark that cannot distinguish anything spending the first
       slot on every row. It is the CARDS board's own column now, where the
       tier belongs to the thing being ranked. */
    case 'record':
      return recordRows(data.rows, scheme);
    case 'collection':
      return collectionRows(data.rows, scheme);
    case 'cards':
      // The COPY's tier: this board ranks the card, so the tier is its own.
      return cardRows(data.rows, scheme);
    case 'sets':
      return setRows(data.rows, scheme);
  }
}

/**
 * How each board writes a quantity of its own figure.
 *
 * The single source for it. Each board's caption states a gap — `380 to 11th`
 * — and it has to be in the same units and to the same precision as the two
 * figures the gap is between, which is only true while one table decides both.
 * The alternative is a formatter per caller, and coins with a comma in one
 * place and without it in another is one number that looks like two.
 */
export const BOARD_FORMAT: Record<BoardId, (n: number) => string> = {
  points: oneDp,
  record: rate,
  collection: whole,
  cards: oneDp,
  sets: whole,
};

/** "1st", "12th", "23rd" — the caption's own leading word. */
export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
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

/**
 * The tail of your own row's detail line: what it would take to move one place.
 *
 * IT WAS A CAPTION UNDER THE ROW and it is a phrase inside it, because most of
 * what the caption said was already on the screen twice. `12th of 48 ranked ·
 * top 25% · 380 to 11th` sat under a row whose rank column already read 12,
 * beneath a context line that already read `48 ranked`. What survived the
 * overlap is the last clause, and it goes in the slot `BoardRow` keeps for
 * exactly this — the one the lineup row fills with `0/200 to Silver Tier`.
 *
 * THE LAST CLAUSE IS THE ONLY ACTIONABLE ONE, which is why it is the one that
 * survived. `−9,424` against the leader is a fact about somebody you will not
 * catch; `380 to 11th` is the next thing that can actually happen, and on a
 * board of five hundred it is the only number on the screen a reader can do
 * anything about. On the leader's own row the honest version is the lead they
 * are holding.
 *
 * THE PERCENTILE IS GONE with the caption. It was worth a line of its own and
 * is not worth a third clause here; the field size is still on the context line
 * above, so `12` against `48 ranked` says the same thing one division later.
 */
export function standingNote({
  rank,
  toNext,
  leadingBy,
}: {
  rank: number;
  /** Formatted gap to the rank directly above, or null at the top. */
  toNext: string | null;
  /** Formatted lead over second place — the leader's version of `toNext`. */
  leadingBy: string | null;
}): string | undefined {
  if (rank === 1) return leadingBy ? `Leading by ${leadingBy}` : undefined;
  return toNext ? `${toNext} to ${ordinal(rank - 1)}` : undefined;
}

/**
 * The caller's own row.
 *
 * On four of the five boards a manager has at most one row, so the first match
 * IS their row. On the cards board they may hold dozens, and the first match is
 * their BEST card — which is the one the panel above the list should be
 * showing. Both cases are the same search, which is why there is one function.
 */
export function findMine(rows: BoardRowModel[], meId: string | null): BoardRowModel | null {
  if (!meId) return null;
  return rows.find((r) => r.userId === meId) ?? null;
}
