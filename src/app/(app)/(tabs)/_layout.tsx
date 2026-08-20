import { Tabs, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_TABS, routeNameOf } from '@/components/shell/sections';
import { Sidebar } from '@/components/shell/Sidebar';
import { TabIcon } from '@/components/shell/TabIcon';
import { useIsWide } from '@/components/shell/useResponsive';
import { Colors, TabBarContentHeight } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The bottom bar, which is the WHOLE APP's navigation and not the fantasy
 * game's.
 *
 * It used to be the five boards — Lineup, Collection, Players, Board, Profile —
 * which meant the bar could only ever name things inside one product. Those
 * four moved to a strip under the header inside Fantasy (see `FantasyTopNav`),
 * and what is left down here is Fantasy, Scores and Profile: three places the
 * app can be, with room for the ones that do not exist yet.
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
 * Fantasy is the same mechanism and the OPPOSITE call, because the tab's name
 * is now true of everything under it. Coming back from Scores should find the
 * collection you were part-way through sorting, not throw you back to the
 * lineup — so Fantasy gets no href and keeps its state. What that also buys,
 * free, is the platform gesture: pressing the tab you are already on resets its
 * navigator to the route it opens on, which here means "take me back to my
 * lineup".
 *
 * Scores and Profile are single pages with no navigator and nothing to restore,
 * so an href on them would be identity. They keep one anyway — see `href`
 * below — so the bar is one rule rather than two.
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
                  backgroundColor: c.background,
                  borderTopColor: c.backgroundElement,
                  /* The height is imposed rather than left to the navigator's
                     default, which is the whole reason `useTabBarInset()` can
                     promise screens an exact number to reserve. Content sits
                     in TabBarContentHeight; the safe area is padding beneath
                     it, so the bar's background still runs to the bottom of
                     the screen instead of floating above the home indicator. */
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
                  <TabIcon name={tab.icon} color={color} focused={focused} size={24} />
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
  /* Three labels now rather than five, so there is room — but the size stays
     at 10 because the bar's height is fixed (see TabBarContentHeight) and a
     bigger label would only crowd the glyph above it. */
  tabLabel: { fontSize: 10, fontWeight: '600' },
});
