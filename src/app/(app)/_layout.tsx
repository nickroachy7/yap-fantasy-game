import { Redirect, Tabs, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { Sidebar } from '@/components/shell/Sidebar';
import { TabIcon, type TabIconName } from '@/components/shell/TabIcon';
import { useIsWide } from '@/components/shell/useResponsive';
import { Colors } from '@/constants/theme';
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
 * Order is deliberate and matches NAV_SECTIONS: the weekly decision first,
 * standings second, acquisition third, what you own fourth, identity last.
 */
const TABS: { name: string; href: Href; title: string; icon: TabIconName }[] = [
  { name: 'lineup', href: '/lineup', title: 'Lineup', icon: 'lineup' },
  { name: 'leaderboard', href: '/leaderboard', title: 'Leaderboard', icon: 'leaderboard' },
  { name: 'cards', href: '/cards', title: 'Cards', icon: 'cards' },
  { name: 'collection', href: '/collection', title: 'Collection', icon: 'collection' },
  { name: 'profile', href: '/profile', title: 'Profile', icon: 'profile' },
];

export default function AppLayout() {
  const { session, initialising } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const isWide = useIsWide();

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
                : { backgroundColor: c.background, borderTopColor: c.backgroundElement },
            }}>
            {TABS.map((tab) => (
              <Tabs.Screen
                key={tab.name}
                name={tab.name}
                options={{
                  title: tab.title,
                  href: tab.href,
                  tabBarIcon: ({ color, focused }) => (
                    <TabIcon name={tab.icon} color={color} focused={focused} size={24} />
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
  tabLabel: { fontSize: 11, fontWeight: '600' },
});
