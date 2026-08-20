/**
 * Data access for the Cards player directory.
 *
 * Kept out of the screen so the one genuinely dangerous part of this feature —
 * paging past PostgREST's silent row cap — is in one readable place.
 */
import type { CardTier } from '@/constants/theme';
import type { Database } from '@/lib/database.types';
import { fetchAllPages } from '@/lib/paged';
import { supabase } from '@/lib/supabase';

type DirectoryRow = Database['public']['Views']['player_directory']['Row'];
export type Rarity = Database['public']['Enums']['rarity'];

/** Camel-cased, null-narrowed row. The view types everything nullable. */
export type DirectoryPlayer = {
  cardId: string;
  playerId: string;
  season: number | null;
  name: string;
  position: string | null;
  team: string | null;
  injuryStatus: string | null;
  rarity: Rarity | null;
  seasonFp: number;
  gamesPlayed: number;
  fpPerGame: number;
  /** Season totals, for the row's stat strip. See `statStrip`. */
  stats: DirectoryStats;
  /* --- from `players`, merged in by `fetchPlayerDirectory` --- */
  age: number | null;
  college: string | null;
  /** Seasons of NFL service. 0 is a rookie. Null when the feed omits it. */
  experience: number | null;
  /* --- derived, see `assignRanks` --- */
  posRank: number | null;
  /** Rank across EVERY position, by season points. Null until he has played. */
  overallRank: number | null;
  /* --- from `player_card_market()`, merged in by `fetchPlayerDirectory` --- */
  market: PlayerCardMarket | null;
};

/**
 * How many copies of this player exist in the game, and what the best one has
 * earned. Null when NOBODY owns one — which is not the same as owning zero of
 * every tier, and the row draws the two differently.
 */
export type PlayerCardMarket = {
  copies: number;
  bronze: number;
  silver: number;
  gold: number;
  diamond: number;
  /** Highest `career_fp` on any held copy. 0 when none has ever been started. */
  bestFp: number;
};

export type DirectoryStats = {
  receptions: number;
  targets: number;
  receivingYards: number;
  receivingTds: number;
  rushingAttempts: number;
  rushingYards: number;
  rushingTds: number;
  passingCompletions: number;
  passingAttempts: number;
  passingYards: number;
  passingTds: number;
  interceptions: number;
  fieldGoalsMade: number;
  fieldGoalAttempts: number;
  extraPointsMade: number;
};

export const DIRECTORY_COLUMNS =
  'card_id, player_id, season, player_name, position_abbreviation, team_abbreviation, injury_status, rarity, season_fp, games_played, fp_per_game, receptions, receiving_targets, receiving_yards, receiving_touchdowns, rushing_attempts, rushing_yards, rushing_touchdowns, passing_completions, passing_attempts, passing_yards, passing_touchdowns, passing_interceptions, field_goals_made, field_goal_attempts, extra_points_made';

/**
 * Page size. Deliberately well under PostgREST's `db-max-rows` ceiling so a
 * full page is never ambiguous: a short page means "end of data", not "capped".
 */
export const DIRECTORY_PAGE_SIZE = 400;

/**
 * Hard ceiling on round trips, so a server that keeps handing back tiny pages
 * cannot spin the screen forever. At 968 rows the read takes 3.
 */
const MAX_REQUESTS = 40;

