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
  /** False for a fixture that has not happened yet. */
  played: boolean;
  points: number | null;
  isHome: boolean | null;
  opponent: string | null;
  teamScore: number | null;
  oppScore: number | null;
  stats: Record<string, number | null>;
};

export type GameLogSection = {
  key: string;
  season: number;
  seasonType: number;
  label: string;
  games: GameLogGame[];
  /** Totals over PLAYED games only — an upcoming fixture is not a zero. */
  playedCount: number;
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
      points: num(e.points),
      isHome: typeof e.is_home === 'boolean' ? e.is_home : null,
      opponent: str(e.opponent),
      teamScore: num(e.team_score),
      oppScore: num(e.opp_score),
      stats: statsOf(e.stats),
    });
  }

  const byKey = new Map<string, GameLogGame[]>();
  for (const g of games) {
    const key = `${g.season}-${g.seasonType}`;
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
      seasonType: bucket[0].seasonType,
      label: `${bucket[0].season} ${seasonTypeLabel(bucket[0].seasonType)}`,
      // Forwards through the season: a game log is read Week 1 -> Week 18 even
      // though the seasons themselves stack newest-first.
      games: [...bucket].sort((a, b) => (a.week ?? 0) - (b.week ?? 0)),
      playedCount: bucket.filter((g) => g.played).length,
      upcomingCount: bucket.filter((g) => !g.played).length,
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

  // Newest season first, and within a season the later stage first, so
  // postseason sits above the regular season it followed.
  return sections.sort((a, b) => b.season - a.season || b.seasonType - a.seasonType);
}
