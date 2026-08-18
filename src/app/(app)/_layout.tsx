import { Redirect, Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { PlayerProvider } from '@/context/PlayerContext';

export default function AppLayout() {
  const { session, initialising } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  useEffect(() => {
    if (!initialising) void SplashScreen.hideAsync();
  }, [initialising]);

  // Hold rather than flash the login screen at an already-signed-in user.
  if (initialising) return null;
  if (!session) return <Redirect href="/login" />;

  return (
    <PlayerProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: c.text,
          tabBarInactiveTintColor: c.textSecondary,
          tabBarLabelStyle: styles.tabLabel,
          tabBarStyle: {
            backgroundColor: c.background,
            borderTopColor: c.backgroundElement,
          },
        }}>
        {/* Order is deliberate: the weekly decision comes first, standings
            second, acquisition third, what you own fourth, identity last. */}
        <Tabs.Screen name="lineup" options={{ title: 'Lineup' }} />
        <Tabs.Screen name="leaderboard" options={{ title: 'Board' }} />
        <Tabs.Screen name="cards" options={{ title: 'Cards' }} />
        <Tabs.Screen name="collection" options={{ title: 'Collection' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />

        {/* Detail routes live in the stack but never appear as tabs. */}
        <Tabs.Screen name="player/[id]" options={{ href: null }} />
      </Tabs>
    </PlayerProvider>
  );
}

const styles = StyleSheet.create({
  tabLabel: { fontSize: 11, fontWeight: '600' },
});
