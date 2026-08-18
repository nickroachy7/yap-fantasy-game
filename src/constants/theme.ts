/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

/**
 * Content measure.
 *
 * 800 was a prose measure applied to screens that are grids and tables. Beside
 * a 236pt rail on a 1440pt window it left 405pt of dead space — more than half
 * the width of the column it was protecting — and a five-row leaderboard read
 * as a narrow strip adrift in an empty page. Grids and tables want width; only
 * running text wants a short line.
 *
 * 1180 keeps a modest gutter at 1440 (52pt a side beside the rail) and still
 * caps the sprawl on a very wide monitor. Below it the window is the measure,
 * so this is inert on every phone.
 */
export const MaxContentWidth = 1180;

/** Prose measure, for screens that really are running text (legal pages). */
export const MaxProseWidth = 720;

/** The wide-web sidebar's width, shared so layout arithmetic can subtract it. */
export const RailWidth = 236;

/* ------------------------------------------------------------------------- *
 * Card tier design tokens (Yap Fantasy)
 *
 * Everything above this banner is the original Expo template surface and is
 * consumed by src/app/** and the themed-* components. It is intentionally
 * left untouched. Everything below is additive.
 *
 * Tier is EARNED by accumulating fantasy points, so tier - not team - is the
 * primary visual identity of a card. Each tier is separated on FOUR
 * independent axes so it never depends on hue alone:
 *
 *   1. colour      - the palette below
 *   2. frame       - border weight, corner radius, inner ring, corner ticks
 *   3. rank pips   - COUNT (1..4) and SHAPE (square/pill/circle/diamond)
 *   4. motif       - the geometric pattern drawn in the art slot
 *
 * A user with full colour blindness can still read tier from pip count,
 * pip shape, border weight and motif. A greyscale screenshot stays legible.
 * ------------------------------------------------------------------------- */

/** Mirrors the `card_tier` enum in the database. */
export const TierOrder = ['bronze', 'silver', 'gold', 'diamond'] as const;

export type CardTier = (typeof TierOrder)[number];

/** Shape used for a tier's rank pips - shape-codes tier independently of hue. */
export type PipShape = 'square' | 'pill' | 'circle' | 'diamond';

/** Geometric pattern drawn behind the (currently empty) art slot. */
export type TierMotif = 'bars' | 'stripes' | 'concentric' | 'lattice';

export type TierColorSet = {
  /** Outer frame / border colour. */
  frame: string;
  /** Primary accent - progress fill, badge background. */
  accent: string;
  /** Low-contrast accent - progress track, motif strokes. */
  accentSoft: string;
  /** Card body background. */
  surface: string;
  /** Secondary surface - art slot, stat wells. */
  surfaceAlt: string;
  /** Text drawn ON the accent colour. */
  onAccent: string;
  /** Primary body text. */
  text: string;
  /** Secondary / label text. */
  textMuted: string;
};

/**
 * Non-colour treatment per tier. These are what keep the tiers distinguishable
 * in greyscale and for colour-blind users.
 */
export type TierTreatment = {
  /** Display name, e.g. 'BRONZE'. */
  label: string;
  /** 1..4 - also the number of pips rendered. */
  rank: number;
  pip: PipShape;
  motif: TierMotif;
  borderWidth: number;
  radius: number;
  /** Gold + diamond get a second, inset outline. */
  innerRing: boolean;
  /** Gold + diamond get L-shaped ticks in each corner. */
  cornerTicks: boolean;
  /** Extra letter-spacing on the tier wordmark - rises with tier. */
  letterSpacing: number;
  /** Drives shadow radius / android elevation. */
  lift: number;
};

export const TierTreatments: Record<CardTier, TierTreatment> = {
  bronze: {
    label: 'BRONZE',
    rank: 1,
    pip: 'square',
    motif: 'bars',
    borderWidth: 1,
    radius: 10,
    innerRing: false,
    cornerTicks: false,
    letterSpacing: 0.5,
    lift: 0,
  },
  silver: {
    label: 'SILVER',
    rank: 2,
    pip: 'pill',
    motif: 'stripes',
    borderWidth: 2,
    radius: 12,
    innerRing: false,
    cornerTicks: false,
    letterSpacing: 1,
    lift: 2,
  },
  gold: {
    label: 'GOLD',
    rank: 3,
    pip: 'circle',
    motif: 'concentric',
    borderWidth: 3,
    radius: 14,
    innerRing: true,
    cornerTicks: true,
    letterSpacing: 1.5,
    lift: 5,
  },
  diamond: {
    label: 'DIAMOND',
    rank: 4,
    pip: 'diamond',
    motif: 'lattice',
    borderWidth: 3,
    radius: 18,
    innerRing: true,
    cornerTicks: true,
    letterSpacing: 2.5,
    lift: 9,
  },
};

