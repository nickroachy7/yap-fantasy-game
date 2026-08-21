/**
 * Everything the lineup screen needs, in two round trips.
 *
 * The old screen asked one question — "what do I own?" — and rendered a name.
 * Setting a lineup actually needs four more: who is my player playing, when
 * does that game start, what has he produced this season, and how has he looked
 * lately. All four come from tables the client can already read, so this is a
 * wider query rather than a new RPC.
 *
 * ---------------------------------------------------------------------------
 * WHICH WEEK, WHICH IS NOT THE QUESTION IT LOOKS LIKE
 * ---------------------------------------------------------------------------
 *
 * This hook used to ask `upcoming_slate()` and use the answer for everything.
 * That is the right week to SUBMIT for and the wrong week to LOOK at, and an
 * NFL week is long enough for the difference to matter for five days out of
 * seven: `upcoming_slate()` returns the first week whose earliest kickoff is
 * still ahead, so the instant Thursday night kicks off it moves on — and the
 * screen showed an empty week 2 board through the whole of the Sunday and
 * Monday that week 1 was being played.
 *
 * `lineup_slate()` (20260821130000) answers the third question: the week that
 * has begun and is not finished, falling back to the next open week when no
 * week is in play. Both are fetched, because when a week IS in play they are
 * different weeks and the screen legitimately offers both — the one you are
 * watching, and the one you can still set.
 */
import { useCallback, useState } from 'react';

import type { CardTier } from '@/constants/theme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { fetchAllPages } from '@/lib/paged';
import { supabase } from '@/lib/supabase';

import {
  FORM_GAMES,
  resolveStatus,
  type GameContext,
  type LineupCard,
  type SeasonForm,
  type Slate,
  type SlotConfig,
} from './model';

/**
 * Which of the two weeks this hook is reading.
 *
 * `'current'` is whatever `lineup_slate()` names — the week in play, or the
 * next open one when nothing is being played. `'next'` is always
 * `upcoming_slate()`, and is only a distinct week while a week is in play.
 */
export type LineupView = 'current' | 'next';

type CollectionRow = {
  id: string | null;
  player_id: string | null;
  player_name: string | null;
  position_abbreviation: string | null;
  team_abbreviation: string | null;
  injury_status: string | null;
  career_fp: number | null;
  next_tier_at: number | null;
  next_tier_label: string | null;
  tier: CardTier | null;
  season: number | null;
};

type StatRow = {
  player_id: string;
  week: number | null;
  season_type: number;
  fantasy_points: { points: number; rules_version: number }[];
};

/**
 * `.in()` is a query string, so a 300-card collection would build a 11kB URL
 * and get truncated by an intermediary with no error anyone could read. Chunked
 * and run in parallel instead — the round trips overlap, so this costs latency
 * only for collections large enough to have been broken before.
 */
const PLAYER_CHUNK = 100;

/**
 * The picker needs the whole collection, and PostgREST silently caps select()
 * at 1000 rows — a large collection would lose its tail with no error at all.
 *
 * career_fp is not unique, so `id` is the tiebreak: paging over a non-unique
 * sort key can repeat or drop rows between requests.
 */
async function loadCollection(): Promise<CollectionRow[]> {
  return fetchAllPages<CollectionRow>((from, to) =>
    supabase
      .from('my_collection')
      .select(
        'id, player_id, player_name, position_abbreviation, team_abbreviation, injury_status, career_fp, next_tier_at, next_tier_label, tier, season',
      )
      .order('career_fp', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  );
}

async function loadStatLines(season: number, playerIds: string[]): Promise<StatRow[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < playerIds.length; i += PLAYER_CHUNK) {
    chunks.push(playerIds.slice(i, i + PLAYER_CHUNK));
  }
  const batches = await Promise.all(
    chunks.map((ids) =>
      fetchAllPages<StatRow>((from, to) =>
        supabase
          .from('stat_lines')
          .select('id, player_id, week, season_type, fantasy_points(points, rules_version)')
          .eq('season', season)
          .in('player_id', ids)
          .order('id', { ascending: true })
          .range(from, to)
          // The generated types describe the embed as a nested relation whose
          // shape depends on the select string; asserting it keeps the rest of
          // this file honestly typed instead of `any` leaking outward.
          .returns<StatRow[]>(),
      ),
    ),
  );
  return batches.flat();
}

