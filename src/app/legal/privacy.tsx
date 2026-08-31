/**
 * Public privacy policy (build plan task 27) — required before App Store
 * submission and linked from the App Privacy questionnaire.
 *
 * Deliberately outside the (app) and (auth) groups so it is reachable without a
 * session: Apple's reviewer must be able to open it from a cold browser.
 *
 * DRAFT — describes what the app actually does today. It is not legal advice
 * and should be reviewed before submission.
 */
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const UPDATED = '18 August 2026';

export default function PrivacyScreen() {
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Privacy Policy</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Last updated {UPDATED}
          </ThemedText>

          <Section title="What we collect">
            <P>
              <B>Your email address.</B> Used only to sign you in and to contact you about the
              beta. Sign-in is by emailed link or by a password you choose.
            </P>
            <P>
              <B>A display name.</B> Defaulted from your email and shown on the public
              leaderboard. You can change it.
            </P>
            <P>
              <B>Your gameplay.</B> The cards you own, the lineups you set, your coin balance and
              transaction history, and the fantasy points you score.
            </P>
          </Section>

          <Section title="What we do not collect">
            <P>
              No advertising identifiers, no third-party analytics or tracking SDKs, no location,
              no contacts, no payment information. Yap Fantasy has no in-app purchases — coins are
              earned in-game and cannot be bought.
            </P>
          </Section>

          <Section title="Who else sees it">
            <P>
              <B>Supabase</B> hosts our database and authentication and therefore stores the data
              above on our behalf.
            </P>
            <P>
              <B>balldontlie</B> supplies NFL statistics. We send them no information about you —
              requests are for player and game data only.
            </P>
            <P>
              Other players see your display name and your score on the leaderboard. Nobody can
              see your email, your collection, your lineups or your coin balance; access is
              enforced per-row in the database, not merely hidden in the app.
            </P>
            <P>We do not sell your data, and we do not share it for advertising.</P>
          </Section>

          <Section title="Deleting your data">
            <P>
              Email us and we will delete your account and everything attached to it. Deletion
              cascades: profile, cards, lineups, coin ledger and score history all go with it, and
              it cannot be undone.
            </P>
          </Section>

          <Section title="Player names and statistics">
            <P>
              Yap Fantasy shows the names and real-world statistics of professional players. It
              uses no team logos, uniforms, or player photography, and is not affiliated with,
              endorsed by, or sponsored by the NFL, its teams, or the NFL Players Association.
            </P>
          </Section>

          <Section title="Beta software">
            <P>
              This is a beta. Data may be reset while we develop, and we will tell you before that
              happens where we can.
            </P>
          </Section>

          <Section title="Contact">
            <P>Questions, deletion requests, or anything else: see the support page.</P>
          </Section>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ThemedView style={styles.section}>
      <ThemedText type="subtitle">{title}</ThemedText>
      {children}
    </ThemedView>
  );
}

const P = ({ children }: { children: React.ReactNode }) => (
  <ThemedText style={styles.para}>{children}</ThemedText>
);

const B = ({ children }: { children: React.ReactNode }) => (
  <ThemedText type="smallBold">{children}</ThemedText>
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 24, gap: 8, maxWidth: 700, width: '100%', alignSelf: 'center' },
  section: { gap: 8, marginTop: 20 },
  para: { lineHeight: 22 },
});
