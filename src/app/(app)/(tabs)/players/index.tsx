/**
 * Who is heating up, and who has gone cold. The Players section lands here.
 *
 * WHY THIS IS THE LANDING PAGE AND SEARCH IS NOT
 *
 * Search shows you nothing until you type. It is the right page when you
 * already have a name in mind and the wrong one to open on, because opening on
 * it makes the section's first impression an empty box and a keyboard. Trend
 * has an answer before you do anything, and it is the answer that precedes
 * spending gems: who changed.
 *
 * ONE COLUMN OF FIFTY, WITH A TOGGLE. This screen used to draw risers and
 * fallers side by side, twelve each, on the argument that hiding either behind
 * a toggle makes the page read as a hype feed. That argument was right about
 * the danger and wrong about the fix. Two columns of twelve is a shortlist you
 * cannot scan and cannot filter, and once the rows became full directory rows —
 * three lines of identity over a band of ownership counts — two of them abreast
 * does not fit a phone at all.
 *
 * The toggle is not a hype feed because DOWN is a peer of UP, not a footnote:
 * the same control, the same fifty, the same rows, one press away. What would
 * make it a hype feed is a "trending" list with no way to see the other half,
 * and that is precisely what is not being built here.
 *
 * See `trend/movers.ts` for why this measures production rather than the
 * add/drop volume the same screen shows on Sleeper.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PlayerList, type ListedPlayer } from '@/components/cards/PlayerList';
import { ROW_GUTTER } from '@/components/cards/PlayerRow';
import { loadPlayerDirectory, type DirectoryPlayer } from '@/components/cards/player-directory';
import { fixtureLabel, useUpcomingFixtures } from '@/components/cards/use-fixtures';
import { DASH } from '@/components/ui/DataTable';
import { weekLabel } from '@/components/scores/scoreboard';
import { useSeasonSchedule, useWeekLeaders, type Slate } from '@/components/scores/use-scores';
import { Screen } from '@/components/shell/Screen';
import { SectionNav } from '@/components/shell/SectionNav';
import { SegmentedControl } from '@/components/shell/SegmentedControl';
import { PositionFilter, type PosFilter } from '@/components/cards/PositionFilter';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { computeMovers, deltaText } from '@/components/trend/movers';
import { supabase } from '@/lib/supabase';

const FALLBACK_SEASON = 2026;

/** How long a board is. Fifty is a list you scroll; twelve was a teaser. */
const SHOWN = 50;

/**
 * A player has to have been worth starting in at least one of the two weeks to
 * appear. Six points is roughly a replacement-level game — below it the list
 * fills with third-stringers whose "+3.1" is arithmetically true and tells you
 * nothing.
 */
const MINIMUM_POINTS = 6;

type Direction = 'up' | 'down';

