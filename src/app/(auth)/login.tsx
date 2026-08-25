import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { YapMark } from '@/components/brand/YapLogo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

/**
 * EMAIL AND PASSWORD, AND NOTHING ELSE.
 *
 * Magic link used to lead here and has been removed outright rather than
 * demoted. It was the better door on paper — nothing to remember, no reset flow
 * to write — and it kept failing on the one thing it depends on: a sender.
 * Until custom SMTP lands, Supabase sends from its shared address, rate limited
 * to a handful of messages an hour across the WHOLE project rather than per
 * user. The failure that produces is the bad kind. The client's request
 * succeeds, the screen says "we sent you a link", and the link never arrives —
 * so the third person to sign up in the same hour concludes the app is broken.
 * A group of friends all signing up at once is precisely that case.
 *
 * Keeping it as a secondary path was the first attempt and it was worse than
 * either extreme: a door that works for the first two people through it is a
 * trap for everyone behind them, and offering two ways in doubles what can go
 * wrong for a beta that needs neither.
 *
 * THERE IS NO PASSWORD RESET YET. That is the cost of this, and it is worth
 * being honest about in the place someone will read it: a player who forgets
 * their password currently cannot get back in without a hand-issued recovery
 * link from the Supabase dashboard. Reset is the same email dependency wearing
 * a different hat, so it lands with SMTP, not before.
 *
 * Note: email+password does NOT trigger Apple's Sign in with Apple requirement.
 * That applies only to third-party social login.
 *
 * ── TWO MODES, AND WHY SIGNING UP IS ITS OWN ONE ────────────────────────────
 *
 * `password` signs in; `signup` creates an account.
 *
 * `signup` is separate because of a third field. Creating an account used to be
 * a second button under Sign in, submitting whatever was in the same two
 * inputs — so there was nowhere to ask what the player wanted to be CALLED, and
 * the trigger fell back to deriving a name from the email local part. Everyone
 * ended up on the leaderboard as the first half of their email address, which
 * is both a name nobody chose and more of an email address than they meant to
 * publish: `profiles` is readable by every authenticated user.
 *
 * Two verbs on one form is also how people create a second account when they
 * meant to sign in — the fields are identical, so nothing catches it.
 */
type Mode = 'password' | 'signup';

const MIN_PASSWORD = 8;

/* The same 2..24 the `profiles_display_name_check` constraint enforces and the
   `handle_new_user` trigger re-checks. Stated here so the reader gets a real
   message instead of the trigger quietly falling back to their email prefix. */
const MIN_NAME = 2;
const MAX_NAME = 24;

/* THE SECOND-ACCOUNT BUG, CAUGHT AT THE ONLY POINT IT IS STILL RECOVERABLE.
 *
 * Someone who already has an account and does not remember the password has
 * nowhere to go — there is no reset until SMTP lands. What they do instead is
 * tap "Create an account", because it is the only button that does anything,
 * and the fields are identical so nothing tells them they are in the wrong
 * place. Supabase rejects the duplicate email, the raw "User already
 * registered" prints under the form, and the obvious next move is to try a
 * DIFFERENT email — which works, and silently abandons the collection on the
 * first one. That is exactly how it played out with the first real tester.
 *
 * The code is `user_already_exists` when confirmation is off. With
 * confirmation ON, Supabase deliberately returns a fake user rather than
 * admitting the address is taken, so this cannot fire — `signUpWithPassword`
 * throws its own "confirm your email" instead. Matching the message as well
 * as the code is deliberate: the code is newer than the string, and getting
 * this wrong costs someone their account.
 */
function isAlreadyRegistered(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === 'user_already_exists' || code === 'email_exists') return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' && /already registered|already exists/i.test(message);
}

