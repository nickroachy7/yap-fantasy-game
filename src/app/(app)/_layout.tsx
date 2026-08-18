import { Redirect, Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { Sidebar } from '@/components/shell/Sidebar';
import { useIsWide } from '@/components/shell/useResponsive';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { PlayerProvider } from '@/context/PlayerContext';

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
            {/* Order is deliberate: the weekly decision first, standings second,
                acquisition third, what you own fourth, identity last. */}
            <Tabs.Screen name="lineup" options={{ title: 'Lineup' }} />
            <Tabs.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
            <Tabs.Screen name="cards" options={{ title: 'Cards' }} />
            <Tabs.Screen name="collection" options={{ title: 'Collection' }} />
            <Tabs.Screen name="profile" options={{ title: 'Profile' }} />

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
