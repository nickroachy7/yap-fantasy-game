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
    /** Third rank of text: units, footnotes, the quiet half of a stat pair. */
    textTertiary: '#8B8D98',
    /** Hairline between rows in a dense table. Must not read as a box. */
    border: '#E4E4E9',
    /** Around a panel, where the edge is doing real work. */
    borderStrong: '#D0D1D9',
    /** A panel sitting on the page background. */
    surface: '#FFFFFF',
    /** A row inside a panel that needs to separate from it. */
    surfaceSunken: '#F7F7F9',
    /**
     * The body of something presented OVER the app — see the dark value, which
     * is where this token earns its keep. White here, deliberately the same as
     * `background`: in a light scheme iOS's page-sheet dim is VISIBLE (dimming
     * white gives grey), so the platform already separates the sheet from the
     * page and a second, lighter-than-white layer does not exist to reach for.
     */
    surfaceSheet: '#FFFFFF',
    positive: '#1A7F49',
    negative: '#C4283C',
    warning: '#8A6100',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    textTertiary: '#7E8289',
    border: '#26282C',
    borderStrong: '#34373C',
    /**
     * Lifted from #121316 when `surfaceSheet` arrived, because a panel has to
     * clear the sheet it sits ON as well as the page. #121316 was 18 steps
     * above the page and only 4 above the sheet, so "This copy" on the card
     * profile was a hairline border around nothing. This clears both by a
     * comparable margin, and keeps roughly the same distance to
     * `backgroundElement` above it.
     */
    surface: '#17191E',
    surfaceSunken: '#0B0C0E',
    /**
     * The body of something presented OVER the app: both profile sheets, the
     * set checklist, the lineup's swap sheet.
     *
     * IT EXISTS BECAUSE #000 OVER #000 IS NOT A SHEET. Every sheet used to fill
     * with `background`, the same token the page uses, and the only thing UIKit
     * does to separate a page sheet from what it covers is DIM the view behind
     * it — which over pure black produces pure black. So the platform's one cue
     * was invisible by construction, and a profile opening over the collection
     * read as the collection having been replaced rather than covered. On web
     * the same arithmetic killed the backdrop: `rgba(0,0,0,0.62)` over #000.
     *
     * IT IS NOT `surface`, and that is the whole reason it is a fourth step
     * rather than a reuse. `Panel` fills with `surface`, so a sheet at the same
     * value makes every panel inside it — "This copy", "Weeks started", the
     * community block — vanish into its own background. (`surface` was nudged
     * up at the same time for the same reason; see its note.) The ramp has to
     * keep stacking:
     *
     *   background #000 → surfaceSheet #0E1013 → surface #17191E → element #212225
     *
     * with `surfaceSunken` (#0B0C0E) still darker than the sheet, so a sunken
     * row inside a sheet still reads sunken.
     *
     * Do not use it for anything that is part of the page. A raised layer that
     * appears in the flow of a screen is just a lighter page, and the next
     * sheet then has nothing to be raised above.
     *
     * Nor for something floating OVER a sheet — `ConfirmDialog` and
     * `DropdownChip` stay on `surface`, which is above this, because the sell
     * confirmation opens on top of the card profile and has to read as raised
     * from it.
     */
    surfaceSheet: '#0E1013',
    positive: '#4CC38A',
    negative: '#FF6369',
    warning: '#E0C46A',
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

/**
 * Type scale, built for density.
 *
 * A fantasy app is a table of numbers with a name attached, and the reader is
 * scanning rather than reading. Bigger type here does not mean clearer — it
 * means fewer rows on screen and more scrolling to compare two players, which
 * is the actual job. So the scale starts small and every step is deliberate:
 * a row of stats at 12 with 9pt labels shows twice what 16/13 does, and reads
 * better because the eye is comparing columns rather than travelling.
 *
 * `micro` and `label` are uppercase with letter-spacing, which is what keeps
 * them legible at 9-10pt. Do not use them for sentences.
 *
 * Line heights are tight on purpose. Where prose appears — a caveat, an injury
 * note — use `body` or `bodyRelaxed`, which are set for reading.
 */
