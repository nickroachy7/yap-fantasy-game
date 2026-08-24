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
 * WHY A BAR AND NOT A ROW OF PEERS. It has been underlined tabs and it has been
 * a scrolling strip of filter pills, and neither survived a 375pt phone: tabs
 * collided with `FantasyTopNav`'s own treatment one row above, and six pills
 * needed about 520pt in a 343pt row so the strip opened clipped at both ends.
 * `BoardControls` carries the full argument.
 *
 * WHY THE BAR IS PINNED, with the scope control, the context line and your own
 * row beside it, while everything else scrolls. They are different ranks of
 * thing: which board, what it is counted over, and where you stand in it all
 * have to be answerable from row two hundred; the sentence describing the board
 * is read once and should go.
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

  /**
   * "Preseason 2026" — the slate every board is counted over, handed down for
   * each board to finish with its own scope and field size.
   *
   * IT IS NOT PASSED TO `Screen` ANY MORE, and that is a fix rather than a
   * removal. `Screen`'s `context` prop is wide-only by design, so this line
   * rendered on web and NOWHERE on a phone — leaving the phone build with no
   * statement anywhere of which season or week its numbers belonged to. The
   * boards draw it themselves now, under the board strip, on both builds. See
   * `BoardControls`.
   *
   * The WEEK is deliberately not in here. The points board can be showing a
   * week other than the slate's current one, and a line that said "Week 3"
   * above a board of Week 1 scores would be a wrong statement rather than a
   * missing one. Each board appends the scope it is actually showing.
   */
  const slateContext = useMemo(
    () => (slate ? `${slateLabel(slate.season_type)} ${slate.season}` : `${SEASON} season`),
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
          slateContext={slateContext}
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
        slateContext={slateContext}
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
    <Screen title="Leaders" measure="table" scroll={false}>
      {/* The board draws the control row — see `BoardControls` for why both
          controls have to be drawn by the same component. This screen still
          owns which board is selected; it just no longer draws the strip. */}
      <View style={styles.body}>{body()}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
});
