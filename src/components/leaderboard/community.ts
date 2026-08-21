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
import { DASH } from '@/components/ui/DataTable';
import { positionColors } from '@/constants/positions';
import { Colors, getTierTheme, selectionAccent, type CardTier } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { weekTabLabel } from './board';

/** Same ceiling and same reason as the points board. */
export const BOARD_LIMIT = 500;

export type CommunityBoardId = 'week' | 'record' | 'collection' | 'cards' | 'sets';

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
  'week',
  'record',
  'collection',
  'cards',
  'sets',
];

/** Tab order. Points first: it is the board the screen opens on. */
export const BOARD_IDS: BoardId[] = ['points', ...COMMUNITY_BOARD_IDS];

/* ------------------------------------------------------------------ rows */

export type BestWeekEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  week: number;
  points: number;
  weeks_played: number;
};

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
  value_gems: number;
  held: number;
  players: number;
  gold_plus: number;
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
  gems: number;
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
  | { id: 'week'; rows: BestWeekEntry[] }
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
   * `790` by `GEMS` — so the line survives greyscale and a red/green reader
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
  /** Line 2: the one sentence that qualifies the figure on the right. */
  secondary: string;
  /**
   * Line 3, leading it — the slot the lineup row gives its tier letter.
   *
   * The cards board puts the copy's own tier here. The collection board puts
   * the BEST tier on the shelf, which is the one fact that says what kind of
   * collection it is at a glance.
   */
  tier?: CardTier;
  /** Leads line 3 with the gem glyph, where the line is about currency. */
  gem?: boolean;
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
  /** The tier mark per manager. Empty until `fetchTopTiers` lands. */
  topTiers: Map<string, CardTier>;
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
  /** One line under the title: what this board ranks, and on what. */
  blurb: string;
  /** Shown instead of the table when nobody qualifies yet. */
  emptyTitle: string;
  emptyBody: string;
  /** Shown in the "where you stand" panel when the caller has no row. */
  absent: string;
  /** Screen-reader phrasing for the headline value, e.g. "42.5 points". */
  unit: string;
};

export const BOARD_META: Record<BoardId, BoardMeta> = {
  points: {
    label: 'Points',
    title: 'Points',
    // No "pick a week to…": the week chip now sits immediately beside the board
    // chip, and a line explaining a control the reader is looking at is chrome.
    blurb: 'Every fantasy point a scored lineup has earned, season to date or week by week.',
    emptyTitle: 'Nothing scored yet',
    emptyBody:
      'Scores land after a week’s games finish, so the board fills in as soon as one is scored.',
    // The points board replaces this with a sentence naming the week you should
    // be setting a lineup for — see `PointsBoard`. It is here so the record of
    // what every board says is complete in one place.
    absent: 'You have no scored lineup yet.',
    unit: 'points',
  },
  week: {
    label: 'Best week',
    title: 'Best week',
    blurb: 'The single highest week anybody has posted, and when they posted it.',
    emptyTitle: 'No week has been scored yet',
    emptyBody:
      'A best week needs a scored week. The first one lands after a slate’s games finish.',
    absent: 'You have no scored week yet, so you have no best one.',
    unit: 'points',
  },
  record: {
    label: 'Record',
    title: 'Record against the median',
    blurb:
      'Everybody plays the field’s median score every week. Beat it and it is a win — so half of everyone wins.',
    emptyTitle: 'No week has been graded yet',
    emptyBody:
      'A week is graded once every fixture in it is final and at least two managers entered it. Until then there is a live median but no result.',
    absent: 'You have no graded week yet. Set a lineup and it is scored against the median.',
    unit: 'win rate',
  },
  collection: {
    label: 'Collection',
    title: 'Collections',
    blurb:
      'What a shelf would sell for. Tier is earned by starting a card, so a played collection outgrows a hoarded one.',
    emptyTitle: 'Nobody holds a card yet',
    emptyBody: 'Every card enters the game through a pack. The first one is still out there.',
    absent: 'You hold no cards yet. Open a pack and you will appear here.',
    unit: 'gems',
  },
  cards: {
    label: 'Cards',
    title: 'Best cards in the game',
    blurb:
      'The highest-scoring single COPY, and who holds it. Two managers with the same player have two different cards.',
    emptyTitle: 'No card has scored yet',
    emptyBody:
      'A copy only earns while it is in a lineup, so this board fills in from the first scored week.',
    absent: 'None of your cards has scored yet. A card earns from the week you start it.',
    unit: 'career points',
  },
  sets: {
    label: 'Sets',
    title: 'Set progress',
    blurb:
      'Rungs claimed on the team ladders, dailies cleared, and the cards burnt getting there.',
    emptyTitle: 'Nobody has claimed a rung yet',
    emptyBody:
      'A team set pays at a quarter, a half, three quarters and all of its requirement. Commit cards to start climbing.',
    absent: 'You have not claimed a set rung yet.',
    unit: 'rungs',
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
 * The best card each manager still holds, keyed by user.
 *
 * Fetched apart from the boards because it is one row per MANAGER rather than
 * per board row — the same answer serves all of them — and because the points
 * board reads `leaderboard()`, which could not carry the column without being
 * dropped and recreated. See the migration.
 *
 * A failure here is swallowed to an empty map on purpose: the mark is the row's
 * colour, not its content, and losing it must never take a rendered board down
 * with it. The same posture the points board takes on its week enrichment.
 */
export async function fetchTopTiers(): Promise<Map<string, CardTier>> {
  const { data, error } = await supabase.rpc('board_top_tiers');
  if (error) return new Map();
  return new Map((data ?? []).map((r) => [r.user_id, r.tier] as const));
}

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
    case 'week': {
      const { data, error } = await supabase.rpc('board_best_week', {
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
          week: num(r.week),
          points: num(r.points),
          weeks_played: num(r.weeks_played),
        })),
      };
    }
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
          value_gems: num(r.value_gems),
          held: num(r.held),
          players: num(r.players),
          gold_plus: num(r.gold_plus),
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
          gems: num(r.gems),
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

