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

/**
 * ONE PLAYER'S FANTASY POINTS FOR ONE WEEK, as the PROVIDER scores them.
 *
 * ---------------------------------------------------------------------------
 * THIS IS WHY `scoring.ts` IS NO LONGER THE AUTHORITY
 * ---------------------------------------------------------------------------
 *
 * We wrote a scoring engine because `/stats` returns raw counting stats and no
 * points, and the note recording that is still true as far as it goes. What it
 * missed is `/fantasy/weekly_stats`, which returns points per player per week
 * under three named formats with the full rule definitions inline.
 *
 * Measured against our own engine on 2025 week 1, 269 of 302 lines agreed to
 * the cent. The 17 skill-position gaps were all exactly 3.00 — our yardage
 * bonuses, which their PPR does not have. The other 16 were KICKERS, and there
 * ours was simply worse: a flat 3 per field goal against their 3/4/5/6 by
 * distance and −1 for a miss, so we were underpaying every kicker in the game
 * by 1.2 a week.
 *
 * So their `ppr` format is our scoring now. The engine stays as a verifier and
 * as the reader of `scoring_rules`, but the number that reaches the database is
 * theirs — which is what makes a projection and a result the same currency by
 * construction rather than by two implementations agreeing.
 *
 * `points` is the `ppr` format's `total_points`. The other two formats are
 * carried in `byFormat` untouched, because a reconciliation that cannot see
 * what it is reconciling against is not one.
 */
export interface ProviderFantasyPoints {
  playerExternalId: number;
  gameExternalId: number | null;
  season: number;
  week: number;
  /** The format we run on. Null when the provider scored no PPR line. */
  points: number | null;
  /** Every format the provider returned, keyed by its own name. */
  byFormat: Record<string, number>;
  /**
   * The provider's own position for this row.
   *
   * KEPT, AND NEVER JOINED ON. `/fantasy/*` says `K` where `/players` says
   * `PK` for the same man — see the census note. Every join in this codebase is
   * on the player id; this field exists so a mismatch can be SEEN in the row
   * rather than silently dropping kickers.
   */
  position: string | null;
}

/**
 * What a player is EXPECTED to do in a week that has not been played.
 *
 * The same shape as `ProviderFantasyPoints` plus the raw projected stat line,
 * and deliberately so: a projection and a result differ in tense, not in kind,
 * and the moment they stop sharing a shape is the moment a screen can print one
 * where it means the other.
 *
 * `stats` is the 44-field projected line, kept verbatim. We do not score it —
 * `points` already comes from the provider under the same format as the result
 * it will be compared against — but it is what any future confidence interval,
 * or any argument about why a projection was wrong, would have to be built on.
 */
export interface ProviderProjection extends ProviderFantasyPoints {
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

export interface ProviderSeasonStat {
  playerExternalId: number;
  season: number;
  /** The vendor returns regular season and postseason as separate rows. */
  postseason: boolean;
  gamesPlayed: number | null;
  /**
   * The complete season aggregate, vendor keys intact and minus the nested
   * player object. 63 fields as of 2026 — far more than the profile reads
   * today, which is the reason to keep it whole.
   */
  raw: Record<string, unknown>;
}

export interface ProviderStanding {
  teamExternalId: number;
  season: number;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  pointDifferential: number | null;
  playoffSeed: number | null;
  winStreak: number | null;
  overallRecord: string | null;
  conferenceRecord: string | null;
  divisionRecord: string | null;
  homeRecord: string | null;
  roadRecord: string | null;
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
  /**
   * What every player scored in a week that has been PLAYED, as the provider
   * scores it.
   *
   * Week is required and singular, exactly like `listStatLines`'s game ids: the
   * endpoint takes one week, so a backfill is a loop and the signature says so
   * rather than letting a caller reach for a `weeks[]` that does not exist.
   */
  listWeeklyFantasyPoints(season: number, week: number): Promise<ProviderFantasyPoints[]>;
  /**
   * What every player is expected to score in a week that has NOT been played.
   *
   * Same shape and same scoring format as `listWeeklyFantasyPoints`, which is
   * the entire reason both live on this interface — a projection that could be
   * fetched without its result being fetched the same way is a projection that
   * will eventually be compared against a differently-scored number.
   */
  listProjections(season: number, week: number): Promise<ProviderProjection[]>;
  listInjuries(): Promise<ProviderInjury[]>;
  listSalaries(query: SalaryQuery): Promise<ProviderSalary[]>;
  /**
   * Season aggregates for EVERY player in one season.
   *
   * `season` is required and singular upstream — there is no seasons[] filter —
   * so a career is one request per season, not one per player. The signature
   * says so, to stop a caller reaching for a career-shaped call that does not
   * exist.
   */
  listSeasonStats(season: number): Promise<ProviderSeasonStat[]>;
  listStandings(season: number): Promise<ProviderStanding[]>;
}
