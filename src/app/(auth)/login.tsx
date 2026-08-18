import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

/**
 * Magic link is the primary path — it is what real users get, and it keeps the
 * app free of password-reset flows. Password is a secondary path so development
 * and testing do not depend on the email sender, which is rate limited until
 * custom SMTP lands.
 *
 * Note: email+password does NOT trigger Apple's Sign in with Apple requirement.
 * That applies only to third-party social login.
 */
type Mode = 'link' | 'sent' | 'password';

const MIN_PASSWORD = 8;

export default function LoginScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { sendMagicLink, verifyCode, signInWithPassword, signUpWithPassword } = useAuth();

  const [mode, setMode] = useState<Mode>('link');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailLooksValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const passwordLongEnough = password.length >= MIN_PASSWORD;

  async function run(action: () => Promise<void>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.backgroundElement }];

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ThemedView style={styles.content}>
            <ThemedText type="title">Yap Fantasy</ThemedText>

            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              {mode === 'sent'
                ? `We sent a sign-in link to ${email.trim()}.`
                : mode === 'password'
                  ? 'Sign in with an email and password.'
                  : 'Sign in with your email. No password to remember.'}
            </ThemedText>

            {mode !== 'sent' ? (
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                inputMode="email"
                editable={!busy}
                style={inputStyle}
              />
            ) : null}

            {mode === 'link' ? (
              <>
                <PrimaryButton
                  label="Email me a link"
                  busy={busy}
                  disabled={!emailLooksValid || busy}
                  onPress={() => run(() => sendMagicLink(email), () => setMode('sent'))}
                />
                <SecondaryButton
                  label="Use a password instead"
                  disabled={busy}
                  onPress={() => { setMode('password'); setError(null); }}
                />
              </>
            ) : null}

            {mode === 'sent' ? (
              <>
                <ThemedText themeColor="textSecondary" style={styles.subtitle}>
                  Open it on this device, or enter the code from the email.
                </ThemedText>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="123456"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={10}
                  editable={!busy}
                  style={[...inputStyle, styles.codeInput]}
                />
                <PrimaryButton
                  label="Verify code"
                  busy={busy}
                  disabled={code.trim().length < 6 || busy}
                  onPress={() => run(() => verifyCode(email, code))}
                />
                <SecondaryButton
                  label="Use a different email"
                  disabled={busy}
                  onPress={() => { setMode('link'); setCode(''); setError(null); }}
                />
              </>
            ) : null}

            {mode === 'password' ? (
              <>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={`Password (${MIN_PASSWORD}+ characters)`}
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  secureTextEntry
                  editable={!busy}
                  style={inputStyle}
                />
                <PrimaryButton
                  label="Sign in"
                  busy={busy}
                  disabled={!emailLooksValid || !passwordLongEnough || busy}
                  onPress={() => run(() => signInWithPassword(email, password))}
                />
                <SecondaryButton
                  label="Create an account with this password"
                  disabled={!emailLooksValid || !passwordLongEnough || busy}
                  onPress={() => run(() => signUpWithPassword(email, password))}
                />
                <SecondaryButton
                  label="Back to magic link"
                  disabled={busy}
                  onPress={() => { setMode('link'); setPassword(''); setError(null); }}
                />
              </>
            ) : null}

            {error ? (
              <ThemedText type="small" style={[styles.error, { color: colors.text }]}>
                {error}
              </ThemedText>
            ) : null}
          </ThemedView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.secondaryButton,
        { borderColor: colors.textSecondary },
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.secondaryPressed,
      ]}>
      <ThemedText type="link" style={styles.secondaryAction}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.backgroundSelected },
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}>
      {busy ? <ActivityIndicator color={colors.text} /> : <ThemedText>{label}</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
    padding: 24,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  subtitle: { marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  codeInput: { letterSpacing: 4, textAlign: 'center', fontSize: 22 },
  button: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.8 },
  // Rendered as a bordered control, not bare text: as a plain link this was
  // easy to miss entirely, which reads as "there is no way to sign in".
  secondaryAction: { textAlign: 'center' },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryPressed: { opacity: 0.7 },
  error: { textAlign: 'center' },
});
