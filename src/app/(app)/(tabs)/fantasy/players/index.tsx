/**
 * PLAYERS: every card in the game, on one board.
 *
 * ===========================================================================
 * THIS WAS THREE PAGES
 * ===========================================================================
 *
 * Search, Trend and Top, under a permanent section nav. They were never three
 * screens. All three read the same directory through `useDirectoryBoard`, all
 * three drew the same `PlayerRow` through `PlayerList`, and by the end the only
 * thing separating them was one sort key and one filter each — a fact this file
 * used to admit in its own comments, where the trend board padded itself out
 * with every non-mover in the directory sorted by season points because there
 * were four qualifying movers in preseason.
 *
 * The cost of the split was not the extra files. It was that a reader could not
 * ask a question that crossed two of them: "the receivers who play on Sunday,
 * cheapest first" had no page to be asked on, and picking a starting page was
 * picking which two thirds of the controls to give up.
 *
 * So the ORDER became a control and the three collapsed into one. `board-view.ts`
 * holds the model — the six orders and what each measures, and the five facets
 * — and this
 * file is the screen around it.
 *
 * THE BOARD STILL ANSWERS BEFORE YOU TOUCH IT, which is the property the merge
 * could most easily have destroyed. It opens on the market's rank with nothing
 * filtered, which is exactly the page Top was; it is a board on arrival and a
 * query surface only if you make it one. A merge that had opened on an empty
 * form would have traded three answers for none.
 *
 * ===========================================================================
 * WHAT IT COSTS, STATED PLAINLY
 * ===========================================================================
 *
 * The delta the trend order sorts by is NOT DRAWN on the row. That was already
 * true of the trend page — the note it inherited is worth keeping, because the
 * objection has not been answered, only accepted: a board ordered by a number
 * it does not print cannot explain itself, and what carries it instead is the
 * order's own name in the bar and the context line naming the two weeks. One
 * row across every ordering was worth more than one ordering's self-defence.
 *
 * SEARCH IS STILL A TAKEOVER and does not inherit these facets. It is a tool
 * you pick up with a name in mind and put down four seconds later, and the case
 * for giving it the whole screen — no chrome, keyboard up on arrival — did not
 * weaken because its two neighbours became sort keys. The magnifier on the
 * controls pushes it. See `app/(app)/search.tsx`.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { PlayerList } from '@/components/cards/PlayerList';
import { BoardDetail, figureFor } from '@/components/cards/BoardDetail';
import { PlayerBoardControls } from '@/components/cards/PlayerBoardControls';
import { useDirectoryBoard } from '@/components/cards/use-directory-board';
import {
  NO_FILTERS,
  buildBoard,
  orderOf,
  type BoardFilters,
  type BoardSort,
  type SortDir,
} from '@/components/cards/board-view';
import { type DirectoryPlayer } from '@/components/cards/player-directory';
import { fixtureLabel, useUpcomingFixtures } from '@/components/cards/use-fixtures';
import { weekLabel } from '@/components/scores/scoreboard';
import {
  loadCurrentSeason,
  peekCurrentSeason,
  useSeasonSchedule,
  useWeekLeaders,
  type Slate,
} from '@/components/scores/use-scores';
import { Screen } from '@/components/shell/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { computeMovers, type Mover } from '@/components/trend/movers';

const FALLBACK_SEASON = 2026;

/**
 * A player has to have been worth starting in at least one of the two weeks
 * before his change counts. Six points is roughly a replacement-level game —
 * below it the ordering fills with third-stringers whose "+3.1" is
 * arithmetically true and tells you nothing.
 */
const MINIMUM_POINTS = 6;

