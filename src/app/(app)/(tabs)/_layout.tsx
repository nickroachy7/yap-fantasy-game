import { Tabs, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { NAV_TABS, routeNameOf } from '@/components/shell/sections';
import { Sidebar } from '@/components/shell/Sidebar';
import { NavIcon } from '@/components/icons/NavIcon';
import { useIsWide } from '@/components/shell/useResponsive';
import { WebHeader } from '@/components/shell/WebHeader';
import { TabBarGlass } from '@/components/shell/TabBarGlass';
import { Colors, TabPillHeight, TabPillInset } from '@/constants/theme';
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
            /* THE PILL IS A LAYER OVER THE PAGE, NOT A BAND UNDER IT.

               `position: absolute` is what makes the glass mean anything: the
               scene runs the full height of the screen and the content passes
               UNDER the pill, which is the only thing there is to refract. A
               bar that content stops above is a solid capsule with a blur
               setting. The cost is that every list must now reserve a tail —
               see `useTabBarSpace`, and the note on `TabPillHeight` for why
               this app spent a while insisting the opposite.

               NO FILL AND NO BORDER HERE. Both belong to `tabBarBackground`,
               which is the only child clipped by the radius; a background set
               on this style sits OVER the glass and would flatten it.

               `overflow: hidden` is what does the clipping, and it has to be on
               this box rather than on the glass — the glass is
               `absoluteFill`ed inside it and would otherwise square off the
               corners it is meant to fill. */
            tabBarStyle: isWide
              ? { display: 'none' }
              : {
                  position: 'absolute',
                  /* THE SAME NUMBER THREE TIMES, and the safe-area inset is
                     deliberately not added to the bottom one — see
                     `TabPillInset`. Adding it put the capsule 46pt off the
                     bottom and 12 off the sides, which reads as drift. */
                  left: TabPillInset,
                  right: TabPillInset,
                  bottom: TabPillInset,
                  height: TabPillHeight,
                  /* A capsule rather than a rounded rectangle: half the height
                     is the only radius that stays a capsule if the height ever
                     changes, and the app's `SheetCorner` is deliberately not
                     used — this is not a sheet edge any more, it is a control
                     floating over the page, and it should not read as the same
                     kind of layer. */
                  borderRadius: TabPillHeight / 2,
                  overflow: 'hidden',
                  backgroundColor: 'transparent',
                  borderTopWidth: 0,
                  /* Android draws `elevation` as a rectangular shadow that
                     ignores `borderRadius`, so a capsule would sit in a square
                     shadow of itself. */
                  elevation: 0,
                  /* The navigator pads for the home indicator by default. The
                     pill is already clear of it — that is what `bottom` is
                     doing — so a second inset inside it would push the labels
                     off the bottom of the capsule. */
                  paddingBottom: 0,
                  paddingTop: 6,
                },
            tabBarBackground: isWide ? undefined : () => <TabBarGlass />,
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
