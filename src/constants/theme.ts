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
    backgroundElement: '#F0F0F0',
    backgroundSelected: '#E0E0E0',
    /**
     * "This row is you", wherever a list contains the reader.
     *
     * NOT `backgroundSelected`, which is what it used to be and what the lineup
     * row still uses. Those two tints answer different questions.
     * `backgroundSelected` marks a CHOICE the reader just made — the card
     * picked in the swap sheet — so it is loud on purpose and lasts a moment.
     * This marks an IDENTITY that is true on every row of every board forever,
     * and at `backgroundSelected` a permanent band of mid-grey out-shouted the
     * seven rows around it that the reader was actually scanning.
     *
     * It is the tab bar's own grey, which is the quietest surface in the app
     * that still reads as a surface — exactly the job here. `surfaceSheet`
     * carries the same value in dark and is deliberately NOT reused: that token
     * is for things presented OVER the app and says so, and a row in the flow of
     * a page borrowing it would be the drift its note warns about. Same value,
     * different reason, so it can move without dragging every sheet with it.
     *
     * Light mode cannot copy the bar, which is white on white there and leans on
     * its seam instead. A row has no seam, so this is the lightest grey that
     * still separates from the page.
     */
    backgroundMine: '#F0F0F0',
    textSecondary: '#616161',
    /** Third rank of text: units, footnotes, the quiet half of a stat pair. */
    textTertiary: '#8B8B8B',
    /** Hairline between rows in a dense table. Must not read as a box. */
    border: '#E4E4E4',
    /** Around a panel, where the edge is doing real work. */
    borderStrong: '#D0D0D0',
    /** A panel sitting on the page background. */
    surface: '#FFFFFF',
    /** A row inside a panel that needs to separate from it. */
    surfaceSunken: '#F7F7F7',
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
    /**
     * A WEEK WITH A BALL IN THE AIR. The app's fourth semantic hue, and the
     * only one that is not an outcome.
     *
     * IT IS NOT GOLD, AND THAT IS THE WHOLE REASON IT EXISTS. `selectionAccent`
     * already means two things within a hundred points of the contest card —
     * "this is the one you are looking at" on a focused heart, and "press me"
     * on the Contests button directly under the carousel. A gold LIVE would be
     * a third meaning for one hue on one screen, and the eye cannot rank three.
     *
     * It is not red either, which is the broadcast convention and would collide
     * head-on with `negative` meaning you lost.
     *
     * Green and red are settled states; blue is the state that has not settled.
     */
    live: '#1F6FBF',
    warning: '#8A6100',
  },
  dark: {
    text: '#ffffff',
    background: '#080808',
    backgroundElement: '#212121',
    backgroundSelected: '#2E2E2E',
    /** See the light value. The tab bar's grey — the quietest real surface. */
    backgroundMine: '#101010',
    textSecondary: '#B4B4B4',
    textTertiary: '#808080',
    border: '#272727',
    borderStrong: '#363636',
    /**
     * A panel has to clear the sheet it sits ON as well as the page, which is
     * why this sits where it does: 15 steps above the page and 7 above the
     * sheet. An earlier #121316 was 18 above the page and only 4 above the
     * sheet, and "This copy" on the card profile was a hairline border around
     * nothing.
     */
    surface: '#171717',
    /**
     * PURE BLACK LIVES HERE NOW, not on `background`, and that is the whole
     * point of the 2026-08-31 neutral pass.
     *
     * When #000 was the page there was no such thing as sunken: this token was
     * #0B0C0E and sat ABOVE the surface it was supposed to sink into, because
     * nothing can be darker than black. Every "sunken" row in the app was a
     * lighter row wearing the name. Moving black down one slot costs the page
     * 8 points it does not miss and buys the ramp a real floor.
     *
     * It still clears the invariant its old note claimed and could not keep:
     * darker than `surfaceSheet`, so a sunken row inside a sheet reads sunken.
     */
    surfaceSunken: '#000000',
    /**
     * The body of something presented OVER the app: both profile sheets, the
     * set checklist, the lineup's swap sheet.
     *
     * IT EXISTS BECAUSE A DIM OVER A NEAR-BLACK PAGE IS NOT A SHEET. Every
     * sheet used to fill with `background`, the same token the page uses, and
     * the only thing UIKit does to separate a page sheet from what it covers is
     * DIM the view behind it — which over a page this dark produces something
     * indistinguishable from it. So the platform's one cue was invisible by
     * construction, and a profile opening over the collection read as the
     * collection having been replaced rather than covered. On web the same
     * arithmetic killed the backdrop: `rgba(0,0,0,0.62)` over #080808.
     *
     * Lifting the page off #000 does not retire this token. It buys 8 points,
     * and a sheet needs to clear the page by enough that the eye reads a layer.
     *
     * IT IS NOT `surface`, and that is the whole reason it is a fourth step
     * rather than a reuse. `Panel` fills with `surface`, so a sheet at the same
     * value makes every panel inside it — "This copy", "Weeks started", the
     * community block — vanish into its own background. (`surface` was nudged
     * up at the same time for the same reason; see its note.) The ramp has to
     * keep stacking:
     *
     *   sunken #000000 → background #080808 → surfaceSheet #101010
     *     → surface #171717 → element #212121
     *
     * with `surfaceSunken` (#000000) darker than the sheet AND darker than the
     * page, so a sunken row reads sunken wherever it appears.
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
    surfaceSheet: '#101010',
    positive: '#4CC38A',
    negative: '#FF6369',
    /** See the light value. */
    live: '#5AA9F0',
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
 * The floating tab pill: how tall it is, and how far it sits off the edges.
 *
 * ---------------------------------------------------------------------------
 * IT USED TO BE ATTACHED, AND THAT INVERTED THE TAIL-ROOM RULE
 * ---------------------------------------------------------------------------
 *
 * The bar was a full-width band fixed to the bottom of the screen, drawn as a
 * SIBLING of the scene in `BottomTabView`'s column. That had one very useful
 * consequence, and this constant's note used to be written entirely about it:
 * a scrolling page already ended exactly where the bar began, so no list
 * anywhere in the app reserved a tail for it. An earlier `useTabBarInset()`
 * that did put ~88pt of dead black under every list, twice over.
 *
 * A DETACHED PILL CANNOT WORK THAT WAY. The whole point of the glass is that
 * content passes UNDER it — a pill with the page ending above it has nothing
 * to refract and may as well be a solid capsule. So the bar is positioned
 * absolutely now, the scene runs the full height of the screen, and every list
 * does have to reserve room. `useTabBarSpace` is the one place that number is
 * computed, and it returns 0 off the tab navigator so a pushed screen with no
 * bar under it does not pad for one.
 *
 * That is a real cost and it is the reason the old note was so emphatic. The
 * difference is that it is now TRUE: there is a bar floating over the content,
 * and a list that ignores it hides its last row behind glass.
 *
 * 56 fits a 24pt icon over a 10pt label.
 *
 * ---------------------------------------------------------------------------
 * ONE INSET, EQUAL ON ALL THREE SIDES, MEASURED FROM THE SCREEN'S EDGE
 * ---------------------------------------------------------------------------
 *
 * The first version had 12 either side and `insets.bottom + 12` beneath, which
 * is 46 on a notched phone — so the capsule floated visibly higher off the
 * bottom than it did off the sides and read as an object that had drifted
 * upward rather than one placed. A floating thing wants the same air all round;
 * the moment the three margins differ, the eye reads the largest one as a
 * mistake.
 *
 * SO THE SAFE-AREA INSET IS NOT ADDED. That is the part which looks wrong
 * rather than the number: `insets.bottom` is 34, and it is Apple's conservative
 * reserve, not the size of the home indicator. The indicator itself is a ~5pt
 * bar sitting about 8pt off the bottom, so it occupies roughly the lowest 11pt
 * of the screen. At 20 the capsule clears it by about nine points and the
 * indicator sits in the margin, which is where Apple's own floating bars put
 * it.
 *
 * 20 rather than `Spacing.three`: 16 leaves five points between the capsule and
 * the indicator, which is close enough to read as a collision on a device even
 * though it is not one.
 */
export const TabPillHeight = 56;
export const TabPillInset = 20;

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
 *
 * IT IS A PROPERTY OF THE SCREEN EXCEPT WHERE SCREENS SHARE A PAGE. On wide
 * web the Collection's two views are tabs of one board, and they were asking
 * for `grid` and `table` — so the page jumped ~240pt wider when you pressed
 * Inventory, which reads as the layout breaking rather than as two screens
 * with different needs. A folded board names ONE measure for all its views;
 * see `WebNavSpec.measure`. The inventory is therefore a `table`-width grid on
 * a desktop, which is a real cost (a column or so) knowingly paid for a page
 * that does not resize under the reader.
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

/**
 * The fill of the wide-web CHROME — the rail down the left and the score band
 * across the top.
 *
 * It lived as a private `BAND` constant inside `Sidebar` while the rail was the
 * only chrome there was. It is shared now because the two pieces have to be the
 * SAME value or they stop reading as one frame around the page: a header a
 * shade off the rail it meets at the corner draws a seam diagonally across the
 * top-left of the window, which is the one place a seam has nothing to divide.
 *
 * Fixed rather than themed, like the rail always was. The app is dark-only
 * today (see `use-color-scheme`); when that changes this becomes a pair.
 *
 * It sits between `background` (#080808) and `surfaceSheet` (#101010) on
 * purpose — near enough the sheet value that chrome and sheets feel related,
 * far enough off the page that what it frames is plainly the deeper thing.
 *
 * NEUTRALISED WITH THE REST OF THE RAMP. It was #0E0F12, which carried the same
 * blue the greys did and, once the page lifted to #080808, had also drifted
 * onto `surfaceSheet` rather than between it and the page. Both halves of its
 * own rule were broken; this restores them.
 */
export const ChromeBand = '#0C0C0C';


/* ------------------------------------------------------------------------- *
 * Brand
 * ------------------------------------------------------------------------- */

/**
 * The Yap mark's two tones, carried over from the site this app replaces.
 *
 * FIXED, NOT THEMED, and deliberately outside `Colors`. A logo is one artwork
 * with one palette — the same lime on a phone, on the web rail and on a
 * favicon fetched as its own document with no page to inherit from. Putting it
 * in `Colors` would invite it to follow the scheme, and a mark that changes
 * colour with the chrome is no longer a mark.
 *
 * `ink` is NOT a background. It is the colour of the shapes punched back
 * through the lime — the bot's face slots, the counters in the A and the P —
 * and it has to match whatever surface the logo is drawn on or those cutouts
 * read as a dark rectangle sitting behind the letters. Every caller passes the
 * ground it is actually drawing on; this value is only the fallback for
 * surfaces that happen to be `ChromeBand`-ish, and for the standalone raster
 * assets, which have no surface to ask.
 *
 * `lime` is close to but NOT `TierColors.dark.gold.accent` (#E3BE4A). They are
 * allowed to coexist because they never mean the same thing: gold prices
 * things in coins inside the content, lime only ever says Yap in the chrome.
 */
export const Brand = {
  lime: '#C7F53D',
  ink: '#101010',
} as const;


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
 * IT IS KELLY GREEN, AND IT IS ITS OWN SWATCH. It used to return
 * `TierColors[scheme].gold.accent` outright, which meant "this is selected" and
 * "this is a gold-tier card" and "this is currency" were one value that could
 * not move independently. Gems, coins and the gold tier keep the gold. Only
 * SELECTION is green, and it now has somewhere to live that is not a tier.
 *
 * A selected page is the only saturated thing in a neutral bar, which reads
 * faster than a box AND survives being small, where a few points of lightness
 * between two greys does not. The 2026-08-31 neutral ground is what makes this
 * work: with no chroma anywhere in the chrome, one hue carries the whole job.
 *
 * KNOWN TENSION, RECORDED ON PURPOSE. Green is now spoken three times: this,
 * `positive` (#4CC38A, "you won"), and the RB position badge (also #4CC38A).
 * The three are separated by about 25 degrees of hue and a visible step in
 * saturation, and they are never adjacent doing different jobs on the same
 * row — but this is the exact trap the `live` note warns about, and if a
 * screen ever puts a green selection next to a green gain, one of them moves.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. Every control using this also fills its
 * glyph on selection, so the state is legible to a reader who cannot separate
 * the two hues. Do not drop that half.
 */
export const SelectionColors = {
  light: { accent: '#15702F', onAccent: '#FFFFFF' },
  dark: { accent: '#3CCB4B', onAccent: '#04210A' },
} as const;

export function selectionAccent(scheme: 'light' | 'dark'): string {
  return SelectionColors[scheme].accent;
}

/**
 * The ink that goes ON `selectionAccent`.
 *
 * Callers used to reach for `TierColors[scheme].gold.onAccent` and lean on the
 * two being the same swatch by construction. They are not any more, so read the
 * pair from here or a selected chip ships dark-brown text on green.
 */
export function selectionInk(scheme: 'light' | 'dark'): string {
  return SelectionColors[scheme].onAccent;
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
