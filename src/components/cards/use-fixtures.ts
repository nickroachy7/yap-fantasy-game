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
 */
import { useEffect, useState } from 'react';

import { kickoffLabel, matchupLabel, type GameContext } from '@/components/lineup/model';
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

/** The directory row's one-line form. "Sun 1:05p vs BUF", or "BYE". */
export function fixtureLabel(game: GameContext | null | undefined): string {
  if (!game) return 'BYE';
  const kick = kickoffLabel(game);
  return `${kick ? `${kick} ` : ''}${matchupLabel(game)}`;
}

export function useUpcomingFixtures(): FixtureMap {
  const [fixtures, setFixtures] = useState<FixtureMap>(new Map());

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const { data: slateRows, error: slateErr } = await supabase.rpc('upcoming_slate');
        const slate = (slateRows as { season: number; season_type: number; week: number }[] | null)?.[0];
        if (slateErr || !slate) return;

        const [teamsRes, gamesRes] = await Promise.all([
          supabase.from('teams').select('id, abbreviation'),
          supabase
            .from('games')
            .select('home_team_id, visitor_team_id, starts_at')
            .eq('season', slate.season)
            .eq('season_type', slate.season_type)
            .eq('week', slate.week),
        ]);
        if (!live || teamsRes.error || gamesRes.error) return;

        const abbrOf = new Map(
          (teamsRes.data ?? []).map((t) => [t.id, t.abbreviation as string]),
        );
        const byTeam = new Map<string, GameContext>();
        for (const g of gamesRes.data ?? []) {
          const home = g.home_team_id ? abbrOf.get(g.home_team_id) : undefined;
          const away = g.visitor_team_id ? abbrOf.get(g.visitor_team_id) : undefined;
          if (home) byTeam.set(home, { opponent: away ?? null, home: true, startsAt: g.starts_at });
          if (away) byTeam.set(away, { opponent: home ?? null, home: false, startsAt: g.starts_at });
        }

        const out: FixtureMap = new Map();
        for (const abbr of abbrOf.values()) {
          // A club absent from the week's schedule is on a bye — a real fact,
          // and the one this line is most worth showing.
          out.set(abbr, byTeam.get(abbr) ?? null);
        }
        if (live) setFixtures(out);
      } catch {
        // Decoration only. An empty map renders no fixture text at all.
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  return fixtures;
}
