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
 * The status list below is the densest honest thing this screen can show: three
 * facts that are already true and already stated in prose here. It is NOT a
 * progress table — every value is an absence, and none of them will ever tick
 * up on their own.
 *
 * The only decoration is <TierMotif>, which is abstract geometry that already
 * exists in the card art slot — it cannot be mistaken for set data.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TierMotif } from '@/components/cards';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The open product question, stated as the open question it is. These are
 * candidates under discussion, deliberately listed without mechanics, numbers
 * or rewards attached — naming the decision is honest, resolving it here would
 * not be.
 */
const CANDIDATES = ['Gated lineup slots', 'Points-scaled payouts', 'Duplicate fuel'];

/** Every value is a nothing. That is the entire content of this screen. */
const STATUS: { label: string; value: string }[] = [
  { label: 'SET DEFINITIONS', value: 'None — no set table in the schema' },
  { label: 'COMPLETION REWARD', value: 'Undecided' },
  { label: 'YOUR PROGRESS', value: 'Not being tracked' },
  { label: 'PLANNED', value: 'Week 3' },
];

export function SetsPanel({ onBackToInventory }: { onBackToInventory: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
      <View style={[styles.panel, { borderColor: c.borderStrong }]}>
        <View style={styles.headRow}>
          <View style={styles.headText}>
            <Text style={[Type.micro, { color: c.textTertiary }]}>NOT BUILT YET</Text>
            {/* Not "Sets" — the page heading above already says that. */}
            <Text style={[Type.figure, { color: c.text }]}>Nothing to collect here yet</Text>
          </View>
          {/* Abstract geometry, not a placeholder for a set. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.mark, { borderColor: c.borderStrong }]}>
            <TierMotif motif="stripes" color={c.borderStrong} />
          </View>
        </View>

        <Text style={[Type.bodyRelaxed, { color: c.text }]}>
          A set will be a named group of cards you complete by owning all of them. That much is
          settled. What completing one actually gives you is not.
        </Text>

        <View style={[styles.status, { borderColor: c.border }]}>
          {STATUS.map((row, i) => (
            <View
              key={row.label}
              style={[
                styles.statusRow,
                { borderColor: c.border },
                i > 0 && styles.statusRowDivided,
              ]}>
              <Text style={[Type.micro, styles.statusLabel, { color: c.textTertiary }]}>
                {row.label}
              </Text>
              <Text style={[Type.body, styles.statusValue, { color: c.textSecondary }]}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[Type.micro, styles.gutterTop, { color: c.textTertiary }]}>
          THE OPEN DECISION
        </Text>
        <View style={styles.list}>
          {CANDIDATES.map((option) => (
            <View key={option} style={styles.listItem}>
              <Text style={[Type.label, styles.marker, { color: c.textTertiary }]}>?</Text>
              <Text style={[Type.strong, styles.listText, { color: c.text }]}>{option}</Text>
            </View>
          ))}
        </View>
        <Text style={[Type.bodyRelaxed, { color: c.textSecondary }]}>
          Three candidates. None of them is chosen, and they pull collecting in very different
          directions — so committing to one in the UI before we commit to it in the game would be a
          promise we might have to take back.
        </Text>

        <Text style={[Type.bodyRelaxed, styles.gutterTop, { color: c.textSecondary }]}>
          That is why this tab is empty rather than half-built. Nothing is locked away behind it —
          not for you, not for anyone.
        </Text>
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
        <Text style={[Type.strong, { color: c.text }]}>Back to Inventory</Text>
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
    borderRadius: 14,
    padding: Spacing.four,
    gap: Spacing.two + 2,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headText: { gap: Spacing.half, flexShrink: 1 },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  status: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    marginTop: Spacing.one,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two - 1,
  },
  statusRowDivided: { borderTopWidth: StyleSheet.hairlineWidth },
  // Fixed so the four values start on one line and the list reads as a column
  // of answers rather than four sentences.
  statusLabel: { width: 128 },
  statusValue: { flexShrink: 1 },
  gutterTop: { paddingTop: Spacing.two },
  list: { gap: Spacing.one + 1 },
  listItem: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  marker: { width: 10, textAlign: 'center' },
  listText: { flexShrink: 1 },
  action: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pressed: { opacity: 0.75 },
});
