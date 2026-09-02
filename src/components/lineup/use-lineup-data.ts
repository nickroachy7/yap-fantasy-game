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
import { useCallback, useMemo, useRef, useState } from 'react';

import { collectionVersion } from '@/components/collection/use-collection';
import type { CardTier } from '@/constants/theme';
import { useLoader, type Load } from '@/hooks/use-loader';
import { sessionCache } from '@/lib/session-cache';
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
const collectionCache = sessionCache<'mine', CollectionRow[]>(() => fetchCollection());

/**
 * Forget the cards. Call after anything that changes what you hold — a pack, a
 * sale, a commit — alongside `invalidateCollection`, which clears the OTHER
 * cache over the same table.
 *
 * THEY ARE TWO CACHES ON PURPOSE, for now. `useCollection` reads
 * `my_collection` into `CollectionCard`, this reads it into `CollectionRow`,
 * and the two shapes carry different columns for different screens. Merging
 * them is worth doing and is not this change; what matters here is that the
 * lineup's copy stops being fetched from scratch on every mount.
 */
export function invalidateLineupCollection(): void {
  collectionCache.invalidate();
}

async function loadCollection(): Promise<CollectionRow[]> {
  return collectionCache.read('mine');
}

async function fetchCollection(): Promise<CollectionRow[]> {
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

type ProjectionRow = { player_id: string; projected_points: number | string | null };

/**
 * THIS WEEK'S FORECAST for the players you hold.
 *
 * ONE WEEK, NOT A SEASON, which is the whole difference between this and
 * `loadStatLines` beside it. Form is a shape built out of a season's history;
 * a projection is a single perishable claim about the week in front of you, and
 * there is nothing to aggregate.
 *
 * Chunked on the player ids for the same reason as the stat lines: a roster is
 * small but `in()` on a URL is not, and the chunk size is already tuned.
 */
async function loadProjections(
  season: number,
  seasonType: number,
  week: number,
  playerIds: string[],
): Promise<ProjectionRow[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < playerIds.length; i += PLAYER_CHUNK) {
    chunks.push(playerIds.slice(i, i + PLAYER_CHUNK));
  }
  const batches = await Promise.all(
    chunks.map((ids) =>
      fetchAllPages<ProjectionRow>((from, to) =>
        supabase
          .from('projections')
          .select('player_id, projected_points')
          .eq('season', season)
          .eq('season_type', seasonType)
          .eq('week', week)
          .in('player_id', ids)
          .order('player_id', { ascending: true })
          .range(from, to)
          .returns<ProjectionRow[]>(),
      ),
    ),
  );
  return batches.flat();
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
function aggregate(
  rows: StatRow[],
  slate: Slate | null,
  /* Player id -> this week's projected points. Empty until the ingester has
     run for the week, which is a state the board already draws. */
  projections: Map<string, number>,
): Map<string, SeasonForm> {
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
      projectedFp: projections.get(playerId) ?? null,
    });
  }

  /* A PLAYER WITH A PROJECTION AND NO HISTORY STILL NEEDS A ROW.
     `byPlayer` is built from stat lines, so a rookie who has never played — or
     anyone in week 1 of a season — appears nowhere in it, and a projection for
     him would have been silently dropped by the loop above. That is exactly the
     player whose forecast is worth the most, since there is no form to read
     instead. */
  for (const [playerId, projectedFp] of projections) {
    if (out.has(playerId)) continue;
    out.set(playerId, {
      seasonFp: 0,
      gamesPlayed: 0,
      fpPerGame: 0,
      recent: [],
      weekFp: null,
      projectedFp,
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

type ContestRow = {
  id: string;
  code: string;
  name: string;
  kind: 'free' | 'lobby';
  format_code: string;
  entry_fee_coins: number;
};

/** One of the caller's lineups on this slate, with its slots. */
type SlateLineup = {
  id: string;
  contest_id: string;
  total_points: number | string | null;
  scored_at: string | null;
  finalized_at: string | null;
  lineup_slots: { slot: string; card_instance_id: string; points: number | null }[] | null;
};

/** The contest a lineup screen is editing, and the format it must be filled to. */
export type LineupContest = {
  id: string;
  code: string;
  name: string;
  kind: 'free' | 'lobby';
  formatCode: string;
  entryFeeCoins: number;
  /** True until the entry exists — the fee has not been taken yet. */
  unentered: boolean;
};

export type LineupData = {
  slate: Slate | null;
  /**
   * Cards already playing in one of your OTHER contests this week, mapped to
   * the name of the contest holding each.
   *
   * THE BOARD MUST NOT OFFER WHAT THE SERVER WILL REFUSE. `set_lineup` rejects
   * the whole submission if any card is playing elsewhere this week
   * (`card_plays_one_contest`), and the bench used to know nothing about it —
   * so it happily offered a card sitting in your main lineup, took the pick,
   * and then every autosave from that moment on failed with an error rendered
   * below sixteen bench rows where nobody would ever see it. The lineup simply
   * stopped saving and said nothing.
   *
   * "your main lineup" for the free contest rather than its name, which is the
   * week and reads as a contradiction inside a sentence about this week. Same
   * wording `set_lineup` uses, so the dimmed row and the error agree.
   */
  elsewhere: Map<string, string>;
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

/**
 * THE SLOT SHAPES, FETCHED ONCE A SESSION.
 *
 * `contest_format_slots` is the only thing this hook reads that cannot change
 * while the app is open: a format's slots are seeded by a migration and are
 * the same rows for every player on every week. It was nonetheless refetched
 * on every mount, in the second of two sequential waves — so opening a contest
 * paid a round trip to be told the same twenty-eight rows the board had
 * already been told on launch, and the empty slots could not be drawn until it
 * came back. That is the delay you see as "the slots take a moment".
 *
 * `sessionCache` is the pattern `useCollection` already uses for exactly this:
 * memory first, network once, and an `invalidate` for when it is wrong. It is
 * safe to hold across a sign-out because there is nothing of anybody's in it —
 * no RLS scoping, no user column, the same answer for an anonymous reader.
 */
const formatSlotCache = sessionCache<'all', Map<string, SlotConfig[]>>(async () => {
  const { data, error } = await supabase
    .from('contest_format_slots')
    .select('format_code, slot, eligible_positions, display_order')
    .order('display_order');
  if (error) throw error;

  const byFormat = new Map<string, SlotConfig[]>();
  for (const row of (data ?? []) as (SlotConfig & { format_code: string })[]) {
    const list = byFormat.get(row.format_code) ?? [];
    list.push({
      slot: row.slot,
      eligible_positions: row.eligible_positions,
      display_order: row.display_order,
    });
    byFormat.set(row.format_code, list);
  }
  return byFormat;
});

/** For a migration that adds or re-slots a format while the app is open. */
export function invalidateFormatSlots(): void {
  formatSlotCache.invalidate();
}

export function useLineupData(contestCode?: string, hint?: LineupContest | null): LineupData {
  const [slate, setSlate] = useState<Slate | null>(null);
  /**
   * EVERYTHING FOR THE WHOLE SLATE, HELD RAW, and this is what makes swiping
   * the carousel cost nothing.
   *
   * The first cut keyed the fetch on `contestCode`, so every swipe re-ran the
   * entire load — the paged collection, the team list, a stat line per player
   * owned — and the screen's `if (loading)` blanked the board while it did.
   * Two contests, and moving between them was a full page refresh for data
   * that was identical both times.
   *
   * None of it is per-contest. A slate has a handful of contests, three
   * formats hold fourteen slot rows between them, and your lineups for the
   * week are at most one each — so all of it comes back in the SAME round trip
   * as the collection, and picking a contest afterwards is a `useMemo`. The
   * load no longer depends on `contestCode` at all.
   */
  const [contestRows, setContestRows] = useState<ContestRow[]>([]);
  /* Seeded from memory, so a second visit draws its slots on the first paint
     rather than after a round trip — see `formatSlotCache`. */
  const [formatSlots, setFormatSlots] = useState<Map<string, SlotConfig[]>>(
    () => formatSlotCache.peek('all') ?? new Map(),
  );
  const [myLineups, setMyLineups] = useState<SlateLineup[]>([]);
  const [inPlay, setInPlay] = useState(false);
  const [hasLiveGame, setHasLiveGame] = useState(false);
  const [lockAt, setLockAt] = useState<string | null>(null);

  const [cards, setCards] = useState<LineupCard[]>([]);


  /**
   * Write one lineup row into the five pieces of state it feeds. Shared by the
   * full load and by the lineup-only re-read, so the two cannot disagree about
   * what an absent lineup means — both resolve it to empty rather than leaving
   * whatever was there before.
   */
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

    const owned = coll.data.filter((r): r is CollectionRow & { id: string } => Boolean(r.id));
    const playerIds = [...new Set(owned.map((r) => r.player_id).filter((id): id is string => Boolean(id)))];

    /* EVERY CONTEST ON THE SLATE, EVERY FORMAT'S SLOTS, AND EVERY LINEUP YOU
       HOLD — all of it, in one batch, because none of it is big and picking a
       contest out of it afterwards is free. This is what makes a carousel
       swipe cost nothing; see the note on `contestRows`. */
    const [contestsRes, fmtRes, minesRes, lock, gamesRes, stats, projRows] = await Promise.all([
      s
        ? supabase
            .from('contests')
            .select('id, code, name, kind, format_code, entry_fee_coins')
            .eq('season', s.season)
            .eq('season_type', s.season_type)
            .eq('week', s.week)
        : Promise.resolve({ data: null, error: null }),
      /* Every format's slots, not just the one in front: fetching one would put
         a round trip on every swipe to save nothing. Served from memory after
         the first read of the session — see `formatSlotCache`. */
      /* Caught rather than thrown: a rejection here would reject the whole
         batch and empty a screen the other five queries could still fill. The
         cache stores successes only, so a failure is simply retried next
         mount. */
      formatSlotCache.read('all').catch(() => null),
      /* RLS scopes this to you, so no user filter is sent and none would help.
         It answers three questions at once: which contests you are in, what
         each of those lineups holds, and — for every contest that is NOT the
         one on screen — which cards are unavailable. */
      s
        ? supabase
            .from('lineups')
            .select(
              'id, contest_id, total_points, scored_at, finalized_at, lineup_slots(slot, card_instance_id, points)',
            )
            .eq('season', s.season)
            .eq('season_type', s.season_type)
            .eq('week', s.week)
        : Promise.resolve({ data: null, error: null }),
      s
        ? supabase.rpc('week_lock_time', {
            p_season: s.season,
            p_season_type: s.season_type,
            p_week: s.week,
          })
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
      /* THIS WEEK'S FORECAST, in the same batch as everything else.
         Caught rather than thrown, like the format slots above: a projection is
         the least important thing on this screen and must never be the reason
         the lineup fails to draw. An empty list simply leaves every row showing
         `PROJ —`, which is what the board did for its whole life until now. */
      s && playerIds.length > 0
        ? loadProjections(s.season, s.season_type, s.week, playerIds).catch(
            () => [] as ProjectionRow[],
          )
        : Promise.resolve([] as ProjectionRow[]),
    ]);

    if (!live()) return;
    /* Same precedence as before: the collection's failure is the one reported
       if both the slot config and the collection fail, because it is the one
       that empties the screen. */
    if (contestsRes.error) failure = failure ?? contestsRes.error.message;
    if (!fmtRes) failure = failure ?? 'Could not load the contest formats.';
    if (minesRes.error) failure = failure ?? minesRes.error.message;

    setContestRows((contestsRes.data ?? []) as ContestRow[]);

    /* Already grouped by format — the cache does it once per session rather
       than on every load, because the board asks for one format's slots on
       every paint and the answer never changes. */
    setFormatSlots(fmtRes ?? new Map());
    setMyLineups((minesRes.data ?? []) as unknown as SlateLineup[]);

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
    /* Numeric, not `numeric` — PostgREST returns a `numeric(7,2)` as a STRING,
       and a string in this map would reach the row and render as "19.70" beside
       figures set to one decimal. */
    const projections = new Map<string, number>();
    for (const row of projRows) {
      if (row.projected_points === null) continue;
      const points = Number(row.projected_points);
      if (Number.isFinite(points)) projections.set(row.player_id, points);
    }
    const form = aggregate(stats, s, projections);

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

    return failure;
    /* NO `contestCode` IN THESE DEPS, and that is the whole point. Nothing this
       function fetches depends on which contest is in front, so swiping the
       carousel does not re-run it — see `contestRows`. */
  }, []);

  /* ------------------------------------------------------------------ *
   * DERIVED PER CONTEST. No fetching below this line.
   *
   * Everything the board shows for ONE contest is a projection of the
   * slate-wide state above. That is what makes swiping the carousel free: it
   * changes `contestCode`, these memos recompute, and no request is sent.
   * ------------------------------------------------------------------ */

  /**
   * THE CONTEST, FROM THE CALLER UNTIL THE SERVER CATCHES UP.
   *
   * `contestRows` arrives in the second of two waves, and the slots cannot be
   * drawn without it — which is most of why opening a contest to enter had a
   * visible wait. But the page that opened it already HAS the contest: the
   * lobby fetched every field this needs (`id`, `code`, `name`, `kind`,
   * `format_code`, `entry_fee_coins`) to draw the row that was just tapped.
   *
   * So a caller may hand it over, and the fetched row supersedes the hint the
   * moment it lands. They cannot disagree about anything that matters — same
   * table, same columns — except `unentered`, which the hint's owner knows
   * from its own read and which is re-derived here from `myLineups` as soon as
   * those arrive. Erring is safe in the direction it errs: a hint that says
   * "unentered" when you are in fact entered shows an Enter button for a
   * moment, and `set_lineup` is idempotent on the fee either way.
   */
  const contest = useMemo<LineupContest | null>(() => {
    if (contestRows.length === 0) return hint ?? null;
    const row = contestCode
      ? contestRows.find((r) => r.code === contestCode)
      : contestRows.find((r) => r.kind === 'free');
    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      formatCode: row.format_code,
      entryFeeCoins: row.entry_fee_coins,
      /* An entry exists exactly when a lineup row does — which is also what
         makes the fee idempotent server-side. See `20260825050000`. */
      unentered: !myLineups.some((l) => l.contest_id === row.id),
    };
  }, [contestRows, contestCode, myLineups, hint]);

  const slots = useMemo<SlotConfig[]>(
    () => (contest ? (formatSlots.get(contest.formatCode) ?? []) : []),
    [contest, formatSlots],
  );

  /** The caller's lineup in the contest on screen, if they have one. */
  const mine = useMemo(
    () => (contest ? (myLineups.find((l) => l.contest_id === contest.id) ?? null) : null),
    [contest, myLineups],
  );

  const savedPicks = useMemo(
    () =>
      Object.fromEntries((mine?.lineup_slots ?? []).map((r) => [r.slot, r.card_instance_id])),
    [mine],
  );

  const savedPoints = useMemo(
    () =>
      Object.fromEntries(
        (mine?.lineup_slots ?? []).map((r) => [r.slot, r.points === null ? null : Number(r.points)]),
      ),
    [mine],
  );

  const totalPoints = useMemo(
    () => (mine?.total_points === null || mine?.total_points === undefined ? null : Number(mine.total_points)),
    [mine],
  );

  /**
   * Cards held by your OTHER lineups this week, mapped to what is holding each.
   *
   * Derived rather than fetched, and it changes as you swipe: the free
   * contest's own board must warn about cards committed to the lobby, and the
   * lobby's board about cards in your main lineup. Same set, opposite sides.
   */
  const elsewhere = useMemo(() => {
    const held = new Map<string, string>();
    for (const l of myLineups) {
      if (contest && l.contest_id === contest.id) continue;
      const row = contestRows.find((r) => r.id === l.contest_id);
      const where = row?.kind === 'free' ? 'your main lineup' : (row?.name ?? 'another contest');
      for (const slot of l.lineup_slots ?? []) held.set(slot.card_instance_id, where);
    }
    return held;
  }, [myLineups, contestRows, contest]);

  /**
   * Re-read ONLY the lineups for the slate.
   *
   * What a submission changes is one row and its slots. `reload()` re-reads the
   * whole paged collection, the team list, the fixtures and a stat line per
   * player owned — chunked, so several round trips — and every one of those
   * answers is identical to the one it already had. Doing that after each swap
   * is what made moving a player feel slow.
   *
   * It re-reads ALL of them rather than just the one on screen, because an
   * entry changes what is available in the OTHER contests too: the card you
   * just started here is the card the next board has to grey out.
   *
   * Points are deliberately not chased. A swapped slot keeps the OLD card's
   * points until the next sweep recomputes them, so there is nothing fresher to
   * fetch; the 60s poll brings them in when they exist.
   */
  const reloadLineup = useCallback(async () => {
    if (!slate) return;
    const { data, error: err } = await supabase
      .from('lineups')
      .select(
        'id, contest_id, total_points, scored_at, finalized_at, lineup_slots(slot, card_instance_id, points)',
      )
      .eq('season', slate.season)
      .eq('season_type', slate.season_type)
      .eq('week', slate.week);
    if (err) return;
    setMyLineups((data ?? []) as unknown as SlateLineup[]);
  }, [slate]);

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
      /* The version bumped, so the cards changed — a pack, a sale, a commit.
         Drop this hook's own copy before refreshing, or the refresh is served
         the rows the bump was telling us are wrong. */
      invalidateLineupCollection();
      void refresh();
    }, [refresh]),
  );

  return {
    slate,
    contest,
    elsewhere,
    inPlay,
    hasLiveGame,
    lockAt,
    slots,
    cards,
    savedPicks,
    savedPoints,
    totalPoints,
    scoredAt: mine?.scored_at ?? null,
    finalizedAt: mine?.finalized_at ?? null,
    loading,
    error,
    reload: refresh,
    reloadLineup,
  };
}