export const Type = {
  /** 9pt uppercase column headers and stat labels. Always with letterSpacing. */
  micro: { fontSize: 9, lineHeight: 12, fontWeight: '700' as const, letterSpacing: 0.8 },
  /** 10pt uppercase, for chips and badges. */
  label: { fontSize: 10, lineHeight: 13, fontWeight: '700' as const, letterSpacing: 0.6 },
  /** 11pt secondary values, footnotes, meta lines. */
  fine: { fontSize: 11, lineHeight: 15, fontWeight: '500' as const },
  /** 12pt — the default for a dense table cell. */
  body: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  /** 12pt set for reading rather than scanning. */
  bodyRelaxed: { fontSize: 12, lineHeight: 18, fontWeight: '400' as const },
  /** 13pt — a name in a list, the primary value in a row. */
  strong: { fontSize: 13, lineHeight: 17, fontWeight: '600' as const },
  /** 15pt section headings inside a page. */
  section: { fontSize: 15, lineHeight: 20, fontWeight: '700' as const },
  /** 18pt the one number a panel exists to show. */
  figure: { fontSize: 18, lineHeight: 22, fontWeight: '700' as const },
  /** 26pt page heading. */
  page: { fontSize: 26, lineHeight: 30, fontWeight: '800' as const, letterSpacing: -0.4 },
} as const;

/** Tabular figures. Columns of numbers must not jitter as values change. */
export const NUMERIC = { fontVariant: ['tabular-nums' as const] };

/**
 * Corner radii, so controls that sit next to each other agree about how round
 * they are.
 *
 * There were five values in play across the filter controls alone — 7 on a
 * chip, 8 on the directory's sort chip and its search field, 9 on a bar item,
 * 10 on a panel, 12 on the bar — which is why a row of them never looked like
 * one control. Three steps, and they nest: a chip sits inside a bar, a bar
 * sits on a panel.
 */
export const Radius = {
  /** Chips, sort keys, anything the size of a word. */
  chip: 8,
  /** Search fields, bar items, buttons. */
  control: 10,
  /** The container something else sits inside. */
  panel: 12,
} as const;

/**
 * A round control's diameter — the action bar's detached button, and the
 * inventory's filter buttons.
 *
 * 32 matches the chips' 28 plus the ring that makes it a button. It lives here
 * rather than in either file that draws one because BOTH do: `MenuButton` had
 * the only copy, and the action bar cannot import it (MenuButton imports
 * `ActionIcon` from there, so the arrow already points the other way).
 */
export const ControlDiameter = 32;

/**
 * The action bar's detached button — bigger than the round controls above,
 * deliberately.
 *
 * 44 is not a taste pick twice over. It is the platform's minimum touch target,
 * and it is ALREADY this button's real size: it was a 32pt circle with
 * `hitSlop: 6`, so it has always been 44pt to a thumb and 32pt to the eye.
 * Drawing it at 44 just stops the two disagreeing, and the hitSlop goes.
 *
 * It must not collapse back into `ControlDiameter`. That one sizes the
 * inventory's four FILTER buttons, which sit in their own row a rank below
 * this; growing those to 44 would take another 12pt off the grid on a screen
 * whose whole argument is fitting more cards on it.
 */
export const ActionDiameter = 44;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Height of the bottom tab bar's CONTENT, excluding the safe-area inset.
 *
 * This is not a measurement of react-navigation's default bar — it is a height
 * we impose on it (see `(app)/(tabs)/_layout.tsx`), which is what makes it safe for
 * screens to reserve exactly this much tail room. The number it replaced was a
 * guess per platform, `{ ios: 50, android: 80 }`, and it was wrong in three
 * ways at once: it had no web value, so on a narrow browser — where the bar is
 * very much visible — every screen padded its tail by nothing and the last row
 * sat underneath it; it ignored the safe-area inset, so on a device with a home
 * indicator it fell ~34pt short; and it was applied on wide web too, where
 * there is no bar at all.
 *
 * 54 fits a 24pt icon over a 10pt label with breathing room either side.
 * Do not read this directly for padding — use `useTabBarInset()`, which knows
 * about the safe area and about the bar not existing on wide web.
 */
export const TabBarContentHeight = 54;

/**
 * Content measures.
 *
 * One number was wrong, because these screens are not one kind of thing. 800
 * was a prose measure applied to everything, which left 405pt of dead space
 * beside the rail on a 1440pt window and made a collection unbrowsable. But
 * simply widening it to 1180 stretches a settings form and an eight-row lineup
 * across a monitor, and hands them a 1180pt-wide submit button.
 *
 * So the measure is a property of the screen:
 *   grid  — you are scanning many small things at once. Use the window.
 *   table — you are reading rows. Wide enough to hold columns, narrow enough
 *           that the eye does not have to travel from name to score.
 *   form  — you are filling something in, or reading sentences. A short line.
 *
 * Below each number the window is the measure, so all three are inert on a
 * phone. Choosing per screen is the point; do not add a fourth without one.
 */
