/**
 * Find a player. A takeover, not a page.
 *
 * WHY THIS ONE IS DIFFERENT FROM ITS TWO NEIGHBOURS
 *
 * Trend and Leaders are boards: you arrive, you read, you leave. Search is a
 * tool you pick up with a name already in mind, use for about four seconds, and
 * put down — and the whole time you are using it the rest of the section is
 * irrelevant. So it takes the screen: no section nav, no position chips, no
 * sort strip, nothing but a field and what matches it.
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
 * to Trend — the section's landing page — because there is nowhere else it
 * could sensibly go.
 *
 * THE FIELD IS FOCUSED ON ARRIVAL. The entire content of this screen is a
 * response to typing, so a keyboard that has to be summoned first is a step
 * between the reader and the only thing here.
 *
 * NO SORT, AND NO POSITION FILTER. Both exist on the directory panel this
 * replaced, and both are answers to "show me a set", which is what the boards
 * next door are for. Here the query IS the filter, and a sort key would just be
 * a second control competing with it — the order that matters is points
 * descending, which is what you want when two players share a surname.
 */
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerList, type ListedPlayer } from '@/components/cards/PlayerList';
import { figureFor, ROW_GUTTER } from '@/components/cards/PlayerRow';
import { useDirectoryBoard } from '@/components/cards/use-directory-board';
import {
  filterAndSort,
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
 */
const SORT = { key: 'fp', dir: 'desc' } as const;

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
   * THE SAME ROW AS TREND AND TOP: a number on the left, and how he scores over
   * what a card of him is worth on the right.
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
  const matches = useMemo<ListedPlayer[]>(() => {
    if (!result) return [];
    return filterAndSort(result.players, { position: 'ALL', query, sort: SORT }).map(
      (player, i) => ({
        player,
        rank: i + 1,
        figure: figureFor(player, prices?.get(player.playerId)),
      }),
    );
  }, [result, query, prices]);

  /**
   * Close, not navigate.
   *
   * This used to `replace('/fantasy/players')`, which was wrong twice over. It sent
   * everyone to Trend regardless of where they opened search from, so anyone
   * arriving from Leaders was moved to a different board on the way out. And a
   * replace is a NAVIGATION: it tears this screen down and mounts a board from
   * scratch, refetching the directory and flashing a spinner to arrive at a
   * page that was already sitting there a moment ago.
   *
   * Going back dismisses instead. The page underneath was never unmounted, so
   * it reappears already scrolled where you left it, with no fetch and nothing
   * to wait for — which is most of why closing now feels instant.
   *
   * The fallback is for arriving here cold: a deep link or a refreshed browser
   * tab has no history to pop, and `back()` on an empty stack does nothing at
   * all, which would strand the reader on a screen whose only exit had stopped
   * working. Trend is the section's landing page and the right place to land.
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
    return <PlayerList players={matches} fixtureFor={fixtureFor} onOpen={openPlayer} />;
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
