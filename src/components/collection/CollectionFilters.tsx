/**
 * Faceted controls for the inventory grid.
 *
 * The tier row is BOTH the summary strip and the tier filter — the counts a
 * player wants to read ("how many golds do I have?") and the control they want
 * to press are the same object, so splitting them would just duplicate the
 * numbers on screen.
 *
 * Tier is never signalled by colour alone: each chip carries a <TierBadge>,
 * which restates the tier as a word AND as rank pips that differ in count and
 * shape. Selection is likewise not colour-only — the selected chip gains a
 * heavier border.
 *
 * Everything here is drawn at the small end of the type scale on purpose. Four
 * control rows above a grid is a lot of vertical budget on a phone; at 10pt
 * with a 4pt tap-target-preserving hitSlop the whole facet block costs about
 * what two rows used to, and the cards start higher up the screen.
 */
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { TierBadge } from '@/components/cards';
import {
  Colors,
  NUMERIC,
  Spacing,
  TierOrder,
  Type,
  getTierTheme,
  type CardTier,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  PositionOrder,
  SortLabels,
  type AvailabilityFilter,
  type Position,
  type PositionFilter,
  type SortDir,
  type SortKey,
  type TierFilter,
} from './types';

function useScheme(): 'light' | 'dark' {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

function Chip({
  selected,
  label,
  count,
  children,
  onPress,
  accessibilityLabel,
}: {
  selected: boolean;
  label?: string;
  count?: number;
  children?: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const c = Colors[useScheme()];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      // The chip is 24pt tall so four facet rows fit above the fold; hitSlop
      // buys the touch target back without spending the pixels.
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={({ pressed }) => [pressed && styles.pressed]}>
      <View
        style={[
          styles.chip,
          {
            backgroundColor: selected ? c.backgroundSelected : c.backgroundElement,
            borderColor: selected ? c.text : c.border,
            borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
            // Keep the box identical either way so nothing shifts on press.
            paddingHorizontal: selected ? Spacing.two - 1 : Spacing.two,
            paddingVertical: selected ? 3.5 : 4,
          },
        ]}>
        {children}
        {label ? (
          <Text style={[Type.label, { color: selected ? c.text : c.textSecondary }]}>{label}</Text>
        ) : null}
        {count === undefined ? null : (
          <Text
            style={[
              Type.label,
              NUMERIC,
              styles.count,
              { color: selected ? c.text : c.textTertiary },
            ]}>
            {count}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A tap on a facet with the search field focused must apply the facet,
      // not just dismiss the keyboard and be swallowed.
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}>
      {children}
    </ScrollView>
  );
}

/** Rendered only above the size where scanning stops working — see Inventory. */
export function SearchField({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (next: string) => void;
  /** e.g. "142 cards". Sits inside the field's row rather than on its own line. */
  hint?: string;
}) {
  const c = Colors[useScheme()];

  return (
    <View
      style={[styles.searchWrap, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search name, team or position"
        placeholderTextColor={c.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Search your collection"
        style={[Type.body, styles.search, { color: c.text }]}
      />
      {hint ? (
        <Text style={[Type.micro, NUMERIC, { color: c.textTertiary }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function TierFilterRow({
  value,
  onChange,
  total,
  counts,
}: {
  value: TierFilter;
  onChange: (next: TierFilter) => void;
  total: number;
  counts: Record<CardTier, number>;
}) {
  const scheme = useScheme();

  return (
    <Row>
      <Chip
        selected={value === 'ALL'}
        label="ALL TIERS"
        count={total}
        onPress={() => onChange('ALL')}
        accessibilityLabel={`All tiers, ${total} cards`}
      />
      {TierOrder.map((tier) => {
        const selected = value === tier;
        const t = getTierTheme(tier, scheme);

        return (
          <Chip
            key={tier}
            selected={selected}
            count={counts[tier]}
            onPress={() => onChange(selected ? 'ALL' : tier)}
            accessibilityLabel={`${t.label} tier, ${counts[tier]} cards`}>
            {/* Decorative here: the chip's own label already says the tier. */}
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <TierBadge tier={tier} size="grid" />
            </View>
          </Chip>
        );
      })}
    </Row>
  );
}

export function PositionFilterRow({
  value,
  onChange,
  total,
  counts,
}: {
  value: PositionFilter;
  onChange: (next: PositionFilter) => void;
  total: number;
  counts: Record<Position, number>;
}) {
  return (
    <Row>
      <Chip
        selected={value === 'ALL'}
        label="ALL POS"
        count={total}
        onPress={() => onChange('ALL')}
        accessibilityLabel={`All positions, ${total} cards`}
      />
      {PositionOrder.map((pos) => {
        const selected = value === pos;

        return (
          <Chip
            key={pos}
            selected={selected}
            label={pos}
            count={counts[pos]}
            onPress={() => onChange(selected ? 'ALL' : pos)}
            accessibilityLabel={`${pos}, ${counts[pos]} cards`}
          />
        );
      })}
    </Row>
  );
}

/**
 * What the arrow means depends on the key: "descending" is meaningless as a
 * label next to a name column. Naming the actual outcome is two extra words
 * and removes the guess.
 */
function directionLabel(key: SortKey, dir: SortDir): string {
  if (key === 'name') return dir === 'asc' ? 'A–Z' : 'Z–A';
  if (key === 'recent') return dir === 'desc' ? 'NEWEST' : 'OLDEST';

  return dir === 'desc' ? 'HIGH' : 'LOW';
}

export function SortRow({
  value,
  dir,
  onChange,
  onToggleDir,
}: {
  value: SortKey;
  dir: SortDir;
  onChange: (next: SortKey) => void;
  onToggleDir: () => void;
}) {
  const c = Colors[useScheme()];

  return (
    <View style={styles.sortRow}>
      <Text style={[Type.micro, { color: c.textTertiary }]}>SORT</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.sortScroll}
        contentContainerStyle={styles.row}>
        {(Object.keys(SortLabels) as SortKey[]).map((key) => (
          <Chip
            key={key}
            selected={value === key}
            label={SortLabels[key]}
            onPress={() => onChange(key)}
            accessibilityLabel={`Sort by ${SortLabels[key]}`}
          />
        ))}
      </ScrollView>
      <Chip
        selected={false}
        label={`${dir === 'desc' ? '↓' : '↑'} ${directionLabel(value, dir)}`}
        onPress={onToggleDir}
        accessibilityLabel={`Sorted ${directionLabel(value, dir).toLowerCase()} first. Reverse the order.`}
      />
    </View>
  );
}

/**
 * The line between the facets and the grid: how much of the collection you are
 * looking at, and the one filter that is a toggle rather than a facet.
 *
 * Hiding the unavailable is offered only when there ARE unavailable cards —
 * a permanent "hide 0" is a control that can never do anything.
 */
export function ResultLine({
  shown,
  total,
  unavailable,
  availability,
  onToggleAvailability,
}: {
  shown: number;
  total: number;
  unavailable: number;
  availability: AvailabilityFilter;
  onToggleAvailability: () => void;
}) {
  const c = Colors[useScheme()];
  const hiding = availability === 'AVAILABLE';

  return (
    <View style={styles.resultLine}>
      <Text numberOfLines={1} style={[Type.fine, NUMERIC, { color: c.textSecondary }]}>
        {shown === total ? `${total} cards` : `${shown} of ${total} cards`}
      </Text>
      {unavailable > 0 || hiding ? (
        <Chip
          selected={hiding}
          label={hiding ? 'SHOWING AVAILABLE' : `HIDE ${unavailable} UNAVAILABLE`}
          onPress={onToggleAvailability}
          accessibilityLabel={
            hiding
              ? 'Unavailable cards are hidden. Show them.'
              : `Hide ${unavailable} unavailable cards`
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, paddingRight: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
    borderRadius: 7,
  },
  count: { fontWeight: '600' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two + 2,
  },
  search: { flex: 1, minWidth: 0, height: '100%' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sortScroll: { flexShrink: 1 },
  resultLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  pressed: { opacity: 0.7 },
});
