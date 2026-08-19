/**
 * The app header: gem balance and account access, on every tab.
 *
 * Keeps its dark band in light mode on purpose — the chrome stays constant and
 * branded regardless of the device setting, which is how game UI usually reads.
 * The gem is a rotated square rather than an icon font so it stays crisp
 * everywhere and costs no dependency.
 */
import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TierColors } from '@/constants/theme';
import { usePlayer } from '@/context/PlayerContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Tabular figures stop the balance jittering as it changes. */
const NUMERIC = { fontVariant: ['tabular-nums' as const] };

const BAND = '#0E0F12';

/**
 * First letter of each of the first two word-ish parts. Splitting on separators
 * matters: "a_very_long_name" was rendering as "A_", which looks broken.
 */
export function initialsOf(name: string): string {
  const parts = name.split(/[\s._\-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Gem({ size = 11, color }: { size?: number; color: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        transform: [{ rotate: '45deg' }],
        borderRadius: 1.5,
      }}
    />
  );
}

export function AppHeader({ context }: { context?: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const accent = TierColors[scheme].gold.accent;
  const top = useSafeAreaInsets().top;
  const router = useRouter();
  const { gems, displayName, loading } = usePlayer();

  return (
    <View style={[styles.base, { paddingTop: top, backgroundColor: BAND }]}>
      <View pointerEvents="none" style={[styles.bloom, { backgroundColor: accent }]} />
      <View style={styles.row}>
        <View style={styles.identity}>
          <Text style={styles.wordmark}>YAP FANTASY</Text>
          {context ? (
            <Text style={styles.context} numberOfLines={1}>
              {context}
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>
          <View style={[styles.gems, { borderColor: accent }]}>
            <Gem color={accent} />
            <View>
              <Text style={styles.microLabel}>GEMS</Text>
              <Text style={[styles.balance, NUMERIC]}>
                {loading ? '—' : gems.toLocaleString()}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            hitSlop={8}
            style={({ pressed }) => [styles.avatar, { borderColor: accent }, pressed && styles.pressed]}>
            <Text style={styles.avatarText}>{initialsOf(displayName)}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { width: '100%', overflow: 'hidden' },
  bloom: {
    position: 'absolute',
    right: -30,
    top: -34,
    width: 170,
    height: 130,
    borderRadius: 90,
    opacity: 0.07,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  identity: { gap: 1, flexShrink: 1 },
  wordmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.8,
    ...Platform.select({ web: { fontFamily: 'inherit' }, default: {} }),
  },
  context: { color: 'rgba(255,255,255,0.60)', fontSize: 11, letterSpacing: 0.2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  gems: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  microLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 8, fontWeight: '700', letterSpacing: 1.1 },
  balance: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', lineHeight: 17 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  avatarText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  pressed: { opacity: 0.7 },
});
