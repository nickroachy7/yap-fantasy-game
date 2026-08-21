/**
 * Reads for the scoreboard, split by how often each thing changes.
 *
 * A season's fixture list is ~340 rows and changes almost never, so it is
 * fetched once and every week switch after that is a client-side filter — which
 * is what makes the week picker feel instant instead of costing a round trip
 * per tap. Per-week stat lines are ~1,500 rows and only matter for the week you
 * are looking at, so they are fetched on demand and cached by slate.
 */
import { useCallback, useMemo, useState } from 'react';

import { positionKey } from '@/constants/positions';
import { useLoader, type Load } from '@/hooks/use-loader';
import { fetchAllPages } from '@/lib/paged';
import { sessionCache, useSessionRead } from '@/lib/session-cache';
import { supabase } from '@/lib/supabase';

import { slateOrder, statusOf, type Leader, type ScoreGame, type ScoreTeam } from './scoreboard';

export type Slate = { season: number; seasonType: number; week: number };

/** Key for the leader cache and for React keys. */
export const slateKey = (s: Slate) => `${s.season}-${s.seasonType}-${s.week}`;

type GameRow = {
  id: string;
  season: number;
  season_type: number;
  week: number | null;
  home_team_id: string | null;
  visitor_team_id: string | null;
  home_score: number | null;
  visitor_score: number | null;
  starts_at: string | null;
  status: string | null;
  status_state: string | null;
};

type TeamRow = { id: string; abbreviation: string; name: string | null };