/**
 * Season production per player.
 *
 * Two decisions worth naming:
 *
 * 1. Every season_type counts. Hardcoding regular season would render the whole
 *    screen as zeroes through the preseason validation window, which is exactly
 *    the bug the leaderboard already shipped once and reads as "the app is
 *    broken" rather than "no games yet".
 *
 * 2. A stat line with no fantasy_points row has not been scored under ANY
 *    ruleset, so it is dropped from the numerator AND the denominator. Counting
 *    it as a nought-point game would understate FP/G for exactly the players
 *    whose most recent game has not been swept yet.
 *
 * Which ruleset: the highest rules_version present. The active version lives in
 * `scoring_rules`, which this screen does not read — versions only ever go up,
 * so the newest computed row is the current one. A mismatch would move a
 * displayed average, never what gets submitted.
 */
function aggregate(rows: StatRow[], slate: Slate | null): Map<string, SeasonForm> {
  const byPlayer = new Map<string, { order: number; points: number; thisWeek: boolean }[]>();

  for (const row of rows) {
    const best = row.fantasy_points.reduce<{ points: number; rules_version: number } | null>(
      (acc, fp) => (acc === null || fp.rules_version > acc.rules_version ? fp : acc),
      null,
    );
    if (!best) continue;
    // season_type sorts chronologically as a number (1 pre, 2 regular, 3 post),
    // so one key orders a whole season without a date lookup.
    const order = row.season_type * 1000 + (row.week ?? 0);
    const list = byPlayer.get(row.player_id) ?? [];
    list.push({
      order,
      points: Number(best.points),
      /* The slate's own week, which the row draws beside the fixture. Matched
         on season_type AS WELL as week: preseason week 3 and regular-season
         week 3 are both "week 3" and are four weeks apart. */
      thisWeek:
        slate !== null && row.season_type === slate.season_type && row.week === slate.week,
    });
    byPlayer.set(row.player_id, list);
  }

  const out = new Map<string, SeasonForm>();
  for (const [playerId, games] of byPlayer) {
    games.sort((a, b) => a.order - b.order);
    const seasonFp = games.reduce((sum, g) => sum + g.points, 0);
    const current = games.find((g) => g.thisWeek);
    out.set(playerId, {
      seasonFp,
      gamesPlayed: games.length,
      fpPerGame: seasonFp / games.length,
      recent: games.slice(-FORM_GAMES).map((g) => g.points),
      // Absent, not zero. A game that has not been swept has no number at all,
      // and the row draws that differently from a player who blanked.
      weekFp: current ? current.points : null,
    });
  }
  return out;
}

type GameRow = {
  home_team_id: string | null;
  visitor_team_id: string | null;
  starts_at: string | null;
  status: string | null;
  status_state: string | null;
};

/**
 * Team abbreviation -> this week's game. Absent means the team is idle.
 *
 * Now carries the game's STATE as well as its time. Selecting only `starts_at`
 * was what left the row unable to distinguish a player who had not kicked off
 * from one who had played and scored nothing — both rendered as the same blank
 * — and unable to say that a number it was showing was still moving.
 */
function buildSchedule(
  teams: { id: string; abbreviation: string }[],
  games: GameRow[],
): Map<string, GameContext> {
  const abbrOf = new Map(teams.map((t) => [t.id, t.abbreviation]));
  const out = new Map<string, GameContext>();
  for (const g of games) {
    const home = g.home_team_id ? abbrOf.get(g.home_team_id) : undefined;
    const away = g.visitor_team_id ? abbrOf.get(g.visitor_team_id) : undefined;
    const status = resolveStatus(g.status_state, g.starts_at);
    if (home) {
      out.set(home, {
        opponent: away ?? null, home: true, startsAt: g.starts_at, status, statusText: g.status,
      });
    }
    if (away) {
      out.set(away, {
        opponent: home ?? null, home: false, startsAt: g.starts_at, status, statusText: g.status,
      });
    }
  }
  return out;
}

