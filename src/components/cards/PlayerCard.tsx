import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import {
  CardSizes,
  Fonts,
  Radius,
  Spacing,
  type CardSize,
  type CardTier,
} from '@/constants/theme';
import type { Database } from '@/lib/database.types';
import { PositionGlyph } from './PositionGlyph';
import { useTierTheme } from './use-tier-theme';

/**
 * Compile-time guarantee that our tier union stays in sync with the database
 * `card_tier` enum. If a tier is ever added or renamed in the schema, this
 * alias resolves to `never` and the assertion below stops the build.
 */
type DbTier = Database['public']['Enums']['card_tier'];
type TierParity = [CardTier] extends [DbTier] ? ([DbTier] extends [CardTier] ? true : never) : never;
const _tierParity: TierParity = true;
void _tierParity;

/**
 * A collectible card.
 *
 * WHAT THIS REDESIGN REMOVED, AND WHY
 *
 * The card used to signal tier on four simultaneous axes: a 1-3pt coloured
 * frame, an inset inner ring, L-shaped corner ticks, a filled tier badge with
 * rank pips, a geometric motif behind the art, and a shadow whose depth rose
 * with tier. Each was defensible alone. Together they made a 106pt grid cell
 * that was mostly CHROME — five nested boxes around three numbers — and the
 * effect was busy rather than precious. A card should feel valuable because of
 * what it says, not because of how much is drawn around it.
 *
 * So the frame is now a hairline, the rings and ticks are gone, the art slot
 * has lost its border and its motif, and the tier badge is a dot and a word.
 *
 * ONE NUMBER, NOT FOUR. Career FP is what the card IS — it is the thing that
 * accrues, the thing that drives tier, and the thing you compare two copies by.
 * It now sits alone and centred at figure size, with everything else demoted to
 * a single meta line beneath. Starts and the distance to the next tier are
 * still there; they are simply no longer competing for the same attention.
 *
 * TIER IS STILL NEVER COLOUR ALONE — the rule is unchanged, the carrier is not.
 * Pip count, pip shape, border weight and motif were four non-colour signals,
 * and stripping them for subtlety would have left hue doing the work on its
 * own. The tier NAME is now printed on every card at every size, which is a
 * stronger accessible signal than any of them: it survives greyscale, every
 * form of colour blindness, and needing to have learned what three pips mean.
 * The accent dot beside it only makes the reading faster.
 *
 * Likewise the progress track: the exact distance is always printed as text
 * next to it ("200 to SILVER"), so the bar is never the only source.
 *
 * NO PHOTO, NO LOGO, NO JERSEY: unlicensed. The art slot is kept as reserved
 * space with its aspect ratio fixed, so dropping a real <Image> in later
 * changes nothing about the surrounding layout. Until then it holds a text
 * monogram, quietly.
 *
 * This component is PURE — it never touches Supabase. Callers join
 * card_instances -> cards -> players -> teams (and tier_thresholds for
 * `nextTierAt`) and pass the flattened result in.
 */
export type PlayerCardModel = {
  playerName: string;
  positionAbbreviation: string | null; // 'QB' | 'RB' | 'WR' | 'TE' | 'PK' | ...
  teamAbbreviation: string | null; // 'PIT'
  tier: CardTier;
  careerFp: number;
  lineupStarts: number;
  nextTierAt: number | null; // null when already diamond
  /**
   * OPTIONAL. `min_career_fp` of the card's CURRENT tier, so the progress bar
   * can fill across the current band rather than from zero. Omit it and
   * progress is measured from 0, which is still correct - just coarser.
   */
  tierFloorFp?: number;
  /** OPTIONAL. Display name of the next tier, e.g. 'GOLD'. */
  nextTierLabel?: string;
};

export type PlayerCardProps = {
  model: PlayerCardModel;
  size?: CardSize;
  onPress?: () => void;
  style?: ViewStyle;
  /** Set false to let the card fill its container instead of a fixed width. */
  fixedWidth?: boolean;
};

const fmt = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Initials for the art-slot monogram. Text only - never a likeness. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '--';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Fraction through the CURRENT tier band, 0-1. Null at the top tier. */
function progressOf(model: PlayerCardModel): number | null {
  if (model.nextTierAt === null) return null;
  const floor = model.tierFloorFp ?? 0;
  const span = model.nextTierAt - floor;
  if (span <= 0) return null;
  return Math.min(1, Math.max(0, (model.careerFp - floor) / span));
}

