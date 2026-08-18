import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import {
  CardSizes,
  Fonts,
  Spacing,
  type CardSize,
  type CardTier,
  type TierTheme,
} from '@/constants/theme';
import type { Database } from '@/lib/database.types';
import { PositionGlyph } from './PositionGlyph';
import { TierBadge } from './TierBadge';
import { TierMotif } from './TierMotif';
import { TierProgress } from './TierProgress';
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
 * The presentational view-model for a card.
 *
 * This component is PURE - it never touches Supabase. Callers join
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

export function PlayerCard({
  model,
  size = 'grid',
  onPress,
  style,
  fixedWidth = true,
}: PlayerCardProps) {
  const t = useTierTheme(model.tier);
  const dims = CardSizes[size];
  const detail = size === 'detail';

  const team = model.teamAbbreviation?.toUpperCase() ?? '—';
  const a11yLabel =
    `${model.playerName}, ${t.label} tier, ` +
    `${model.positionAbbreviation ?? 'unknown position'}, ` +
    `${model.teamAbbreviation ?? 'no team'}, ` +
    `${fmt(model.careerFp)} career fantasy points, ` +
    `${fmt(model.lineupStarts)} lineup starts`;

  const body = (
    <View
      style={[
        styles.card,
        shadowFor(t),
        {
          width: fixedWidth ? dims.width : undefined,
          alignSelf: fixedWidth ? 'flex-start' : 'stretch',
          padding: dims.padding,
          gap: dims.gap,
          borderWidth: t.borderWidth,
          borderRadius: t.radius,
          borderColor: t.colors.frame,
          backgroundColor: t.colors.surface,
        },
        style,
      ]}>
      {/* Gold + diamond gain a second inset outline - a non-colour frame cue. */}
      {t.innerRing ? (
        <View
          style={[
            styles.innerRing,
            { borderColor: t.colors.accent, borderRadius: Math.max(0, t.radius - 4) },
          ]}
        />
      ) : null}

      {/* ---- header: position glyph + team abbreviation ---- */}
      <View style={styles.headerRow}>
        <PositionGlyph
          position={model.positionAbbreviation}
          size={dims.glyph}
          color={t.colors.text}
          background={t.colors.surfaceAlt}
          borderColor={t.colors.frame}
        />
        {/*
          NO team logo: we are not licensed for club marks, so the club is
          rendered purely as its 3-letter abbreviation in text.
        */}
        <Text
          numberOfLines={1}
          style={[
            styles.team,
            {
              color: t.colors.textMuted,
              fontSize: detail ? 18 : 13,
              letterSpacing: detail ? 2 : 1.2,
            },
          ]}>
          {team}
        </Text>
      </View>

      {/* ================= ART SLOT =================================== *
        * Reserved region for licensed/commissioned card art.            *
        * Its box is driven by `artAspect`, so dropping a real <Image>   *
        * in here later changes NOTHING about the surrounding layout.    *
        * Until then it holds an abstract tier motif + a text monogram - *
        * no player photo, no team logo, no jersey.                      *
        * ============================================================== */}
      <View
        // Decorative placeholder: keep it out of the accessibility tree.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.artSlot,
          {
            aspectRatio: dims.artAspect,
            backgroundColor: t.colors.surfaceAlt,
            borderColor: t.colors.accentSoft,
            borderRadius: Math.max(2, t.radius - 6),
          },
        ]}>
        <TierMotif motif={t.motif} color={t.colors.accentSoft} />
        <Text
          style={[
            styles.monogram,
            { color: t.colors.frame, fontSize: detail ? 56 : 30, letterSpacing: 2 },
          ]}>
          {initialsOf(model.playerName)}
        </Text>
        {/* Corner ticks: an extra frame treatment for the top two tiers. */}
        {t.cornerTicks ? <CornerTicks color={t.colors.frame} /> : null}
      </View>

      {/* ---- identity ---- */}
      <View style={styles.nameBlock}>
        <Text
          numberOfLines={dims.nameLines}
          ellipsizeMode="tail"
          style={[styles.name, { color: t.colors.text, fontSize: dims.nameSize }]}>
          {model.playerName}
        </Text>
        <TierBadge tier={model.tier} size={size} />
      </View>

      {/* ---- stats ---- */}
      <View style={[styles.statRow, { gap: dims.gap }]}>
        <Stat
          label="CAREER FP"
          value={fmt(model.careerFp)}
          theme={t}
          size={size}
          emphasise
        />
        <Stat label="STARTS" value={fmt(model.lineupStarts)} theme={t} size={size} />
      </View>

      {/* ---- progression ---- */}
      <TierProgress
        theme={t}
        size={size}
        careerFp={model.careerFp}
        nextTierAt={model.nextTierAt}
        floorFp={model.tierFloorFp}
        nextLabel={model.nextTierLabel}
      />
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

function Stat({
  label,
  value,
  theme,
  size,
  emphasise = false,
}: {
  label: string;
  value: string;
  theme: TierTheme;
  size: CardSize;
  emphasise?: boolean;
}) {
  const dims = CardSizes[size];

  return (
    <View style={styles.stat}>
      <Text
        numberOfLines={1}
        style={[styles.statLabel, { color: theme.colors.textMuted, fontSize: dims.labelSize }]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.statValue,
          {
            color: emphasise ? theme.colors.text : theme.colors.textMuted,
            fontSize: emphasise ? dims.statSize : dims.statSize - 2,
          },
        ]}>
        {value}
      </Text>
    </View>
  );
}

/** L-shaped ticks in each corner of the art slot (gold + diamond only). */
function CornerTicks({ color }: { color: string }) {
  return (
    <>
      <View style={[styles.tick, styles.tickTL, { borderColor: color }]} />
      <View style={[styles.tick, styles.tickTR, { borderColor: color }]} />
      <View style={[styles.tick, styles.tickBL, { borderColor: color }]} />
      <View style={[styles.tick, styles.tickBR, { borderColor: color }]} />
    </>
  );
}

/** Elevation rises with tier - another non-hue separator. */
function shadowFor(t: TierTheme): ViewStyle {
  if (t.lift === 0) return {};

  const y = Math.round(t.lift / 2);

  // `boxShadow` is the cross-platform shadow API in RN 0.86 (the older
  // `shadow*` props are deprecated on web and Android-only via `elevation`).
  return { boxShadow: `0px ${y}px ${t.lift}px ${withAlpha(t.colors.frame, 0.28)}` };
}

/** '#RRGGBB' -> 'rgba(r, g, b, a)'. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);

  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const TICK = 10;

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
  },
  innerRing: {
    position: 'absolute',
    pointerEvents: 'none',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderWidth: 1,
    opacity: 0.7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  team: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'right',
  },
  artSlot: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
  monogram: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
    opacity: 0.55,
  },
  nameBlock: {
    gap: Spacing.one + 2,
  },
  name: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  stat: {
    flexShrink: 1,
    gap: 1,
  },
  statLabel: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  statValue: {
    fontFamily: Fonts.mono,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  tick: {
    position: 'absolute',
    width: TICK,
    height: TICK,
  },
  tickTL: { top: 4, left: 4, borderTopWidth: 2, borderLeftWidth: 2 },
  tickTR: { top: 4, right: 4, borderTopWidth: 2, borderRightWidth: 2 },
  tickBL: { bottom: 4, left: 4, borderBottomWidth: 2, borderLeftWidth: 2 },
  tickBR: { bottom: 4, right: 4, borderBottomWidth: 2, borderRightWidth: 2 },
});