export const ContentMeasure = {
  grid: 1180,
  table: 940,
  form: 720,
} as const;

export type Measure = keyof typeof ContentMeasure;

/** The widest measure, for code that needs the outer bound (galleries). */
export const MaxContentWidth = ContentMeasure.grid;

/** The wide-web sidebar's width, shared so layout arithmetic can subtract it. */
export const RailWidth = 236;

/* ------------------------------------------------------------------------- *
 * Sheets
 *
 * The player profile is presented over the app rather than instead of it: a
 * native sheet on a phone, a centred dialog on a wide browser window. These
 * are the numbers both presentations share, so the two cannot drift.
 * ------------------------------------------------------------------------- */

/**
 * The web sheet's corner radius.
 *
 * There were resting detents here too, for a native `formSheet`. That
 * presentation is gone: on iOS 26 a formSheet is INSET on iPhone, leaving a
 * margin down each side through which the page underneath stays visible, and a
 * sheet you can see the page around reads as a card dropped on the screen
 * rather than as the screen. The profile now uses `modal` — UIKit's page sheet,
 * full width — which has one height and no detents to configure. iOS draws its
 * own corner; this number is the web dialog's, kept so the two presentations
 * still feel like one object.
 */
export const SheetCorner = 20;

/**
 * The web dialog's cap. Narrower than `table` (940) on purpose: a profile read
 * in a dialog is a glance, and a dialog stretched to a full reading measure
 * stops reading as something laid OVER the page and starts reading as the page.
 */
export const SheetDialogWidth = 720;

/** How far the dialog stays clear of the top and bottom of the viewport. */
export const SheetDialogInset = 40;

/* ------------------------------------------------------------------------- *
 * Card tier design tokens (Yap Fantasy)
 *
 * Everything above this banner is the original Expo template surface and is
 * consumed by src/app/** and the themed-* components. It is intentionally
 * left untouched. Everything below is additive.
 *
 * Tier is EARNED by accumulating fantasy points, so tier - not team - is the
 * primary visual identity of a card.
 *
 * THE RULE, WHICH HAS NOT CHANGED: tier is never signalled by hue alone. A
 * user with full colour blindness must be able to read it, and a greyscale
 * screenshot must stay legible.
 *
 * WHAT CARRIES IT, WHICH HAS. The tokens below still describe four non-colour
 * axes - frame weight and radius, inner ring and corner ticks, rank pips by
 * COUNT (1..4) and SHAPE, and a geometric motif - and `TierBadge` and
 * `TierMotif` still use them. `TierMark` uses the accent and the initial only. `PlayerCard` no longer does. Applied all at
 * once they turned a 106pt grid cell into five nested boxes around three
 * numbers, which read as busy rather than precious. The card now prints the
 * tier NAME instead, which is a stronger accessible signal than any of them:
 * it needs no legend, survives greyscale, and cannot be confused at 4pt. The
 * accent only makes the reading faster.
 *
 * Do not reintroduce a tier cue to the card without either keeping the word or
 * replacing it with something equally readable without colour.
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

/**
 * "You are here", for a control that switches between places.
 *
 * One function rather than a colour picked per control, because the app has two
 * of these — the section bar and the segmented control — and when each chose
 * its own treatment they drifted: both marked the selection with a raised tile,
 * which is a lot of furniture to say one word, and neither could be changed
 * without the other quietly disagreeing.
 *
 * It is the app's own gold: the rail's active marker, the gem, the avatar ring.
 * A selected page is now the only warm thing in a grey bar, which reads faster
 * than a box AND survives being small, where a few points of lightness between
 * two greys does not.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. Every control using this also fills its
 * glyph on selection, so the state is legible to a reader who cannot separate
 * the two hues. Do not drop that half.
 */
export function selectionAccent(scheme: 'light' | 'dark'): string {
  return TierColors[scheme].gold.accent;
}

