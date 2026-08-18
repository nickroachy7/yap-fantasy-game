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
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TierBadge } from '@/components/cards';
import { Colors, Spacing, TierOrder, getTierTheme, type CardTier } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  PositionOrder,
  SortLabels,
  type Position,
  type PositionFilter,
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
      style={({ pressed }) => [pressed && styles.pressed]}>
      <View
        style={[
          styles.chip,
          {
            backgroundColor: selected ? c.backgroundSelected : c.backgroundElement,
            borderColor: selected ? c.text : 'transparent',
            borderWidth: selected ? 2 : 1,
            // Keep the box identical either way so nothing shifts on press.
            paddingHorizontal: selected ? Spacing.two + 1 : Spacing.two + 2,
            paddingVertical: selected ? Spacing.one + 1 : Spacing.one + 2,
          },
        ]}>
        {children}
        {label ? (
          <Text style={[styles.chipLabel, { color: selected ? c.text : c.textSecondary }]}>
            {label}
          </Text>
        ) : null}
        {count === undefined ? null : (
          <Text style={[styles.chipCount, { color: selected ? c.text : c.textSecondary }]}>
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
      contentContainerStyle={styles.row}>
      {children}
    </ScrollView>
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
        label="ALL"
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

export function SortRow({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (next: SortKey) => void;
}) {
  const c = Colors[useScheme()];

  return (
    <View style={styles.sortRow}>
      <Text style={[styles.sortHead, { color: c.textSecondary }]}>SORT</Text>
      {(Object.keys(SortLabels) as SortKey[]).map((key) => (
        <Chip
          key={key}
          selected={value === key}
          label={SortLabels[key]}
          onPress={() => onChange(key)}
          accessibilityLabel={`Sort by ${SortLabels[key]}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingRight: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    borderRadius: 10,
  },
  chipLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  chipCount: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  sortHead: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  pressed: { opacity: 0.7 },
});