export default function PlayersScreen() {
  const router = useRouter();
  /* Resolved once here rather than inside the figure builder, which is a plain
     function called a thousand times inside a memo. Only the trend order uses
     them — a signed change reads as one — but a hook cannot be conditional and
     reading two tokens costs nothing. */
  const c = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];

  const { result, prices, failed, refreshing, refresh } = useDirectoryBoard();

  /**
   * MARKET RANK, which is the page Top was.
   *
   * It is the only ordering that exists in September: `assignRanks` refuses to
   * rank a man who has not played, so ours is null for everybody until week
   * one, where the provider's consensus is published before a snap is taken.
   * A board whose default order is empty for the first month of the season is
   * not a default.
   */
  const [sort, setSort] = useState<BoardSort>('market');
  const [dir, setDir] = useState<SortDir>('asc');
  const [filters, setFilters] = useState<BoardFilters>(NO_FILTERS);

  const fixtures = useUpcomingFixtures();

  /* Peeked, so a revisit starts on the season it ended on rather than on the
     fallback — which would send the schedule read after the WRONG season for
     one render and miss its cache. See `currentSeason`. */
  const seededSeason = peekCurrentSeason();
  const [season, setSeason] = useState(seededSeason ?? FALLBACK_SEASON);
  const [seeded, setSeeded] = useState(seededSeason !== null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const value = await loadCurrentSeason();
      if (!live) return;
      if (value !== null) setSeason(value);
      setSeeded(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  /**
   * THE TREND READS ARE NOT PAID FOR UNTIL THEY ARE ASKED FOR.
   *
   * Ordering by movement needs a season of fixtures and two weeks of stat
   * lines — three reads that the old trend PAGE could fund honestly, because
   * arriving there was the request. On a merged board it is one of six orders,
   * so funding it on mount would charge every visit for something most visits
   * never use.
   *
   * The latch never falls back to false. Flipping to another order and back
   * would otherwise drop a schedule that is fixed months ahead and re-read it,
   * and the cache behind these hooks is session-scoped anyway — so once the
   * cost has been paid, paying attention to it again buys nothing.
   *
   * IT IS SET WHERE THE ORDER IS CHOSEN rather than in an effect watching the
   * order. An effect would be a second render caused by the first, for a fact
   * already known at the moment of the press — and the press is the request.
   */
  const [wantsMovement, setWantsMovement] = useState(false);

  const chooseSort = useCallback((key: BoardSort, next: SortDir) => {
    if (orderOf(key).needsMovers) setWantsMovement(true);
    setSort(key);
    setDir(next);
  }, []);

  const armed = wantsMovement && seeded;
  const { games, slates, teams, loading, error } = useSeasonSchedule(armed ? season : null);

  /**
   * The two most recently COMPLETED slates.
   *
   * Completion is read from the fixtures rather than from the stat lines: a
   * slate whose games are all final is one we expect to have swept, so if its
   * stat lines are missing the screen should say "no data yet" rather than
   * silently comparing week 12 against week 3 and presenting the gap as form.
   */
  const [recentSlate, previousSlate] = useMemo(() => {
    const completed = slates.filter((s) =>
      games.some((g) => g.seasonType === s.seasonType && g.week === s.week && g.status === 'final'),
    );
    const tail = completed.slice(-2);
    return [tail[1] ?? tail[0] ?? null, tail.length > 1 ? tail[0] : null] as [
      Slate | null,
      Slate | null,
    ];
  }, [slates, games]);

  const recent = useWeekLeaders(recentSlate, teams);
  const previous = useWeekLeaders(previousSlate, teams);

  /**
   * Movement by player id — the WHOLE mover, not just its delta.
   *
   * It was a `Map<string, number>` of deltas, which was enough while the board
   * only had to sort by them. The row now explains the ordering — the two
   * weeks' points and the two ranks either side of the move — and all four
   * facts are already on the `Mover` that produced the delta. Recomputing them
   * beside it would be two derivations of one move.
   *
   * Null until BOTH weeks have landed, which keeps the trend order from briefly
   * sorting everyone on nothing while the reads are in flight — `buildBoard`
   * sinks a null delta to the bottom in both directions, so a half-loaded map
   * would shuffle the board once and then again.
   */
  const movers = useMemo<Map<string, Mover> | null>(() => {
    if (!armed || recent.loading || previous.loading) return null;
    if (!recentSlate || !previousSlate) return null;
    return new Map(
      computeMovers(recent.leaders, previous.leaders, MINIMUM_POINTS).map((m) => [m.playerId, m]),
    );
  }, [armed, recent.loading, recent.leaders, previous.loading, previous.leaders, recentSlate, previousSlate]);

  /** Just the deltas, which is all the ORDERING needs. */
  const deltas = useMemo<Map<string, number> | null>(
    () => (movers ? new Map([...movers].map(([id, m]) => [id, m.delta])) : null),
    [movers],
  );

  const playsThisWeek = useCallback(
    (team: string | null) => (team ? fixtures.get(team.toUpperCase()) != null : false),
    [fixtures],
  );

  /** Every club with a player in the pool, for the facet menu. */
  const clubs = useMemo(() => {
    if (!result) return [];
    const seen = new Set<string>();
    for (const p of result.players) if (p.team) seen.add(p.team.toUpperCase());
    return [...seen].sort();
  }, [result]);

  /**
   * The board.
   *
   * THE NUMBER BESIDE EACH NAME IS HIS MARKET RANK, not this list's ordinal.
   *
   * It was the ordinal, and the old directory's own rule had already forbidden
   * that: a rank column is honest on a list whose ORDER IS ITS SUBJECT and
   * dishonest on one whose order is a control, because the same player is 1st
   * on the market board and 340th on the trend board and the column looks like
   * it is describing him. It is not. Holding his market rank there instead
   * makes it describe him, on every order, and the sequence of the list is
   * something a reader can already see by reading down it.
   *
   * WHICH ALSO SETTLES THE POSITION FILTER, and reverses what this note used to
   * say. It argued that picking WR should re-rank the receivers 1..n, because a
   * board reading 1, 4, 9, 14 "would be a filtered table". That was an argument
   * about an ORDINAL and it does not survive the change: the left column is now
   * an overall rank, so 1, 4, 9, 14 is simply true, and the receiver's place
   * among receivers is on the detail line where it can carry its pool with it.
   * The row says both, which neither version managed alone.
   */
  const board = useMemo<DirectoryPlayer[]>(
    () => (result ? buildBoard(result.players, { sort, dir, filters, deltas, playsThisWeek }) : []),
    [result, sort, dir, filters, deltas, playsThisWeek],
  );

  /**
   * What a row draws, as functions the list calls for the rows it decides to
   * mount — not as a thousand pre-built objects.
   *
   * THIS IS WHY THE SORT MENU IS NOT LAGGY. The board used to build the figure,
   * the detail line and a wrapper object for every player in the game inside
   * the memo above, so picking an order did ~968 `figureFor` calls and ~968
   * element creations — several thousand `toLocaleString`s among them, which
   * Hermes is slow at — on the main thread, between the press and the menu
   * closing, to render twelve visible rows.
   *
   * Sorting is now a sort. Everything else follows the viewport, which is the
   * point of handing `getItemLayout` to a virtualised list in the first place.
   *
   * The context is rebuilt per row, which sounds like the same mistake and is
   * not: it happens twelve times instead of a thousand, and it is a five-field
   * object literal rather than a formatted string and two React elements.
   */
  const ctxFor = useCallback(
    (player: DirectoryPlayer) => ({
      sort,
      dir,
      coins: prices?.get(player.playerId),
      mover: movers?.get(player.playerId) ?? null,
      positive: c.positive,
      negative: c.negative,
    }),
    [sort, dir, prices, movers, c.positive, c.negative],
  );

  /* HIS MARKET RANK, NOT HIS ROW NUMBER, and the same one under every order —
     see `PlayerRow.rank`. An ordinal here reshuffled the left column every time
     the sort changed, so the number appeared to be about the board rather than
     about the man. */
  const rankFor = useCallback((player: DirectoryPlayer) => player.marketRank, []);
  const figureOf = useCallback(
    (player: DirectoryPlayer) => figureFor(player, ctxFor(player)),
    [ctxFor],
  );
  const detailOf = useCallback(
    (player: DirectoryPlayer) => <BoardDetail player={player} ctx={ctxFor(player)} />,
    [ctxFor],
  );

  const openPlayer = useCallback(
    (player: DirectoryPlayer) =>
      router.push({ pathname: '/player/[id]', params: { id: player.playerId } }),
    [router],
  );

  const fixtureFor = useCallback(
    (team: string | null) => (team ? fixtureLabel(fixtures.get(team.toUpperCase())) : undefined),
    [fixtures],
  );

  const openSearch = useCallback(() => router.push('/search'), [router]);

  /**
   * What the board is of, in one line.
   *
   * The trend order names the two weeks it is comparing, because that is the
   * part a reader needs in order to trust an ordering whose number is not on
   * the rows. Every other order is self-describing from the bar above.
   */
  const context = (() => {
    if (!result) return 'Every player in the game';
    if (sort === 'trend' && recentSlate && previousSlate) {
      return `${weekLabel(previousSlate.seasonType, previousSlate.week)} → ${weekLabel(recentSlate.seasonType, recentSlate.week)} · ${board.length} players`;
    }
    return `${result.season ?? ''} season · ${board.length} players`.trim();
  })();

  const body = () => {
    if (failed) {
      return (
        <EmptyState
          title="Could not load the players"
          body="The board is built from the card directory, and that read failed. Pull to refresh, or try again in a moment."
        />
      );
    }
    if (!result) return <ActivityIndicator style={styles.pad} />;
    /* The trend order is the one that can be asked for before it can be
       answered. Everything else is served from a directory already in memory. */
    if (sort === 'trend' && (loading || recent.loading || previous.loading)) {
      return <ActivityIndicator style={styles.pad} />;
    }
    if (sort === 'trend' && (error || recent.error || previous.error)) {
      return (
        <EmptyState
          title="Could not measure the movement"
          body={error ?? recent.error ?? previous.error ?? ''}
        />
      );
    }
    if (sort === 'trend' && (!recentSlate || !previousSlate)) {
      return (
        <EmptyState
          title="Not enough football yet"
          body="Movement needs two completed weeks to compare. Pick another order, and come back once a second week has been played."
        />
      );
    }
    if (board.length === 0) {
      return (
        <EmptyState
          title="No players match"
          body="Nothing in the pool fits every filter you have set. Clear one and try again."
        />
      );
    }
    return (
      <PlayerList
        players={board}
        rankFor={rankFor}
        figureFor={figureOf}
        renderDetail={detailOf}
        fixtureFor={fixtureFor}
        onOpen={openPlayer}
        refreshing={refreshing}
        onRefresh={refresh}
      />
    );
  };

  return (
    <Screen title="Players" measure="table" context={context} scroll={false}>
      {/* `scroll={false}` gives the page no horizontal gutter — the list owns
          that so its rows can run edge to edge — so the controls supply their
          own, at the same 16 the names below them use. */}
      <PlayerBoardControls
        sort={sort}
        dir={dir}
        onSort={chooseSort}
        filters={filters}
        onFilters={setFilters}
        onSearch={openSearch}
        teams={clubs}
      />

      {body()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingVertical: Spacing.four },
});
