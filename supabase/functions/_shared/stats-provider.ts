/**
 * The provider boundary (build plan task 11).
 *
 * Everything above this file speaks these types. No caller imports a
 * balldontlie shape, so swapping or adding a data vendor is one file
 * (`balldontlie.ts`) rather than a refactor. If the vendor's undocumented
 * response shape drifts, it drifts here and nowhere else.
 */

/** 1 = preseason, 2 = regular season, 3 = postseason. Mirrors the wire format. */
export type SeasonType = 1 | 2 | 3;

export interface ProviderTeam {
  externalId: number;
  abbreviation: string;
  location: string | null;
  name: string | null;
  fullName: string | null;
  conference: string | null;
  division: string | null;
}

export interface ProviderPlayer {
  externalId: number;
  firstName: string;
  lastName: string;
  position: string | null;
  positionAbbreviation: string | null;
  jerseyNumber: string | null;
  height: string | null;
  weight: string | null;
  college: string | null;
  experience: string | null;
  age: number | null;
  teamExternalId: number | null;
}

export interface ProviderGame {
  externalId: number;
  season: number;
  week: number | null;
  seasonType: SeasonType;
  homeTeamExternalId: number | null;
  visitorTeamExternalId: number | null;
  startsAt: string | null;
  status: string | null;
  /** 'pre' | 'in' | 'post' — the field to poll on, not `status`. */
  statusState: string | null;
  homeScore: number | null;
  visitorScore: number | null;
}

export interface ProviderStatLine {
  playerExternalId: number;
  gameExternalId: number;
  teamExternalId: number | null;
  season: number;
  week: number | null;
  seasonType: SeasonType;
  /**
   * The complete stat payload, vendor keys intact and minus the nested
   * player/team/game objects. Persisted verbatim so scoring can be recomputed
   * against a new rules version without re-ingesting.
   */
  raw: Record<string, unknown>;
}

export interface ProviderInjury {
  playerExternalId: number;
  status: string | null;
  comment: string | null;
  date: string | null;
}

export interface ProviderSalary {
  playerExternalId: number;
  slateId: number | null;
  provider: string;
  salary: number;
  position: string | null;
}

export interface GameQuery {
  season: number;
  seasonType: SeasonType;
  weeks?: number[];
}

export interface SalaryQuery {
  season: number;
  seasonType: SeasonType;
  week?: number;
}

export interface StatsProvider {
  listTeams(): Promise<ProviderTeam[]>;
  listActivePlayers(): Promise<ProviderPlayer[]>;
  listGames(query: GameQuery): Promise<ProviderGame[]>;
  /**
   * The vendor's /stats endpoint has no week parameter, so callers must resolve
   * a week to its game ids via listGames() first. That constraint is deliberate
   * and lives in the interface so no caller can forget it.
   */
  listStatLines(gameExternalIds: number[], seasonType: SeasonType): Promise<ProviderStatLine[]>;
  listInjuries(): Promise<ProviderInjury[]>;
  listSalaries(query: SalaryQuery): Promise<ProviderSalary[]>;
}
