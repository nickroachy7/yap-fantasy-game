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
 * `lineup_slate()` (20260821130000) answers the third question, and is the only
 * one this hook asks: the week that has begun and is not finished, falling back
 * to the next open week when no week is in play.
 *
 * IT BRIEFLY FETCHED BOTH, and offered a switcher between them. That existed
 * because the week in play was entirely frozen — the old lock froze every player
 * at the week's first kickoff — so making any change at all meant going to the
 * next week. Per-player locking (20260821210000) removed the reason: the week in
 * play is editable, slot by slot, right up to each player's own kickoff. What
 * was left was a control with one real option and a second week nobody needed,
 * and between a week's last game and the next week's first this function rolls
 * forward on its own with days to spare.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { collectionVersion } from '@/components/collection/use-collection';
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

/** The one row a submission changes, and the only thing worth re-reading after one. */
type PriorLineup = {
  total_points: number | null;
  scored_at: string | null;
  finalized_at: string | null;
  lineup_slots?: { slot: string; card_instance_id: string; points: number | null }[];
} | null;

const LINEUP_SELECT =
  'id, total_points, scored_at, finalized_at, lineup_slots(slot, card_instance_id, points)';

/**
 * KEYED ON THE CONTEST, not on the slate.
 *
 * It filtered by season/type/week and took `maybeSingle()`, which was exactly
 * right while a week held one lineup and became a live bug the moment it could
 * hold two: the moment a player enters anything in the lobby, the free
 * contest's own screen starts erroring on multiple rows returned. A week is no
 * longer a key — `lineups_user_id_contest_key` is.
 */
function readLineup(contestId: string) {
  return supabase
    .from('lineups')
    .select(LINEUP_SELECT)
    .eq('contest_id', contestId)
    .maybeSingle();
}

/** The contest a lineup screen is editing, and the format it must be filled to. */
export type LineupContest = {
  id: string;
  code: string;
  name: string;
  kind: 'free' | 'lobby';
  formatCode: string;
  entryFeeGems: number;
  /** True until the entry exists — the fee has not been taken yet. */
  unentered: boolean;
};

export type LineupData = {
  slate: Slate | null;
  /**
   * Which contest this board is editing. Null only before the first load, or
   * when the slate has no fixtures at all.
   */
  contest: LineupContest | null;
  /**
   * True when the week being shown has kicked off and is not yet done with.
   * The board is a scoreboard in that state and a form otherwise, and this is
   * the single flag that decides which.
   */
  inPlay: boolean;
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
  /** Re-read everything. The pull-to-refresh and the live poll. */
  reload: () => Promise<void>;
  /** Re-read just the lineup row — what a submission actually changes. */
  reloadLineup: () => Promise<void>;
};

