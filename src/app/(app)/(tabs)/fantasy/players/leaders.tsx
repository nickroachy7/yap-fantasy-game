/**
 * The best cards of the season, in order. Called TOP in the bar.
 *
 * It was called Leaders until 2026-08-24, when the board one level up — the
 * standings between MANAGERS — took that word. Two bars a row apart both
 * reading "Leaders" and pointing at different rankings is a collision the
 * reader cannot see, so the narrower meaning moved: this ranks cards, that
 * ranks people. The route is still `/fantasy/players/leaders`.
 *
 * WHAT THIS IS FOR THAT SEARCH IS NOT
 *
 * Search can be sorted by points, so the top of it is these same names — and
 * that is the objection to this page, so it is worth answering. Search is a
 * tool for a question you already have: you arrive with a name, or a position,
 * or a college, and you narrow until you find it. This is a BOARD, which is a
 * different object: fixed length, no state to set, nothing to type, and it
 * answers a question you did not have to phrase. Opening Search and sorting it
 * is four decisions to reach what this page shows on arrival.
 *
 * It is also the only place in the section that ranks. Search deliberately does
 * not draw a rank column — its order changes with every sort key, so a number
 * beside a name would mean something different from one press to the next. Here
 * the order is the subject, so the rank is honest.
 *
 * ONE POOL AT A TIME. The position chips do not filter a global list, they
 * CHANGE it: pick WR and you get the top fifty receivers ranked 1..50, not
 * whichever receivers happened to place in the overall top fifty. A board of
 * "the best wide receivers" that skips from 3rd to 11th because the quarterbacks
 * between them were removed is not a board, it is a filtered table.
 */
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PlayerList, type ListedPlayer } from '@/components/cards/PlayerList';
import { ROW_GUTTER, figureFor } from '@/components/cards/PlayerRow';
import { useDirectoryBoard } from '@/components/cards/use-directory-board';
import {
  type DirectoryPlayer,
} from '@/components/cards/player-directory';
import { fixtureLabel, useUpcomingFixtures } from '@/components/cards/use-fixtures';
import { Screen } from '@/components/shell/Screen';
import { PositionFilter, type PosFilter } from '@/components/cards/PositionFilter';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spacing } from '@/constants/theme';

/**
 * NO CAP. The board is every ranked player, in the market's order.
 *
 * It was fifty, matched to the trend board. Both have dropped it for the same
 * reason: the pool is already in memory, `PlayerRow` is a fixed height and
 * `PlayerList` hands `getItemLayout` down, so the rows past the fold cost
 * nothing until they are scrolled to — and a reader looking for the man ranked
 * 63rd had no way to reach him and nothing on screen admitting he was there.
 */

