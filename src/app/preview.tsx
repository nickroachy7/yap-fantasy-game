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

import { PlayerCard } from '@/components/cards';
import { InventoryCard } from '@/components/collection/InventoryCard';
import { OWNED_CARDS, SAMPLE_CARDS, SAMPLE_FIXTURES } from '@/components/dev/fixtures';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/* ---- compact / inventory geometry ------------------------------------ *
 * The compact card is only ever drawn inside the inventory grid, at a width
 * the grid computes. Reproducing that arithmetic here — rather than picking a
 * width that looks right — is the whole point: 106pt is what a 375pt phone
 * actually yields, and it is the width the type has to survive.            */
const PHONE_CONTENT = 375 - Spacing.three * 2; // 343 — Screen's gutters
const WEB_CONTENT = MaxContentWidth - Spacing.three * 2; // widest the grid gets
const GAP = Spacing.two + 4;
const columnWidth = (content: number, columns: number) =>
  Math.floor((content - GAP * (columns - 1)) / columns);

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
        {OWNED_CARDS.map((card) => (
          <InventoryCard
            key={`${label}-${card.id}`}
            card={card}
            width={width}
            /* Handed in separately, exactly as the inventory screen does. */
            game={card.team ? SAMPLE_FIXTURES.get(card.team.toUpperCase()) : undefined}
          />
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
          <InventoryRow label="Compact, web" content={WEB_CONTENT} columns={7} />

          <ThemedText type="subtitle">Grid size</ThemedText>
          <View style={styles.grid}>
            {SAMPLE_CARDS.map((m) => (
              <PlayerCard key={`grid-${m.playerName}`} model={m} size="grid" />
            ))}
          </View>

          <ThemedText type="subtitle">Detail size</ThemedText>
          <View style={styles.grid}>
            {SAMPLE_CARDS.map((m) => (
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
