/**
 * Data access for the Cards > Players scouting browser.
 *
 * Kept out of the screen so the one genuinely dangerous part of this feature —
 * paging past PostgREST's silent row cap — is in one readable place.
 */
import type { Database } from '@/lib/database.types';
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
};

export const DIRECTORY_COLUMNS =
  'card_id, player_id, season, player_name, position_abbreviation, team_abbreviation, injury_status, rarity, season_fp, games_played, fp_per_game';

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

export function normalise(row: DirectoryRow): DirectoryPlayer {
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
 * Read the whole directory for the current season, in pages, and prove the read
 * was complete by comparing against an exact server-side count.
 */
export async function fetchPlayerDirectory(): Promise<DirectoryFetch> {
  const season = await latestSeason();

  const countQuery = supabase
    .from('player_directory')
    .select('card_id', { count: 'exact', head: true });
  const countRes = await (season === null ? countQuery : countQuery.eq('season', season));
  if (countRes.error) throw new Error(countRes.error.message);
  const expected = countRes.count ?? 0;

  const players: DirectoryPlayer[] = [];

  for (let request = 0; request < MAX_REQUESTS && players.length < expected; request += 1) {
    const from = players.length;
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

    const rows = (data ?? []) as DirectoryRow[];
    // Advance by what the server actually returned, not by the page size we
    // asked for: if `db-max-rows` is lower than DIRECTORY_PAGE_SIZE this still
    // walks the whole set instead of stopping a page in.
    if (rows.length === 0) break;
    for (const row of rows) players.push(normalise(row));
  }

  return { players, expected, complete: players.length === expected, season };
}

export type PositionFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE' | 'PK';
export const POSITION_FILTERS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PK'];

export type SortKey = 'fp' | 'name';

/** Diacritic-insensitive, case-insensitive contains. */
function normaliseForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function filterAndSort(
  players: DirectoryPlayer[],
  { position, query, sort }: { position: PositionFilter; query: string; sort: SortKey },
): DirectoryPlayer[] {
  const q = normaliseForSearch(query.trim());
  const filtered = players.filter((p) => {
    if (position !== 'ALL' && (p.position ?? '').toUpperCase() !== position) return false;
    if (!q) return true;
    return normaliseForSearch(p.name).includes(q) || normaliseForSearch(p.team ?? '').includes(q);
  });

  return filtered.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    // Points descending, with name as the tiebreak so the order is stable
    // across the very many players sitting on exactly 0.
    if (b.seasonFp !== a.seasonFp) return b.seasonFp - a.seasonFp;
    return a.name.localeCompare(b.name);
  });
}
