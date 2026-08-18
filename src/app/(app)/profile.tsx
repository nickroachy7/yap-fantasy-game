import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import { Gem } from '@/components/shell/AppHeader';
import { Screen } from '@/components/shell/Screen';
import { Colors, TierColors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { usePlayer } from '@/context/PlayerContext';
import { supabase } from '@/lib/supabase';

const NUMERIC = { fontVariant: ['tabular-nums' as const] };
const MIN_NAME = 2;
const MAX_NAME = 24;

type LedgerRow = {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
};

/** The enum values are terse; players should not have to read snake_case. */
const REASON_LABEL: Record<string, string> = {
  signup_bonus: 'Welcome bonus',
  weekly_grant: 'Weekly allowance',
  weekly_score_reward: 'Weekly score reward',
  pack_purchase: 'Pack opened',
  admin_adjust: 'Adjustment',
};

export default function ProfileScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const accent = TierColors[scheme].gold.accent;

  const { session, signOut } = useAuth();
  const { gems, displayName, cardCount, refresh } = usePlayer();

  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [lineupCount, setLineupCount] = useState(0);
  const [name, setName] = useState(displayName);
  const [savingName, setSavingName] = useState(false);
  const [nameNotice, setNameNotice] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => setName(displayName), [displayName]);

  const load = useCallback(async () => {
    setError(null);
    const [ledgerRes, lineupRes] = await Promise.all([
      supabase
        .from('gems_ledger')
        .select('id, amount, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(25),
      supabase.from('lineups').select('id', { count: 'exact', head: true }),
    ]);
    if (ledgerRes.error) return setError(ledgerRes.error.message);
    setLedger((ledgerRes.data ?? []) as LedgerRow[]);
    setLineupCount(lineupRes.count ?? 0);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  }, [load, refresh]);

  const trimmed = name.trim();
  const nameChanged = trimmed !== displayName;
  const nameValid = trimmed.length >= MIN_NAME && trimmed.length <= MAX_NAME;

  async function saveName() {
    setSavingName(true);
    setNameNotice(null);
    // The DB enforces the same length rule; this is convenience, not the check.
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('id', session!.user.id);
    if (err) {
      setNameNotice(err.message);
    } else {
      setNameNotice('Saved.');
      await refresh();
    }
    setSavingName(false);
  }

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
      // The (app) layout redirects to /login the moment the session clears.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out.');
      setSigningOut(false);
    }
  }

  return (
    <Screen title="Profile" context="Account" refreshing={refreshing} onRefresh={onRefresh}>
      {/* ---- identity ---------------------------------------------------- */}
      <View style={[styles.card, { backgroundColor: c.backgroundElement }]}>
        <Text style={[styles.label, { color: c.textSecondary }]}>DISPLAY NAME</Text>
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          Shown on the leaderboard. Everything else stays private.
        </Text>
        <View style={styles.nameRow}>
          <TextInput
            value={name}
            onChangeText={(v) => {
              setName(v);
              setNameNotice(null);
            }}
            maxLength={MAX_NAME}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!savingName}
            style={[styles.input, { color: c.text, borderColor: c.backgroundSelected }]}
          />
          <Pressable
            onPress={() => void saveName()}
            disabled={!nameChanged || !nameValid || savingName}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.saveButton,
              { borderColor: accent },
              (!nameChanged || !nameValid || savingName) && styles.dim,
              pressed && styles.pressed,
            ]}>
            {savingName ? (
              <ActivityIndicator />
            ) : (
              <Text style={[styles.saveText, { color: c.text }]}>Save</Text>
            )}
          </Pressable>
        </View>
        {nameNotice ? (
          <Text style={[styles.hint, { color: c.textSecondary }]}>{nameNotice}</Text>
        ) : null}
        <Text style={[styles.email, { color: c.textSecondary }]}>{session?.user.email}</Text>
      </View>

      {/* ---- stats ------------------------------------------------------- */}
      <View style={styles.statRow}>
        <Stat label="Gems" value={gems.toLocaleString()} c={c} accent={accent} showGem />
        <Stat label="Cards" value={String(cardCount)} c={c} accent={accent} />
        <Stat label="Lineups" value={String(lineupCount)} c={c} accent={accent} />
      </View>

      {/* ---- ledger ------------------------------------------------------ */}
      <View style={[styles.card, { backgroundColor: c.backgroundElement }]}>
        <Text style={[styles.label, { color: c.textSecondary }]}>GEM HISTORY</Text>
        {ledger === null ? (
          <ActivityIndicator style={styles.pad} />
        ) : ledger.length === 0 ? (
          <Text style={[styles.hint, { color: c.textSecondary }]}>Nothing yet.</Text>
        ) : (
          ledger.map((row) => (
            <View key={row.id} style={[styles.ledgerRow, { borderTopColor: c.backgroundSelected }]}>
              <View style={styles.ledgerLeft}>
                <Text style={[styles.ledgerReason, { color: c.text }]} numberOfLines={1}>
                  {REASON_LABEL[row.reason] ?? row.reason}
                </Text>
                <Text style={[styles.ledgerDate, { color: c.textSecondary }]}>
                  {new Date(row.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              <Text
                style={[
                  styles.ledgerAmount,
                  NUMERIC,
                  { color: row.amount < 0 ? c.textSecondary : c.text },
                ]}>
                {row.amount > 0 ? '+' : ''}
                {row.amount.toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* ---- account actions --------------------------------------------- */}
      <View style={styles.links}>
        <Link href="/legal/privacy">
          <Text style={[styles.link, { color: c.textSecondary }]}>Privacy policy</Text>
        </Link>
        <Link href="/legal/support">
          <Text style={[styles.link, { color: c.textSecondary }]}>Support</Text>
        </Link>
      </View>

      <Pressable
        onPress={() => void handleSignOut()}
        disabled={signingOut}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.signOut,
          { borderColor: c.backgroundSelected },
          signingOut && styles.dim,
          pressed && styles.pressed,
        ]}>
        {signingOut ? (
          <ActivityIndicator />
        ) : (
          <Text style={[styles.signOutText, { color: c.text }]}>Sign out</Text>
        )}
      </Pressable>

      {error ? <Text style={[styles.hint, { color: c.text }]}>{error}</Text> : null}
    </Screen>
  );
}

function Stat({
  label,
  value,
  c,
  accent,
  showGem,
}: {
  label: string;
  value: string;
  c: Record<string, string>;
  accent: string;
  showGem?: boolean;
}) {
  return (
    <View style={[styles.stat, { backgroundColor: c.backgroundElement }]}>
      <View style={styles.statValueRow}>
        {showGem ? <Gem size={9} color={accent} /> : null}
        <Text style={[styles.statValue, NUMERIC, { color: c.text }]}>{value}</Text>
      </View>
      <Text style={[styles.statLabel, { color: c.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 8 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  hint: { fontSize: 12, lineHeight: 17 },
  email: { fontSize: 12, marginTop: 4 },
  nameRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  saveButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontSize: 14, fontWeight: '600' },

  statRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center', gap: 4 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8 },

  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ledgerLeft: { flex: 1, gap: 1 },
  ledgerReason: { fontSize: 14 },
  ledgerDate: { fontSize: 11 },
  ledgerAmount: { fontSize: 15, fontWeight: '700' },

  links: { flexDirection: 'row', gap: 20, justifyContent: 'center', paddingVertical: 4 },
  link: { fontSize: 13 },
  signOut: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  signOutText: { fontSize: 15, fontWeight: '600' },
  pad: { paddingVertical: 12 },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
