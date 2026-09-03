/**
 * Find a player. A takeover, not a page.
 *
 * WHY THIS SURVIVED THE MERGE
 *
 * It had two neighbours — Trend and Top — and they are gone, not because they
 * were cut but because they turned out to be two orderings of the board they
 * shared. See `players/index.tsx`. That could have swallowed this screen too:
 * once a board has facets and a sort, a search field is arguably one more
 * narrowing and belongs in the same row.
 *
 * It did not, and the reason is that search is not a way of looking at a list.
 * It is a tool you pick up with a name already in mind, use for about four
 * seconds, and put down — and the whole time you are using it, everything else
 * on the board is in the way. So it still takes the screen: no chrome, no
 * chips, no sort, nothing but a field and what matches it.
 *
 * THE COST, NAMED. A result here cannot inherit the board's facets or its order.
 * Someone who has narrowed to unowned rookie receivers and then searches gets
 * the whole pool back. That is the price of the focus, it was paid knowingly,
 * and the fix if it ever bites is a field on the board rather than a filter row
 * on this screen — which would be this file arguing itself out of existence.
 *
 * IT COVERS EVERYTHING, and that is why it does not live under `(tabs)`.
 *
 * It was a route inside the tab navigator, which meant it inherited the app
 * header and the tab bar — so a screen whose whole claim is "nothing here but
 * the field and its results" shipped with a wordmark, a coin balance and five
 * tabs still on it. A takeover with a tab bar is not a takeover; it is a page
 * with the section nav removed, which is strictly worse than the page it
 * replaced because it lost the navigation without gaining the focus.
 *
 * So it is a sibling of `(tabs)` in the Stack above them, presented as a
 * full-screen modal — the same layer `player/[id]` and `card/[id]` already use
 * to sit over the app, one presentation stronger. It draws its own safe-area
 * insets, because with no `Screen` around it nothing else will.
 *
 * That makes the X the only way out, which is the intended trade: there is no
 * tab bar to escape sideways through, so the dismissal has to be obvious and
 * has to be the biggest control on the row after the field itself. It returns
 * to the players board, because there is nowhere else it could sensibly go.
 *
 * THE FIELD IS FOCUSED ON ARRIVAL. The entire content of this screen is a
 * response to typing, so a keyboard that has to be summoned first is a step
 * between the reader and the only thing here.
 *
 * NO SORT, AND NO POSITION FILTER. Both live on the board next door, and both
 * are answers to "show me a set" — which is a different errand from "find me
 * this man". Here the query IS the filter, and a sort key would be a second
 * control competing with the only one that matters. The order is points
 * descending, which is what you want when two players share a surname.
 */
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerList } from '@/components/cards/PlayerList';
import { BoardDetail, figureFor } from '@/components/cards/BoardDetail';
import { ROW_GUTTER } from '@/components/cards/PlayerRow';
import { useDirectoryBoard } from '@/components/cards/use-directory-board';
import { NO_FILTERS, buildBoard } from '@/components/cards/board-view';
import {
  type DirectoryFetch,
  type DirectoryPlayer,
} from '@/components/cards/player-directory';
import { fixtureLabel, useUpcomingFixtures } from '@/components/cards/use-fixtures';
import { SearchField } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors, NUMERIC, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Points descending, fixed. See the header: the query is the only control here,
 * and this is the order that makes two players with the same surname resolve
 * into "the one you meant is first".
 *
 * IT GOES THROUGH `buildBoard`, the same function the board uses, with every
 * facet left at its default and the query the only thing set. That is not
 * ceremony: the matcher decides whether a man EXISTS, and two implementations
 * of it is how a board and a search come to disagree about whether he does.
 */
const SORT = { key: 'points', dir: 'desc' } as const;

/**
 * The figure column follows the order, here as on the board — see `figureFor`.
 *
 * `points` descending puts a season total beside every name, over the price. In
 * September that total is null for everybody and the row draws the quiet dash,
 * which is correct and is what the whole app does with an unplayed player: the
 * price underneath is the number that is real, and it is the fact most likely
 * to be wanted by someone who arrived with a name in mind.
 */

