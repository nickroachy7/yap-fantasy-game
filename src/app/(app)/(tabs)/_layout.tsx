import { Tabs, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_TABS, routeNameOf } from '@/components/shell/sections';
import { Sidebar } from '@/components/shell/Sidebar';
import { NavIcon } from '@/components/icons/NavIcon';
import { useIsWide } from '@/components/shell/useResponsive';
import { WebHeader } from '@/components/shell/WebHeader';
import { Colors, SheetCorner, TabBarContentHeight } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The bottom bar, which is the WHOLE APP's navigation and not the fantasy
 * game's.
 *
 * It used to be the five boards — Lineup, Collection, Players, Board, Profile —
 * which meant the bar could only ever name things inside one product. Those
 * moved to a strip under the header inside the game (see `FantasyTopNav`), and
 * what is left down here is Yap, Leagues, Scores and Profile: two products and
 * the two pieces of furniture that belong to neither.
 *
 * THE TAB LABELLED YAP IS THE ROUTE `/fantasy`, and Leagues is a placeholder.
 * Both are deliberate and both are argued in `sections.ts`; nothing in this
 * file needs to know, because it renders whatever NAV_TABS declares.
 *
 * ONLY LEAF TABS ARE PINNED TO AN href, and that distinction is load-bearing.
 *
 * A tab whose route is a nested navigator restores that navigator's last state
 * when you return to it. When the bar was five boards that was a bug: after a
 * trip to Scores, pressing "Lineup" put you back on Scores, and the tab
 * labelled Lineup never showed the lineup again. Naming the href made the tab
 * button a link to that exact path rather than a "switch to this navigator"
 * action, which reset the section.
 *
 * Yap is the same mechanism and the OPPOSITE call, because the tab's name is
 * now true of everything under it. Coming back from Scores should find the
 * collection you were part-way through sorting, not throw you back to the
 * lineup — so Yap gets no href and keeps its state. What that also buys, free,
 * is the platform gesture: pressing the tab you are already on resets its
 * navigator to the route it opens on, which here means "take me back to my
 * lineup".
 *
 * Leagues, Scores and Profile are single pages with no navigator and nothing to
 * restore, so an href on them would be identity. They keep one anyway — see
 * `href` below — so the bar is one rule rather than two.
 *
 * The tabs come from NAV_TABS rather than a list kept here. That file is the
 * single declaration of the navigation — its own header warns about exactly
 * this — and the first version of this layout carried a parallel array of five
 * sections that had already begun to drift from it.
 */

