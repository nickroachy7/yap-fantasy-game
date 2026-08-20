/**
 * Shape and grouping for the `player_game_log` RPC.
 *
 * The RPC returns one flat list so the client does not have to make a request
 * per season. Grouping happens here because the SHAPE the screen wants —
 * seasons stacked newest-first, games inside each running forwards — is a
 * presentation decision, not a storage one.
 */
import type { Json } from '@/lib/database.types';

export type GameLogGame = {
  gameId: string;
  season: number;
  seasonType: number;
  week: number | null;
  startsAt: string | null;
  statusState: string | null;
  /** True when we hold a stat line for him in this game. */
  played: boolean;
  /**
   * What the row IS, which `played` alone could not say.
   *
   * `played` is a two-state flag over a three-state world, and the missing
   * state is the one a reader most wants marked: a game that HAS been played,
   * by his team, that he was not in. Injured, inactive, benched — the log had
   * been drawing those exactly like a fixture in three weeks' time, a dimmed
   * row with a kickoff date on it, which reads as "not yet" rather than "he
   * missed it".
   *
   * The distinction is free: `games.status_state` is only ever `final` or
   * `scheduled`, so a final game with no stat line is a DNP and a scheduled one
   * is genuinely upcoming.
   */
  status: 'played' | 'dnp' | 'upcoming';
  points: number | null;
  isHome: boolean | null;
  opponent: string | null;
  teamScore: number | null;
  oppScore: number | null;
  stats: Record<string, number | null>;
};

/**
 * One stage within a season: its preseason, its regular season, its playoffs.
 *
 * The season is ONE section — a reader opening 2026 wants the year, not a third
 * of it — but the three stages are not interchangeable and the rows must not
 * run together. Preseason points are earned against players who will be cut;
 * a playoff week is a different thing again. So they are grouped inside the
 * section and the table breaks between them.
 */
export type GameLogStage = {
  seasonType: number;
  /** 'Preseason' | 'Regular Season' | 'Postseason'. */
  label: string;
  games: GameLogGame[];
};

export type GameLogSection = {
  key: string;
  season: number;
  label: string;
  /** In played order: preseason, regular season, postseason. */
  stages: GameLogStage[];
  /** Totals over PLAYED games only — an upcoming fixture is not a zero. */
  playedCount: number;
  /** Fixtures still to come. A missed game is in NEITHER count — see `status`. */
  upcomingCount: number;
  totalPoints: number | null;
  pointsPerGame: number | null;
  best: number | null;
};

type Obj = { [k: string]: Json | undefined };
const obj = (v: Json | undefined): Obj | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
const str = (v: Json | undefined): string | null => (typeof v === 'string' ? v : null);
const num = (v: Json | undefined): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

function statsOf(v: Json | undefined): Record<string, number | null> {
  const o = obj(v);
  if (!o) return {};
  const out: Record<string, number | null> = {};
  for (const [k, value] of Object.entries(o)) out[k] = num(value);
  return out;
}

/** 1 = preseason, 2 = regular, 3 = post. */
export function seasonTypeLabel(seasonType: number): string {
  if (seasonType === 1) return 'Preseason';
  if (seasonType === 3) return 'Postseason';
  return 'Regular Season';
}

export function weekLabel(seasonType: number, week: number | null): string {
  const w = week === null ? '—' : String(week);
  if (seasonType === 1) return `P${w}`;
  if (seasonType === 3) return `PO${w}`;
  return w;
}

/** Split one season's games into its stages, each running week 1 upward. */
function stagesOf(games: GameLogGame[]): GameLogStage[] {
  const byStage = new Map<number, GameLogGame[]>();
  for (const g of games) {
    const bucket = byStage.get(g.seasonType);
    if (bucket) bucket.push(g);
    else byStage.set(g.seasonType, [g]);
  }
  return [...byStage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seasonType, bucket]) => ({
      seasonType,
      label: seasonTypeLabel(seasonType),
      games: [...bucket].sort((a, b) => (a.week ?? 0) - (b.week ?? 0)),
    }));
}

export function parseGameLog(payload: Json): GameLogSection[] {
  const list = Array.isArray(payload) ? payload : [];
  const games: GameLogGame[] = [];

  for (const entry of list) {
    const e = obj(entry);
    if (!e) continue;
    const season = num(e.season);
    const seasonType = num(e.season_type);
    const gameId = str(e.game_id);
    if (season === null || seasonType === null || !gameId) continue;

    games.push({
      gameId,
      season,
      seasonType,
      week: num(e.week),
      startsAt: str(e.starts_at),
      statusState: str(e.status_state),
      played: e.played === true,
      status:
        e.played === true
          ? 'played'
          : str(e.status_state) === 'final'
            ? 'dnp'
            : 'upcoming',
      points: num(e.points),
      isHome: typeof e.is_home === 'boolean' ? e.is_home : null,
      opponent: str(e.opponent),
      teamScore: num(e.team_score),
      oppScore: num(e.opp_score),
      stats: statsOf(e.stats),
    });
  }

  /**
   * ONE SECTION PER SEASON, with every stage inside it.
   *
   * It used to bucket by `season-seasonType`, which gave a player three
   * sections for one year — "2026 Preseason", "2026 Regular Season", "2026
   * Postseason" — stacked as if they were separate campaigns. They are not.
   * A season is a season; preseason and the playoffs are its ends, and the
   * reader opening 2026 wants the year, not a third of it.
   *
   * Nothing is lost by merging: the WK column already prefixes the stage
   * (`P3`, `12`, `PO1` — see `weekLabel`), so the rows stay distinguishable
   * inside one table, and ordering them by stage puts the year in the sequence
   * it was actually played.
   */
  const byKey = new Map<string, GameLogGame[]>();
  for (const g of games) {
    const key = String(g.season);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(g);
    else byKey.set(key, [g]);
  }

  const sections: GameLogSection[] = [];
  for (const [key, bucket] of byKey) {
    const played = bucket.filter((g) => g.played && g.points !== null);
    const total = played.length > 0 ? played.reduce((sum, g) => sum + (g.points ?? 0), 0) : null;

    sections.push({
      key,
      season: bucket[0].season,
      label: String(bucket[0].season),
      // Forwards through the season — preseason, then the regular season, then
      // the playoffs, each running week 1 upward. A game log is read in the
      // order it was played even though the seasons themselves stack
      // newest-first.
      stages: stagesOf(bucket),
      playedCount: bucket.filter((g) => g.status === 'played').length,
      upcomingCount: bucket.filter((g) => g.status === 'upcoming').length,
      totalPoints: total === null ? null : Math.round(total * 10) / 10,
      pointsPerGame:
        total === null || played.length === 0
          ? null
          : Math.round((total / played.length) * 10) / 10,
      best:
        played.length === 0
          ? null
          : Math.round(Math.max(...played.map((g) => g.points ?? 0)) * 10) / 10,
    });
  }

  return sections.sort((a, b) => b.season - a.season);
}
