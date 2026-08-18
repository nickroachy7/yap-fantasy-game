/**
 * Everything the leaderboard screen knows about its data.
 *
 * The shape of this file is forced by one fact: `lineups` is RLS-scoped to its
 * owner, so a client can read its OWN weekly scores and nobody else's. The only
 * cross-user source is the `leaderboard` RPC — and it takes a week. So the
 * entire per-week picture (best week, movement, week-by-week rank) is bought
 * with one RPC call per scored week and nothing else. No new SQL, no invented
 * numbers.
 *
 * The season board stays authoritative for points, rank and weeks played. The
 * week boards only ever ADD columns, so a week fetch that fails or is still in
 * flight degrades to an em dash rather than to a wrong total.
 */
import { supabase } from '@/lib/supabase';

export type Entry = {
  rank: number;
  user_id: string;
  display_name: string;
  total_points: number;
  weeks_played: number;
};

export type Slate = { season: number; season_type: number; week: number };

/** One player's line in one week's board. */
export type WeekLine = { week: number; points: number; rank: number };

/** Week boards in ascending week order. Weeks nobody scored are omitted. */
export type WeekBoards = { week: number; entries: Entry[] }[];

export type Scope = 'season' | number;

export type Standing = {
  userId: string;
  name: string;
  /** Rank within the ACTIVE scope — season to date, or the selected week. */
  rank: number;
  /** Points within the active scope. */
  points: number;
  /** Always season-to-date, in either scope, so the field has one meaning. */
  weeksPlayed: number;
  seasonRank: number | null;
  avg: number | null;
  best: WeekLine | null;
  /**
   * Places gained since the previous scored week. Null means "was not ranked
   * then" — a different claim from 0 ("held position"), and the row renders
   * the two differently.
   */
  movement: number | null;
  weekly: WeekLine[];
};

/**
 * Every call has to share a limit. The RPC ranks then truncates, so a season
 * board of 500 against week boards of 100 would hand everyone below the week
 * cut a wrong "best week" instead of no best week. 500 is the RPC's own
 * ceiling (`least(coalesce(p_limit,100), 500)`).
 */
export const BOARD_LIMIT = 500;

/** Backstop so a nonsense slate week cannot fan out into hundreds of calls. */
const MAX_WEEK_FETCH = 25;

export function normaliseEntries(rows: Entry[] | null | undefined): Entry[] {
  // `total_points` is numeric(10,2) and `rank`/`weeks_played` are bigint. Both
  // can arrive as strings depending on how the driver renders them, and a
  // string here silently breaks every sort and sum below.
  return (rows ?? []).map((r) => ({
    rank: Number(r.rank),
    user_id: r.user_id,
    display_name: r.display_name,
    total_points: Number(r.total_points),
    weeks_played: Number(r.weeks_played),
  }));
}

/** 1 = preseason, 2 = regular, 3 = post. Mirrors the rest of the app. */
export function slateLabel(seasonType: number): string {
  if (seasonType === 1) return 'Preseason';
  if (seasonType === 3) return 'Postseason';
  return 'Season';
}

/** Tab label: "Pre 3" / "Wk 3". */
export function weekTabLabel(seasonType: number, week: number): string {
  return seasonType === 1 ? `Pre ${week}` : `Wk ${week}`;
}

/** 9pt column header, so it has to be tiny: "P3" / "W3". */
export function weekShortLabel(seasonType: number, week: number): string {
  return seasonType === 1 ? `P${week}` : `W${week}`;
}

/**
 * One board per scored week, fetched in parallel.
 *
 * A week that errors is dropped rather than propagated: this is the enrichment
 * pass, and losing the "best week" column is a far better failure than
 * replacing a rendered leaderboard with an error string.
 */
