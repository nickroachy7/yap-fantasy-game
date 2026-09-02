/**
 * Shape and coercion for the `player_profile` RPC.
 *
 * The RPC returns `Json`, so every field is untyped and nullable at the
 * boundary. Coercing in exactly one place means the screen can read plain
 * numbers and the "did the provider actually report this" question is answered
 * once rather than at each render site.
 *
 * The distinction that matters most here is NULL vs 0. A season the provider
 * never reported comes back with `baseFp: null`, and that is not the same
 * claim as a season worth zero points — see `season_base_points`.
 */
import type { Json } from '@/lib/database.types';

export type CareerSeason = {
  season: number;
  gamesPlayed: number | null;
  /** Null when the provider reported no scoring stats for this season. */
  baseFp: number | null;
  baseFpPerGame: number | null;
  /**
   * Scored from per-game rows, so it INCLUDES the per-game bonuses that a
   * season total cannot express — and it is the same number the leaderboard
   * uses. Present only for seasons whose game rows we ingested; prefer it
   * wherever it exists.
   *
   * It does not always exceed `baseFp`. 2025 comes out +12.0 (four bonus
   * games) but 2024 is -2.0: the provider's season totals do not perfectly
   * reconcile with its own game logs. Preferring this one is still right,
   * because agreeing with our own leaderboard matters more than agreeing with
   * the provider's aggregate.
   */
  exactFp: number | null;
  exactGames: number | null;
  exactFpPerGame: number | null;
  /** Null whenever baseFp is — you cannot rank a season you have no number for. */
  posRank: number | null;
  /** How many players the rank was computed against. Always shown with it. */
  rankPool: number | null;
  stats: Record<string, number | null>;
};

export type PlayerBio = {
  id: string;
  name: string;
  position: string | null;
  positionAbbreviation: string | null;
  jerseyNumber: string | null;
  height: string | null;
  weight: string | null;
  college: string | null;
  experience: string | null;
  age: number | null;
  injuryStatus: string | null;
  injuryComment: string | null;
  injuryUpdatedAt: string | null;
  teamAbbreviation: string | null;
  teamName: string | null;
  conference: string | null;
  division: string | null;
};

export type CurrentSeason = {
  season: number | null;
  seasonType: number | null;
  games: number;
  /** Scored from per-game rows, so this DOES include per-game bonuses. */
  fp: number;
  fpPerGame: number | null;
};

export type UsageShare = {
  season: number | null;
  targets: number;
  carries: number;
  /** 0–1. Null when the team has recorded none of that action yet. */
  targetShare: number | null;
  carryShare: number | null;
  rankOnTeam: number | null;
  positionGroupSize: number | null;
};

export type TeamStandings = {
  season: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  overallRecord: string | null;
  divisionRecord: string | null;
  conferenceRecord: string | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  pointDifferential: number | null;
  playoffSeed: number | null;
};

export type PlayerProfile = {
  player: PlayerBio;
  career: CareerSeason[];
  current: CurrentSeason | null;
  usage: UsageShare | null;
  standings: TeamStandings | null;
};

type Obj = { [k: string]: Json | undefined };

const obj = (v: Json | undefined): Obj | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;

const str = (v: Json | undefined): string | null => (typeof v === 'string' ? v : null);

/** Numeric jsonb can arrive as a JS number or a string depending on the driver. */
const num = (v: Json | undefined): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const numOr = (v: Json | undefined, fallback: number): number => num(v) ?? fallback;

function statsOf(v: Json | undefined): Record<string, number | null> {
  const o = obj(v);
  if (!o) return {};
  const out: Record<string, number | null> = {};
  for (const [k, value] of Object.entries(o)) out[k] = num(value);
  return out;
}

export function parseProfile(payload: Json): PlayerProfile | null {
  const root = obj(payload);
  const p = obj(root?.player);
  if (!root || !p || !str(p.id)) return null;

  const careerRaw = Array.isArray(root.career) ? root.career : [];
  const career: CareerSeason[] = careerRaw
    .map((entry) => {
      const e = obj(entry);
      if (!e) return null;
      const season = num(e.season);
      if (season === null) return null;
      return {
        season,
        gamesPlayed: num(e.games_played),
        baseFp: num(e.base_fp),
        baseFpPerGame: num(e.base_fp_per_game),
        exactFp: num(e.exact_fp),
        exactGames: num(e.exact_games),
        exactFpPerGame: num(e.exact_fp_per_game),
        posRank: num(e.pos_rank),
        rankPool: num(e.rank_pool),
        stats: statsOf(e.stats),
      };
    })
    .filter((s): s is CareerSeason => s !== null);

  const cur = obj(root.current);
  const use = obj(root.usage);
  const st = obj(root.standings);

  return {
    player: {
      id: str(p.id)!,
      name: str(p.name) ?? 'Unknown player',
      position: str(p.position),
      positionAbbreviation: str(p.position_abbreviation),
      jerseyNumber: str(p.jersey_number),
      height: str(p.height),
      weight: str(p.weight),
      college: str(p.college),
      experience: str(p.experience),
      age: num(p.age),
      injuryStatus: str(p.injury_status),
      injuryComment: str(p.injury_comment),
      injuryUpdatedAt: str(p.injury_updated_at),
      teamAbbreviation: str(p.team_abbreviation),
      teamName: str(p.team_name),
      conference: str(p.conference),
      division: str(p.division),
    },
    career,
    current: cur
      ? {
          season: num(cur.season),
          seasonType: num(cur.season_type),
          games: numOr(cur.games, 0),
          fp: numOr(cur.fp, 0),
          fpPerGame: num(cur.fp_per_game),
        }
      : null,
    usage: use
      ? {
          season: num(use.season),
          targets: numOr(use.targets, 0),
          carries: numOr(use.carries, 0),
          targetShare: num(use.target_share),
          carryShare: num(use.carry_share),
          rankOnTeam: num(use.rank_on_team),
          positionGroupSize: num(use.position_group_size),
        }
      : null,
    standings: st
      ? {
          season: num(st.season),
          wins: num(st.wins),
          losses: num(st.losses),
          ties: num(st.ties),
          overallRecord: str(st.overall_record),
          divisionRecord: str(st.division_record),
          conferenceRecord: str(st.conference_record),
          pointsFor: num(st.points_for),
          pointsAgainst: num(st.points_against),
          pointDifferential: num(st.point_differential),
          playoffSeed: num(st.playoff_seed),
        }
      : null,
  };
}