/** Numeric columns arrive as JSON numbers, but never trust a null into maths. */
const num = (v: number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** The subset of `players` the directory table actually renders. */
export type PlayerBio = {
  age: number | null;
  college: string | null;
  experience: number | null;
};

export function normalise(row: DirectoryRow, bio?: PlayerBio): DirectoryPlayer {
  return {
    cardId: row.card_id ?? '',
    playerId: row.player_id ?? '',
    season: row.season,
    name: row.player_name ?? 'Unknown player',
    position: row.position_abbreviation,
    team: row.team_abbreviation,
    injuryStatus: row.injury_status,
    rarity: row.rarity,
    seasonFp: num(row.season_fp),
    gamesPlayed: num(row.games_played),
    fpPerGame: num(row.fp_per_game),
    stats: {
      receptions: num(row.receptions),
      targets: num(row.receiving_targets),
      receivingYards: num(row.receiving_yards),
      receivingTds: num(row.receiving_touchdowns),
      rushingAttempts: num(row.rushing_attempts),
      rushingYards: num(row.rushing_yards),
      rushingTds: num(row.rushing_touchdowns),
      passingCompletions: num(row.passing_completions),
      passingAttempts: num(row.passing_attempts),
      passingYards: num(row.passing_yards),
      passingTds: num(row.passing_touchdowns),
      interceptions: num(row.passing_interceptions),
      fieldGoalsMade: num(row.field_goals_made),
      fieldGoalAttempts: num(row.field_goal_attempts),
      extraPointsMade: num(row.extra_points_made),
    },
    age: bio?.age ?? null,
    college: bio?.college ?? null,
    experience: bio?.experience ?? null,
    posRank: null,
    overallRank: null,
    market: null,
  };
}

export type DirectoryFetch = {
  players: DirectoryPlayer[];
  /** Server-side `count: 'exact'` for the same filter. */
  expected: number;
  /**
   * False when what we assembled does not match `expected`. The whole point of
   * this flag: PostgREST caps `.select()` at `db-max-rows` (1000 by default)
   * and returns HTTP 200 with no error, so a truncated read is otherwise
   * indistinguishable from a complete one. A job here once scored 1000 of 1584
   * rows and reported success.
   */
  complete: boolean;
  /** The season the directory was read for, or null if the view is empty. */
  season: number | null;
  /** False when the bio read failed. The table still renders; AGE/YR go blank. */
  bios: boolean;
  /** False when the ownership read failed. Rows draw dashes for the counts. */
  market: boolean;
};

/** The newest season present in the directory. */
async function latestSeason(): Promise<number | null> {
  const { data, error } = await supabase
    .from('player_directory')
    .select('season')
    .order('season', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.season ?? null;
}

/**
 * `experience` arrives as prose — 'Rookie', '1st Season', '11th Season'. Stored
 * as a number so the column can sort and so 'R' is a rendering choice rather
 * than a special case buried in a comparator.
 */
export function parseExperience(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.startsWith('rookie')) return 0;
  const n = /^(\d+)/.exec(s);
  return n ? Number(n[1]) : null;
}

/**
 * Bios for the fantasy-relevant positions only.
 *
 * `players` holds 3,010 rows against the directory's 968, and every one of the
 * extra 2,042 is an offensive lineman or a defender we will never show. The
 * position filter cuts the read to two pages; without it this is seven, and
 * three of them are over PostgREST's cap where a silent truncation would look
 * like "some players have no age".
 */
const BIO_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'PK'];

async function fetchPlayerBios(): Promise<Map<string, PlayerBio>> {
  const rows = await fetchAllPages<{
    id: string;
    age: number | null;
    college: string | null;
    experience: string | null;
  }>((from, to) =>
    supabase
      .from('players')
      .select('id, age, college, experience')
      .in('position_abbreviation', BIO_POSITIONS)
      // `id` is the primary key, so this is the unique order paging requires.
      .order('id', { ascending: true })
      .range(from, to),
  );

  const byId = new Map<string, PlayerBio>();
  for (const r of rows) {
    byId.set(r.id, {
      age: r.age,
      college: r.college,
      experience: parseExperience(r.experience),
    });
  }
  return byId;
}

/**
 * Rank within position, computed over the whole season rather than the current
 * filter, so 'WR12' means the same thing whatever is typed in the search box.
 *
 * Players with no games are left unranked instead of tied at the bottom: a
 * rank of 380 for someone who has not taken a snap reads as information and is
 * not, and it would make the RK column mostly noise in preseason, where 354 of
 * 968 players have not played.
 */
function assignRanks(players: DirectoryPlayer[]): void {
  const rank = (list: DirectoryPlayer[], set: (p: DirectoryPlayer, n: number) => void) => {
    // Name is the tiebreak, so two players on identical points do not swap
    // places between reads — a rank that moves on refresh reads as a bug.
    list.sort((a, b) => b.seasonFp - a.seasonFp || a.name.localeCompare(b.name));
    list.forEach((p, i) => set(p, i + 1));
  };

  const played = players.filter((p) => p.gamesPlayed > 0);

  rank([...played], (p, n) => {
    p.overallRank = n;
  });

  const byPos = new Map<string, DirectoryPlayer[]>();
  for (const p of played) {
    const key = (p.position ?? '—').toUpperCase();
    const list = byPos.get(key);
    if (list) list.push(p);
    else byPos.set(key, [p]);
  }
  for (const list of byPos.values()) {
    rank(list, (p, n) => {
      p.posRank = n;
    });
  }
}

/**
 * Community card counts for every player, in one call.
 *
 * Soft-failing on purpose, like the bios above it. These figures are context,
 * not the subject: a directory that will not draw because nobody could count
 * the cards is a worse outcome than a directory whose ownership strip is
 * dashes. `player_card_market` is `security definer` and returns a row only for
 * players some copy of whom is actually held — see the migration.
 */
