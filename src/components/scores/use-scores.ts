/**
 * Reads for the scoreboard, split by how often each thing changes.
 *
 * A season's fixture list is ~340 rows and changes almost never, so it is
 * fetched once and every week switch after that is a client-side filter — which
 * is what makes the week picker feel instant instead of costing a round trip
 * per tap. Per-week stat lines are ~1,500 rows and only matter for the week you
 * are looking at, so they are fetched on demand and cached by slate.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { positionKey } from '@/constants/positions';
import { fetchAllPages } from '@/lib/paged';
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

export function useSeasonSchedule(season: number): SeasonSchedule {
  const [games, setGames] = useState<ScoreGame[]>([]);
  const [teams, setTeams] = useState<Map<string, ScoreTeam>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
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
      setTeams(byId);
      setGames(
        gameRows.map((g) => ({
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
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the schedule.');
    } finally {
      setLoading(false);
    }
  }, [season]);

  useEffect(() => {
    void load();
  }, [load]);

  const slates = useMemo(() => {
    const seen = new Map<string, Slate>();
    for (const g of games) {
      if (g.week === null) continue;
      const s = { season: g.season, seasonType: g.seasonType, week: g.week };
      seen.set(slateKey(s), s);
    }
    return [...seen.values()].sort(
      (a, b) => slateOrder(a.seasonType, a.week) - slateOrder(b.seasonType, b.week),
    );
  }, [games]);

  return { games, slates, teams, loading, error, reload: load };
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
export function useWeekLeaders(
  slate: Slate | null,
  teams: Map<string, ScoreTeam>,
): { leaders: Leader[]; loading: boolean; error: string | null } {
  const [cache, setCache] = useState<Record<string, Leader[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Owned player ids, read once — the "in your collection" mark on each row. */
  const [owned, setOwned] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const rows = await fetchAllPages<{ player_id: string | null; id: string | null }>(
          (from, to) =>
            supabase
              .from('my_collection')
              .select('id, player_id')
              .order('id', { ascending: true })
              .range(from, to),
        );
        if (!live) return;
        setOwned(new Set(rows.map((r) => r.player_id).filter((v): v is string => Boolean(v))));
      } catch {
        // A failed ownership read costs a decoration, not the screen. Leaving
        // the set empty under-claims rather than over-claims, which is the
        // right way to be wrong about "you own this".
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  /* The slate object is rebuilt on every render by its caller, so effects have
     to depend on its KEY rather than its identity or this refetches forever. */
  const key = slate ? slateKey(slate) : null;
  const cached = key ? cache[key] : undefined;

  /**
   * Which slates have already been asked for.
   *
   * Separate from `cache` because the effect must not depend on the state it
   * writes — listing `cache` in the deps re-runs the effect the moment its own
   * result lands. Reading the cache through a ref instead is the obvious
   * alternative and is worse: assigning `ref.current` during render is a real
   * violation, not a lint nit, and tears under concurrent rendering. This ref
   * is only ever touched INSIDE the effect, which is legal and honest.
   */
  const requested = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!slate || !key || requested.current.has(key)) return;
    requested.current.add(key);
    let live = true;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const rows = await fetchAllPages<StatRow>((from, to) =>
          supabase
            .from('stat_lines')
            .select(
              'id, game_id, player_id, team_id, players(full_name, position_abbreviation), fantasy_points(points, rules_version)',
            )
            .eq('season', slate.season)
            .eq('season_type', slate.seasonType)
            .eq('week', slate.week)
            .order('id', { ascending: true })
            .range(from, to)
            .returns<StatRow[]>(),
        );
        if (!live) return;
        setCache((c) => ({ ...c, [key]: toLeaders(rows, teams) }));
      } catch (e) {
        // Forget the attempt so a pull-to-refresh or a revisit can retry it.
        // Without this a single network blip makes that week permanently empty
        // for the rest of the session.
        requested.current.delete(key);
        if (live) setError(e instanceof Error ? e.message : 'Could not load this week.');
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
    // `teams` is captured at fetch time only; a late-arriving team map would
    // change abbreviations, not who scored, and the schedule resolves first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /* Ownership resolves independently of the slate fetch, so it is applied on
     read rather than baked in — otherwise the first week you open is the one
     week whose rows never get the mark. */
  const leaders = useMemo(
    () => (cached ?? []).map((l) => ({ ...l, owned: owned.has(l.playerId) })),
    [cached, owned],
  );

  return { leaders, loading: loading && !cached, error };
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
