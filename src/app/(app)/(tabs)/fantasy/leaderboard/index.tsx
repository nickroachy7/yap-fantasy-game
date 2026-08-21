/**
 * The global board. One community, no leagues and no friend lists in the beta.
 *
 * SIX BOARDS, NOT ONE, and the reason is that a single points board answers one
 * question and settles early. By week four the top is decided, the bottom half
 * has no reason to open the screen, and everything else the game asks of a
 * player — pulling cards, tiering one up, burning thirty into a set, beating the
 * median with a squad that started late — produces a number nothing compares.
 *
 * Each board ranks what a different part of the game actually produces:
 *
 *   Points      season and per-week fantasy points. The original board.
 *   Best week   the single highest week anybody has posted.
 *   Record      W-L-T against the field's median — the contest already played.
 *   Collection  what a shelf would sell for.
 *   Cards       the best individual COPY in the game, and who holds it.
 *   Sets        rungs claimed, sets finished, cards burnt getting there.
 *
 * WHY IN-PAGE STATE RATHER THAN ROUTES. These are six views of one subject: a
 * route per board would put six entries in the back stack for what is a glance
 * sideways, and would make the phone's back gesture walk the reader through
 * boards they were only flicking past.
 *
 * WHY A DROPDOWN AND NOT A STRIP OF TABS. It WAS a strip of tabs, and it was
 * the exact mistake `FantasyTopNav` documents: "if they ever converge on the
 * same treatment, the page grows two identical strips again and the reader has
 * to work out which is which by trying them." A word with a rule under it is
 * that file's treatment, drawn one row above this. Points had three of them
 * stacked — section nav, boards, weeks.
 *
 * It was also too many for a strip. `DropdownChip`'s own note is the argument:
 * a row of peers "become a horizontally scrolling strip where the option you
 * want is usually off-screen". At 375pt exactly that happened — Sets sat past
 * the right edge with nothing to say the row scrolled, so two of the six boards
 * were undiscoverable on a phone. The grid shows all six at once.
 *
 * WHY THE STRIP IS PINNED while the week tabs inside the points board scroll
 * away with the content. They are different ranks of control: this one says
 * WHICH BOARD you are reading and has to stay reachable from row two hundred;
 * the week tabs filter the board you are already on.
 *
 * THE SLATE IS READ HERE, ONCE. Every board needs the same season and season
 * type, so six boards each calling `current_slate()` would be six round trips
 * for one answer — and two boards could disagree about the week across a
 * rollover. It is read once and handed down.
 */
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CommunityBoard } from '@/components/leaderboard/CommunityBoard';
import { PointsBoard } from '@/components/leaderboard/PointsBoard';
import { slateLabel, type Slate } from '@/components/leaderboard/board';
import type { BoardId } from '@/components/leaderboard/community';
import { Screen } from '@/components/shell/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useLoader, type Load } from '@/hooks/use-loader';
import { supabase } from '@/lib/supabase';

// Fallback only — the live slate comes from current_slate().
const SEASON = 2026;

export default function LeaderboardScreen() {
  const { session } = useAuth();
  const meId = session?.user.id ?? null;

  const [slate, setSlate] = useState<Slate | null>(null);
  const [board, setBoard] = useState<BoardId>('points');

  // Follow whatever slate is actually being played. Hardcoding season_type 2
  // (regular season) made the board render empty for the whole preseason
  // validation window, which reads as "the leaderboard is broken".
  const load = useCallback<Load>(async (live) => {
    const { data, error } = await supabase.rpc('current_slate');
    if (!live()) return;
    if (error) return error.message;
    setSlate((data as Slate[] | null)?.[0] ?? null);
  }, []);

  const { loading, error, reload, refresh } = useLoader(load);

  const season = slate?.season ?? SEASON;
  const seasonType = slate?.season_type ?? 2;

  /** Handed to each board so a pull-to-refresh re-reads the slate as well. */
  const refreshSlate = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const headerContext = useMemo(
    () =>
      [
        slate ? `${slateLabel(slate.season_type)} ${slate.season}` : `${SEASON} season`,
        slate?.week ? `Week ${slate.week}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    [slate],
  );

  const body = () => {
    // The slate is one small RPC and everything below depends on it, so the
    // whole screen waits rather than each board rendering a season it guessed.
    if (loading) return <ActivityIndicator style={styles.centred} />;
    if (error) {
      return (
        <View style={styles.centred}>
          <EmptyState
            title="Could not load the leaderboard"
            body={error}
            actionLabel="Try again"
            onAction={reload}
          />
        </View>
      );
    }
    if (board === 'points') {
      return (
        <PointsBoard
          slate={slate}
          season={season}
          seasonType={seasonType}
          meId={meId}
          onRefreshSlate={refreshSlate}
          board={board}
          onBoardChange={setBoard}
        />
      );
    }
    return (
      <CommunityBoard
        id={board}
        season={season}
        seasonType={seasonType}
        meId={meId}
        onRefreshSlate={refreshSlate}
        board={board}
        onBoardChange={setBoard}
      />
    );
  };

  return (
    // scroll={false}: each board owns a FlatList, and nesting a virtualised
    // list inside a ScrollView defeats the virtualisation.
    <Screen title="Leaderboard" measure="table" context={headerContext} scroll={false}>
      {/* The board draws the control row — see `BoardControls` for why both
          chips have to be drawn by the same component. This screen still owns
          which board is selected; it just no longer draws the chip itself. */}
      <View style={styles.body}>{body()}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
});
