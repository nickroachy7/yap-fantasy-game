import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  /** True until the persisted session has been read — gate routing on this. */
  initialising: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * On native the magic link comes back as a deep link with the tokens in the URL
 * fragment (`#access_token=...`). expo-linking's parser only reads the query
 * string, so pull the fragment apart by hand.
 */
function tokensFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  const fragment = url.split('#')[1];
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialising, setInitialising] = useState(true);
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setInitialising(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Web handles the callback itself via detectSessionInUrl; native does not.
  const incomingUrl = Linking.useURL();
  useEffect(() => {
    if (Platform.OS === 'web' || !incomingUrl) return;
    const tokens = tokensFromUrl(incomingUrl);
    if (!tokens) return;
    void supabase.auth.setSession(tokens);
  }, [incomingUrl]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
  }, []);

  /**
   * The chosen name rides along IN the signup call rather than being written
   * after it.
   *
   * `options.data` lands on the new row's `raw_user_meta_data`, which the
   * `handle_new_user` trigger reads while creating the profile — inside the
   * same transaction that creates the account. A follow-up UPDATE from here
   * would be a second round trip that a closed tab or a dropped connection can
   * lose, and what it loses is not just the name: the profile is left called
   * after the email address, on a board every other player can read.
   *
   * The trigger validates the same 2..24 rule and falls back rather than
   * raising, so a name it rejects costs the name and not the account. The
   * screen enforces it too, which is what makes that outcome unreachable.
   */
  const signUpWithPassword = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    if (error) throw error;
    // With email confirmation disabled, signUp returns a session directly. If
    // confirmation is ever switched back on it returns a user with no session,
    // which would otherwise look like a silent no-op to the caller.
    if (!data.session) {
      throw new Error('Account created — confirm your email before signing in.');
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      initialising,
      signInWithPassword,
      signUpWithPassword,
      signOut,
    }),
    [
      session,
      initialising,
      signInWithPassword,
      signUpWithPassword,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