export type SeasonSchedule = {
  games: ScoreGame[];
  /** Every slate that has fixtures, chronological. Drives the week picker. */
  slates: Slate[];
  teams: Map<string, ScoreTeam>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * The slate the competition is currently in, per `current_slate()`.
 *
 * Every screen that needs it was making its own round trip for a value that
 * changes a few times a year, and on the trend board that trip was load-bearing
 * in the worst way: until it landed the screen used the fallback season, so a
 * revisit asked `useSeasonSchedule` for the wrong season for one render and
 * missed the cache it was about to hit. Peeking it removes both costs.
 *
 * IT KEEPS THE WHOLE ROW NOW, not just the season. It cached only
 * `data[0].season` and threw the week away, so the wide-web score band — which
 * wants exactly the week the RPC just named — would have had to make a second
 * identical call for the two fields this one had already fetched and discarded.
 * The season accessors below are unchanged in behaviour and read through it.
 *
 * Null means the RPC returned nothing — the caller's own fallback applies. That
 * is a real answer and is cached; only a thrown read is retried.
 */
const currentSlate = sessionCache<'now', Slate | null>(async () => {
  const { data, error } = await supabase.rpc('current_slate');
  if (error) throw new Error(error.message);
  const row = (data as { season: number; season_type: number; week: number }[] | null)?.[0];
  return row ? { season: row.season, seasonType: row.season_type, week: row.week } : null;
});

export function loadCurrentSeason(): Promise<number | null> {
  return currentSlate.read('now').then((s) => s?.season ?? null).catch(() => null);
}

/** The season IF it has already landed. Never starts a read. */
export function peekCurrentSeason(): number | null {
  return currentSlate.peek('now')?.season ?? null;
}

/**
 * The current slate, as a hook, for chrome that is mounted for the whole
 * session rather than for one screen.
 *
 * Null while it is in flight AND when the RPC has nothing to say — the two are
 * deliberately not distinguished, because the one caller (`WebHeader`) draws
 * the same thing either way: a band with no fixtures in it. A screen that needs
 * to tell "loading" from "offseason" apart should read the cache directly.
 */
export function useCurrentSlate(): Slate | null {
  return useSessionRead(currentSlate, 'now').value ?? null;
}

type Schedule = { games: ScoreGame[]; slates: Slate[]; teams: Map<string, ScoreTeam> };

async function fetchSeasonSchedule(key: string): Promise<Schedule> {
  const season = Number(key);
  const [teamRows, gameRows] = await Promise.all([
    supabase
      .from('teams')
      .select('id, abbreviation, name')
      .then(({ data, error: e }) => {
        if (e) throw new Error(e.message);
        return (data ?? []) as TeamRow[];
      }),
    // Paged even though a season is ~340 rows: the cap is silent, and a
    // scoreboard that quietly loses week 18 is worse than a slow one.
    fetchAllPages<GameRow>((from, to) =>
      supabase
        .from('games')
        .select(
          'id, season, season_type, week, home_team_id, visitor_team_id, home_score, visitor_score, starts_at, status, status_state',
        )
        .eq('season', season)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  const byId = new Map<string, ScoreTeam>(
    teamRows.map((t) => [t.id, { id: t.id, abbreviation: t.abbreviation, name: t.name }]),
  );
  const games = gameRows.map<ScoreGame>((g) => ({
    id: g.id,
    season: g.season,
    seasonType: g.season_type,
    week: g.week,
    home: g.home_team_id ? (byId.get(g.home_team_id) ?? null) : null,
    away: g.visitor_team_id ? (byId.get(g.visitor_team_id) ?? null) : null,
    homeScore: g.home_score,
    awayScore: g.visitor_score,
    startsAt: g.starts_at,
    status: statusOf(g.status_state),
    statusText: g.status,
  }));

  /* Derived here rather than in a `useMemo` downstream: the slate list is a
     pure function of the games, so it belongs with them in the cache. A hook
     recomputing it on every mount would be recomputing a constant. */
  const seen = new Map<string, Slate>();
  for (const g of games) {
    if (g.week === null) continue;
    const s = { season: g.season, seasonType: g.seasonType, week: g.week };
    seen.set(slateKey(s), s);
  }
  const slates = [...seen.values()].sort(
    (a, b) => slateOrder(a.seasonType, a.week) - slateOrder(b.seasonType, b.week),
  );

  return { games, slates, teams: byId };
}

/**
 * A season's fixtures do not change under you, and three screens read them —
 * the scoreboard, the lineup and the trend board. Re-reading ~340 games plus
 * the club table on every mount is a large part of what made leaving Trend and
 * coming back cost a visible pause. Held for the session it costs nothing, and
 * because the cache can be PEEKED the revisit has its fixtures in the first
 * render rather than a frame later. See `lib/session-cache`.
 */
const schedules = sessionCache<string, Schedule>(fetchSeasonSchedule);

/** One object, so `useMemo` deps downstream do not churn while it is empty. */
const NO_SCHEDULE: Schedule = { games: [], slates: [], teams: new Map() };

export function useSeasonSchedule(season: number): SeasonSchedule {
  const { value, loading, error, reload } = useSessionRead(schedules, String(season));
  const schedule = value ?? NO_SCHEDULE;

  return {
    games: schedule.games,
    slates: schedule.slates,
    teams: schedule.teams,
    loading,
    error,
    /* Async so a caller can await it. It drops the cached season and reads it
       again, which means `loading` goes true for the duration — see the note on
       `useSessionRead().reload`. No screen calls this today. */
    reload: async () => reload(),
  };
}

type StatRow = {
  game_id: string;
  player_id: string;
  team_id: string | null;
  players: { full_name: string | null; position_abbreviation: string | null } | null;
  fantasy_points: { points: number; rules_version: number }[];
};

/**
 * Every scored performance in one slate, richest first.
 *
 * This deliberately fetches the whole slate rather than a top-N. PostgREST
 * cannot order by an embedded resource, so "the twenty best receivers" is not
 * expressible as a query — the ranking has to happen here either way, and once
 * the rows are on the client they also answer the per-game panel and the
 * position filter without three more round trips. It is ~1,500 rows once per
 * week viewed, cached for the session.
 */
/**
 * Owned player ids — the "in your collection" mark on each leader row.
 *
 * Session-cached rather than read per mount, and deliberately allowed to REJECT
 * on failure: an empty set cached forever would silently un-mark the whole
 * collection for the rest of the session, where a rejection is simply retried
 * the next time a screen asks. Callers treat the failure as "no marks", which
 * under-claims rather than over-claims — the right way to be wrong about "you
 * own this".
 */
const ownedIds = sessionCache<'me', Set<string>>(async () => {
  const rows = await fetchAllPages<{ player_id: string | null; id: string | null }>((from, to) =>
    supabase
      .from('my_collection')
      .select('id, player_id')
      .order('id', { ascending: true })
      .range(from, to),
  );
  return new Set(rows.map((r) => r.player_id).filter((v): v is string => Boolean(v)));
});

const NO_IDS: Set<string> = new Set();

/**
 * One week's stat lines, ~1,500 rows, cached BY SLATE and for the session.
 *
 * This cache used to be component state, which meant every screen that mounted
 * `useWeekLeaders` re-read both of the weeks it compares — so the trend board
 * paid for ~3,000 rows each time you flipped to Leaders and back. At module
 * level the second visit costs nothing and, being peekable, renders in the
 * first frame instead of after a spinner.
 *
 * RAW ROWS, not `Leader[]`. Mapping needs the club table, which is a separate
 * read that may land after this one; baking abbreviations in at fetch time is
 * how you get the first week you open to be the one week with no club names.
 * The mapping is a `useMemo` in the hook instead.
 */
const statLines = sessionCache<string, StatRow[]>((key) => {
  const [season, seasonType, week] = key.split('-').map(Number);
  return fetchAllPages<StatRow>((from, to) =>
    supabase
      .from('stat_lines')
      .select(
        'id, game_id, player_id, team_id, players(full_name, position_abbreviation), fantasy_points(points, rules_version)',
      )
      .eq('season', season)
      .eq('season_type', seasonType)
      .eq('week', week)
      .order('id', { ascending: true })
      .range(from, to)
      .returns<StatRow[]>(),
  );
});

/** The nightly sweep rewrites points. Nothing else should clear these. */
export function invalidateWeekLeaders(): void {
  statLines.invalidate();
  ownedIds.invalidate();
}

export function useWeekLeaders(
  slate: Slate | null,
  teams: Map<string, ScoreTeam>,
): { leaders: Leader[]; loading: boolean; error: string | null } {
  /* The slate object is rebuilt on every render by its caller, so everything
     downstream keys off its KEY rather than its identity or this re-reads
     forever. A null slate is "nothing to ask for yet", which the cache hook
     understands and simply idles on. */
  const key = slate ? slateKey(slate) : null;

  const { value: rows, loading, error } = useSessionRead(statLines, key);
  /* Ownership resolves independently of the slate read, so it is applied on
     read rather than baked in — see the cache above. Its error is dropped on
     purpose: a missing mark is a missing decoration, not a failed screen. */
  const owned = useSessionRead(ownedIds, 'me').value ?? NO_IDS;

  const leaders = useMemo(
    () => (rows ? toLeaders(rows, teams).map((l) => ({ ...l, owned: owned.has(l.playerId) })) : []),
    [rows, teams, owned],
  );

  return { leaders, loading, error };
}

function toLeaders(rows: StatRow[], teams: Map<string, ScoreTeam>): Leader[] {
  const out: Leader[] = [];
  for (const row of rows) {
    // Highest rules_version wins, same rule as the lineup screen: versions only
    // ever go up, so the newest computed row is the current one.
    const best = row.fantasy_points.reduce<{ points: number; rules_version: number } | null>(
      (acc, fp) => (acc === null || fp.rules_version > acc.rules_version ? fp : acc),
      null,
    );
    // No fantasy_points row means the line has not been scored under ANY
    // ruleset — which is not the same as a nought-point game, and putting it in
    // at zero would pad every position list with unscored players.
    if (!best) continue;
    const pos = row.players?.position_abbreviation ?? null;
    out.push({
      playerId: row.player_id,
      gameId: row.game_id,
      name: row.players?.full_name ?? 'Unknown player',
      position: positionKey(pos),
      positionLabel: pos,
      // The team he played FOR in this game, not the team he is on today.
      teamAbbreviation: row.team_id ? (teams.get(row.team_id)?.abbreviation ?? null) : null,
      points: Number(best.points),
      owned: false,
    });
  }
  return out;
}

/**
 * One week's fixtures, for the strip at the top of the lineup screen.
 *
 * Deliberately not `useSeasonSchedule` filtered down. That hook reads ~340 game
 * rows so its week picker can switch without a round trip, which is right for a
 * screen whose whole job is browsing weeks and wrong for a strip that shows one
 * week and never changes it — the lineup screen already makes two round trips
 * before it can render a row, and a third that reads the whole season to draw
 * sixteen tiles is the kind of cost that only shows up on someone else's phone.
 *
 * The teams table is small and read by nearly every screen; it is fetched here
 * rather than threaded down so this hook stands alone.
 */
export function useSlateGames(slate: Slate | null): {
  games: ScoreGame[];
  loading: boolean;
  error: string | null;
} {
  const [games, setGames] = useState<ScoreGame[]>([]);

  /* Keyed on the slate's VALUE, not its identity: the lineup screen rebuilds
     its slate object on every countdown tick, and depending on the object
     itself would refetch this once a second. */
  const key = slate ? slateKey(slate) : null;

  const load = useCallback<Load>(
    async (live) => {
      if (!slate || !key) return;
      try {
        const [teamRows, gameRows] = await Promise.all([
          supabase
            .from('teams')
            .select('id, abbreviation, name')
            .then(({ data, error: e }) => {
              if (e) throw new Error(e.message);
              return (data ?? []) as TeamRow[];
            }),
          supabase
            .from('games')
            .select(
              'id, season, season_type, week, home_team_id, visitor_team_id, home_score, visitor_score, starts_at, status, status_state',
            )
            .eq('season', slate.season)
            .eq('season_type', slate.seasonType)
            .eq('week', slate.week)
            .then(({ data, error: e }) => {
              if (e) throw new Error(e.message);
              return (data ?? []) as GameRow[];
            }),
        ]);
        if (!live()) return;

        const byId = new Map<string, ScoreTeam>(
          teamRows.map((t) => [t.id, { id: t.id, abbreviation: t.abbreviation, name: t.name }]),
        );
        setGames(
          gameRows
            .map((g) => ({
              id: g.id,
              season: g.season,
              seasonType: g.season_type,
              week: g.week,
              home: g.home_team_id ? (byId.get(g.home_team_id) ?? null) : null,
              away: g.visitor_team_id ? (byId.get(g.visitor_team_id) ?? null) : null,
              homeScore: g.home_score,
              awayScore: g.visitor_score,
              startsAt: g.starts_at,
              status: statusOf(g.status_state),
              statusText: g.status,
            }))
            // Kickoff order, untimed last, so the strip reads as a weekend.
            .sort((a, b) => (a.startsAt ?? '9').localeCompare(b.startsAt ?? '9')),
        );
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not load this week’s games.';
      }
    },
    // `slate` is read through `key`; see above. The loader's identity is what
    // starts a new read, so keying it here is what keys the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const { loading, error } = useLoader(load);

  /* With no slate there is nothing to wait for, so `loading` is false without
     the effect having to say so — writing state from an effect body just to
     report "nothing to do" is a cascading render for no information. */
  return { games, loading: key !== null && loading, error };
}
