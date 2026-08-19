import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/context/AuthContext';

SplashScreen.preventAutoHideAsync();

/**
 * The app ships one theme. See `hooks/use-color-scheme` for why.
 *
 * `DarkTheme` unconditionally rather than switched on the device setting: this
 * provider colours what react-navigation itself draws — the screen background
 * behind a transition, the card shadow, the default header — and if it followed
 * the device while every screen drew from `Colors.dark`, a light phone got a
 * white flash between screens and a white gap under the last row.
 */
export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider value={DarkTheme}>
        {/* Light glyphs, because the band behind them is always dark. */}
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="(auth)" />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}