export default function TabsLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const isWide = useIsWide();
  const insets = useSafeAreaInsets();

  /* One navigator either way. Swapping between a Tabs and a Drawer navigator
     on resize would remount every screen and lose scroll position, so the tab
     bar is hidden and the rail rendered beside it. */
  return (
    <View style={[styles.shell, isWide && styles.shellWide, { backgroundColor: c.background }]}>
      {isWide ? <Sidebar /> : null}
      <View style={styles.content}>
        {/* Mounted HERE, above the navigator, for the same reason `FantasyFrame`
            draws the phone's masthead above its own: chrome rendered by a
            screen is chrome that is torn down and rebuilt every time you change
            screen. For a ticker that costs a refetch of the week's fixtures on
            every click and — more visibly — resets its horizontal scroll, so
            scrolling to Sunday night and then opening Collection would put you
            back at Thursday. Mounted once, it simply keeps its place.

            Narrow renders nothing: a phone cannot spend 62pt of a 812pt screen
            on chrome, which is why the scoreboard is a tab there. */}
        {isWide ? <WebHeader /> : null}
        <Tabs
          /**
           * Back returns to the tab you CAME FROM, not to the first one.
           *
           * react-navigation defaults to `firstRoute`, which meant backing
           * out of a player profile always landed on Lineup — the profile is
           * an href:null sibling of the tabs, so leaving it popped to the
           * navigator's initial route rather than to the directory you opened
           * it from. Verified with a probe: default lands on tab one,
           * `history` lands where you were.
           *
           * It also makes Android's hardware back walk the tabs you actually
           * visited, which is what people expect of it everywhere else.
           */
          backBehavior="history"
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: c.text,
            tabBarInactiveTintColor: c.textSecondary,
            tabBarLabelStyle: styles.tabLabel,
            tabBarStyle: isWide
              ? { display: 'none' }
              : {
                  /* A SURFACE, LIFTED OFF THE PAGE, and curved at the top like
                     the sheets are.

                     It was `background` with a hairline over it — the same
                     black as the page, separated by one grey line. That is the
                     arrangement `AppHeader` already threw out at the top of the
                     screen for the same reason: against #000 a near-black band
                     is not chrome, it is a rectangle of very slightly different
                     black whose only real signal is the seam. `surfaceSheet` is
                     the app's answer to "a layer above the page" everywhere
                     else, so the bar reads as one rather than as the page with
                     a line drawn on it.

                     THE BORDER GOES WITH IT. The fill is doing the separating
                     now, and a hairline that only exists on one edge cannot
                     follow the corner radius anyway — React Native needs a
                     uniform border for that, so a top-only one would run
                     straight off the curve. */
                  backgroundColor: c.surfaceSheet,
                  borderTopWidth: 0,
                  /* `SheetCorner`, not a number picked here: this is the same
                     curve the profile, card, set and packs sheets are drawn
                     with, and the point is that the bar is recognisably the
                     same kind of layer. They must move together. */
                  borderTopLeftRadius: SheetCorner,
                  borderTopRightRadius: SheetCorner,
                  /* Android draws `elevation` as a rectangular shadow that
                     ignores `borderRadius`, so the corners would sit in the
                     square shadow of the bar they were rounded off. */
                  elevation: 0,
                  /* The height is imposed rather than left to the navigator's
                     default, so the bar is the same object on every device.
                     Content sits in TabBarContentHeight; the safe area is
                     padding beneath it, so the bar's background still runs to
                     the bottom of the screen instead of floating above the home
                     indicator.

                     SCREENS DO NOT RESERVE THIS. The bar is a sibling of the
                     scene rather than a layer over it, so a page already ends
                     where the bar starts — see `TabBarContentHeight`. */
                  height: TabBarContentHeight + insets.bottom,
                  paddingBottom: insets.bottom,
                  paddingTop: 6,
                },
          }}>
          {NAV_TABS.map((tab) => (
            <Tabs.Screen
              key={tab.href}
              name={routeNameOf(tab)}
              options={{
                title: tab.label,
                /* `undefined` restores the navigator's own state; a path resets
                   it. Only Fantasy has a navigator to restore — see the header
                   for why it is the one tab that wants to. */
                href: (tab.sections ? undefined : tab.href) as Href | undefined,
                tabBarIcon: ({ color, focused }) => (
                  <NavIcon name={tab.icon} color={color} focused={focused} size={24} />
                ),
              }}
            />
          ))}

          {/* `/` resolves so the deployed domain root and every
              <Redirect href="/" /> land somewhere; hidden from the bar. */}
          <Tabs.Screen name="index" options={{ href: null }} />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  shellWide: { flexDirection: 'row' },
  content: { flex: 1 },
  /* Four labels rather than the old five, so there is still room — but the size
     stays at 10 because the bar's height is fixed (see TabBarContentHeight) and
     a bigger label would only crowd the glyph above it. "Leagues" is the
     longest of the four at seven characters, which is what "Fantasy" was before
     it became "Yap"; the note below is the measurement that word produced. */
  /**
   * `overflow: 'visible'` is the fix for "Fantasy" reading as "Fantasv".
   *
   * Only the ACTIVE label was cut, which is what made it look like a font
   * problem rather than a layout one. Measured on the deployed build: the
   * active label's box is 10pt tall — the font size — while its content is 14,
   * and react-native-web ships `overflow: hidden` on it for `numberOfLines`.
   * The inactive labels box at the full 14 and are fine. So the tail of the y
   * overflowed by 2.5pt and was clipped, on that one tab, whichever tab it was.
   *
   * Letting it paint outside its box is the smallest correct answer. The label
   * is a single short word in a fixed-width column, so the ellipsis that
   * `hidden` exists to produce has nothing to do here anyway.
   *
   * `lineHeight` stays: it is what makes the inactive labels 14 rather than the
   * font's own `normal`, and the two should agree.
   */
  tabLabel: { fontSize: 10, fontWeight: '600', lineHeight: 14, overflow: 'visible' },
});
