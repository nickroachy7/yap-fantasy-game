/**
 * Where an emailed sign-in link lands.
 *
 * NOTHING IN THE APP SENDS ONE ANY MORE. Magic link was removed from the login
 * screen — see the header there — so no code path here produces a link that
 * arrives at this route. It is kept, and kept working, for two reasons that are
 * not speculative:
 *
 *  - A RECOVERY LINK ISSUED BY HAND from the Supabase dashboard lands here, and
 *    with no password-reset flow in the app that is currently the ONLY way to
 *    get a player who has forgotten their password back into their account.
 *    Deleting this route would remove the last door.
 *  - Password reset, when SMTP lands, is the same mechanism — `type=recovery`
 *    is already handled below.
 *
 * Handles every shape the link can arrive in:
 *   - web implicit flow: tokens in the URL fragment, consumed by
 *     detectSessionInUrl before this component mounts
 *   - PKCE flow: `?code=` to exchange
 *   - token-hash flow: `?token_hash=&type=`
 *   - native: tokens in the fragment, handled by AuthContext's deep-link effect
 *
 * The link is single-use, so a refresh or a second click lands here with a spent
 * token. That is a normal thing for a user to do and gets a plain explanation
 * rather than a dead end.
 */
import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type EmailOtpType = 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email_change' | 'email';

export default function AuthCallbackScreen() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{
    code?: string;
    token_hash?: string;
    type?: string;
    error_description?: string;
  }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function complete() {
      if (params.error_description) {
        setError(String(params.error_description));
        return;
      }

      // detectSessionInUrl may already have consumed a fragment by now.
      const { data } = await supabase.auth.getSession();
      if (cancelled || data.session) return;

      if (params.code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(String(params.code));
        if (!cancelled && err) setError(err.message);
        return;
      }

      if (params.token_hash && params.type) {
        const { error: err } = await supabase.auth.verifyOtp({
          token_hash: String(params.token_hash),
          type: String(params.type) as EmailOtpType,
        });
        if (!cancelled && err) setError(err.message);
        return;
      }

      // Give the fragment handler a beat before declaring failure.
      setTimeout(async () => {
        const { data: retry } = await supabase.auth.getSession();
        if (!cancelled && !retry.session) {
          setError('This sign-in link has already been used. Request a fresh one.');
        }
      }, 1500);
    }

    void complete();
    return () => {
      cancelled = true;
    };
  }, [params.code, params.token_hash, params.type, params.error_description]);

  // This route sits outside both the (app) and (auth) groups, so nothing
  // redirects it for us — without this the user stares at a spinner forever
  // even though they are signed in.
  if (session) return <Redirect href="/" />;

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.centre}>
        {error ? (
          <>
            <ThemedText type="subtitle">Could not finish signing in</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.body}>
              {error}
            </ThemedText>
            <Link href="/login">
              <ThemedText type="link">Back to sign in</ThemedText>
            </Link>
          </>
        ) : (
          <>
            <ActivityIndicator />
            <ThemedText themeColor="textSecondary">Finishing sign-in…</ThemedText>
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  body: { textAlign: 'center' },
});