async function fetchCardMarket(): Promise<Map<string, PlayerCardMarket>> {
  const byPlayer = new Map<string, PlayerCardMarket>();
  const { data, error } = await supabase.rpc('player_card_market');
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    if (!row.player_id) continue;
    byPlayer.set(row.player_id, {
      copies: num(row.copies),
      bronze: num(row.bronze),
      silver: num(row.silver),
      gold: num(row.gold),
      diamond: num(row.diamond),
      bestFp: num(row.best_fp),
    });
  }
  return byPlayer;
}

/**
 * Players and Shop are separate routes now, so switching between them unmounts
 * the panel. Without a cache that means re-reading ~1,000 rows across three
 * round trips every time someone glances at the Shop and comes back.
 *
 * Held for the session and cleared by `invalidatePlayerDirectory()` — the
 * directory only changes when the nightly sync runs.
 *
 * `peekPlayerDirectory` is the half that was missing. Caching the PROMISE
 * removed the network cost but not the spinner: every remount still awaited it,
 * and an await resolves a microtask later, so Trend and Leaders each rendered
 * once with nothing before rendering the board they already had in memory. The
 * peek answers during the first render instead. See `lib/session-cache`.
 */
let cached: Promise<DirectoryFetch> | null = null;
let settled: DirectoryFetch | null = null;

export function invalidatePlayerDirectory(): void {
  cached = null;
  settled = null;
}

/** The directory IF it has already landed. Never starts a read. */
export function peekPlayerDirectory(): DirectoryFetch | null {
  return settled;
}

export function loadPlayerDirectory(): Promise<DirectoryFetch> {
  if (!cached) {
    cached = fetchPlayerDirectory().then(
      (result) => {
        settled = result;
        return result;
      },
      (err) => {
        // A failed read must not be cached, or the screen is stuck on the error
        // until a reload.
        cached = null;
        throw err;
      },
    );
  }
  return cached;
}

/**
 * Read the whole directory for the current season, in pages, and prove the read
 * was complete by comparing against an exact server-side count.
 */
export async function fetchPlayerDirectory(): Promise<DirectoryFetch> {
  // Bios do not depend on the season, so this is started before the season
  // probe rather than after the pages: the two reads then overlap instead of
  // adding. A bio failure degrades the AGE/YR columns and nothing else, so it
  // must not take the directory down with it.
  let bioOk = true;
  const biosPromise = fetchPlayerBios().catch(() => {
    bioOk = false;
    return new Map<string, PlayerBio>();
  });

  /* Started here for the same reason as the bios: one RPC over every player,
     which overlaps the season probe and the pages rather than adding to them.
     A failure degrades the ownership strip to dashes and nothing else. */
  let marketOk = true;
  const marketPromise = fetchCardMarket().catch(() => {
    marketOk = false;
    return new Map<string, PlayerCardMarket>();
  });

  const season = await latestSeason();

  const countQuery = supabase
    .from('player_directory')
    .select('card_id', { count: 'exact', head: true });
  const countRes = await (season === null ? countQuery : countQuery.eq('season', season));
  if (countRes.error) throw new Error(countRes.error.message);
  const expected = countRes.count ?? 0;

  const rows: DirectoryRow[] = [];

  for (let request = 0; request < MAX_REQUESTS && rows.length < expected; request += 1) {
    const from = rows.length;
    // A PostgREST builder is a thenable that resolves once, so each page needs
    // its own builder rather than a shared, re-awaited one.
    const pageQuery = supabase
      .from('player_directory')
      .select(DIRECTORY_COLUMNS)
      // Range paging is only stable under a total order, hence the card_id
      // tiebreak: two players share a name often enough to matter.
      .order('player_name', { ascending: true })
      .order('card_id', { ascending: true })
      .range(from, from + DIRECTORY_PAGE_SIZE - 1);
    const { data, error } = await (season === null ? pageQuery : pageQuery.eq('season', season));
    if (error) throw new Error(error.message);

    const page = (data ?? []) as DirectoryRow[];
    // Advance by what the server actually returned, not by the page size we
    // asked for: if `db-max-rows` is lower than DIRECTORY_PAGE_SIZE this still
    // walks the whole set instead of stopping a page in.
    if (page.length === 0) break;
    for (const row of page) rows.push(row);
  }

  const [bios, market] = await Promise.all([biosPromise, marketPromise]);
  const players = rows.map((row) => {
    const p = normalise(row, bios.get(row.player_id ?? ''));
    // Absent means "no copies in circulation", which the row draws as dashes.
    p.market = market.get(p.playerId) ?? null;
    return p;
  });
  assignRanks(players);

  return {
    players,
    expected,
    complete: players.length === expected,
    season,
    bios: bioOk,
    market: marketOk,
  };
}