/** Card geometry per size variant. Art slot keeps its box when real art lands. */
/**
 * The photo region's aspect ratio (w/h), and it is SQUARE at every card size.
 *
 * One number rather than three, because a player's picture is the same object
 * on a 106pt grid cell as on a 320pt detail card and cropping it differently by
 * size would mean commissioning or licensing three crops of every portrait.
 * Square is also what the rest of the app already reserves: `PlayerAvatar` on
 * the directory row and both profile headers is a square frame, so the day real
 * imagery lands one asset fits every slot in the product.
 *
 * IT NO LONGER COSTS HEIGHT, and that is new. A square photo used to sit on
 * top of a five-line block, which made a 106pt compact cell ~166pt tall and
 * bought the picture at the price of a third fewer cards per screen. The card
 * draws its facts ON the square now (see `PlayerCard`), so the cell is the
 * square plus one footer line — ~118pt — and the picture is free.
 *
 * `silhouette` beside each size is the placeholder figure's height, at the 0.62
 * of the frame `PlayerAvatar` uses, computed against that size's NOMINAL width.
 * The compact card stretches past its nominal 106 on a wide window (up to ~153
 * at seven across), where the figure will sit a little small in its square —
 * acceptable for a placeholder, and moot the day a real image replaces it.
 */
const PHOTO_ASPECT = 1;

export const CardSizes = {
  /**
   * Three-across on a phone gives each card ~106pt. The grid size is drawn for
   * 168 and its type does not survive that reduction, so compact is its own
   * set of values rather than the same card scaled down.
   */
  compact: {
    width: 106,
    /**
     * Inset for everything overlaid on the square — the two corner blocks and
     * the nameplate all sit this far from the card's edges. It is the card's
     * only spacing value now that nothing stacks inside it.
     */
    padding: Spacing.one + 1,
    /**
     * The tier frame's thickness — the card's border is drawn in the tier's
     * `frame` colour and it is the only place tier appears on the square.
     *
     * 1.5 rather than a hairline: a hairline in a saturated colour reads as a
     * thread and disappears against a busy photograph, and this edge has to be
     * findable across a grid of nine at arm's length. It scales UP with the
     * card rather than staying fixed, because a frame that is 1.4% of a 106pt
     * card and 0.5% of a 320pt one is not the same frame.
     */
    frame: 1.5,
    artAspect: PHOTO_ASPECT,
    silhouette: 66,
    /**
     * The name, on BOTH of its lines — the card stacks the given name over the
     * surname rather than wrapping (see `splitName`), so this size has to hold
     * a surname alone rather than a whole name. That is what makes 11 viable
     * in 94pt: "McCaffrey" is ~58pt at 11pt bold where "Christian McCaffrey"
     * was ~112 and ellipsised on most of the league.
     *
     * There is no `nameLines` beside it any more. The stack is structurally
     * two lines at every size — a name is a given name and a surname — so it
     * was a field that could only ever hold one value.
     */
    nameSize: 11,
    labelSize: 7,
    /**
     * Career FP, in the card's top-right corner.
     *
     * 12 is a WEIGHT decision rather than a fit one. It sits one point above
     * the 11pt name, and the size is not what makes it the headline — weight
     * and colour are: 800 against the name's 700, full `text` against the
     * meta's tertiary grey, and tabular figures so a column of them lines up
     * down the grid.
     *
     * IT IS ALSO THE FLOOR. Anything below 12 makes the total smaller than the
     * player it belongs to, and a card whose headline number is the smallest
     * type on it has stopped having a headline. The meta is 9 and the labels
     * are 7. The ceiling is the corner: a four-digit total is ~30pt at 12, and
     * the card is 94pt wide between its insets — the tier at the other end
     * needs the rest.
     */
    figureSize: 12,
    glyph: 16,
    pip: 4,
  },
  grid: {
    width: 168,
    padding: Spacing.two,
    frame: 2,
    /** Art slot aspect ratio (w/h). Fixed so layout is stable pre/post art. */
    artAspect: PHOTO_ASPECT,
    silhouette: 104,
    nameSize: 15,
    labelSize: 9,
    figureSize: 18,
    glyph: 22,
    pip: 5,
  },
  detail: {
    width: 320,
    padding: Spacing.three,
    frame: 3,
    artAspect: PHOTO_ASPECT,
    silhouette: 198,
    nameSize: 24,
    labelSize: 11,
    figureSize: 26,
    glyph: 32,
    pip: 8,
  },
} as const;

export type CardSize = keyof typeof CardSizes;