export type LineupData = {
  slate: Slate | null;
  /**
   * True when the week being shown has kicked off and is not yet done with.
   * The board is a scoreboard in that state and a form otherwise, and this is
   * the single flag that decides which.
   */
  inPlay: boolean;
  /**
   * The week `lineup_slate()` named, whichever view is showing. Needed
   * separately from `slate` so a switcher can label the option it is offering
   * to switch BACK to while the reader is looking at the other one.
   */
  currentSlate: Slate | null;
  /**
   * The next week still open for submission, when that is a DIFFERENT week from
   * the one on screen — which is exactly when a week is in play. Null the rest
   * of the time, because offering to switch to the week you are already looking
   * at is not an offer.
   */
  nextSlate: Slate | null;
  /**
   * True while at least one game in the shown week is actually being played.
   * Narrower than `inPlay`, which stays true through the days between a
   * Thursday night game and the Sunday ones, and it is the right test for
   * whether to keep re-reading: polling a week whose next kickoff is 60 hours
   * away is just traffic.
   */
  hasLiveGame: boolean;
  lockAt: string | null;
  slots: SlotConfig[];
  cards: LineupCard[];
  /** Whatever was already submitted for this week, so an edit starts from it. */
  savedPicks: Record<string, string>;
  /**
   * Points this week PER SLOT, once the sweep has run. Null for a slot that
   * has not been scored — which is not the same as a slot that scored nothing,
   * and the row draws the two differently.
   */
  savedPoints: Record<string, number | null>;
  /** The week's total, straight from the server rather than re-added here. */
  totalPoints: number | null;
  /**
   * When the sweep last recomputed this lineup. On a gameday that is a minute
   * ago, so it is a FRESHNESS stamp and nothing more — the screen prints it as
   * "as of" rather than treating it as a verdict.
   *
   * It used to be read as "the week has been scored", which stopped being true
   * the moment scoring went live: score_week stamps it on every pass, so it is
   * non-null from the first snap of Thursday night and the screen was calling a
   * week finished while its first game was in the opening quarter.
   */
  scoredAt: string | null;
  /** Non-null once every game in the week is final. THIS is "the week is over". */
  finalizedAt: string | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useLineupData(view: LineupView = 'current'): LineupData {
  const [slate, setSlate] = useState<Slate | null>(null);
  const [inPlay, setInPlay] = useState(false);
  const [currentSlate, setCurrentSlate] = useState<Slate | null>(null);
  const [nextSlate, setNextSlate] = useState<Slate | null>(null);
  const [hasLiveGame, setHasLiveGame] = useState(false);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotConfig[]>([]);
  const [cards, setCards] = useState<LineupCard[]>([]);
  const [savedPicks, setSavedPicks] = useState<Record<string, string>>({});
  const [savedPoints, setSavedPoints] = useState<Record<string, number | null>>({});
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const [scoredAt, setScoredAt] = useState<string | null>(null);
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null);

  const load = useCallback<Load>(async (live) => {
    // BOTH slates, in the same round trip as everything else.
    //
    // `lineup_slate()` is the week to show and `upcoming_slate()` the week that
    // is still open. They name the same week whenever nothing is being played,
    // and different ones whenever something is — see the note at the head of
    // this file for what reading only the second one cost.
    //
    // The collection, slot config and team list do not depend on either, so
    // they ride along rather than waiting a round trip for them.
    const [slateRes, nextRes, cfg, coll, teamsRes] = await Promise.all([
      supabase.rpc('lineup_slate'),
      supabase.rpc('upcoming_slate'),
      supabase
        .from('lineup_slot_config')
        .select('slot, eligible_positions, display_order')
        .order('display_order'),
      loadCollection().then(
        (data) => ({ data, error: null as string | null }),
        (err: unknown) => ({
          data: [] as CollectionRow[],
          error: err instanceof Error ? err.message : 'Could not load your cards.',
        }),
      ),
      supabase.from('teams').select('id, abbreviation'),
    ]);

    if (!live()) return;
    if (slateRes.error) return slateRes.error.message;

    const shown = (slateRes.data as (Slate & { in_play: boolean })[] | null)?.[0] ?? null;
    const next = (nextRes.data as Slate[] | null)?.[0] ?? null;
    /* Same week means there is nothing to switch to. Compared on all three
       fields rather than on `week` alone: preseason week 3 and regular-season
       week 3 are both "week 3" and are four weeks apart. */
    const sameWeek =
      shown !== null &&
      next !== null &&
      shown.season === next.season &&
      shown.season_type === next.season_type &&
      shown.week === next.week;

    // `'next'` is only a real choice while a week is in play; the rest of the
    // time both views resolve to the one week that exists.
    const s = view === 'next' && !sameWeek && next ? next : shown;
    setSlate(s);
    setInPlay(s === shown && (shown?.in_play ?? false));
    setCurrentSlate(shown);
    setNextSlate(sameWeek || !next ? null : next);
    /* Same precedence as before: the collection's failure is the one reported
       if both the slot config and the collection fail, because it is the one
       that empties the screen. */
    let failure: string | null = null;
    if (cfg.error) failure = cfg.error.message;
    else setSlots((cfg.data ?? []) as SlotConfig[]);
    if (coll.error) failure = coll.error;

    const owned = coll.data.filter((r): r is CollectionRow & { id: string } => Boolean(r.id));
    const playerIds = [...new Set(owned.map((r) => r.player_id).filter((id): id is string => Boolean(id)))];

    const [lock, existing, gamesRes, stats] = await Promise.all([
      s
        ? supabase.rpc('week_lock_time', {
            p_season: s.season,
            p_season_type: s.season_type,
            p_week: s.week,
          })
        : Promise.resolve({ data: null, error: null }),
      s
        ? supabase
            .from('lineups')
            .select('id, total_points, scored_at, finalized_at, lineup_slots(slot, card_instance_id, points)')
            .eq('season', s.season)
            .eq('season_type', s.season_type)
            .eq('week', s.week)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      s
        ? supabase
            .from('games')
            .select('home_team_id, visitor_team_id, starts_at, status, status_state')
            .eq('season', s.season)
            .eq('season_type', s.season_type)
            .eq('week', s.week)
        : Promise.resolve({ data: null, error: null }),
      s && playerIds.length > 0
        ? loadStatLines(s.season, playerIds).catch(() => [] as StatRow[])
        : Promise.resolve([] as StatRow[]),
    ]);

    if (!live()) return;
    if (!lock.error && lock.data) setLockAt(String(lock.data));

    const weekGames = (gamesRes.data ?? []) as GameRow[];
    const schedule = buildSchedule(
      (teamsRes.data ?? []) as { id: string; abbreviation: string }[],
      weekGames,
    );
    /* Whether to keep re-reading, decided from the week's own fixtures rather
       than from any of the cards: a game is live whether or not you own anybody
       in it, and the contest card's median moves with the whole community. */
    setHasLiveGame(
      weekGames.some((g) => resolveStatus(g.status_state, g.starts_at) === 'live'),
    );
    const form = aggregate(stats, s);

    setCards(
      owned.map((r) => ({
        id: r.id,
        playerId: r.player_id,
        name: r.player_name ?? 'Unknown player',
        position: r.position_abbreviation,
        team: r.team_abbreviation,
        injuryStatus: r.injury_status,
        tier: (r.tier ?? 'bronze') as CardTier,
        careerFp: Number(r.career_fp ?? 0),
        nextTierAt: r.next_tier_at === null ? null : Number(r.next_tier_at),
        nextTierLabel: r.next_tier_label,
        season: r.season,
        form: r.player_id ? (form.get(r.player_id) ?? null) : null,
        // A team missing from the week's schedule is on a bye, which is a real
        // and distinct fact — not the same as "we failed to load a game".
        game: r.team_abbreviation ? (schedule.get(r.team_abbreviation) ?? null) : null,
      })),
    );

    // Re-hydrate a lineup already submitted for this week.
    const prior = existing.data as {
      total_points: number | null;
      scored_at: string | null;
      finalized_at: string | null;
      lineup_slots?: { slot: string; card_instance_id: string; points: number | null }[];
    } | null;
    setSavedPicks(
      prior?.lineup_slots
        ? Object.fromEntries(prior.lineup_slots.map((r) => [r.slot, r.card_instance_id]))
        : {},
    );
    setSavedPoints(
      prior?.lineup_slots
        ? Object.fromEntries(
            prior.lineup_slots.map((r) => [r.slot, r.points === null ? null : Number(r.points)]),
          )
        : {},
    );
    setTotalPoints(prior?.total_points === null || prior?.total_points === undefined ? null : Number(prior.total_points));
    setScoredAt(prior?.scored_at ?? null);
    setFinalizedAt(prior?.finalized_at ?? null);
    return failure;
  }, [view]);

  // Quiet, like the old `reload`: it cleared the error and re-read, but never
  // put the screen back into its first-load spinner.
  const { loading, error, refresh } = useLoader(load);

  return {
    slate,
    inPlay,
    currentSlate,
    nextSlate,
    hasLiveGame,
    lockAt,
    slots,
    cards,
    savedPicks,
    savedPoints,
    totalPoints,
    scoredAt,
    finalizedAt,
    loading,
    error,
    reload: refresh,
  };
}
