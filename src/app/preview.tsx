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
import { InventoryCard } from '@/components/collection/InventoryCard';
import type { CollectionCard } from '@/components/collection/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

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

/* ---- compact / inventory geometry ------------------------------------ *
 * The compact card is only ever drawn inside the inventory grid, at a width
 * the grid computes. Reproducing that arithmetic here — rather than picking a
 * width that looks right — is the whole point: 106pt is what a 375pt phone
 * actually yields, and it is the width the type has to survive.            */
const PHONE_CONTENT = 375 - Spacing.three * 2; // 343 — Screen's gutters
const WEB_CONTENT = 800 - Spacing.three * 2; // 768 — capped at MaxContentWidth
const GAP = Spacing.two + 4;
const columnWidth = (content: number, columns: number) =>
  Math.floor((content - GAP * (columns - 1)) / columns);

/** Injury statuses run alongside the tiers so the flag is exercised too. */
const INJURIES: (string | null)[] = [null, 'Questionable', 'Out', null];

const OWNED: CollectionCard[] = SAMPLES.map((m, i) => ({
  id: `sample-${i}`,
  cardId: `card-${i}`,
  playerName: m.playerName,
  position: m.positionAbbreviation,
  team: m.teamAbbreviation,
  injuryStatus: INJURIES[i] ?? null,
  tier: m.tier,
  careerFp: m.careerFp,
  lineupStarts: m.lineupStarts,
  tierFloorFp: m.tierFloorFp,
  nextTierAt: m.nextTierAt,
  nextTierLabel: m.nextTierLabel,
  season: 2026,
  acquiredAt: 0,
}));

function InventoryRow({ label, content, columns }: {
  label: string;
  content: number;
  columns: number;
}) {
  const width = columnWidth(content, columns);

  return (
    <>
      <ThemedText type="subtitle">
        {label} — {columns} across at {width}pt
      </ThemedText>
      <View style={[styles.inventory, { width: content }]}>
        {OWNED.map((card) => (
          <InventoryCard key={`${label}-${card.id}`} card={card} width={width} />
        ))}
      </View>
    </>
  );
}

export default function PreviewScreen() {
  // Inert outside development: this route is emitted into the static export.
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Card gallery</ThemedText>

          <InventoryRow label="Compact, phone" content={PHONE_CONTENT} columns={3} />
          <InventoryRow label="Compact, web" content={WEB_CONTENT} columns={5} />

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
  /** Mirrors the inventory FlatList: fixed gap, wraps to a short final row. */
  inventory: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, alignItems: 'flex-start' },
});