export default function LeadersScreen() {
  const router = useRouter();

  /* One read, shared with Trend and Search — the cached directory, prices
     allowed to be newer than it, and the way to drop both. This screen grew all
     three first and they moved into `useDirectoryBoard` when the other two
     boards needed the same thing. */
  const { result, prices, failed, refreshing, refresh } = useDirectoryBoard();
  const [pos, setPos] = useState<PosFilter>('ALL');

  const fixtures = useUpcomingFixtures();

  /**
   * The board.
   *
   * Ranked off `overallRank` / `posRank` rather than off this list's own index,
   * so the number beside a name is the same number the directory row shows for
   * him — see `assignRanks`. Deriving it from the index here would be a second
   * ranking of the same players, and the two would disagree the moment either
   * changed its mind about who counts as unranked.
   *
   * Which is also why a player with no games is simply absent: he has no rank,
   * and a board is a list of ranks.
   */
  /**
   * THE BOARD IS THE MARKET'S, NOT OURS, and that is what makes it a board in
   * September.
   *
   * It used to rank on `overallRank`, which this app computes from points
   * actually scored this season. That is the right number in December and no
   * number at all in preseason: `assignRanks` leaves anyone with no games
   * unranked, so before week one it is null for EVERY player and this screen
   * was an empty state. A season board that only exists once the season is half
   * over is not much of a season board.
   *
   * `marketRank` is the provider's consensus, which exists before a snap is
   * taken. It is also the honest answer to what this page claims: "the best
   * cards" is a forward-looking statement, and ranking it on points already
   * banked answered a different question — who has been best SO FAR.
   *
   * THE POSITION BOARDS RE-RANK RATHER THAN FILTER, which is unchanged and is
   * the point of the note at the head of this file: picking WR gives the top
   * fifty receivers numbered 1..50. The market publishes only an overall rank
   * with any coverage (`position_rank` is present for a fifth of the board), so
   * the position number is this list's own ordinal over the market's order —
   * which is exactly what "the 12th best receiver" means.
   */
  const board = useMemo<ListedPlayer[]>(() => {
    if (!result) return [];
    const inPool =
      pos === 'ALL'
        ? result.players.filter((p) => p.marketRank !== null)
        : result.players.filter(
            (p) => p.marketRank !== null && (p.position ?? '').toUpperCase() === pos,
          );

    const rankOf = (p: DirectoryPlayer) => p.marketRank ?? Number.MAX_SAFE_INTEGER;

    return [...inPool]
      .sort((a, b) => rankOf(a) - rankOf(b))
        /* The ordinal, not the raw market rank. On the ALL board the two agree
           for the top fifty; on a position board they must not — a receiver
           board that reads 1, 4, 9, 14 is the filtered table this page exists
           not to be. */
        /* THE COLLECTION ROW'S PAIR, on a board of players rather than of
           copies: how he SCORES over what a card of him is worth.
 
           Both halves were already here and neither was readable — the price
           had taken the figure column outright, which put the season's
           production nowhere, and before that the production was there and the
           price was nowhere. They are two answers to one question and the
           collection has drawn them stacked all along. Two boards drawing the
           same pair two different ways is the drift `Identity` exists to stop.
 
           AVERAGE, NOT TOTAL. A season total rewards availability — sixteen
           quiet games out-scores nine good ones — and this board is ordered by
           what the market expects NEXT, which is a rate. It is also the only
           form of the number that means anything in September, when the totals
           are all zero.
 
           A DASH WHERE HE HAS NOT PLAYED, never 0.0. Every row on this board is
           unplayed until week one, and printing a nought for all fifty would be
           the board inventing a bad season for the best players in football.
 
           The price is the BASE — bronze, nothing earned — so two players are
           compared on the part of it that is about them. A copy in hand is
           worth this times its tier plus what it has banked, which is still
           `card_prices`. */
      .map((player, i) => ({
        player,
        rank: i + 1,
        figure: figureFor(player, prices?.get(player.playerId)),
      }));
  }, [result, pos, prices]);

  const openPlayer = useCallback(
    (player: DirectoryPlayer) =>
      router.push({ pathname: '/player/[id]', params: { id: player.playerId } }),
    [router],
  );

  const fixtureFor = useCallback(
    (team: string | null) => (team ? fixtureLabel(fixtures.get(team.toUpperCase())) : undefined),
    [fixtures],
  );

  const body = () => {
    if (failed) {
      return (
        <EmptyState
          title="Could not load the players"
          body="The board is built from the directory, and that read failed. Try again in a moment."
        />
      );
    }
    if (!result) return <ActivityIndicator style={styles.pad} />;
    if (board.length === 0) {
      return (
        <EmptyState
          title="Nobody has played yet"
          body={
            pos === 'ALL'
              ? 'A board needs the market\'s rankings, and that read came back empty. It refreshes weekly.'
              : `No ${pos} has a scored game this season yet.`
          }
        />
      );
    }
    return (
      <PlayerList
        players={board}
        fixtureFor={fixtureFor}
        onOpen={openPlayer}
        refreshing={refreshing}
        onRefresh={refresh}
      />
    );
  };

  /* The board IS the pool now, so the count is one number rather than a claim
     about how much was trimmed. The "top N of M" form went with the cap — it
     existed to promise that something had been left out, and nothing is. */
  const context = !result
    ? 'Season leaders'
    : `${result.season ?? ''} season · ${board.length} by market rank`.trim();

  return (
    <Screen title="Top" measure="table" context={context} scroll={false}>
      {/* The list runs edge to edge, so the chrome supplies the gutter the
          page does not. See the same block on the Trend board. */}
      <View style={styles.controls}>

        <PositionFilter value={pos} onChange={setPos} />
      </View>

      {body()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingVertical: Spacing.four },
  controls: { paddingHorizontal: ROW_GUTTER, paddingBottom: Spacing.two, gap: Spacing.two },
});
