/**
 * Dev-only component gallery. Deliberately OUTSIDE the (app) auth gate so the
 * card treatments can be reviewed without a session, and not linked from
 * anywhere in the product.
 *
 * Because it sits outside the auth gate it WOULD otherwise ship as a public
 * page on the deployed site — `expo export` emits every route it finds. The
 * __DEV__ guard below keeps the tool available while developing and makes it
 * inert in any production build, which is better than deleting a useful gallery.
 */
import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerCard, type PlayerCardModel } from '@/components/cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const SAMPLES: PlayerCardModel[] = [
  {
    playerName: 'Drew Allar',
    positionAbbreviation: 'QB',
    teamAbbreviation: 'TEN',
    tier: 'bronze',
    careerFp: 20.32,
    lineupStarts: 1,
    tierFloorFp: 0,
    nextTierAt: 200,
    nextTierLabel: 'SILVER',
  },
  {
    playerName: 'Amar Johnson',
    positionAbbreviation: 'RB',
    teamAbbreviation: 'KC',
    tier: 'silver',
    careerFp: 412.5,
    lineupStarts: 14,
    tierFloorFp: 200,
    nextTierAt: 750,
    nextTierLabel: 'GOLD',
  },
  {
    playerName: 'Christian McCaffrey',
    positionAbbreviation: 'WR',
    teamAbbreviation: 'SF',
    tier: 'gold',
    careerFp: 1284.75,
    lineupStarts: 41,
    tierFloorFp: 750,
    nextTierAt: 2500,
    nextTierLabel: 'DIAMOND',
  },
  {
    playerName: 'Ja"Marr Chase-Williamson',
    positionAbbreviation: 'TE',
    teamAbbreviation: 'CIN',
    tier: 'diamond',
    careerFp: 3140.2,
    lineupStarts: 96,
    tierFloorFp: 2500,
    nextTierAt: null,
  },
];

export default function PreviewScreen() {
  // Inert outside development: this route is emitted into the static export.
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Card gallery</ThemedText>

          <ThemedText type="subtitle">Grid size</ThemedText>
          <View style={styles.grid}>
            {SAMPLES.map((m) => (
              <PlayerCard key={`grid-${m.playerName}`} model={m} size="grid" />
            ))}
          </View>

          <ThemedText type="subtitle">Detail size</ThemedText>
          <View style={styles.grid}>
            {SAMPLES.map((m) => (
              <PlayerCard key={`detail-${m.playerName}`} model={m} size="detail" />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 24, gap: 20, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
});