export default function LoginScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { signInWithPassword, signUpWithPassword } = useAuth();

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailLooksValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const passwordLongEnough = password.length >= MIN_PASSWORD;
  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= MIN_NAME && trimmedName.length <= MAX_NAME;
  const canCreate = emailLooksValid && passwordLongEnough && nameValid && !busy;

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

  /* Not `run`, because this is the one action whose failure is not just a
     message to print: it has to move them to the other mode. Keeping it out
     of `run` leaves that helper doing the one thing it does everywhere else. */
  async function createAccount() {
    setBusy(true);
    setError(null);
    try {
      await signUpWithPassword(email, password, trimmedName);
    } catch (err) {
      if (isAlreadyRegistered(err)) {
        /* Their email stays in the field — it is the right one, and retyping
           it is friction on top of a mistake. The password does not: whatever
           they just invented is not the one on the account, and leaving it
           there would send them straight into a failed sign-in that looks
           like the app rejecting a correct password. */
        setMode('password');
        setPassword('');
        setError('That email already has an account. Sign in with it instead.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
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
          {/* Scrolls rather than centres-and-clips. `content` used to be a
              `flex: 1` column with `justifyContent: 'center'`, which centres
              beautifully until the form is taller than the window — and then
              overflows EQUALLY in both directions, putting the heading and the
              email field above the top edge where nothing can scroll to them.
              A short laptop window is enough to do it, and that is most of the
              people this is being handed to. `flexGrow` keeps the centring for
              every viewport that does have the room. */}
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled">
            <ThemedView style={styles.content}>
              {/* The mark, not the full lockup: the lockup's wordmark reads YAP,
                  and setting that directly above the words "Yap Fantasy" says the
                  same thing twice at two sizes. `ink` is the page — see YapLogo. */}
              <YapMark height={54} ink={colors.background} />

              <ThemedText type="title">Yap Fantasy</ThemedText>

              <ThemedText themeColor="textSecondary" style={styles.subtitle}>
                {mode === 'signup'
                  ? 'Pick a name, and you are in. It is what the leaderboard calls you.'
                  : 'Welcome back.'}
              </ThemedText>

              {/* FIRST FIELD, and deliberately so. It is the only one that is
                  about them rather than about the account, and asking for it
                  after a password reads as an afterthought — which is how you
                  get people skipping it and living with a name derived from
                  their email address. */}
              {mode === 'signup' ? (
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Display name"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  maxLength={MAX_NAME}
                  editable={!busy}
                  style={inputStyle}
                />
              ) : null}

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
                  {/* A DOOR TO THE SIGNUP SCREEN, NOT A SECOND SUBMIT.
                      This used to create the account from right here, using
                      whatever was in the two fields above — which is why nobody
                      ever chose a name: there was no third field and no screen
                      to put one on. Two verbs on one form is also how people
                      sign up by accident when they meant to sign in. */}
                  <SecondaryButton
                    label="Create an account"
                    disabled={busy}
                    onPress={() => { setMode('signup'); setError(null); }}
                  />
                </>
              ) : null}

              {mode === 'signup' ? (
                <>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder={`Password (${MIN_PASSWORD}+ characters)`}
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    secureTextEntry
                    editable={!busy}
                    style={inputStyle}
                  />
                  {/* Say which rule is unmet rather than dimming the button and
                      leaving them to guess. The name rule is the one worth
                      naming: 24 characters is not a limit anyone assumes. */}
                  {!nameValid && trimmedName.length > 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {`Name must be ${MIN_NAME}-${MAX_NAME} characters.`}
                    </ThemedText>
                  ) : null}
                  <PrimaryButton
                    label="Create account"
                    busy={busy}
                    disabled={!canCreate}
                    onPress={createAccount}
                  />
                  <SecondaryButton
                    label="I already have an account"
                    disabled={busy}
                    onPress={() => { setMode('password'); setError(null); }}
                  />
                </>
              ) : null}

              {error ? (
                <ThemedText type="small" style={[styles.error, { color: colors.text }]}>
                  {error}
                </ThemedText>
              ) : null}
            </ThemedView>
          </ScrollView>
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
  /* The centring lives here now, on the scroll content, so it degrades to
     "start at the top and scroll" instead of overflowing off both edges. */
  scroll: { flexGrow: 1, justifyContent: 'center' },
  content: {
    gap: 14,
    padding: 24,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  subtitle: { marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
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