/** The best tier on a shelf — what the collection IS, in one letter. */
function topTier(row: CollectionEntry): CardTier | undefined {
  if (row.diamond > 0) return 'diamond';
  if (row.gold_plus > 0) return 'gold';
  // Below gold the counts are not returned separately, and guessing between
  // silver and bronze from a valuation would be a number pretending to be a
  // fact. No mark is better than a wrong one.
  return undefined;
}

/** "3 weeks" / "1 week". Every board counts something that can be singular. */
const plural = (n: number, one: string, many = `${one}s`) => `${whole(n)} ${n === 1 ? one : many}`;

function weekRows(rows: BestWeekEntry[], seasonType: number): BoardRowModel[] {
  const best = rows[0]?.points ?? 0;
  return rows.map((r) => ({
    key: r.user_id,
    rank: r.rank,
    userId: r.user_id,
    name: r.display_name,
    // WHICH week is the whole context for a best week — the figure alone is a
    // number with no occasion attached to it.
    secondary: `Posted in ${weekTabLabel(seasonType, r.week)}`,
    detail: [part('weeks', whole(r.weeks_played), 'weeks played')],
    // The lineup row ends its third line with the distance still to run; so
    // does this. A board of scores with no gaps on it is a list, not a race.
    note:
      rows.length < 2
        ? undefined
        : r.rank === 1
          ? 'Best in the game'
          : best - r.points > 0
            ? `${oneDp(best - r.points)} off the best`
            : undefined,
    figure: oneDp(r.points),
    figureLabel: 'PTS',
  }));
}

function recordRows(rows: RecordEntry[], scheme: 'light' | 'dark'): BoardRowModel[] {
  const c = Colors[scheme];
  return rows.map((r) => ({
    key: r.user_id,
    rank: r.rank,
    userId: r.user_id,
    name: r.display_name,
    // What the record MEANS, in the contest's own terms, rather than the
    // W-L-T repeated as a word. The three counts are on the line below.
    secondary: `Beat the median in ${r.wins} of ${plural(r.weeks, 'graded week')}`,
    // A win and a loss are the app's clearest positive and negative facts, and
    // this is the one board whose numbers ARE those facts. The letter beside
    // each is what carries it; the colour only makes the record scannable.
    detail: [
      part('w', String(r.wins), 'w', r.wins > 0 ? c.positive : undefined),
      part('l', String(r.losses), 'l', r.losses > 0 ? c.negative : undefined),
      part('t', String(r.ties), 't'),
      part('pts', oneDp(r.points), 'pts'),
    ],
    figure: rate(r.win_pct),
    figureLabel: 'PCT',
  }));
}