export type PositionFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE' | 'PK';
export const POSITION_FILTERS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PK'];

/** Counts for the filter tabs, over the unfiltered set so they never move. */
export function positionCounts(players: DirectoryPlayer[]): Record<PositionFilter, number> {
  const counts = { ALL: players.length, QB: 0, RB: 0, WR: 0, TE: 0, PK: 0 };
  for (const p of players) {
    const pos = (p.position ?? '').toUpperCase() as PositionFilter;
    if (pos !== 'ALL' && pos in counts) counts[pos] += 1;
  }
  return counts;
}

/**
 * Sortable fields.
 *
 * `pos`, `team` and `college` were dropped along with the column headers that
 * used to carry them. Position is what the filter tabs above the list do, and
 * team and college are both matched by the search box — so all three were a
 * second way to do something the screen already does, and a sort bar has to
 * earn every chip it shows.
 */
export type SortKey = 'name' | 'exp' | 'age' | 'games' | 'fp' | 'fpg';
export type SortDir = 'asc' | 'desc';

/** Chip order for the sort bar. Production first, identity last. */
export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'fp', label: 'FP' },
  { key: 'fpg', label: 'FP/G' },
  { key: 'games', label: 'GP' },
  { key: 'name', label: 'Name' },
  { key: 'age', label: 'Age' },
  { key: 'exp', label: 'Yrs' },
];

/**
 * The direction a column takes the first time you press it. Descending for a
 * stat — nobody opens a leaderboard to see who scored least — and ascending
 * for text, where A-Z is the only order anyone means.
 */
export const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  name: 'asc',
  exp: 'asc',
  age: 'asc',
  games: 'desc',
  fp: 'desc',
  fpg: 'desc',
};

export type SortState = { key: SortKey; dir: SortDir };

/** Diacritic-insensitive, case-insensitive contains. */
function normaliseForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Missing values sort last in BOTH directions rather than flipping to the top
 * when you reverse a column. A blank is not a small number, and a table that
 * opens with forty em dashes has buried the thing you pressed the header for.
 */
function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

/** Same rule for text: an absent college is not a college that sorts before A. */
function compareText(a: string | null, b: string | null, dir: SortDir): number {
  const x = a?.trim() || null;
  const y = b?.trim() || null;
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  const r = x.localeCompare(y);
  return dir === 'asc' ? r : -r;
}

export function filterAndSort(
  players: DirectoryPlayer[],
  {
    position,
    query,
    sort,
  }: { position: PositionFilter; query: string; sort: SortState },
): DirectoryPlayer[] {
  const q = normaliseForSearch(query.trim());
  const filtered = players.filter((p) => {
    if (position !== 'ALL' && (p.position ?? '').toUpperCase() !== position) return false;
    if (!q) return true;
    // College is searchable at every width, including the two where the column
    // is not drawn: 'every Georgia receiver' is a real thing people look for,
    // and on a phone typing it is the only way to ask.
    return (
      normaliseForSearch(p.name).includes(q) ||
      normaliseForSearch(p.team ?? '').includes(q) ||
      normaliseForSearch(p.college ?? '').includes(q)
    );
  });

  const { key, dir } = sort;
  return filtered.sort((a, b) => {
    const r = compareBy(a, b, key, dir);
    // Name is the tiebreak everywhere, because a preseason table has hundreds
    // of players on exactly 0.0 and an arbitrary order among them makes the
    // list appear to reshuffle whenever it re-renders.
    return r !== 0 ? r : a.name.localeCompare(b.name);
  });
}

function compareBy(a: DirectoryPlayer, b: DirectoryPlayer, key: SortKey, dir: SortDir): number {
  switch (key) {
    case 'name':
      return compareText(a.name, b.name, dir);
    case 'exp':
      return compareNullable(a.experience, b.experience, dir);
    case 'age':
      return compareNullable(a.age, b.age, dir);
    case 'games':
      return compareNullable(a.gamesPlayed, b.gamesPlayed, dir);
    case 'fp':
      return compareNullable(a.seasonFp, b.seasonFp, dir);
    case 'fpg':
      // Per-game off zero games is 0/0, not 0. Ranking a player who has not
      // played above one averaging 4.0 is the classic rate-stat bug.
      return compareNullable(
        a.gamesPlayed > 0 ? a.fpPerGame : null,
        b.gamesPlayed > 0 ? b.fpPerGame : null,
        dir,
      );
  }
}


