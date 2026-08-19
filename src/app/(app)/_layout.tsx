import { Redirect, Tabs, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_SECTIONS, routeNameOf } from '@/components/shell/sections';
import { Sidebar } from '@/components/shell/Sidebar';
import { TabIcon } from '@/components/shell/TabIcon';
import { useIsWide } from '@/components/shell/useResponsive';
import { Colors, TabBarContentHeight } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { PlayerProvider } from '@/context/PlayerContext';

/**
 * The five bottom tabs.
 *
 * `href` is the load-bearing part, not decoration. Four of these five routes
 * are FOLDERS with sub-pages, and a tab whose route is a nested navigator
 * restores that navigator's last state when you return to it — so after a trip
 * to Scores, pressing "Lineup" put you back on Scores, and the tab labelled
 * Lineup never showed the lineup again. `popToTopOnBlur` does not fix it
 * either: `SubNav` navigates with `replace`, so the sub-page IS the stack root
 * and there is nothing to pop.
 *
 * Naming the href makes the tab button a link to that exact path rather than a
 * "switch to this navigator" action, which resets the section in both cases —
 * returning from another tab, and pressing the tab you are already on. Verified
 * against expo-router 57 rather than assumed.
 *
 * The tabs themselves come from NAV_SECTIONS rather than a list kept here.
 * That file is the single declaration of the navigation — its own header warns
 * about exactly this — and the first version of this layout carried a parallel
 * array of five sections that had already begun to drift from it.
 */

export default function AppLayout() {
  const { session, initialising } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const isWide = useIsWide();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!initialising) void SplashScreen.hideAsync();
  }, [initialising]);

  // Hold rather than flash the login screen at an already-signed-in user.
  if (initialising) return null;
  if (!session) return <Redirect href="/login" />;

  return (
    <PlayerProvider>
      {/* One navigator either way. Swapping between a Tabs and a Drawer
          navigator on resize would remount every screen and lose scroll
          position, so the tab bar is hidden and the rail rendered beside it. */}
      <View style={[styles.shell, isWide && styles.shellWide, { backgroundColor: c.background }]}>
        {isWide ? <Sidebar /> : null}
        <View style={styles.content}>
          <Tabs
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
            {NAV_SECTIONS.map((section) => (
              <Tabs.Screen
                key={section.href}
                name={routeNameOf(section)}
                options={{
                  // `title` stays the full name — it is the route's name, not
                  // just the bar's. Only the bar shortens, via tabBarLabel.
                  title: section.label,
                  tabBarLabel: section.tabLabel ?? section.label,
                  href: section.href as Href,
                  tabBarIcon: ({ color, focused }) => (
                    <TabIcon name={section.icon} color={color} focused={focused} size={24} />
                  ),
                }}
              />
            ))}

            {/* `/` resolves so the deployed domain root and every
                <Redirect href="/" /> land somewhere; hidden from the bar. */}
            <Tabs.Screen name="index" options={{ href: null }} />
            <Tabs.Screen name="player/[id]" options={{ href: null }} />
          </Tabs>
        </View>
      </View>
    </PlayerProvider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  shellWide: { flexDirection: 'row' },
  content: { flex: 1 },
  /* 10, not 11. At 11 both "Leaderboard" and "Collection" truncated on a
     320pt viewport once icons were sitting above them. 10 clears every label
     at 320 except Leaderboard, which gets a shorter word instead. Measured,
     not guessed. */
  tabLabel: { fontSize: 10, fontWeight: '600' },
});
