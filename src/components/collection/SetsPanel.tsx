/**
 * The Sets segment.
 *
 * Sets are deferred to Week 3 and the reward mechanic is genuinely undecided,
 * so this screen is a designed "not yet" rather than a preview. Three rules
 * govern what is allowed on it:
 *
 *  1. No invented set names, gem values, rewards or completion rules. The
 *     decision has not been made; printing one here would teach players a
 *     mechanic we might not ship, and they would build a collection around it.
 *  2. No progress bars and no placeholder set cards. Both imply data exists.
 *     There is no set table in the schema — for anyone.
 *  3. It must read as deliberate. The dashed frame, the "not built yet"
 *     eyebrow and the plainly-stated open decision are what separate "we have
 *     not done this yet" from "this screen is broken".
 *
 * The only decoration is <TierMotif>, which is abstract geometry that already
 * exists in the card art slot — it cannot be mistaken for set data.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TierMotif } from '@/components/cards';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The open product question, stated as the open question it is. These are
 * candidates under discussion, deliberately listed without mechanics, numbers
 * or rewards attached — naming the decision is honest, resolving it here would
 * not be.
 */
const CANDIDATES = ['Gated lineup slots', 'Points-scaled payouts', 'Duplicate fuel'];

export function SetsPanel({ onBackToInventory }: { onBackToInventory: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
      <View style={[styles.panel, { borderColor: c.backgroundSelected }]}>
        <View style={styles.headRow}>
          <View style={styles.headText}>
            <Text style={[styles.eyebrow, { color: c.textSecondary }]}>NOT BUILT YET</Text>
            <Text style={[styles.title, { color: c.text }]}>Sets</Text>
          </View>
          {/* Abstract geometry, not a placeholder for a set. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.mark, { borderColor: c.backgroundSelected }]}>
            <TierMotif motif="stripes" color={c.backgroundSelected} />
          </View>
        </View>

        <Text style={[styles.body, { color: c.text }]}>
          A set will be a named group of cards you complete by owning all of them. That much is
          settled. What completing one actually gives you is not.
        </Text>

        <View style={[styles.divider, { backgroundColor: c.backgroundElement }]} />

        <Text style={[styles.eyebrow, { color: c.textSecondary }]}>THE OPEN DECISION</Text>
        <View style={styles.list}>
          {CANDIDATES.map((option) => (
            <View key={option} style={styles.listItem}>
              <Text style={[styles.marker, { color: c.textSecondary }]}>?</Text>
              <Text style={[styles.listText, { color: c.text }]}>{option}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          Three candidates. None of them is chosen, and they pull collecting in very different
          directions — so committing to one in the UI before we commit to it in the game would be
          a promise we might have to take back.
        </Text>

        <View style={[styles.divider, { backgroundColor: c.backgroundElement }]} />

        <Text style={[styles.body, { color: c.textSecondary }]}>
          That is why this tab is empty rather than half-built. There is no set data behind it, no
          progress being tracked and nothing locked away — not for you, not for anyone.
        </Text>

        <Text style={[styles.footnote, { color: c.textSecondary }]}>Planned for Week 3.</Text>
      </View>

      <Pressable
        onPress={onBackToInventory}
        accessibilityRole="button"
        accessibilityLabel="Back to Inventory"
        style={({ pressed }) => [
          styles.action,
          { backgroundColor: c.backgroundElement },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.actionLabel, { color: c.text }]}>Back to Inventory</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  panel: {
    // Dashed, because the frame itself should read as provisional.
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 18,
    padding: Spacing.four,
    gap: Spacing.two + 2,
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.three },
  headText: { gap: Spacing.one, flexShrink: 1 },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  title: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  body: { fontSize: 14, lineHeight: 21, fontWeight: '500' },
  divider: { height: 1, marginVertical: Spacing.one },
  list: { gap: Spacing.one + 2 },
  listItem: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  marker: { fontSize: 13, fontWeight: '800', width: 12, textAlign: 'center' },
  listText: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  footnote: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, paddingTop: Spacing.one },
  action: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  actionLabel: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