function collectionRows(
  rows: CollectionEntry[],
  scheme: 'light' | 'dark',
  topTiers: Map<string, CardTier>,
): BoardRowModel[] {
  return rows.map((r) => ({
    key: r.user_id,
    rank: r.rank,
    userId: r.user_id,
    name: r.display_name,
    // The quality of the shelf in one phrase; its size is on the line below.
    secondary:
      r.gold_plus > 0
        ? `${whole(r.gold_plus)} gold or better${r.diamond > 0 ? `, ${whole(r.diamond)} diamond` : ''}`
        : 'No card above silver yet',
    // The shelf's best tier leads the line, exactly where a card's own tier
    // leads a lineup row — it is the same question asked of a whole collection.
    // The exact tier where it is known; the board's own columns can only see
    // as far down as gold, so they are the fallback rather than the source.
    tier: topTiers.get(r.user_id) ?? topTier(r),
    detail: [
      part('held', whole(r.held), 'cards'),
      // DISTINCT cards. The gap between this and CARDS is the duplicates.
      part('players', whole(r.players), 'unique'),
      part(
        'fp',
        r.career_fp > 0 ? oneDp(r.career_fp) : DASH,
        'tfp',
        r.career_fp > 0
          ? getTierTheme(topTiers.get(r.user_id) ?? topTier(r) ?? 'bronze', scheme).colors.accent
          : undefined,
      ),
    ],
    figure: whole(r.value_gems),
    figureLabel: 'GEMS',
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
      // WHOSE copy it is. On a board of cards that is the leaderboard part.
      secondary: `Held by ${r.display_name}`,
      tier: r.tier,
      // The tier mark leads this line, so the tier's NAME is not repeated here
      // — what is left is what the copy has actually done.
      detail: [
        part('starts', whole(r.lineup_starts), 'gs'),
        ...(r.fp_per_start === null ? [] : [part('avg', oneDp(r.fp_per_start), 'per start')]),
      ],
      figure: oneDp(r.career_fp),
      figureLabel: 'FP',
    };
  });
}

function setRows(rows: SetsEntry[], scheme: 'light' | 'dark'): BoardRowModel[] {
  const gemAccent = selectionAccent(scheme);
  return rows.map((r) => ({
    key: r.user_id,
    rank: r.rank,
    userId: r.user_id,
    name: r.display_name,
    secondary:
      r.sets > 0
        ? `${whole(r.completed)} of ${plural(r.sets, 'team set')} completed`
        : 'No team set started yet',
    // Dailies are counted apart from rungs everywhere, including here — see
    // the note on board_sets.
    // Gems are the app's one currency and they are gold wherever they appear —
    // the masthead balance, the profile's gem flow, and now here.
    gem: true,
    detail: [
      part('daily', whole(r.dailies), 'dailies'),
      part('burned', whole(r.burned), 'burnt'),
      part('gems', whole(r.gems), 'gems', r.gems > 0 ? gemAccent : undefined),
    ],
    figure: whole(r.rungs),
    figureLabel: 'RUNGS',
  }));
}

export function buildBoard(
  data: CommunityData,
  seasonType: number,
  { scheme, topTiers }: BuildOptions,
): BoardRowModel[] {
  switch (data.id) {
    case 'week':
      return withTopTier(weekRows(data.rows, seasonType), topTiers);
    case 'record':
      return withTopTier(recordRows(data.rows, scheme), topTiers);
    case 'collection':
      // Already leads with the shelf's own best tier, from its own columns.
      return collectionRows(data.rows, scheme, topTiers);
    case 'cards':
      // The COPY's tier, not its owner's best — this board ranks the card.
      return cardRows(data.rows, scheme);
    case 'sets':
      return withTopTier(setRows(data.rows, scheme), topTiers);
  }
}

/**
 * Marks manager rows with the best card their owner holds.
 *
 * Applied after the fact rather than inside each builder, because it is the
 * same operation on four boards and the alternative is the same three lines
 * copied into each of them.
 */
export function withTopTier(
  rows: BoardRowModel[],
  topTiers: Map<string, CardTier>,
): BoardRowModel[] {
  if (topTiers.size === 0) return rows;
  return rows.map((r) => (r.tier ? r : { ...r, tier: topTiers.get(r.userId) }));
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
