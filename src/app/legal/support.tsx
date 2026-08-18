/**
 * Public support page (build plan task 27). App Store Connect requires a
 * reachable support URL, and TestFlight testers need somewhere to report bugs.
 *
 * Outside the auth groups on purpose: someone who cannot sign in is exactly the
 * person who needs this page.
 *
 * TODO(nick): SUPPORT_EMAIL is a placeholder — set it to a real, monitored
 * address before submission. App Review does check that this resolves.
 */
import { Link } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const SUPPORT_EMAIL = 'support@yapfantasy.app';

export default function SupportScreen() {
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Support</ThemedText>

          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">Get in touch</ThemedText>
            <ThemedText style={styles.para}>{SUPPORT_EMAIL}</ThemedText>
            <ThemedText style={styles.para} themeColor="textSecondary">
              We read everything during the beta. Bugs, confusing screens, scoring that looks
              wrong — all of it is useful.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">Reporting a bug</ThemedText>
            <ThemedText style={styles.para}>
              Tell us what you did, what you expected, and what happened instead. If it involves
              scoring or a lineup, include the week and roughly when you noticed — that is enough
              for us to find it in the logs.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">Trouble signing in</ThemedText>
            <ThemedText style={styles.para}>
              Sign-in links are single use and expire. If a link says it is invalid, request a
              fresh one rather than reopening the old email. Links must be opened on the same
              device you requested them from.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">Deleting your account</ThemedText>
            <ThemedText style={styles.para}>
              Email us from the address you signed up with and we will delete your account and
              all data attached to it. This cannot be undone.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.section}>
            <Link href="/legal/privacy">
              <ThemedText type="link">Privacy policy</ThemedText>
            </Link>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 24, gap: 8, maxWidth: 700, width: '100%', alignSelf: 'center' },
  section: { gap: 8, marginTop: 20 },
  para: { lineHeight: 22 },
});