export default function TrendScreen() {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const [season, setSeason] = useState(FALLBACK_SEASON);
  const [seeded, setSeeded] = useState(false);
  const [pos, setPos] = useState<PosFilter>('ALL');
  const [direction, setDirection] = useState<Direction>('up');

  /**
   * The directory, for the rows themselves.
   *
   * A `Mover` is a name, two week totals and a delta — it has no season line,
   * no fixture and no ownership counts, which is three quarters of what a
   * `PlayerRow` draws. Rather than widen the mover model to carry them, the
   * rows come from the directory this section already loads and caches for the
   * session: the trend board is a REORDERING of the directory, not a different
   * set of players, and saying so in the code is what keeps the two screens
   * from drifting into two ideas of what a player is.
   */
  const [directory, setDirectory] = useState<Map<string, DirectoryPlayer> | null>(null);
  const [directoryFailed, setDirectoryFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await supabase.rpc('current_slate');
      const row = (data as { season: number }[] | null)?.[0];
      if (!live) return;
      if (!error && row) setSeason(row.season);
      setSeeded(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const result = await loadPlayerDirectory();
        if (!live) return;
        setDirectory(new Map(result.players.map((p) => [p.playerId, p])));
      } catch {
        if (live) setDirectoryFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const fixtures = useUpcomingFixtures();
  const { games, slates, teams, loading, error } = useSeasonSchedule(season);

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
      games.some(
        (g) => g.seasonType === s.seasonType && g.week === s.week && g.status === 'final',
      ),
    );
    const tail = completed.slice(-2);
    return [tail[1] ?? tail[0] ?? null, tail.length > 1 ? tail[0] : null] as [
      Slate | null,
      Slate | null,
    ];
  }, [slates, games]);

  const recent = useWeekLeaders(recentSlate, teams);
  const previous = useWeekLeaders(previousSlate, teams);

  const movers = useMemo(
    () => computeMovers(recent.leaders, previous.leaders, MINIMUM_POINTS),
    [recent.leaders, previous.leaders],
  );

  /**
   * The board: fifty rows, movers first.
   *
   * A mover with no directory row is DROPPED rather than drawn half-empty. It
   * means the player is not in this season's card pool — there is no card to
   * own, so "he is up 12 points" is not a thing this section can act on.
   *
   * THEN IT IS PADDED OUT TO FIFTY WITH PLAYERS WHO DID NOT MOVE, and the
   * padding is drawn as an em dash rather than as "+0.0".
   *
   * Two weeks into a preseason there are a handful of qualifying movers, so a
   * board that showed only them was four rows of content under three rows of
   * controls — a page that looked broken rather than early. As weeks accumulate
   * the movers push the padding off the bottom on their own, and the list never
   * changes shape while that happens.
   *
   * The dash is what keeps this honest. A padded row has no measured change —
   * he did not play both weeks, or did not clear the six-point floor — and
   * printing 0.0 there would claim we measured him and found no movement. It is
   * the same distinction `market` draws on the directory row, for the same
   * reason, and it means the boundary between the real board and the padding is
   * visible without a divider: the signed green and red stop.
   *
   * Padding is ordered by season points, so if you are going to be shown
   * players for whom there is no trend, they are at least the ones worth
   * knowing about.
   */
  const board = useMemo<ListedPlayer[]>(() => {
    if (!directory) return [];
    const inPosition = (position: string | null) =>
      pos === 'ALL' ? true : (position ?? '').toUpperCase() === pos;

    const wanted = movers
      .filter((m) => inPosition(m.position))
      .filter((m) => (direction === 'up' ? m.delta > 0 : m.delta < 0));
    // computeMovers sorts by delta descending, so risers are already in order
    // and fallers need reversing — the biggest DROP belongs at the top of its
    // own board, not the smallest.
    const ordered = direction === 'up' ? wanted : [...wanted].reverse();

    const rows: ListedPlayer[] = [];
    const taken = new Set<string>();
    for (const m of ordered) {
      if (rows.length >= SHOWN) break;
      const player = directory.get(m.playerId);
      if (!player) continue;
      taken.add(player.playerId);
      rows.push({
        player,
        /* The delta leads, because it is what the list is ordered by — a board
           sorted by movement whose headline figure was a season total would be
           ranked by a number it does not show. Signed and coloured, which is
           the one place in this app a figure carries a sign. */
        figure: {
          value: deltaText(m.delta),
          label: 'WK',
          color: m.delta > 0 ? c.positive : c.negative,
        },
      });
    }

    if (rows.length < SHOWN) {
      const filler = [...directory.values()]
        .filter((p) => !taken.has(p.playerId) && inPosition(p.position))
        .sort((a, b) => b.seasonFp - a.seasonFp || a.name.localeCompare(b.name))
        .slice(0, SHOWN - rows.length)
        .map<ListedPlayer>((player) => ({
          player,
          figure: { value: DASH, label: 'WK', color: c.textTertiary },
        }));
      rows.push(...filler);
    }

    return rows;
  }, [directory, movers, pos, direction, c]);

  const openPlayer = useCallback(
    (player: DirectoryPlayer) =>
      router.push({ pathname: '/player/[id]', params: { id: player.playerId } }),
    [router],
  );

  const fixtureFor = useCallback(
    (team: string | null) =>
      team ? fixtureLabel(fixtures.get(team.toUpperCase())) : undefined,
    [fixtures],
  );

  const busy = !seeded || loading || recent.loading || previous.loading || directory === null;

  const comparison =
    recentSlate && previousSlate
      ? `${weekLabel(previousSlate.seasonType, previousSlate.week)} → ${weekLabel(recentSlate.seasonType, recentSlate.week)}`
      : null;

  const body = () => {
    if (busy) return <ActivityIndicator style={styles.pad} />;
    if (directoryFailed) {
      return (
        <EmptyState
          title="Could not load the players"
          body="The trend board is built from the directory, and that read failed. Open Search and pull to refresh, then come back."
        />
      );
    }
    if (error || recent.error || previous.error) {
      return (
        <EmptyState
          title="Could not load the trend"
          body={error ?? recent.error ?? previous.error ?? ''}
        />
      );
    }
    if (!recentSlate || !previousSlate) {
      return (
        <EmptyState
          title="Not enough football yet"
          body="Movement needs two completed weeks to compare. Check back once a second week has been played and swept."
        />
      );
    }
    /* Reachable only when the DIRECTORY has nobody at this position, since the
       board pads itself out of the directory. "No movers" is no longer an empty
       state — it is a board of dashes, which says the same thing while still
       being a list of players worth looking at. */
    if (board.length === 0) {
      return (
        <EmptyState
          title="No players here"
          body={
            pos === 'ALL'
              ? 'The directory is empty for this season.'
              : `There are no ${pos} cards in this season's pool.`
          }
        />
      );
    }
    return (
      <PlayerList players={board} fixtureFor={fixtureFor} onOpen={openPlayer} />
    );
  };

  return (
    <Screen title="Trend" measure="table" context={comparison ?? `${season} season`} scroll={false}>
      {/* `scroll={false}` gives the page no horizontal gutter — the list owns
          that, so it can run its rows edge to edge. The chrome above it has to
          supply its own, at the same 16 the rows use, or the controls sit two
          points inside every name below them. Same block as the directory's
          toolbar, down to the numbers. */}
      <View style={styles.controls}>
        <SectionNav section="/players" />

        {/* ONE ROW OF FILTERS, position on the left and direction on the right.
            
            Both are filters over the same list, so stacking them made the page
            three bands of chrome deep before the first player — and it put the
            shared position chips at a different height here than on Leaders,
            which is the exact jitter having one component was meant to remove.
            Side by side, the chips sit directly under the nav on every board in
            the section, and the direction switch reads as the page-specific
            extra it is.

            The chips take the room that is left and SCROLL: `ChipRow` is a
            horizontal ScrollView, so six of them beside a toggle is a scroll
            rather than a squeeze, and the toggle keeps its full label at every
            width. Which is why it is the toggle that gets the fixed size and
            the chips that flex, rather than the other way round — a toggle
            reading `U…`/`D…` would be unusable, where chips you can push are
            merely narrower.

            The paragraph that used to sit under here — what the delta measures
            and who is left out — is gone. It was three lines of methodology
            above every visit, which is a footnote's job: the `context` line in
            the header already names the two weeks being compared, and that is
            the part a reader needs in order to trust the number. */}
        <View style={styles.filters}>
          <View style={styles.chips}>
            <PositionFilter value={pos} onChange={setPos} />
          </View>
          <SegmentedControl<Direction>
            compact
            segments={[
              { value: 'up', label: 'Up' },
              { value: 'down', label: 'Down' },
            ]}
            value={direction}
            onChange={setDirection}
          />
        </View>
      </View>

      {body()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingVertical: Spacing.four },
  controls: { paddingHorizontal: ROW_GUTTER, paddingBottom: Spacing.two, gap: Spacing.two },
  filters: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  /* `minWidth: 0` is load-bearing: without it the chips' ScrollView reports its
     full content width as its minimum and pushes the toggle off the row instead
     of scrolling inside what is left. */
  chips: { flex: 1, minWidth: 0 },
});
