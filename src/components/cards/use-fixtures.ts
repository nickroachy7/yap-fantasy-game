/**
 * This week's fixture per NFL club, for the directory row's meta line.
 *
 * Small and deliberately separate from the directory read: it answers a
 * different question (what is happening this week) on a different cadence (the
 * schedule is fixed months ahead), and it must never be able to take the
 * directory down with it. Every failure path here resolves to an empty map, so
 * the fixture text simply does not render and the other 95% of the row is
 * unaffected.
 *
 * Roughly 50 rows across three small reads — the upcoming slate, its games, and
 * the club list — rather than the whole season the scoreboard loads, because
 * the only thing this screen needs is "who does HOU play next, if anyone".
 *
 * READ ONCE PER SESSION. Small is not free: four screens draw fixture text —
 * Trend, Leaders, Inventory and the directory — and every switch between two of
 * them was re-running all three reads for a schedule that is fixed months
 * ahead. It is a `sessionCache` now, so the second screen to ask gets the map
 * synchronously and draws its fixture lines in its first render.
 */
import {
  kickoffLabel,
  liveLabel,
  matchupLabel,
  resolveStatus,
  type GameContext,
} from '@/components/lineup/model';
import { sessionCache, useSessionRead } from '@/lib/session-cache';
import { supabase } from '@/lib/supabase';

/**
 * Club abbreviation -> its game this week, or null when the club is idle.
 *
 * RAW rather than pre-formatted, because two callers now want different
 * shapes from it: the directory row prints one string ("Sun 1:05p vs BUF"),
 * and the card lays the same facts out across two lines with the club
 * abbreviation folded in. Formatting here would have forced the card to parse
 * a string back apart.
 */
export type FixtureMap = Map<string, GameContext | null>;

/**
 * The directory row's one-line form. "Sun 1:05p vs BUF", or "BYE".
 *
 * Once the game is under way the kickoff time stops being the useful half — it
 * is answering "when", to a reader who can see for themselves that the answer
 * is "now" — so the state takes its place: "Q3 04:22 vs BUF", then "FINAL vs
 * BUF". The matchup stays put in both, because it is what identifies the
 * fixture and it is the part that never changes.
 */
export function fixtureLabel(game: GameContext | null | undefined): string {
  if (!game) return 'BYE';
  const lead = liveLabel(game) ?? kickoffLabel(game);
  return `${lead ? `${lead} ` : ''}${matchupLabel(game)}`;
}

/**
 * Every failure resolves to an EMPTY MAP rather than rejecting, and that is
 * deliberate: this is decoration, the callers have no error path for it, and a
 * rejection would be cached as "retry on the next mount" for something no
 * screen is waiting on. An empty map simply renders no fixture text.
 */
async function fetchUpcomingFixtures(): Promise<FixtureMap> {
  const empty: FixtureMap = new Map();
  try {
    /* `lineup_slate()`, not `upcoming_slate()`, so this line agrees with the
       lineup screen about which week everyone is talking about. Asking for the
       next OPEN week meant that from Thursday night onwards a collection cell
       advertised a fixture four days away while the player on it was on the
       field — see the head of `lineup/use-lineup-data.ts`. */
    const { data: slateRows, error: slateErr } = await supabase.rpc('lineup_slate');
    const slate = (slateRows as { season: number; season_type: number; week: number }[] | null)?.[0];
    if (slateErr || !slate) return empty;

    const [teamsRes, gamesRes] = await Promise.all([
      supabase.from('teams').select('id, abbreviation'),
      supabase
        .from('games')
        .select('home_team_id, visitor_team_id, starts_at, status, status_state')
        .eq('season', slate.season)
        .eq('season_type', slate.season_type)
        .eq('week', slate.week),
    ]);
    if (teamsRes.error || gamesRes.error) return empty;

    const abbrOf = new Map((teamsRes.data ?? []).map((t) => [t.id, t.abbreviation as string]));
    const byTeam = new Map<string, GameContext>();
    for (const g of gamesRes.data ?? []) {
      const home = g.home_team_id ? abbrOf.get(g.home_team_id) : undefined;
      const away = g.visitor_team_id ? abbrOf.get(g.visitor_team_id) : undefined;
      const status = resolveStatus(g.status_state, g.starts_at);
      if (home) {
        byTeam.set(home, {
          opponent: away ?? null, home: true, startsAt: g.starts_at, status, statusText: g.status,
        });
      }
      if (away) {
        byTeam.set(away, {
          opponent: home ?? null, home: false, startsAt: g.starts_at, status, statusText: g.status,
        });
      }
    }

    const out: FixtureMap = new Map();
    for (const abbr of abbrOf.values()) {
      // A club absent from the week's schedule is on a bye — a real fact,
      // and the one this line is most worth showing.
      out.set(abbr, byTeam.get(abbr) ?? null);
    }
    return out;
  } catch {
    return empty;
  }
}

/** One week, one map. The key is a constant; there is only ever one answer. */
const fixtures = sessionCache<'upcoming', FixtureMap>(fetchUpcomingFixtures);

/** Same object every time once it has landed, so `useMemo` deps downstream hold. */
const EMPTY: FixtureMap = new Map();

export function useUpcomingFixtures(): FixtureMap {
  return useSessionRead(fixtures, 'upcoming').value ?? EMPTY;
}

/** The nightly sync moves the schedule on. Nothing else should clear this. */
export function invalidateUpcomingFixtures(): void {
  fixtures.invalidate();
}