/* -------------------------------------------------------------------------- *
 * The row's stat strip.
 * -------------------------------------------------------------------------- */

export type StatCell = { label: string; value: number };

/**
 * Five stats per position, chosen the way a manager reads a player.
 *
 * Five because that is what fits a phone row without the labels colliding, and
 * because the sixth stat for every position is already noise — a receiver's
 * rushing attempts, a quarterback's receptions.
 *
 * The last cell is always FP/G. The reference layout puts rostered-percentage
 * there, which this app cannot honestly show: ownership is RLS-scoped to its
 * owner, so a global figure needs a server-side aggregate, and with a
 * beta-sized user base it would read 0% or 100% for everyone. FP per game is
 * the number that actually decides a start, and it is real.
 */
export function statStrip(player: DirectoryPlayer): StatCell[] {
  const s = player.stats;
  const perGame = player.gamesPlayed > 0 ? player.fpPerGame : 0;

  switch ((player.position ?? '').toUpperCase()) {
    case 'QB':
      return [
        { label: 'PASS YD', value: s.passingYards },
        { label: 'PASS TD', value: s.passingTds },
        { label: 'INT', value: s.interceptions },
        { label: 'RUSH YD', value: s.rushingYards },
        { label: 'FP/G', value: perGame },
      ];
    case 'RB':
      return [
        { label: 'ATT', value: s.rushingAttempts },
        { label: 'RUSH YD', value: s.rushingYards },
        { label: 'TD', value: s.rushingTds + s.receivingTds },
        { label: 'REC', value: s.receptions },
        { label: 'FP/G', value: perGame },
      ];
    case 'PK':
      return [
        { label: 'FG', value: s.fieldGoalsMade },
        { label: 'FGA', value: s.fieldGoalAttempts },
        { label: 'XP', value: s.extraPointsMade },
        { label: 'GP', value: player.gamesPlayed },
        { label: 'FP/G', value: perGame },
      ];
    // WR and TE read identically, and so does anything unexpected the feed
    // sends: receiving is the safest default for a skill position.
    default:
      return [
        { label: 'REC', value: s.receptions },
        { label: 'REC YD', value: s.receivingYards },
        { label: 'TD', value: s.receivingTds },
        { label: 'TGT', value: s.targets },
        { label: 'FP/G', value: perGame },
      ];
  }
}

/** FP/G wants a decimal; a touchdown count does not. */
export function formatStat(cell: StatCell): string {
  if (cell.label === 'FP/G') return cell.value.toFixed(1);
  return Math.round(cell.value).toLocaleString();
}

/**
 * The ownership strip: how many copies of this player exist, split by tier.
 *
 * WHY THIS REPLACED THE SEASON STATS IN THE ROW
 *
 * The row already carries the season: the figure at the right is his points,
 * and the line under his name is the rank those points earned. Receptions and
 * targets underneath were a second telling of the same story in more detail
 * than a row can use — and every one of them is on the player's own screen,
 * one tap away, laid out with room to read.
 *
 * What is NOT anywhere else is the market. In a collection game "how many of
 * these exist, and how good is the best one" is a different question from "how
 * good is he", and it is the one that decides whether a card is worth pulling,
 * holding or selling. `statStrip` stays exported and unchanged for surfaces
 * that want the season line.
 *
 * NO TOTAL. There was a CARDS cell leading the strip and it has gone: it was
 * the sum of the four beside it, printed a second time, and it cost a sixth of
 * the band to say something the reader can see. A derivable figure has to earn
 * its place against what else could stand there, and here nothing had to.
 *
 * THE TIERS ARE LETTERS, NOT WORDS. Six spelled-out headings never fitted: at
 * 375pt `DIAMOND` ellipsised to `DIAMO…`, and a heading truncated is a column
 * with no name. `B S G D` is not an abbreviation invented here to make it fit;
 * it is the tier code this app already draws on every lineup row and every card
 * (see `TierMark`, `TierBadge`), so the letters are ones a reader has met.
 *
 * The row colours them with their tier accent, which is what makes four bare
 * capitals legible at a glance — and colour is safe to lean on for exactly the
 * reason theme.ts gives: the LETTER carries the meaning and the accent only
 * makes it faster, so nothing is lost in greyscale.
 */
export type TierCount = { tier: CardTier; letter: string; value: number };

export function tierCounts(market: PlayerCardMarket): TierCount[] {
  return [
    { tier: 'bronze', letter: 'B', value: market.bronze },
    { tier: 'silver', letter: 'S', value: market.silver },
    { tier: 'gold', letter: 'G', value: market.gold },
    { tier: 'diamond', letter: 'D', value: market.diamond },
  ];
}


