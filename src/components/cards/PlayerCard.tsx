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
import { kickoffLabel, matchupLabel, type GameContext } from '@/components/lineup/model';
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
 * ART SITS AT THE VERY TOP, FULL BLEED. It used to be the second row, under a
 * header carrying a position chip and the club abbreviation, which put a strip
 * of chrome above the one region that will eventually hold a picture. Both of
 * those facts found better homes and the header row went away entirely:
 *
 *   position  to the right of the name, where you read it in the same glance
 *             as the name it qualifies.
 *   club      folded into the fixture line, which needs it anyway — a matchup
 *             is "my club against theirs", so `PHI @ CAR` says both in the
 *             space one of them used to take.
 *
 * That trade is what pays for the fixture line: a row was removed and a row
 * was added, so the card is no taller than before while saying more.
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
  /**
   * OPTIONAL. The PLAYER's fantasy points per scored game this season.
   *
   * NOT A PROJECTION, and must never be labelled as one. balldontlie sells no
   * projections — verified 404s, recorded in docs/sleeper-spec-coverage.md —
   * and nothing in this app fabricates one. This is what he has actually
   * averaged, which answers the same question honestly. Null means he has no
   * scored games yet, which is different from averaging nothing.
   */
  fpPerGame?: number | null;
  /**
   * OPTIONAL. This club's game in the upcoming week. `null` means we know the
   * club is idle (a bye, which is worth saying); `undefined` means the caller
   * did not load a schedule at all, and the line is omitted rather than
   * claiming a bye nobody checked for.
   */
  game?: GameContext | null;
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

  /* `PHI @ CAR` — the club and the opponent in one run, which is why the club
     needs no separate home on the card. Undefined game means no schedule was
     loaded, and the line is omitted rather than asserting a bye. */
  const fixture =
    model.game === undefined ? null : `${team} ${matchupLabel(model.game)}`;
  const kickoff = model.game ? kickoffLabel(model.game) : null;

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
      {/* ================= ART SLOT ===================================== *
        * Reserved region for licensed/commissioned art, now at the very top   *
        * and full bleed — negative margins cancel the card's padding so the   *
        * image will meet the card's own edges. Its box is driven by           *
        * `artAspect`, so dropping a real <Image> in here later changes        *
        * NOTHING about the surrounding layout.                                *
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
            marginTop: -dims.padding,
            marginHorizontal: -dims.padding,
            width: undefined,
          },
        ]}>
        <Text
          style={[
            styles.monogram,
            { color: t.colors.textMuted, fontSize: compact ? 26 : dims.figureSize },
          ]}>
          {initialsOf(model.playerName)}
        </Text>

        {/* The tier rides in the art slot's top-left, where trading cards have
            always put rarity and where this card had dead space. It buys the
            figure below its full width back — at 106pt, "3,140" and "DIAMOND"
            on one row clipped the number to "3…", which is the one thing on
            the card that may not be abbreviated.

            The scrim keeps it legible once real art lands underneath. */}
        <View style={[styles.tierChip, { backgroundColor: withAlpha(t.colors.surface, 0.82) }]}>
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
              { color: t.colors.text, fontSize: dims.labelSize, letterSpacing: 0.8 },
            ]}>
            {t.label}
          </Text>
        </View>
      </View>

      {/* ---- identity: name, with the position it qualifies beside it ---- */}
      <View style={styles.identity}>
        <View style={styles.nameRow}>
          <Text
            numberOfLines={dims.nameLines}
            ellipsizeMode="tail"
            style={[styles.name, { color: t.colors.text, fontSize: dims.nameSize, flex: 1 }]}>
            {model.playerName}
          </Text>
          {/* NO team logo and no club mark: we are not licensed for either, so
              position is plain text and the club is an abbreviation below. */}
          <Text
            numberOfLines={1}
            style={[
              styles.position,
              { color: t.colors.textMuted, fontSize: dims.labelSize + 1 },
            ]}>
            {model.positionAbbreviation?.toUpperCase() ?? '—'}
          </Text>
        </View>

      </View>

      <View style={[styles.divider, { borderColor: withAlpha(t.colors.textMuted, 0.28) }]} />

      {/* ---- one pattern, three times ---------------------------------- *
        * Every row below is the same shape: what it is on the left, what it   *
        * is worth on the right. The card used to mix a centred hero figure    *
        * with left-aligned labels and a right-aligned bar, so nothing lined   *
        * up down the cell and the eye had to re-find the numbers on each      *
        * card in a grid of nine. One column rule fixes that.                  *
        * ================================================================ */}
      <View style={styles.rows}>
        {/* Fixture against expectation. */}
        {fixture ? (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text
                numberOfLines={1}
                style={[styles.rowValue, { color: t.colors.text, fontSize: dims.labelSize + 2 }]}>
                {fixture}
              </Text>
              {kickoff ? (
                <Text
                  numberOfLines={1}
                  style={[styles.rowLabel, { color: t.colors.textMuted, fontSize: dims.labelSize }]}>
                  {kickoff}
                </Text>
              ) : null}
            </View>
            {/* NOT a projection — the provider sells none and this app
                fabricates none. What he has actually averaged, labelled as
                that. See the model's `fpPerGame`. */}
            {model.fpPerGame != null ? (
              <View style={styles.rowRight}>
                <Text
                  numberOfLines={1}
                  style={[styles.rowValue, { color: t.colors.text, fontSize: dims.labelSize + 2 }]}>
                  {model.fpPerGame.toFixed(1)}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.rowLabel, { color: t.colors.textMuted, fontSize: dims.labelSize }]}>
                  FP/G
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* What the COPY has earned. Distinct from FP/G above, which is the
            player's: a card on 0 beside a 21.3 average is a good player you
            have never started, not a contradiction. */}
        <View style={styles.statRows}>
          <View style={styles.statRow}>
            <Text
              numberOfLines={1}
              style={[styles.rowLabel, { color: t.colors.textMuted, fontSize: dims.labelSize }]}>
              {compact ? 'CAREER FP' : 'CAREER POINTS'}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.figure, { color: t.colors.text, fontSize: dims.statSize }]}>
              {fmt(model.careerFp)}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text
              numberOfLines={1}
              style={[styles.rowLabel, { color: t.colors.textMuted, fontSize: dims.labelSize }]}>
              {compact ? 'STARTS' : 'GAMES STARTED'}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.figure, { color: t.colors.textMuted, fontSize: dims.statSize }]}>
              {fmt(model.lineupStarts)}
            </Text>
          </View>
        </View>

        {/* Distance to the next tier. The bar is never the only source — the
            number is printed beside it, which keeps this out of colour-alone. */}
        <View style={styles.statRow}>
          {progress === null ? (
            <View style={styles.trackSpacer} />
          ) : (
            <View style={[styles.track, { backgroundColor: withAlpha(t.colors.accent, 0.18) }]}>
              <View
                style={[
                  styles.fill,
                  { width: `${progress * 100}%`, backgroundColor: t.colors.accent },
                ]}
              />
            </View>
          )}
          <Text
            numberOfLines={1}
            style={[styles.rowLabel, { color: t.colors.textMuted, fontSize: dims.labelSize }]}>
            {nextLine.toUpperCase()}
          </Text>
        </View>
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
  identity: { gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one + 1 },
  position: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: 1,
    flexShrink: 0,
  },
  /* ONE column rule for the whole lower half: what it is on the left, what it
     is worth on the right. Mixing a centred figure with left labels and a
     right-aligned bar meant nothing lined up down a cell, and in a grid of
     nine the eye had to re-find the numbers on every card. */
  rows: { gap: Spacing.one + 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.one + 1,
  },
  rowLeft: { flexShrink: 1, minWidth: 0, gap: 1 },
  rowRight: { flexShrink: 0, alignItems: 'flex-end', gap: 1 },
  statRows: { gap: 1 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.one + 1,
  },
  /* The LABEL shrinks, never the value: a truncated "413" is a wrong number,
     where a truncated label is still a recognisable word. At 106pt the full
     "CAREER POINTS" and a four-digit total do not both fit, so compact uses
     shorter labels rather than a shorter number. */
  rowLabel: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: 0.6,
    flexShrink: 1,
    minWidth: 0,
  },
  rowValue: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  artSlot: {
    alignSelf: 'stretch',
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
  tierChip: {
    position: 'absolute',
    top: Spacing.one + 1,
    left: Spacing.one + 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.one + 1,
    paddingVertical: 2,
    borderRadius: 999,
  },
  tierDot: { borderRadius: 999 },
  tierWord: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  figure: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  /* Holds the row's height at the top tier, where there is no bar to draw and
     the card would otherwise be a few points shorter than its neighbours. */
  trackSpacer: { flex: 1, height: 3 },
  track: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
});
