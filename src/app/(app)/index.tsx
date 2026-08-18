import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Snapshot = {
  displayName: string;
  gems: number;
  cardCount: number;
};

export default function HomeScreen() {
  const { session, signOut } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const [signingOut, setSigningOut] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    // Every one of these is RLS-scoped to the signed-in user — no user_id filter
    // is sent from the client, and adding one would not widen what comes back.
    const [profile, balance, cards] = await Promise.all([
      supabase.from('profiles').select('display_name').single(),
      supabase.from('gem_balances').select('balance').single(),
      supabase.from('card_instances').select('id', { count: 'exact', head: true }),
    ]);

    const failure = profile.error ?? balance.error ?? cards.error;
    if (failure) {
      setError(failure.message);
      return;
    }

    setSnapshot({
      displayName: profile.data?.display_name ?? 'player',
      gems: balance.data?.balance ?? 0,
      cardCount: cards.count ?? 0,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
      // The (app) layout redirects to /login as soon as the session clears.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out.');
      setSigningOut(false);
    }
  }, [signOut]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {!snapshot && !error ? (
            <ActivityIndicator />
          ) : error ? (
            <ThemedText>{error}</ThemedText>
          ) : snapshot ? (
            <>
              <ThemedText type="title">{snapshot.displayName}</ThemedText>

              <ThemedView type="backgroundElement" style={styles.statRow}>
                <Stat label="Gems" value={snapshot.gems.toLocaleString()} />
                <Stat label="Cards" value={String(snapshot.cardCount)} />
              </ThemedView>

              <ThemedView type="backgroundElement" style={styles.account}>
                <ThemedText type="small" themeColor="textSecondary">
                  Signed in as
                </ThemedText>
                <ThemedText numberOfLines={1}>{session?.user.email}</ThemedText>
                <Pressable
                  onPress={() => void handleSignOut()}
                  accessibilityRole="button"
                  disabled={signingOut}
                  style={({ pressed }) => [
                    styles.signOutButton,
                    { borderColor: colors.textSecondary },
                    signingOut && styles.dim,
                    pressed && !signingOut && styles.pressed,
                  ]}>
                  {signingOut ? (
                    <ActivityIndicator />
                  ) : (
                    <ThemedText type="link">Sign out</ThemedText>
                  )}
                </Pressable>
              </ThemedView>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="title">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: 24,
    gap: 16,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  statRow: { flexDirection: 'row', gap: 12, borderRadius: 16, padding: 12 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 20, borderRadius: 12, gap: 4 },
  account: { borderRadius: 16, padding: 16, gap: 6, marginTop: 8 },
  signOutButton: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  dim: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