export async function fetchWeekBoards(
  season: number,
  seasonType: number,
  throughWeek: number,
): Promise<WeekBoards> {
  const last = Math.min(Math.max(throughWeek, 0), MAX_WEEK_FETCH);
  if (last === 0) return [];

  const weeks = Array.from({ length: last }, (_, i) => i + 1);
  const results = await Promise.all(
    weeks.map(async (week) => {
      const { data, error } = await supabase.rpc('leaderboard', {
        p_season: season,
        p_season_type: seasonType,
        p_week: week,
        p_limit: BOARD_LIMIT,
      });
      if (error) return null;
      return { week, entries: normaliseEntries(data as Entry[] | null) };
    }),
  );

  // Ascending, and only weeks somebody actually scored — an unplayed week must
  // not become a gap in the middle of a movement calculation.
  return results.filter((b): b is WeekBoards[number] => b !== null && b.entries.length > 0);
}

function linesByUser(weeks: WeekBoards): Map<string, WeekLine[]> {
  const out = new Map<string, WeekLine[]>();
  for (const board of weeks) {
    for (const e of board.entries) {
      const list = out.get(e.user_id);
      const line = { week: board.week, points: e.total_points, rank: e.rank };
      if (list) list.push(line);
      else out.set(e.user_id, [line]);
    }
  }
  return out;
}

/**
 * Standings as they stood at the end of the given week boards.
 *
 * Summed from the week boards rather than subtracted from the season total, so
 * this stays correct if the season board and the week boards ever disagree.
 * The RPC ranks with `rank() over (order by pts desc, display_name asc)`, whose
 * ties therefore require an identical name as well as identical points —
 * sorting the same way and taking the position reproduces it.
 */
function ranksAsOf(weeks: WeekBoards): Map<string, number> {
  const totals = new Map<string, { points: number; name: string }>();
  for (const board of weeks) {
    for (const e of board.entries) {
      const prev = totals.get(e.user_id);
      totals.set(e.user_id, {
        points: (prev?.points ?? 0) + e.total_points,
        name: e.display_name,
      });
    }
  }
  const out = new Map<string, number>();
  [...totals.entries()]
    .sort((a, b) => b[1].points - a[1].points || a[1].name.localeCompare(b[1].name))
    .forEach(([userId], i) => out.set(userId, i + 1));
  return out;
}

function bestOf(weekly: WeekLine[]): WeekLine | null {
  return weekly.reduce<WeekLine | null>((b, w) => (b === null || w.points > b.points ? w : b), null);
}

export function buildStandings(scope: Scope, season: Entry[], weeks: WeekBoards): Standing[] {
  const weekly = linesByUser(weeks);
  const seasonBy = new Map(season.map((e) => [e.user_id, e] as const));

  const enrich = (userId: string, name: string) => {
    const lines = weekly.get(userId) ?? [];
    const s = seasonBy.get(userId);
    return {
      userId,
      name,
      // Falling back to the count of week lines keeps the column truthful for
      // anyone the season board truncated away.
      weeksPlayed: s ? s.weeks_played : lines.length,
      seasonRank: s?.rank ?? null,
      avg: s && s.weeks_played > 0 ? s.total_points / s.weeks_played : null,
      best: bestOf(lines),
      weekly: lines,
    };
  };

  if (scope === 'season') {
    // Movement over the season is measured against where everyone stood before
    // the most recent scored week — which is the only comparison the data
    // supports and the one every fantasy app shows.
    const prior = weeks.length > 0 ? ranksAsOf(weeks.slice(0, -1)) : null;
    return season.map((e) => {
      const before = prior?.get(e.user_id);
      return {
        ...enrich(e.user_id, e.display_name),
        rank: e.rank,
        points: e.total_points,
        movement: before === undefined ? null : before - e.rank,
      };
    });
  }

  const index = weeks.findIndex((w) => w.week === scope);
  if (index === -1) return [];
  // The PREVIOUS SCORED week, not week-1: a bye or an unplayed preseason week
  // would otherwise make every row look like it had never been ranked.
  const prevBoard = index > 0 ? weeks[index - 1].entries : [];
  const prevRank = new Map(prevBoard.map((e) => [e.user_id, e.rank] as const));

  return weeks[index].entries.map((e) => {
    const before = prevRank.get(e.user_id);
    return {
      ...enrich(e.user_id, e.display_name),
      rank: e.rank,
      points: e.total_points,
      movement: before === undefined ? null : before - e.rank,
    };
  });
}