export default function PlayersSearchScreen() {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();

  /* The same read the two boards make — see `useDirectoryBoard`. Search takes
     the prices too: a card's worth is one of the things you come here to check,
     and it must not disagree with the board you came from. */
  const { result, prices, failed } = useDirectoryBoard();
  const [query, setQuery] = useState('');

  const fixtures = useUpcomingFixtures();

  /**
   * THE SAME ROW THE BOARD DRAWS: a number on the left, and what a card of him
   * fetches on the right. The figure follows the order here exactly as it does
   * on the board, and the order here is fixed — see `SORT`.
   *
   * THE NUMBER IS AN ORDINAL, NOT A RANK, and the distinction is worth keeping
   * straight because this file used to argue against drawing one at all. That
   * argument was about a list whose order changed with a sort strip, where a
   * number beside a name meant something different from one press to the next.
   * Search has ONE order — `SORT`, fixed, best season first — so the number is
   * simply where the row sits in the list you are looking at, and it stays put.
   *
   * Every match is listed. There is no cap here and never was; the boards have
   * dropped theirs to match.
   */
  const matches = useMemo<DirectoryPlayer[]>(() => {
    if (!result) return [];
    return buildBoard(result.players, {
      sort: SORT.key,
      dir: SORT.dir,
      filters: { ...NO_FILTERS, query },
      /* No movement and no fixtures: the sort does not need a delta and no
         facet here asks whether he plays this week. */
      deltas: null,
      playsThisWeek: () => false,
    });
  }, [result, query]);

  /**
   * THE SAME TWO SLOTS THE BOARD FILLS, from the same functions — a season
   * total, with games played and the rate beside it. The takeover has no order
   * control, so the answer is fixed; what it must not be is DIFFERENT. Two
   * screens drawing one player two ways is how a reader learns to distrust
   * both. The tray is left to the row, which is the community band it is
   * everywhere else.
   *
   * CALLED PER VISIBLE ROW, like the board's — see `PlayerList`. It matters
   * more here than there: this list is rebuilt on every KEYSTROKE, so building
   * a figure and an element for every match would have put a thousand
   * `toLocaleString` calls between a letter and its results.
   */
  const ctxFor = useCallback(
    (player: DirectoryPlayer) => ({
      sort: SORT.key,
      dir: SORT.dir,
      coins: prices?.get(player.playerId),
      /* Unreachable for this order — a signed delta is what needs them — but
         the context is required rather than partial, so a measure added later
         cannot silently lose its colours on this screen. */
      positive: c.positive,
      negative: c.negative,
    }),
    [prices, c.positive, c.negative],
  );

  /* His market rank, as the board draws it: a fact about him rather than his
     position in these results, which change on every keystroke. */
  const rankFor = useCallback((player: DirectoryPlayer) => player.marketRank, []);
  const figureOf = useCallback(
    (player: DirectoryPlayer) => figureFor(player, ctxFor(player)),
    [ctxFor],
  );
  const detailOf = useCallback(
    (player: DirectoryPlayer) => <BoardDetail player={player} ctx={ctxFor(player)} />,
    [ctxFor],
  );

  /**
   * Close, not navigate.
   *
   * This used to `replace('/fantasy/players')`, which was wrong twice over. It
   * sent everyone to one particular board regardless of where they had opened
   * search from, so anyone arriving from a sibling view was moved on the way
   * out. And a replace is a NAVIGATION: it tears this screen down and mounts a
   * board from scratch, refetching the directory and flashing a spinner to
   * arrive at a page that was already sitting there a moment ago.
   *
   * It matters more now, not less. The board carries the reader's order, their
   * facets in local state, so a replace on the way out would
   * silently reset every one of them — you would come back from a four-second
   * errand to a board you had not configured.
   *
   * Going back dismisses instead. The page underneath was never unmounted, so
   * it reappears already scrolled where you left it, with no fetch and nothing
   * to wait for — which is most of why closing now feels instant.
   *
   * The fallback is for arriving here cold: a deep link or a refreshed browser
   * tab has no history to pop, and `back()` on an empty stack does nothing at
   * all, which would strand the reader on a screen whose only exit had stopped
   * working. The players board is where it belongs.
   */
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/fantasy/players');
  }, [router]);

  const openPlayer = useCallback(
    (player: DirectoryPlayer) =>
      router.push({ pathname: '/player/[id]', params: { id: player.playerId } }),
    [router],
  );

  const fixtureFor = useCallback(
    (team: string | null) => (team ? fixtureLabel(fixtures.get(team.toUpperCase())) : undefined),
    [fixtures],
  );

  const typing = query.trim().length > 0;

  const body = () => {
    if (failed) {
      return (
        <EmptyState
          title="Could not load the players"
          body="The directory could not be read. Close this and try again in a moment."
        />
      );
    }
    if (!result) return <ActivityIndicator style={styles.pad} />;
    if (matches.length === 0) {
      return (
        <EmptyState
          title="Nothing matches"
          body={`No player, club or college matches "${query.trim()}". Try fewer characters.`}
        />
      );
    }
    return (
      <PlayerList
        players={matches}
        rankFor={rankFor}
        figureFor={figureOf}
        renderDetail={detailOf}
        fixtureFor={fixtureFor}
        onOpen={openPlayer}
      />
    );
  };

  return (
    /* The surface is painted here, opaque, because a full-screen modal that
       does not paint shows the page it covered through its own gaps. */
    <View style={[styles.fill, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <View style={styles.controls}>
        {/* The field and the way out, on one line. The X belongs beside the
            thing it dismisses rather than in a header the page does not draw
            on a phone. */}
        <View style={styles.bar}>
          <View style={styles.field}>
            <SearchField
              value={query}
              onChange={setQuery}
              autoFocus
              placeholder="Search name, team or college"
              hint={
                result
                  ? typing
                    ? `${matches.length}`
                    : `${result.players.length}`
                  : undefined
              }
              accessibilityLabel="Search players by name, team or college"
            />
          </View>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close search"
            hitSlop={Spacing.two}
            style={({ pressed }) => [
              styles.close,
              { backgroundColor: c.backgroundElement, borderColor: c.border },
              pressed && styles.pressed,
            ]}>
            {/* Drawn as a character rather than as two crossed bars: this is the
                one glyph in the app that everyone already reads, and composing
                it from views to match the house rule would be ceremony. */}
            <Text style={[Type.section, styles.x, { color: c.textSecondary }]}>×</Text>
          </Pressable>
        </View>

        {/* What the field's hint counts, said once in words. The hint itself is
            a bare number because it lives inside the field.

            IT ALSO CARRIES THE DEGRADED-READ FLAGS, which is not decoration.
            The directory's one failure mode that looks like success is a
            silent truncation — PostgREST caps `.select()` and returns HTTP 200
            — and a search that quietly cannot see the last 400 players is a
            search that will confidently tell you a man does not exist. The
            panel this screen replaced said so; losing that on the way would
            have been a regression nobody could see. */}
        <Text numberOfLines={2} style={[Type.fine, NUMERIC, { color: c.textTertiary }]}>
          {result ? countLine(result, matches.length, typing) : ' '}
        </Text>

        {result && !result.complete ? (
          <Text
            style={[
              Type.fine,
              styles.warning,
              { color: c.text, backgroundColor: c.backgroundSelected },
            ]}>
            {`Only ${result.players.length} of ${result.expected} players loaded. Some names will be missing — reopen search to retry.`}
          </Text>
        ) : null}
      </View>

      {body()}

      {/* The home indicator, and nothing else: there is no tab bar under this
          screen to leave room for. */}
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

/**
 * The count, plus whichever side reads failed.
 *
 * Same sentence the directory panel used, kept deliberately: two surfaces
 * describing one list in two vocabularies is how a reader learns to distrust
 * both.
 */
function countLine(result: DirectoryFetch, shown: number, typing: boolean): string {
  const total = result.players.length;
  const base = typing ? `${shown} of ${total} players` : `${total} players — start typing`;
  const missing = [result.bios ? null : 'no bios', result.market ? null : 'no card counts']
    .filter(Boolean)
    .join(' · ');
  return missing ? `${base} · ${missing}` : base;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { paddingVertical: Spacing.four },
  warning: { padding: Spacing.two, borderRadius: 6, overflow: 'hidden' },
  controls: {
    paddingHorizontal: ROW_GUTTER,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  field: { flex: 1, minWidth: 0 },
  close: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* The glyph sits high in its own line box; the nudge centres it in the tile. */
  x: { lineHeight: 20 },
  pressed: { opacity: 0.6 },
});