export const TierColors: Record<'light' | 'dark', Record<CardTier, TierColorSet>> = {
  light: {
    bronze: {
      frame: '#8C5A2B',
      accent: '#A8672F',
      accentSoft: '#EADACA',
      surface: '#FCF7F2',
      surfaceAlt: '#F3E7DA',
      onAccent: '#FFFFFF',
      text: '#2A1B0E',
      textMuted: '#6B5341',
    },
    silver: {
      frame: '#69747E',
      accent: '#78848F',
      accentSoft: '#DFE5EA',
      surface: '#F9FAFB',
      surfaceAlt: '#EAEFF3',
      onAccent: '#FFFFFF',
      text: '#131A20',
      textMuted: '#59646E',
    },
    gold: {
      frame: '#96731A',
      accent: '#AE8A1E',
      accentSoft: '#F0E4BE',
      surface: '#FFFCF2',
      surfaceAlt: '#F7EFD9',
      onAccent: '#FFFFFF',
      text: '#2A2107',
      textMuted: '#6E5C1F',
    },
    diamond: {
      frame: '#1F7D95',
      accent: '#237F99',
      accentSoft: '#D2ECF4',
      surface: '#F4FCFE',
      surfaceAlt: '#E1F3FA',
      onAccent: '#FFFFFF',
      text: '#06222B',
      textMuted: '#3D6B79',
    },
  },
  dark: {
    bronze: {
      frame: '#C58448',
      accent: '#C58448',
      accentSoft: '#422D1D',
      surface: '#1A1310',
      surfaceAlt: '#241A14',
      onAccent: '#1A1310',
      text: '#F5E9DE',
      textMuted: '#BCA391',
    },
    silver: {
      frame: '#AEBAC4',
      accent: '#AEBAC4',
      accentSoft: '#2C343B',
      surface: '#101417',
      surfaceAlt: '#191F24',
      onAccent: '#10151A',
      text: '#EDF1F4',
      textMuted: '#9BA7B1',
    },
    gold: {
      frame: '#E3BE4A',
      accent: '#E3BE4A',
      accentSoft: '#3F320C',
      surface: '#17130A',
      surfaceAlt: '#211B0E',
      onAccent: '#17130A',
      text: '#F8EFD4',
      textMuted: '#C7B172',
    },
    diamond: {
      frame: '#6FE0F5',
      accent: '#6FE0F5',
      accentSoft: '#0F3742',
      surface: '#08161A',
      surfaceAlt: '#0E2027',
      onAccent: '#06181D',
      text: '#E4FAFF',
      textMuted: '#8FB8C3',
    },
  },
};

export type TierTheme = TierTreatment & { colors: TierColorSet };

export function getTierTheme(tier: CardTier, scheme: 'light' | 'dark'): TierTheme {
  return { ...TierTreatments[tier], colors: TierColors[scheme][tier] };
}

/** Card geometry per size variant. Art slot keeps its box when real art lands. */
export const CardSizes = {
  /**
   * Three-across on a phone gives each card ~106pt. The grid size is drawn for
   * 168 and its type does not survive that reduction, so compact is its own
   * set of values rather than the same card scaled down.
   */
  compact: {
    width: 106,
    padding: Spacing.one + 1,
    gap: Spacing.one,
    artAspect: 1.25,
    nameSize: 11,
    nameLines: 1,
    labelSize: 7,
    statSize: 10,
    glyph: 18,
    pip: 4,
  },
  grid: {
    width: 168,
    padding: Spacing.two,
    gap: Spacing.two,
    /** Art slot aspect ratio (w/h). Fixed so layout is stable pre/post art. */
    artAspect: 1.25,
    nameSize: 15,
    nameLines: 1,
    labelSize: 9,
    statSize: 13,
    glyph: 26,
    pip: 5,
  },
  detail: {
    width: 320,
    padding: Spacing.three,
    gap: Spacing.three,
    artAspect: 1.35,
    nameSize: 24,
    nameLines: 2,
    labelSize: 11,
    statSize: 20,
    glyph: 40,
    pip: 8,
  },
} as const;

export type CardSize = keyof typeof CardSizes;