export function PlayerCard({
  model,
  size = 'grid',
  onPress,
  style,
  fixedWidth = true,
}: PlayerCardProps) {
  const t = useTierTheme(model.tier);
  const dims = CardSizes[size];
  const compact = size === 'compact';

  const team = model.teamAbbreviation?.toUpperCase() ?? '—';
  const progress = progressOf(model);
  const toNext =
    model.nextTierAt === null ? null : Math.max(0, Math.round(model.nextTierAt - model.careerFp));

  const starts = `${fmt(model.lineupStarts)} ${model.lineupStarts === 1 ? 'start' : 'starts'}`;
  const nextLine =
    toNext === null || !model.nextTierLabel
      ? 'top tier'
      : `${fmt(toNext)} to ${model.nextTierLabel.toUpperCase()}`;

  const a11yLabel =
    `${model.playerName}, ${t.label} tier, ` +
    `${model.positionAbbreviation ?? 'unknown position'}, ` +
    `${model.teamAbbreviation ?? 'no team'}, ` +
    `${fmt(model.careerFp)} career fantasy points, ` +
    `${fmt(model.lineupStarts)} lineup starts` +
    (toNext === null ? ', top tier' : `, ${fmt(toNext)} points to ${model.nextTierLabel ?? 'the next tier'}`);

  const body = (
    <View
      style={[
        styles.card,
        {
          width: fixedWidth ? dims.width : undefined,
          alignSelf: fixedWidth ? 'flex-start' : 'stretch',
          padding: dims.padding,
          gap: dims.gap,
          borderRadius: Radius.panel,
          /* One hairline at every tier, tinted rather than weighted. The old
             card went 1pt -> 3pt across the tiers, which read as four
             different components rather than one component in four states. */
          borderColor: withAlpha(t.colors.accent, 0.35),
          backgroundColor: t.colors.surface,
        },
        style,
      ]}>
      {/* ---- header: position + club, both quiet ---- */}
      <View style={styles.headerRow}>
        <PositionGlyph
          position={model.positionAbbreviation}
          size={dims.glyph}
          color={t.colors.textMuted}
          /* Transparent, so the glyph reads as an outline rather than a filled
             chip. Its SHAPE still encodes the position group. */
          background="transparent"
          borderColor={withAlpha(t.colors.textMuted, 0.45)}
        />
        {/* NO team logo: we are not licensed for club marks, so the club is
            rendered purely as its 3-letter abbreviation in text. */}
        <Text
          numberOfLines={1}
          style={[
            styles.team,
            { color: t.colors.textMuted, fontSize: dims.labelSize + 2 },
          ]}>
          {team}
        </Text>
      </View>

      {/* ================= ART SLOT ===================================== *
        * Reserved region for licensed/commissioned art. Its box is driven  *
        * by `artAspect`, so dropping a real <Image> in here later changes  *
        * NOTHING about the surrounding layout. Borderless now: the outline *
        * was drawing a box around an absence.                              *
        * ================================================================ */}
      <View
        // Decorative placeholder: keep it out of the accessibility tree.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.artSlot,
          {
            aspectRatio: dims.artAspect,
            backgroundColor: t.colors.surfaceAlt,
            borderRadius: Radius.chip,
          },
        ]}>
        <Text
          style={[
            styles.monogram,
            { color: t.colors.textMuted, fontSize: compact ? 26 : dims.figureSize },
          ]}>
          {initialsOf(model.playerName)}
        </Text>
      </View>

      {/* ---- identity ---- */}
      <View style={styles.nameBlock}>
        <Text
          numberOfLines={dims.nameLines}
          ellipsizeMode="tail"
          style={[styles.name, { color: t.colors.text, fontSize: dims.nameSize }]}>
          {model.playerName}
        </Text>
        {/* The tier, as a word. See the note at the top: this is the
            non-colour carrier now that pips and frames are gone. */}
        <View style={styles.tierRow}>
          <View
            style={[
              styles.tierDot,
              { backgroundColor: t.colors.accent, width: dims.pip, height: dims.pip },
            ]}
          />
          <Text
            numberOfLines={1}
            style={[
              styles.tierWord,
              { color: t.colors.textMuted, fontSize: dims.labelSize, letterSpacing: 0.8 },
            ]}>
            {t.label}
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { borderColor: withAlpha(t.colors.textMuted, 0.28) }]} />

      {/* ---- the one number ---- */}
      <View style={styles.figureBlock}>
        <Text
          numberOfLines={1}
          style={[styles.figure, { color: t.colors.text, fontSize: dims.figureSize }]}>
          {fmt(model.careerFp)}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.figureLabel, { color: t.colors.textMuted, fontSize: dims.labelSize }]}>
          CAREER FP
        </Text>
      </View>

      {/* ---- everything else, demoted ---- */}
      <View style={styles.footer}>
        {/* Stacked at compact, where 106pt cannot hold both halves on one line
            and clipped them to "338 to GO…". This text is what keeps the bar
            below out of colour-alone, so it is the one thing here that may not
            truncate. */}
        <View style={compact ? styles.metaStack : styles.metaRow}>
          <Text
            numberOfLines={1}
            style={[styles.meta, { color: t.colors.textMuted, fontSize: dims.labelSize + 1 }]}>
            {starts}
          </Text>
          {compact ? null : (
            <Text
              numberOfLines={1}
              style={[styles.meta, { color: t.colors.textMuted, fontSize: dims.labelSize + 1 }]}>
              ·
            </Text>
          )}
          <Text
            numberOfLines={1}
            style={[styles.meta, { color: t.colors.textMuted, fontSize: dims.labelSize + 1 }]}>
            {nextLine}
          </Text>
        </View>
        {/* The bar is never the only source — `meta` above prints the exact
            distance in text, which is what keeps this out of colour-alone. */}
        {progress === null ? null : (
          <View style={[styles.track, { backgroundColor: withAlpha(t.colors.accent, 0.18) }]}>
            <View
              style={[
                styles.fill,
                { width: `${progress * 100}%`, backgroundColor: t.colors.accent },
              ]}
            />
          </View>
        )}
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={a11yLabel}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => [pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

/** '#RRGGBB' -> 'rgba(r, g, b, a)'. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);

  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  team: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: 1,
    flexShrink: 1,
    textAlign: 'right',
  },
  artSlot: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  monogram: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
    letterSpacing: 1,
    opacity: 0.35,
  },
  nameBlock: { gap: 3 },
  name: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
  },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },
  tierDot: { borderRadius: 999 },
  tierWord: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  figureBlock: { alignItems: 'center', gap: 0 },
  figure: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  figureLabel: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  footer: { gap: Spacing.one },
  metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one },
  metaStack: { gap: 1 },
  meta: {
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  track: { height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
});