export function useLineupData(contestCode?: string): LineupData {
  const [slate, setSlate] = useState<Slate | null>(null);
  const [contest, setContest] = useState<LineupContest | null>(null);
  const [inPlay, setInPlay] = useState(false);
  const [hasLiveGame, setHasLiveGame] = useState(false);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotConfig[]>([]);
  const [cards, setCards] = useState<LineupCard[]>([]);
  const [savedPicks, setSavedPicks] = useState<Record<string, string>>({});
  const [savedPoints, setSavedPoints] = useState<Record<string, number | null>>({});
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const [scoredAt, setScoredAt] = useState<string | null>(null);
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null);

  /**
   * Write one lineup row into the five pieces of state it feeds. Shared by the
   * full load and by the lineup-only re-read, so the two cannot disagree about
   * what an absent lineup means — both resolve it to empty rather than leaving
   * whatever was there before.
   */
  const applyLineup = useCallback((prior: PriorLineup) => {
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
    setTotalPoints(
      prior?.total_points === null || prior?.total_points === undefined
        ? null
        : Number(prior.total_points),
    );
    setScoredAt(prior?.scored_at ?? null);
    setFinalizedAt(prior?.finalized_at ?? null);
  }, []);

  const load = useCallback<Load>(async (live) => {
    // `lineup_slate()` names the one week this screen is about. The collection,
    // slot config and team list do not depend on it, so they ride along rather
    // than waiting a round trip for it.
    const [slateRes, coll, teamsRes] = await Promise.all([
      supabase.rpc('lineup_slate'),
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

    const s = (slateRes.data as (Slate & { in_play: boolean })[] | null)?.[0] ?? null;
    setSlate(s);
    setInPlay(s?.in_play ?? false);
    /* Same precedence as before: the collection's failure is the one reported
       if both the slot config and the collection fail, because it is the one
       that empties the screen. */
    let failure: string | null = null;
    if (coll.error) failure = coll.error;

    /* WHICH CONTEST, and it has to be resolved before the slots can be: the
       slot list belongs to the contest's FORMAT now, so a three-card lobby
       board and the eight-card free one ask for different rows. This is the
       one round trip that had to become sequential — everything after it still
       goes out together. */
    let ct: LineupContest | null = null;
    if (s) {
      const q = supabase
        .from('contests')
        .select('id, code, name, kind, format_code, entry_fee_gems')
        .eq('season', s.season)
        .eq('season_type', s.season_type)
        .eq('week', s.week);

      const { data: cRow, error: cErr } = contestCode
        ? await q.eq('code', contestCode).maybeSingle()
        : await q.eq('kind', 'free').maybeSingle();

      if (!live()) return;
      if (cErr) failure = cErr.message;
      else if (!cRow) failure = contestCode ? 'That contest is no longer open.' : failure;
      else
        ct = {
          id: cRow.id,
          code: cRow.code,
          name: cRow.name,
          kind: cRow.kind as 'free' | 'lobby',
          formatCode: cRow.format_code,
          entryFeeGems: cRow.entry_fee_gems,
          /* Filled in below, once the lineup read comes back: an entry exists
             exactly when a lineup row does, which is what makes the fee
             idempotent server-side too. See `20260825050000`. */
          unentered: true,
        };
    }
    setContest(ct);

    const owned = coll.data.filter((r): r is CollectionRow & { id: string } => Boolean(r.id));
    const playerIds = [...new Set(owned.map((r) => r.player_id).filter((id): id is string => Boolean(id)))];

    const [cfg, lock, existing, gamesRes, stats] = await Promise.all([
      ct
        ? supabase
            .from('contest_format_slots')
            .select('slot, eligible_positions, display_order')
            .eq('format_code', ct.formatCode)
            .order('display_order')
        : Promise.resolve({ data: null, error: null }),
      s
        ? supabase.rpc('week_lock_time', {
            p_season: s.season,
            p_season_type: s.season_type,
            p_week: s.week,
          })
        : Promise.resolve({ data: null, error: null }),
      ct ? readLineup(ct.id) : Promise.resolve({ data: null, error: null }),
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
    /* Same precedence as before: the collection's failure is the one reported
       if both the slot config and the collection fail, because it is the one
       that empties the screen. */
    if (cfg.error) failure = failure ?? cfg.error.message;
    else setSlots((cfg.data ?? []) as SlotConfig[]);
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

    // Re-hydrate a lineup already submitted for this week. Its existence is
    // also the answer to "have I entered", which the paid board's button reads.
    const prior = existing.data as PriorLineup;
    if (ct) setContest({ ...ct, unentered: !prior });
    applyLineup(prior);
    return failure;
  }, [applyLineup, contestCode]);

  /**
   * Re-read ONLY the lineup row.
   *
   * What a submission changes is one row and its slots. `reload()` re-reads the
   * slate, the slot config, the whole paged collection, the team list, the lock
   * time, the week's fixtures and every stat line for every player you own —
   * chunked, so several round trips — and every one of those answers is
   * identical to the one it already had. Doing that after each swap is what made
   * moving a player feel slow: the board sat on stale state for as long as the
   * heaviest query took.
   *
   * Points are deliberately not chased here. A swapped slot keeps the OLD card's
   * points until the next sweep recomputes them, so there is nothing fresher to
   * fetch; the 60s poll brings them in when they exist.
   */
  const reloadLineup = useCallback(async () => {
    if (!contest) return;
    const { data, error: err } = await readLineup(contest.id);
    if (err) return;
    const prior = data as PriorLineup;
    setContest((c) => (c ? { ...c, unentered: !prior } : c));
    applyLineup(prior);
  }, [contest, applyLineup]);

  // Quiet, like the old `reload`: it cleared the error and re-read, but never
  // put the screen back into its first-load spinner.
  const { loading, error, refresh } = useLoader(load);

  /**
   * CATCH UP WHEN THE CARDS HAVE CHANGED UNDER US, which is the whole of a real
   * bug rather than a nicety.
   *
   * This screen is a TAB, so it mounts once and stays mounted for the session —
   * and unlike `useSets` and `useCollection` it holds its state in plain
   * `useState` with no cache to compare against. So committing a card on the
   * Sets tab, or selling one from the inventory, left this screen holding a
   * copy the server had already destroyed: `savedPicks` still named it in a
   * slot and `cards` still offered it on the bench.
   *
   * The next edit then autosaved the whole slot map, dead id included,
   * `set_lineup` refused the lot with "card does not belong to you", and the
   * screen set `blocked` — which is deliberately sticky, so THE AUTOSAVE STAYED
   * OFF for the rest of the session. Nothing on screen explained why, because
   * from the reader's side they had simply moved a card on another tab.
   *
   * `collectionVersion()` moves on every mint and every destroy, because every
   * one of those paths already calls `invalidateCollection`. Comparing it on
   * focus costs nothing when nothing has happened — an ordinary tab switch does
   * not move it — and re-reads exactly when it has.
   */
  const seenCards = useRef(collectionVersion());

  useFocusEffect(
    useCallback(() => {
      if (seenCards.current === collectionVersion()) return;
      seenCards.current = collectionVersion();
      void refresh();
    }, [refresh]),
  );

  return {
    slate,
    contest,
    inPlay,
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
    reloadLineup,
  };
}
