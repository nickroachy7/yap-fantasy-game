import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/context/AuthContext';
import { Colors, selectionAccent } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

/**
 * The app ships one theme. See `hooks/use-color-scheme` for why.
 *
 * `DarkTheme` unconditionally rather than switched on the device setting: this
 * provider colours what react-navigation itself draws — the screen background
 * behind a transition, the card shadow, the default header — and if it followed
 * the device while every screen drew from `Colors.dark`, a light phone got a
 * white flash between screens and a white gap under the last row.
 *
 * BUT ITS GROUND IS OVERRIDDEN, AND THAT IS NOT COSMETIC.
 * `DarkTheme.colors.background` is `rgb(1, 1, 1)` — a colour this app never
 * chose. It was invisible for as long as `Colors.dark.background` was #000000,
 * because the two were one point apart. The 2026-08-31 neutral pass lifted the
 * page to #080808 and left react-navigation painting SEVEN POINTS DARKER than
 * every screen drawn on top of it, which reads as a band behind the navigation
 * and a seam under the last row — the same bug the paragraph above describes,
 * pointing the other way.
 *
 * The lesson is the one that produced this comment in the first place: anything
 * react-navigation paints for itself has to be fed from `Colors`, or it silently
 * disagrees with the app the moment a token moves.
 */
const NavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    /** The ground behind a screen, a transition, and below the last row. */
    background: Colors.dark.background,
    /** Header and bar chrome. DarkTheme's own is rgb(18,18,18), also unchosen. */
    card: Colors.dark.surface,
    border: Colors.dark.border,
    text: Colors.dark.text,
    /** Tints anything react-navigation draws interactive. */
    primary: selectionAccent('dark'),
  },
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider value={NavTheme}>
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
