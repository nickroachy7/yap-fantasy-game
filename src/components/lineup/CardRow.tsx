/**
 * One candidate line inside the swap sheet.
 *
 * It used to draw the bench as well, and that was right while the bench was a
 * separate tab and wrong once the two boards were stacked: a bench row has to
 * be readable against the starter above it, and this row is a different height,
 * density and column order from the one the slots use. `LineupRow` draws both
 * boards now — its header explains what the compact row could not do at 375pt.
 *
 * What is left is the job this shape is actually good at: a list you are
 * scanning, twenty deep, for the best of several. The column discipline comes
 * from `ui/DataTable` — right-aligned tabular numbers, an em dash for missing,
 * identity on the left — followed rather than reimplemented differently.
 * DataTable itself is not usable here: its rows are plain Views (its
 * `onRowPress` prop is declared but never wired up), and every row here has to
 * be pressable.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PositionGlyph } from '@/components/cards/PositionGlyph';
import { InjuryChip } from '@/components/cards/InjuryChip';
import { DASH } from '@/components/ui/DataTable';
import { Colors, NUMERIC, Spacing, Type, getTierTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { FormBars } from './FormBars';
import { kickoffLabel, matchupLabel, type LineupCard } from './model';

/**
 * Column widths, shared by the header and every row variant. Sized for the
 * narrowest case — a 375pt phone minus gutters — so nothing reflows between
 * platforms; the wide-web extras are additive columns, not wider ones.
 */
export const COLS = {
  lead: 30,
  tier: 2,
  glyph: 16,
  fp: 42,
  fppg: 34,
  form: 32,
  gp: 26,
  card: 42,
} as const;

const GAP = Spacing.two - 2;
const ROW_H = 44;

function numText(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? DASH : v.toFixed(digits);
}

export function CardRowHeader({ wide, leadLabel }: { wide: boolean; leadLabel: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const micro = [Type.micro, { color: c.textTertiary }];

  return (
    <View style={[styles.head, { borderColor: c.border }]}>
      <Text style={[...micro, { width: COLS.lead }]}>{leadLabel}</Text>
      <View style={{ width: COLS.tier + COLS.glyph + GAP }} />
      <Text style={[...micro, styles.identity]}>PLAYER</Text>
      {wide ? <Text style={[...micro, styles.right, { width: COLS.gp }]}>GP</Text> : null}
      <Text style={[...micro, styles.right, { width: COLS.fp }]}>FP</Text>
      <Text style={[...micro, styles.right, { width: COLS.fppg }]}>FP/G</Text>
      <Text style={[...micro, { width: COLS.form }]}>FORM</Text>
      {wide ? <Text style={[...micro, styles.right, { width: COLS.card }]}>CARD</Text> : null}
    </View>
  );
}

export type CardRowProps = {
  /** Leftmost cell: the slot this row is about. */
  lead?: ReactNode;
  card: LineupCard | null;
  /** Rendered instead of a player when the slot is empty. */
  emptyPrimary?: string;
  emptySecondary?: string;
  onPress?: () => void;
  accessibilityLabel: string;
  selected?: boolean;
  disabled?: boolean;
  wide: boolean;
};

export function CardRow({
  lead,
  card,
  emptyPrimary,
  emptySecondary,
  onPress,
  accessibilityLabel,
  selected,
  disabled,
  wide,
}: CardRowProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const tier = card ? getTierTheme(card.tier, scheme) : null;
  const bye = card != null && card.game?.opponent == null;
  const kick = card ? kickoffLabel(card.game) : null;

  const body = (
    <View
      style={[
        styles.row,
        { borderColor: c.border },
        selected ? { backgroundColor: c.surfaceSunken } : null,
        disabled ? styles.dim : null,
      ]}>
      <View style={{ width: COLS.lead }}>{lead}</View>

      {/* Tier is the card's identity and costs 2pt to say, so it says it here
          rather than spending a column on a word. */}
      <View
        style={[
          styles.tier,
          { backgroundColor: tier ? tier.colors.frame : 'transparent' },
        ]}
      />

      {card ? (
        <PositionGlyph
          position={card.position}
          size={COLS.glyph}
          color={c.textSecondary}
          background={c.backgroundElement}
          borderColor={c.border}
        />
      ) : (
        <View style={[styles.emptyGlyph, { borderColor: c.borderStrong }]} />
      )}

      <View style={styles.identity}>
        {card ? (
          <>
            <View style={styles.nameLine}>
              <Text numberOfLines={1} style={[Type.strong, styles.name, { color: c.text }]}>
                {card.name}
              </Text>
              <InjuryChip status={card.injuryStatus} />
            </View>
            <Text numberOfLines={1} style={[Type.fine, { color: bye ? c.warning : c.textTertiary }]}>
              {[card.team ?? DASH, matchupLabel(card.game), kick].filter(Boolean).join(' · ')}
            </Text>
          </>
        ) : (
          <>
            <Text numberOfLines={1} style={[Type.strong, { color: c.textSecondary }]}>
              {emptyPrimary ?? 'Empty'}
            </Text>
            {emptySecondary ? (
              <Text numberOfLines={1} style={[Type.fine, { color: c.textTertiary }]}>
                {emptySecondary}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {wide ? (
        <Text style={[Type.body, NUMERIC, styles.right, { width: COLS.gp, color: c.textSecondary }]}>
          {card?.form ? String(card.form.gamesPlayed) : DASH}
        </Text>
      ) : null}
      <Text style={[Type.strong, NUMERIC, styles.right, { width: COLS.fp, color: c.text }]}>
        {numText(card?.form?.seasonFp)}
      </Text>
      <Text style={[Type.body, NUMERIC, styles.right, { width: COLS.fppg, color: c.textSecondary }]}>
        {numText(card?.form?.fpPerGame)}
      </Text>
      <FormBars values={card?.form?.recent ?? []} width={COLS.form} />
      {wide ? (
        // The card's own earned points, which is what moves its tier. Kept
        // beside season production because they answer different questions and
        // showing only one of them is how "why is my star still bronze?" starts.
        <Text style={[Type.body, NUMERIC, styles.right, { width: COLS.card, color: c.textTertiary }]}>
          {card ? numText(card.careerFp) : DASH}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      style={({ pressed }) => (pressed ? styles.pressed : null)}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    height: 20,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    height: ROW_H,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  identity: { flex: 1, minWidth: 0, gap: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  name: { flexShrink: 1 },
  tier: { width: COLS.tier, height: 24, borderRadius: 1 },
  emptyGlyph: {
    width: COLS.glyph,
    height: COLS.glyph,
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  right: { textAlign: 'right' },
  dim: { opacity: 0.45 },
  pressed: { opacity: 0.65 },
});