/**
 * The stat columns worth a career table, per position group. A running back's
 * passing line is noise; a quarterback's receptions are a curiosity at best.
 */
export type CareerColumn = {
  key: string;
  label: string;
  /**
   * The family the column belongs to, printed as a spanning header above it.
   *
   * `PASS YD / TD / INT / RUSH YD` on a quarterback is four abbreviations in a
   * row where two of them belong to one act and two to another, and `TD` is
   * ambiguous between them — the reader has to count across from the position
   * to know which. A band above the group says it once. Consecutive columns
   * sharing a family are spanned together, so the order here IS the grouping;
   * do not interleave two families.
   */
  family: string;
};

export const CAREER_COLUMNS: Record<string, CareerColumn[]> = {
  QB: [
    { key: 'passing_yards', label: 'YD', family: 'PASSING' },
    { key: 'passing_touchdowns', label: 'TD', family: 'PASSING' },
    { key: 'passing_interceptions', label: 'INT', family: 'PASSING' },
    { key: 'rushing_yards', label: 'YD', family: 'RUSHING' },
  ],
  RB: [
    { key: 'rushing_attempts', label: 'ATT', family: 'RUSHING' },
    { key: 'rushing_yards', label: 'YD', family: 'RUSHING' },
    { key: 'rushing_touchdowns', label: 'TD', family: 'RUSHING' },
    { key: 'receptions', label: 'REC', family: 'RECEIVING' },
    { key: 'receiving_yards', label: 'YD', family: 'RECEIVING' },
  ],
  WR: [
    { key: 'receiving_targets', label: 'TGT', family: 'RECEIVING' },
    { key: 'receptions', label: 'REC', family: 'RECEIVING' },
    { key: 'receiving_yards', label: 'YD', family: 'RECEIVING' },
    { key: 'receiving_touchdowns', label: 'TD', family: 'RECEIVING' },
  ],
  TE: [
    { key: 'receiving_targets', label: 'TGT', family: 'RECEIVING' },
    { key: 'receptions', label: 'REC', family: 'RECEIVING' },
    { key: 'receiving_yards', label: 'YD', family: 'RECEIVING' },
    { key: 'receiving_touchdowns', label: 'TD', family: 'RECEIVING' },
  ],
  PK: [
    { key: 'field_goals_made', label: 'FG', family: 'KICKING' },
    { key: 'field_goal_attempts', label: 'FGA', family: 'KICKING' },
    { key: 'extra_points_made', label: 'XP', family: 'KICKING' },
    { key: 'long_field_goal_made', label: 'LONG', family: 'KICKING' },
  ],
};

/** Anything not in the map still gets a table, just a generic one. */
export const DEFAULT_CAREER_COLUMNS: CareerColumn[] = [
  { key: 'total_tackles', label: 'TKL', family: 'DEFENCE' },
  { key: 'defensive_sacks', label: 'SACK', family: 'DEFENCE' },
  { key: 'defensive_interceptions', label: 'INT', family: 'DEFENCE' },
];

export function careerColumnsFor(position: string | null) {
  if (!position) return DEFAULT_CAREER_COLUMNS;
  return CAREER_COLUMNS[position] ?? DEFAULT_CAREER_COLUMNS;
}

/**
 * The stat columns collapsed into their spanning bands, in order.
 *
 * Consecutive columns with the same `family` become one band of that width.
 * Non-consecutive ones would become two bands with the same name, which is why
 * the column lists are ordered by family and must stay that way.
 */
export function careerColumnGroups(position: string | null): { family: string; span: number }[] {
  const out: { family: string; span: number }[] = [];
  for (const col of careerColumnsFor(position)) {
    const last = out[out.length - 1];
    if (last && last.family === col.family) last.span += 1;
    else out.push({ family: col.family, span: 1 });
  }
  return out;
}
