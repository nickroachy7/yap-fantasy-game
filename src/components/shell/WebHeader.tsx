/**
 * The band across the top of the wide-web window: this week's scoreboard.
 *
 * WHY A SCOREBOARD AND NOT A HEADER
 *
 * A browser window has a row of space across the top that a phone does not,
 * and until now the app put nothing in it — the rail carried the wordmark, the
 * balance and the account, and the page started at the top of the window with
 * a heading and no chrome above it. The obvious thing to fill it with is a
 * masthead, and a masthead would have been furniture: the wordmark is already
 * two inches to the left, the balance with it, and repeating either says
 * nothing a reader did not know when the page loaded.
 *
 * What every screen of a fantasy app actually benefits from having permanently
 * in view is the league's own state — who is playing, and how it is going. On a
 * phone that has to be bought with vertical space, so it lives on the Scores
 * tab and the lineup gets a countdown instead. On a desktop it is free, and it
 * turns the top of the window from a border into the one part of the app that
 * is true while you are on any other part of it.
 *
 * IT IS THE SAME TICKER THE LINEUP USED TO CARRY, not a second one — see
 * `ScoreStrip`, which grew exactly three props to be furniture as well as a
 * band on a page. This file is the data and nothing else.
 *
 * IT IS ALWAYS DRAWN, INCLUDING ON A DEAD WEEK. `alwaysShow` is what makes the
 * top of the window a fixed thing rather than one that comes and goes with the
 * fixture list, dragging every page 62pt up and down with it. On a week with no
 * games the band still names the week and still gets you to the scoreboard.
 *
 * WHERE IT IS MOUNTED matters as much as what is in it. `(tabs)/_layout`
 * renders it above the Tabs navigator, inside the content column and beside the
 * rail — so it is mounted ONCE for the whole session. A header rendered per
 * screen would refetch the fixtures on every navigation and, worse, would lose
 * the ticker's horizontal scroll offset every time you changed page: you would
 * scroll to Sunday night, click Collection, and find yourself back at Thursday.
 *
 * NOTHING HERE RUNS ON A PHONE. The only caller gates on `useIsWide()`.
 */
import { StyleSheet, View } from 'react-native';

import { ScoreStrip } from '@/components/scores/ScoreStrip';
import { shortWeekLabel } from '@/components/scores/scoreboard';
import { useCurrentSlate, useSlateGames } from '@/components/scores/use-scores';

/**
 * The band never marks games as "yours".
 *
 * On the lineup that mark was the whole argument for putting a scoreboard
 * there — "two of yours were in it" is a fact about your week. Here it would
 * cost a lineup read on every page of the app to decorate chrome, and it would
 * be wrong half the time anyway: the header shows the CURRENT week, which is
 * not necessarily the week whose lineup you last set. One shared empty map so
 * the memoised strip does not see a new object on every render.
 */
const NO_STARTERS: Map<string, number> = new Map();

export function WebHeader() {
  const slate = useCurrentSlate();
  const { games, loading } = useSlateGames(slate);

  return (
    <View style={styles.band}>
      <ScoreStrip
        games={games}
        week={slate ? shortWeekLabel(slate.seasonType, slate.week) : 'This week'}
        startersByTeam={NO_STARTERS}
        loading={loading}
        chrome
        alwaysShow
        weekHref="/scores"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /* `flexShrink: 0` so the band keeps its height when the navigator below it
     asks for everything. Without it a long page squeezed the chrome instead of
     scrolling, and the fixtures lost a few points off the bottom. */
  band: { flexShrink: 0, width: '100%' },
});
