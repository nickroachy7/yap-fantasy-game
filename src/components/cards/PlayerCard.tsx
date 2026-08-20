import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import {
  CardSizes,
  Colors,
  Fonts,
  getTierTheme,
  NUMERIC,
  Radius,
  Spacing,
  TierOrder,
  type CardSize,
  type CardTier,
} from '@/constants/theme';
import { positionColors } from '@/constants/positions';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { injuryCode, injuryWeight } from '@/lib/injury';
import type { Database } from '@/lib/database.types';
import { tierProgressLabel } from '@/components/lineup/model';
import { PlayerSilhouette } from './PlayerAvatar';
import { TierMark } from './TierMark';
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
 * A collectible card: ONE SQUARE, with everything drawn on it.
 *
 * WHAT CHANGED, AND THE ONE IDEA BEHIND IT
 *
 * The card used to be a picture with a form underneath it. The square art sat
 * at the top and below it came five stacked lines — name, then position and
 * club, then a progress phrase, then a `TFP` label beside a figure — each one
 * left-aligned in its own row. That block was as tall as the picture it
 * belonged to, so a "card" was half photograph and half spreadsheet, and the
 * photograph is the part that makes it feel like a thing you own.
 *
 * So the card IS the picture now. Nothing sits under the art inside the frame;
 * the facts are laid ON it, in the places a trading card has always put them,
 * and the frame's aspect ratio is 1:1 exactly as `artAspect` already said it
 * was. A compact cell went from ~166pt tall to ~118, which is a third more
 * cards in a screen without a single fact leaving.
 *
 * WHERE EACH FACT WENT, AND WHY THERE
 *
 *   the frame     TIER, as the colour of the card's border. See below.
 *   top-left      POSITION, in its position accent, with the injury
 *                 designation beside it.
 *   top-right     THE CLUB, opposite it.
 *   bottom        NAME, centred, over a STAT BLOCK running to both plate
 *                 edges: what the card is, what this copy has earned, and what
 *                 it still owes for the next tier.
 *
 * NOTHING IS DRAWN OUTSIDE THE FRAME. That is the change this layout exists
 * for and everything below follows from it — see the last section.
 *
 * THE TIER IS THE FRAME. It spent two passes as a letter in the top-left, and
 * a letter is the wrong instrument for it in a grid: tier is the fact you scan
 * nine cells for and it was the smallest mark on any of them. An edge is read
 * without being looked at, which is what rarity wants and what printed cards
 * have always done with it.
 *
 * THAT IS ONLY SAFE BECAUSE THE LETTER SURVIVED, now at the head of the stat
 * line. The rule `theme.ts` sets and `TierMark` keeps is that tier is never
 * colour alone — bronze and gold are a brown and a yellow, the first pair to
 * collapse in greyscale or under a red-green deficiency. The frame is the fast
 * channel; the letter is the one that actually carries the meaning. The border
 * width rises with the card size (`CardSizes.frame`) so the edge reads the same
 * at 106pt and at 320.
 *
 * THE POSITION TOOK THE CORNER THE TIER GAVE UP, and it is the third place it
 * has been. Beside the surname it competed with the biggest word on the card
 * for the same 94pt — "Chase-Williamson TE" has nowhere to go. On its own line
 * above the name it cost the plate a whole line of picture. In the top-left it
 * costs neither: that corner has to be reserved for a scrim regardless, and
 * two letters is all it ever needs.
 *
 * THE NAME IS ONE LINE, AND IT ELLIPSISES. The plate has ~93pt at compact and
 * a name is set at 11pt bold, which fits most of the league — "Dean Patterson"
 * is 86, "Davante Adams" 87 — and does not fit the long ones: "Christian
 * McCaffrey" is 112 and "Ja'Marr Chase-Williamson" 147. The alternative, and
 * this is what it replaced, is splitting at the first space and always drawing
 * two lines; that fits everyone but spends a third line of the square and puts
 * a surname on the card at the same weight as a given name. One line is the
 * trade: a shorter plate, more picture, and a tail on four names in a hundred.
 *
 * THE TOTAL SITS UNDER THE NAME rather than in a corner, because it is the one
 * number the card exists to show and a corner is where you put something you
 * want out of the way. It was diagonally opposite the tier for two passes, and
 * the two-line stat stack it needed up there is exactly why the top of the
 * card carried a scrim heavy enough to read as a dark band.
 *
 * THE STAT LINE IS TWO LABELLED FIGURES, at opposite ends of the plate:
 *
 *     B 1,285            1,216
 *       TFP           TO DIAMOND
 *     ▓▓▓  ▓▓▓  ▓░░  ░░░
 *
 * What this copy has earned, and what it still owes for the next tier. Each
 * with its own name under it, which is the whole of what the previous version
 * was missing.
 *
 * THE GAP, NOT THE THRESHOLD. `1,216 to Diamond` is a thing you can act on. An
 * earlier version printed `1,285/2,500`, which is a coordinate you have to
 * subtract before it means anything — and that subtraction is most of why it
 * read as arithmetic rather than as information.
 *
 * IT TOOK THREE ARRANGEMENTS TO FIT BOTH LABELS, and the failures are worth
 * recording because each looked fine until it was measured against a compact
 * card's 93pt of plate.
 *
 *   ONE LINE, everything on it. `1,285 TFP` beside `1,216 TO DIAMOND` measures
 *   ~99pt. Over.
 *
 *   ONE LINE, LABELS DROPPED, which is what shipped for a revision: `B 1,285
 *   1,216 D`. It fit, and it was a puzzle — four tokens with nothing saying
 *   which number was which. Two figures on a card with no names on them is not
 *   a saving.
 *
 *   TWO COLUMNS, figure over label. Still over, and for a reason that is easy
 *   to miss: a column is as wide as its widest member, so the left one measured
 *   46.8pt — the width of `B 1,285`, not of `TFP` — and left 43.2 of the plate
 *   for the right. "TO DIAMOND" needs 54.5. Nothing done to the mark or the
 *   tracking closed an 11pt gap, and every shorter label that did fit ("TO
 *   NEXT", "NEEDED", "TO GO") bought the fit by dropping the one word the
 *   reader wants.
 *
 * TWO INDEPENDENT ROWS is what works. The figures are one row and the labels
 * another, each spread to the plate edges and each measured on its own: 78pt
 * of figures and 74 of labels, both inside 93. A label is no longer boxed by
 * the figure above it, so the long one has the whole row to spend. The pairing
 * is carried by the EDGE — each item sits on the same side as its figure —
 * rather than by a shared column, which is a weaker association on paper and an
 * indistinguishable one on the card.
 *
 * It is also the shape the rest of the app already uses for a labelled figure —
 * `StatStrip`, `DataTable`, `Type.micro` ("9pt uppercase column headers and
 * stat labels") — rather than a form invented here.
 *
 * IT COSTS THE PICTURE, NOT THE GRID. The card is square by `artAspect`, so a
 * taller nameplate takes its 9pt from the silhouette above it and a row of
 * cells is exactly as tall as it was. On a card with no licensed art to crop
 * into, that is the cheapest 9pt on the square.
 *
 * THE TARGET IS NAMED IN FULL — "TO DIAMOND", not "D". The letter was doing two
 * jobs at once in the version this replaces, sitting where a label belongs and
 * being a colour-coded mark, and it managed neither: `1,216 D` reads as a
 * quantity of something called D. The full name costs 54.5pt, which is why the
 * rows above had to stop being columns before it could be afforded.
 *
 * THE LADDER UNDER IT IS THE WHOLE CLIMB, NOT ONE SPAN OF IT.
 *
 * Four rungs, one per tier, in tier order. The ones below you are full, the one
 * you are on is filled by how far through it you are, the ones above are empty
 * tracks.
 *
 * ONLY WHAT IS EARNED IS TINTED. A filled rung takes its own tier's `accent`;
 * every track is the app's own neutral. The first version tinted the tracks too
 * — each rung in its tier's `accentSoft` — and it put a four-hue strip along the
 * bottom of every card in the grid whether that card had earned anything or
 * not: bronze, silver, gold and diamond all announcing themselves on a card
 * that had reached none of them. Fourteen cells of that is a rainbow, and the
 * colour was decoration rather than information. Neutral tracks make the tint
 * mean one thing — this much is yours.
 *
 * THIS IS THE THIRD SHAPE THIS FACT HAS TAKEN, and the two it replaced were
 * each wrong in a way the next one fixed.
 *
 * It was a NUMBER first — `B 0/200 S`, the tier you are, the fraction, the tier
 * you are earning. On paper the same three facts; in a 93pt line, a formula.
 * Four tokens, three type sizes, four colours, and nothing in the shape of it
 * saying "progress". A fraction is for reading and the question a grid asks is
 * "which of these is close", which a bar answers without being read. It also
 * demoted the headline: as a numerator the career total stopped being the one
 * number the card exists to show, and its width swung from `20/200` to
 * `1,285/2,500` down a column.
 *
 * Then it was ONE CONTINUOUS BAR toward the next tier, and that fixed the
 * reading but left the bar saying almost nothing on its own. On a new card —
 * bronze, no points — the letter said "bottom tier", the figure said "nothing
 * yet", and the empty bar said "nothing yet" a third time. Three marks, one
 * fact. And the span it measured was anonymous: full-width meant "silver" on
 * one card and "diamond" on the next, so two bars at the same fill were not
 * comparable and nothing on the card said so.
 *
 * The ladder is worth its ink because it is informative even when the card is
 * not. A zero-point bronze card still says: there are four tiers, you are on
 * the first, you have barely begun it — which is context a reader cannot get
 * from any other mark on the square. And two cards ARE now comparable at a
 * glance, because both are drawn against the same four rungs.
 *
 * THE CURRENT RUNG FILLS FROM ITS OWN FLOOR, which is what `tierFloorFp` is for
 * and the reason it has been on the model unused. A gold card at 1,285 is 30%
 * through gold — 750 to 2,500 — not 51% of some climb from zero. Measuring from
 * zero is what the single bar did, and it is why a gold card's bar looked
 * fuller than a silver card's that was nearly promoted.
 *
 * `tierProgressLabel` still speaks the from-zero span to a screen reader
 * ("1284/2500 to Diamond Tier"). The two are different true statements about
 * the same climb rather than a contradiction — one is where you are on the
 * ladder, the other is how much total you need — but if either ever changes,
 * check the other.
 *
 * POSITION CARRIES IT AS WELL AS COLOUR. Which rung is lit is a fact about
 * ORDER, legible with every hue removed, so the ladder does not lean on the
 * tier palette the way a single coloured bar did. The card's own tier is still
 * the frame AND the letter besides.
 *
 * DIAMOND FILLS ALL FOUR. There is nothing above it and a full ladder is the
 * truthful picture of that.
 *
 * THE EXACT FIGURES ARE NOT LOST, they moved to where precision is worth its
 * width: `CardStanding` on the card's own profile prints the span in full, and
 * the lineup row's third line still carries `tierProgressLabel` as prose.
 *
 * THE CLUB IS BACK ON THE CARD, in the corner opposite the position.
 *
 * It was dropped from the square once, and the reason given was that three
 * letters which repeat down a grid — half a collection is the same dozen clubs
 * — answer nothing you came to the screen to ask. That was an argument for not
 * giving the club a LINE of its own, which is what it had; it is not an
 * argument against a corner that was being reserved and left empty. A scrim has
 * to cover the top strip whatever sits there, and the right half of that strip
 * was paying for itself with nothing in it.
 *
 * THE FIXTURE IS NOT UP THERE WITH IT. A pass drew the whole thing — `CAR @
 * JAX`, club and opponent — and it fit, but it was answering a different
 * question from every other fact on the square. The card says what this thing
 * IS: a name, a position, a club, a tier, a total. Who they happen to play on
 * Sunday is a fact about a week, it goes stale by Monday, and at 8pt in a
 * corner it was the longest string on the card carrying the least durable
 * thing on it.
 *
 * The collection stopped reading the schedule when this went. The directory,
 * Leaders and search still do, through the same session-cached
 * `useUpcomingFixtures` — those screens are about who to play, and a fixture
 * belongs on them.
 *
 * THERE IS NO LONGER ANYTHING UNDER THE FRAME, and that is the point of this
 * pass. The card used to hang two lines below itself — the tier progress and
 * the fixture — and they were the reason a "cell" was never the same object as
 * a "card". A grid of them read as nine squares with captions rather than nine
 * cards, the captions sat on the page background where nothing else on the
 * screen did, and the block cost ~26pt per cell: a fifth of the row's height,
 * spent on two facts that had somewhere to be.
 *
 * The argument for putting them out there was that both have a clock on them —
 * progress moves every Sunday a card is started, the fixture is stale by Monday
 * — and that the square should hold only what is durable. That boundary was
 * real and it is worth naming what replaced it: the tier progress turned out
 * not to be a separate fact at all (see the stat line above), and the fixture
 * is one short token in a corner rather than a caption competing with the card
 * for the cell. Neither needed a line of its own; both needed a place.
 *
 * `footer` survives as a prop for callers with different facts to tell — the
 * set checklist is the one — but nothing is drawn there by default, and a card
 * that is passed no footer is exactly as tall as it is wide plus its frame.
 *
 * THE SCRIMS EXIST FOR A PHOTOGRAPH WE DO NOT HAVE YET.
 *
 * There is no licensed player imagery — no photo, no logo, no jersey — so the
 * square holds the same `PlayerSilhouette` the directory row and both profile
 * headers hold, standing where a head and shoulders land in a real headshot
 * crop. Over a flat grey placeholder the overlaid text would be legible with
 * no help at all. It is drawn over a ramped scrim anyway, because the day an
 * <Image> lands behind it the type has to survive whatever is in the picture,
 * and discovering that on the day is how a card ships with an unreadable name.
 *
 * The scrim is the SCHEME'S BACKGROUND at rising alpha, not black. A black
 * scrim with white type is what a trading card normally does, and it would
 * have forced every accent on the card into a second, dark-only set: the light
 * palette's position accents (`#14568F`) and tier accents are picked to carry
 * white text, so they are illegible ON darkness. Fading to white in light mode
 * and to black in dark mode keeps `positionColors` and `TierMark` doing
 * exactly what they do everywhere else in the app, which is the whole reason a
 * WR is one colour on every screen. It is built from stacked bands rather than
 * a gradient because this project has no gradient dependency and eight bands
 * on an eased ramp is indistinguishable from one at these sizes.
 *
 * WHAT IS STILL DELIBERATELY ABSENT. Starts, which is the denominator of the
 * total and interesting exactly once — `CardStanding` prints "FP earned over
 * 14 starts" on the profile, where there is room to say it in words. And the
 * tier TINT: the tier colours the EDGE and nothing else. The card used to draw
 * its surface, its art band and its border from the tier palette, so a bronze
 * card was a brown object and a diamond one was a teal object; four
 * differently coloured objects in a three-across grid is a lot of noise for
 * one fact. The square is the app's own `backgroundElement`, as every other
 * panel is.
 *
 * IT IS NOT ONLY THE COLLECTION'S CARD. The set checklist draws the same
 * object for every card in a set, including the ones you do not own, and that
 * is what the three widenings in the model are for: a null `tier` (no copy in
 * hand, so the frame falls back to the app's border grey and the tier letter
 * goes), a null `careerFp` (no career to report), and `statLabel`, because
 * that screen puts the player's SEASON points on the face instead. The two
 * lines under the frame are replaceable wholesale via `footer` — they are both
 * facts about a copy you hold, and a checklist has different ones to tell.
 *
 * What is NOT parameterised is the layout: the corners, the plate, the scrims
 * and the footer's reserved height are the card's own, so two screens drawing
 * it cannot drift into two different objects.
 *
 * This component is PURE — it never touches Supabase. Callers join
 * card_instances -> cards -> players -> teams (and tier_thresholds for
 * `nextTierAt`) and pass the flattened result in.
 */
export type PlayerCardModel = {
  playerName: string;
  positionAbbreviation: string | null; // 'QB' | 'RB' | 'WR' | 'TE' | 'PK' | ...
  teamAbbreviation: string | null; // 'PIT'
  /**
   * OPTIONAL. The feed's designation — 'Questionable', 'Out', 'IR'.
   *
   * Drawn beside the position as a one-or-two character code. Undefined or null
   * is "nothing reported", which is the common case and draws nothing.
   */
  injuryStatus?: string | null;
  /**
   * The tier of the copy in hand — NULL when there is no copy.
   *
   * Null is a real state rather than a missing value, and the set checklist is
   * what it exists for: that screen draws every card in a set, including the
   * ones you do not own. A null tier draws the frame in the app's own border
   * grey and leaves the tier letter off the footer, which is what an empty
   * slot in a sticker album looks like. Nothing else may pass it — a card in
   * your collection always has a tier.
   */
  tier: CardTier | null;
  /**
   * The figure on the card's face. NULL prints an em dash.
   *
   * Named for the collection's use of it, which is career FP, but it is
   * whatever `statLabel` says it is — the set checklist puts the player's
   * season points here because a card you do not own has no career of its own.
   * Null is "no scored games yet", which is not the same as zero and must not
   * be drawn as one.
   */
  careerFp: number | null;
  /** What the figure IS. Defaults to the collection's 'TFP'. */
  statLabel?: string;
  nextTierAt: number | null; // null when already diamond
  /**
   * OPTIONAL. `min_career_fp` of the card's CURRENT tier. Retained because
   * callers already have it and `tierProgressLabel` may want it back, though
   * the printed phrase measures from zero — see the note there.
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
  /**
   * A block UNDER the frame. Nothing is drawn there unless a caller asks for
   * it — the card's own facts are all on the square now.
   *
   * This used to hold a default: the tier progress and the next fixture, on
   * two lines, on the page background. Both moved onto the card and the
   * default went with them, so an ordinary cell is now a square and nothing
   * else. The prop stays because the set checklist has genuinely different
   * facts to tell under a card it may not own.
   *
   * The card owns the block's centring and reserves ONE line for whatever it
   * is given, so a caller drawing one line per cell gets an even grid for
   * free. Anything taller is the caller's to keep uniform.
   */
  footer?: ReactNode;
  /**
   * Overrides the frame colour, for a screen whose frame means something other
   * than tier.
   *
   * The set checklist is the one caller: a slot already filled is drawn in the
   * positive tone because "this one is in" is what its frame is saying, and it
   * has no tier to say instead — `set_checklist` reports the tier of a SPARE
   * copy you hold, which for a filled slot is a card the set cannot take.
   * Pair it with a null `tier` so nothing else on the card claims otherwise.
   */
  frameColor?: string;
  /**
   * Overrides the label the card composes from its own model. Callers that
   * wrap the card in a different meaning — a checklist row that burns it —
   * should say what pressing it does, and there must only ever be one label
   * on a cell.
   */
  accessibilityLabel?: string;
};

const fmt = (n: number | null) =>
  n === null
    ? '—'
    : Math.round(n)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * A CSS gradient, addressed to whichever prop the platform calls it.
 *
 * React Native 0.86 takes one under `experimental_backgroundImage` and
 * react-native-web takes the same string under `backgroundImage`, so the value
 * is written once and only the key differs. Neither is in the other's style
 * type, which is what the cast is for.
 *
 * THIS REPLACED A STACK OF FLAT BANDS, and the bands are worth describing
 * because the idea was reasonable and the result was not. With no gradient
 * dependency in the project, the fade was drawn as N solid views of rising
 * alpha. To hide the seams the alpha step has to be below roughly 0.02, which
 * over a compact card's ~35pt ramp means forty-odd views — per scrim, per
 * card, in a grid that draws dozens. Trading that away for five or six bands
 * put a 0.17 step between them, and 0.17 of black over a flat placeholder is
 * not a subtle seam: it drew visible stripes across every card.
 *
 * A real gradient is one view and one interpolation done by the compositor.
 */
const gradient = (css: string): ViewStyle =>
  (Platform.OS === 'web'
    ? { backgroundImage: css }
    : { experimental_backgroundImage: css }) as ViewStyle;

/**
 * A one-sided scrim: flat at `max` through the region the type occupies, then
 * eased away to nothing over `ramp`.
 *
 * `edge` is the side it is anchored to and the side it is opaque at, so a
 * bottom scrim is solid along the card's bottom edge and vanishes upward.
 *
 * THE FLAT PART IS WHAT MAKES IT WORK. A pure fade reaches full strength only
 * at the card's very edge, which is BELOW the type it is protecting: the name
 * sits two thirds of the way up its own strip, where a linear fade has spent
 * about a third of its alpha. Behind a placeholder that reads fine and behind
 * a photograph it does not. So the text sits on a flat band and the fade
 * exists only to reach it without an edge.
 *
 * The two middle stops are what keep the fade from looking like a ruler laid
 * over the picture: alpha falls off fast just above the flat band and then
 * crawls, which is roughly how a shadow behaves and nothing like a straight
 * interpolation looks.
 */
function Scrim({
  edge,
  base,
  ramp,
  rgb,
  max,
}: {
  edge: 'top' | 'bottom';
  /** Height of the flat band at full `max`. Cover the type with this. */
  base: number;
  /** Height of the fade that carries `max` down to nothing. */
  ramp: number;
  rgb: string;
  max: number;
}) {
  const total = base + ramp;
  const at = (px: number) => `${((px / total) * 100).toFixed(1)}%`;
  /* Fully transparent is written as the scrim's OWN colour at zero alpha, not
     as `transparent`: the keyword is transparent BLACK, so a white scrim would
     grey off through the middle of its fade. */
  const step = (alpha: number, px: number) => `rgba(${rgb}, ${alpha.toFixed(3)}) ${at(px)}`;

  const css =
    `linear-gradient(${edge === 'bottom' ? 'to top' : 'to bottom'}, ` +
    [
      step(max, 0),
      step(max, base),
      step(max * 0.45, base + ramp * 0.35),
      step(max * 0.14, base + ramp * 0.68),
      step(0, total),
    ].join(', ') +
    ')';

  return (
    <View
      style={[
        styles.scrim,
        { height: total },
        edge === 'top' ? { top: 0 } : { bottom: 0 },
        gradient(css),
      ]}
    />
  );
}

export function PlayerCard({
  model,
  size = 'grid',
  onPress,
  style,
  fixedWidth = true,
  footer,
  frameColor,
  accessibilityLabel: label,
}: PlayerCardProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  /* Resolved unconditionally because hooks must be, but only READ when there
     is a tier — a null one is a card you do not hold and takes the app's own
     border grey. */
  const t = useTierTheme(model.tier ?? 'bronze');
  const dims = CardSizes[size];
  const compact = size === 'compact';

  /* The one accent on the square is the POSITION's — the same colour the
     lineup row and the directory row put on it, so a WR is one colour
     everywhere in the app. */
  const accent = positionColors(model.positionAbbreviation, scheme).accent;

  const team = model.teamAbbreviation?.toUpperCase() ?? null;
  const weight = injuryWeight(model.injuryStatus);
  /* Prose, and for the screen reader only — "0/200 to Silver Tier" is what a
     reader hears where a sighted one sees `B 1284/2500 S`. The printed line is
     composed below from the same three values. */
  const progress =
    model.careerFp === null
      ? null
      : tierProgressLabel({ ...model, careerFp: model.careerFp }, { short: compact });

  /**
   * The four rungs, bottom tier first: how full each one is, and the colours it
   * is drawn in.
   *
   * Below the card's tier -> 1. Above it -> 0. ON it -> how far through that
   * tier's own band the total has come.
   *
   * THE CURRENT RUNG MEASURES FROM ITS FLOOR, not from zero. `tierFloorFp` is
   * the bottom of the band and `nextTierAt` the top, so a gold card at 1,285
   * fills 30% of the gold rung (750 -> 2,500) rather than 51% of a climb from
   * nothing. The single bar this replaced measured from zero, which made a
   * fresh gold card look further along than a silver one about to be promoted.
   *
   * "MAXED" IS A QUESTION ABOUT THE TIER, NOT ABOUT THE THRESHOLD, and getting
   * that wrong is what the set checklist caught. An earlier version filled the
   * bar whenever `nextTierAt` was null, reading "nothing above diamond" into
   * it. But a null threshold is also what a caller passes when it has no ladder
   * to hand: `SetChecklist` sends `nextTierAt: null` for every member, so every
   * addable card drew itself complete — a bronze card reporting four full
   * rungs. Diamond is the only tier that fills its own; an unsupplied threshold
   * leaves the current rung empty, which still says "bronze" by position.
   *
   * `getTierTheme` rather than the `useTierTheme` hook, because this is four
   * lookups and hooks cannot be mapped over a list. It is the same pure
   * function the hook wraps.
   */
  const rungs = TierOrder.map((rung) => {
    const held = model.tier;
    const here = held === null ? -1 : TierOrder.indexOf(held);
    const i = TierOrder.indexOf(rung);

    let fill = 0;
    if (here >= 0 && i < here) fill = 1;
    else if (here >= 0 && i === here) {
      if (held === 'diamond') fill = 1;
      else if (model.careerFp !== null && model.nextTierAt !== null) {
        const floor = model.tierFloorFp ?? 0;
        const band = model.nextTierAt - floor;
        fill = band <= 0 ? 1 : Math.max(0, Math.min(1, (model.careerFp - floor) / band));
      }
    }

    return { rung, fill, accent: getTierTheme(rung, scheme).colors.accent };
  });

  /* Line heights are pinned here rather than left to the platform because the
     scrim behind the plate and the silhouette's stand-off both need the
     plate's height BEFORE the text has measured itself. Pinning them makes
     `plateH` exact instead of an estimate with a fudge factor in it. */
  const lineH = Math.round(dims.nameSize * 1.12);
  const totalH = Math.round(dims.figureSize * 1.25);

  /* The position label. Set from the LABEL size, one step below the meta type
     it used to be, because the tracking below is what carries it at that size
     and a corner token does not need body weight. */
  const browSize = dims.labelSize + 1;
  const browH = Math.round(browSize * 1.3);

  /* The name under each figure. `Type.micro`'s proportions — uppercase, tracked
     out, 1.3 leading — which is what keeps 7pt legible as a label rather than
     as a caption. */
  const statLabelH = Math.round(dims.labelSize * 1.3);

  /* The rail. Scaled off the FRAME rather than the type, because it is a rule
     rather than a word and the frame is the other rule on the card — at 1.5,
     2 and 3 the two read as the same weight of line at all three sizes. */
  const railH = Math.max(3, Math.round(dims.frame * 2));
  const railGap = Math.round(dims.labelSize * 0.45);
  /* Between rungs. Enough that four reads as four; small enough that the row
     still reads as one object rather than as four unrelated marks. */
  const rungGap = Math.max(2, Math.round(dims.frame));

  /* The name, the two figures under it, their labels under those, and the
     ladder under all of it. Fixed whether or not any line needs its full width
     — and both the label line and the ladder are reserved on every card
     whatever its tier — so a row of cells has one baseline rather than several.
     The extra 9pt comes out of the picture, not out of the grid: the card is
     square, so the cell does not grow. */
  const plateH = lineH + totalH + statLabelH + railGap + railH + dims.padding * 2;

  /* The top corner holds ONE small label now. It used to hold a two-line stat
     stack as well, which is why the scrim over it was tall enough to read as a
     dark band across the top of the card with nothing much in it. */
  const headH = dims.padding + browH;

  /* Reserved for a SUPPLIED footer only — the card draws none of its own now.
     Three steps above the label size, which is where the default block landed
     after a pass at `labelSize + 1` produced 8pt of tertiary grey under a card
     carrying 11pt white and read as a caption you had to go looking for. A
     caller putting a line down there inherits the size that was fixed. */
  const footSize = dims.labelSize + 3;
  const footLine = Math.round(footSize * 1.3);

  /**
   * The tier this card is earning toward, stepped along `TierOrder` rather than
   * parsed out of `nextTierLabel`.
   *
   * The label is a display string a caller hands in — 'GOLD', 'silver' — and
   * `TierMark` needs a `CardTier`, so reading it would mean trusting its casing
   * and spelling to stay in step with the enum. The ORDER is the same thing the
   * database's tier ladder is, and stepping along it cannot disagree with the
   * frame colour drawn from `model.tier`. Null at diamond, and with no copy in
   * hand.
   */
  const nextTier: CardTier | null =
    model.tier === null ? null : (TierOrder[TierOrder.indexOf(model.tier) + 1] ?? null);

  /**
   * Points still needed for the next tier — the GAP, not the threshold.
   *
   * `180 to go` is a thing you can act on; `0/200` was a coordinate you had to
   * subtract before it meant anything, which is half of why the fraction this
   * replaced read as arithmetic homework. Rounded UP, because 179.4 remaining
   * is 180 points of football, and rounding down would print `0 to go` on a
   * card that has not got there.
   *
   * Null at diamond (nothing above it), null with no copy in hand, and null
   * when the caller supplies no ladder — `SetChecklist` sends
   * `nextTierAt: null` for every member, and a card cannot say how far it has
   * to go when nobody has told it where it is going.
   */
  const remaining =
    model.tier === null ||
    model.tier === 'diamond' ||
    model.careerFp === null ||
    model.nextTierAt === null
      ? null
      : Math.max(0, Math.ceil(model.nextTierAt - model.careerFp));

  /* The tier letter leading the stat line. Two ranks under the figure it
     introduces: it is the sentence's first word and the total is its subject,
     and at `figureSize` the two read as equals. */
  const markSize = dims.figureSize - 2;

  /* Fades toward the scheme's own page colour — see the header. */
  const rgb = scheme === 'dark' ? '0, 0, 0' : '255, 255, 255';

  const a11yLabel =
    label ??
    `${model.playerName}, ${model.tier ? `${t.label} tier, ` : 'not held, '}` +
      `${model.positionAbbreviation ?? 'unknown position'}, ` +
      `${model.teamAbbreviation ?? 'no team'}, ` +
      `${fmt(model.careerFp)} ${model.statLabel ?? 'career fantasy points'}` +
      (model.injuryStatus ? `, designated ${model.injuryStatus}` : '') +
      (model.careerFp === null || model.tier === null
        ? ''
        : progress === null
          ? ', top tier'
          : `, ${progress}`);


  const body = (
    <View
      style={[
        styles.wrap,
        {
          width: fixedWidth ? dims.width : undefined,
          alignSelf: fixedWidth ? 'flex-start' : 'stretch',
        },
        style,
      ]}>
      {/* ================= THE CARD ===================================== *
        * A square, edge to edge, with no padding of its own — every child on   *
        * it is positioned against its corners. `overflow: hidden` is what      *
        * lets the scrims run to the rounded edges.                             *
        * ================================================================ */}
      <View
        style={[
          styles.card,
          {
            aspectRatio: dims.artAspect,
            borderRadius: Radius.panel,
            /* THE FRAME IS THE TIER — see the header. `frame` rather than
               `accent`: the palette keeps a separate value for an edge, which
               is a touch deeper than the one meant for type. */
            borderWidth: dims.frame,
            borderColor: frameColor ?? (model.tier ? t.colors.frame : c.border),
            backgroundColor: c.backgroundElement,
          },
        ]}>
        {/* The reserved photo region's occupant. It stands ON the bottom edge
            with only a little clearance, so its shoulders run UNDER the
            nameplate — which is what a real headshot crop does, and the reason
            the stand-off is a fraction of the plate rather than all of it. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.figure, { paddingBottom: Math.round(plateH * 0.45) }]}>
          <PlayerSilhouette height={dims.silhouette} color={c.textTertiary} />
        </View>

        {/* The base covers the type exactly; the ramp is what stops the band
            from reading as a rectangle laid over the picture.

            THE TOP ONE IS NOW MUCH THE WEAKER, and it was the thing that made
            the top of the card look wrong. It was sized and weighted for a
            two-line stat stack in one corner and a tier badge in the other, so
            on a placeholder it read as a dark band across a fifth of the
            square with nothing much sitting in it. All it has to cover now is
            two letters of position, so it is a third of the height at half the
            strength — enough to keep the label off a bright shoulder, not
            enough to be seen as a band. */}
        <Scrim edge="top" base={headH} ramp={Math.round(headH * 1.1)} rgb={rgb} max={0.42} />
        <Scrim edge="bottom" base={plateH} ramp={Math.round(plateH * 0.7)} rgb={rgb} max={0.86} />

        {/* ---- the top strip: what he is, and what is about to happen -- *
          * The position holds the corner the tier letter used to. It has been     *
          * three places in as many passes and this is the one that costs nothing:  *
          * beside the name it took width off the biggest word on the card, above   *
          * the name it took a whole line off the picture, and here it takes a       *
          * corner that had to be reserved for the scrim anyway.                     *
          *                                                                           *
          * The injury designation rides with it. One or two characters, in two       *
          * colours — Out and Questionable are not the same warning and the feed       *
          * emits four times as many of the second.                                    *
          *                                                                             *
          * THE CLUB TAKES THE OTHER END of the same strip, which is the corner       *
          * this card has been reserving and not using. A ROW rather than two           *
          * absolutely-placed corners: both ends are variable-width — "WR IR" is the    *
          * long form of one and a club is three letters or two — and two absolute      *
          * boxes would overlap in the middle rather than one giving way. The position  *
          * never shrinks; the club does, though at three characters it never has to.   *
          * ================================================================ */}
        <View
          style={[
            styles.head,
            { top: dims.padding, left: dims.padding, right: dims.padding },
          ]}>
          <Text
            numberOfLines={1}
            style={[styles.brow, styles.browLead, { color: accent, fontSize: browSize, lineHeight: browH }]}>
            {model.positionAbbreviation?.toUpperCase() ?? '—'}
            {weight && model.injuryStatus ? (
              <Text style={{ color: weight === 'blocking' ? c.negative : c.warning }}>
                {`  ${injuryCode(model.injuryStatus)}`}
              </Text>
            ) : null}
          </Text>

          {team ? (
            <Text
              numberOfLines={1}
              style={[
                styles.brow,
                styles.browTrail,
                { color: c.textSecondary, fontSize: browSize, lineHeight: browH },
              ]}>
              {team}
            </Text>
          ) : null}
        </View>

        {/* ---- the nameplate ------------------------------------------- *
          * The name on ONE line, centred, with the stat block under it running to  *
          * both plate edges. The name stays centred over an edge-aligned block for *
          * the same reason a table's title is: it names the whole card, where the   *
          * figures below are two specific facts that belong at opposite ends. It    *
          * was centred over a centred total for as long as there was only one       *
          * figure to centre. Long names ellipsise: "Christian McCaffrey" measures      *
          * ~112pt at 11pt bold against 94pt of plate, and no arrangement of one    *
          * line fixes that. It is the deliberate trade for a block that is two     *
          * lines instead of three, and for every card in a grid having its name    *
          * on the same baseline whatever the name is.                              *
          *                                                                          *
          * The TOTAL sits under the name rather than in a corner because it is      *
          * the one number the card exists to show, and a corner is where you put    *
          * something you want out of the way. It keeps the LEFT edge on every card, *
          * with or without a remainder opposite it, so the eye finds it in the same *
          * place down a grid. Tabular figures, so the column lines up.              *
          * ================================================================ */}
        <View style={[styles.plate, { padding: dims.padding }]}>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.name, { color: c.text, fontSize: dims.nameSize, lineHeight: lineH }]}>
            {model.playerName}
          </Text>

          {/* A ROW, not one text box with inline spans, because `TierMark` is a
              component with its own fixed box — inlining it would mean
              reimplementing the letter here, and the two would drift.

              The figure and its unit stay inline spans INSIDE that row, and
              that part is load-bearing: as siblings the row would centre the
              pair, which puts the figure off the card's axis by half the width
              of "TFP". The tier letter ahead of them is allowed to, because it
              is a fixed-width box — it shifts the total by the same amount on
              every card, so the column stays a column. */}
          {/* TWO ROWS, NOT TWO COLUMNS, and that is what lets the target
              keep its name.

              As columns each side is as wide as its widest member, so the left
              one measured 46.8pt — the width of `B 1,285`, not of `TFP` — and
              left the right column 43.2 of the plate's 93. "TO DIAMOND" needs
              54.5. No arrangement of the mark or the tracking closed an 11pt
              gap, and every short label that did fit ("TO NEXT", "NEEDED")
              bought the fit by dropping the one word the reader wants.

              Rowwise the two lines are independent: the figures need 78pt and
              the labels 74, both inside 93, and each item still sits on the
              plate edge its figure does. The association is carried by the
              edge rather than by a shared column box. */}
          <View style={[styles.statRow, { minHeight: totalH }]}>
            <View style={styles.statFigure}>
              {model.tier ? <TierMark tier={model.tier} size={markSize} /> : null}
              <Text
                numberOfLines={1}
                style={[styles.figureText, NUMERIC, { color: c.text, fontSize: dims.figureSize }]}>
                {fmt(model.careerFp)}
              </Text>
            </View>

            {/* One rank under the total and in the secondary ink: both figures
                are the point of this block, but only one of them is what the
                card IS. */}
            {remaining !== null && nextTier ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.figureText,
                  NUMERIC,
                  styles.statEnd,
                  { color: c.textSecondary, fontSize: dims.figureSize - 2 },
                ]}>
                {fmt(remaining)}
              </Text>
            ) : null}
          </View>

          <View style={[styles.statRow, { minHeight: statLabelH }]}>
            <Text
              numberOfLines={1}
              style={[
                styles.statName,
                { color: c.textTertiary, fontSize: dims.labelSize, lineHeight: statLabelH },
              ]}>
              {model.statLabel ?? 'TFP'}
            </Text>

            {/* Named in full — "TO DIAMOND", not "D". A bare letter beside a
                number reads as a quantity of that letter, which is exactly how
                `1,216 D` read in the version this replaces. */}
            {remaining !== null && nextTier ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.statName,
                  styles.statEnd,
                  { color: c.textTertiary, fontSize: dims.labelSize, lineHeight: statLabelH },
                ]}>
                {`TO ${getTierTheme(nextTier, scheme).label}`}
              </Text>
            ) : null}
          </View>

          {/* ---- the ladder: the whole climb, four rungs ------------- *
            * Neutral tracks; a FILLED rung takes its own tier's accent. So the  *
            * colour on this row is only ever what the card has earned — see the  *
            * header. Always drawn, at every tier and on a card you do not own,   *
            * so the plate is the same height on every card.                       *
            * ============================================================ */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.ladder, { marginTop: railGap, gap: rungGap }]}>
            {rungs.map((r) => (
              <View
                key={r.rung}
                style={[
                  styles.rung,
                  {
                    height: railH,
                    borderRadius: railH / 2,
                    backgroundColor: c.border,
                  },
                ]}>
                {/* Sized by FLEX rather than by a percentage width. React
                    Native's `DimensionValue` only admits a `${number}%`
                    literal, so a computed percentage has to be cast through
                    it — the two flex-grows say the same thing with no cast and
                    let the compositor round the split. A fill of 0 grows by
                    nothing, which is every rung above the one you are on. */}
                <View
                  style={[
                    styles.rungFill,
                    { flexGrow: r.fill, borderRadius: railH / 2, backgroundColor: r.accent },
                  ]}
                />
                <View style={[styles.rungRest, { flexGrow: 1 - r.fill }]} />
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ---- under the frame: nothing, unless a caller asks -------------- *
        * The card drew two lines here for several passes — the tier progress and  *
        * the next fixture — and both are ON the square now, so an ordinary cell    *
        * ends at the frame. See the header for what that was worth.                 *
        *                                                                             *
        * Rendered CONDITIONALLY rather than reserved at zero height: an empty View   *
        * still takes `wrap`'s gap, which put 4pt of page background under every      *
        * card in the grid and left the cells a hair apart from their own bottom      *
        * edge for no reason a reader could see.                                       *
        * ================================================================ */}
      {footer === undefined ? null : (
        <View style={[styles.footer, { minHeight: footLine }]}>{footer}</View>
      )}

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

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  /* No `borderWidth` here — it is per size and per tier, set inline. */
  card: {
    position: 'relative',
    overflow: 'hidden',
  },
  /* The silhouette's box is the WHOLE square, not the part above the plate:
     centring it in a shortened box would slide the head off the card's own
     centre line, and a portrait that is not centred left-to-right reads as a
     mistake. Vertical placement is the padding's job. */
  figure: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  /* `pointerEvents` in the STYLE, not as a prop — the prop is deprecated in
     0.86 and warns once per mount, which is once per cell in a grid. */
  scrim: { position: 'absolute', left: 0, right: 0, pointerEvents: 'none' },
  /* The top strip. A row pinned across the card between its insets, so the
     position and the fixture share one baseline and one line of height, and
     neither can be placed over the other. */
  head: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  figureText: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  plate: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  name: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  /* The STAT LINE — tier, total over target, next tier — under the name and on
     the same centre line.

     A row, because `TierMark` brings its own box. The figure and whatever
     follows it stay inline spans of ONE text box inside that row, which is the
     part of the old total worth keeping: as siblings they would centre the row
     and put the figure off the card's axis by half the width of "TFP". */
  /* The plate's full width, with what you have at one edge and what you owe
     at the other. Two of these stacked — the figures, then their names — see
     the note at the call site for why they are rows rather than columns. */
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  statFigure: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  /* THE TOTAL NEVER GIVES WAY, the remainder does, and that ordering is the
     whole of how this block degrades.
   *
   * At the narrowest viewport the app can actually reach — 375pt, since the
   * project targets iOS 16.4 and the smallest device that runs it is an SE2 —
   * the figures need ~78pt and the labels ~74 against 93pt of plate, so nothing
   * gives way at all. Narrower than that is a browser window below the app's
   * own floor, and there something has to: it must not be the number the card
   * exists to show. */
  statEnd: { flexShrink: 1, minWidth: 0, textAlign: 'right' },
  /* Uppercase and tracked out, `Type.micro`'s treatment, because that is what
     holds a 7pt word together. */
  statName: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  /* Full plate width, split into four equal rungs, so the ladder means the
     same thing on every card and a column of them can be compared at a glance.
     Equal rather than weighted by each tier's span: the rungs are ordinal
     positions — first tier, second, third, fourth — and drawing bronze as a
     sliver beside a vast diamond band would be a chart of the thresholds
     rather than a picture of where you are. */
  ladder: { width: '100%', flexDirection: 'row' },
  /* `overflow: hidden` so a fill's own radius cannot poke past its track's at
     either end. */
  rung: { flex: 1, flexDirection: 'row', overflow: 'hidden' },
  rungFill: { flexBasis: 0, minWidth: 0 },
  /* The unfilled remainder. It paints nothing — the track behind it is the
     colour — and exists only so the fill has something to divide the width
     with. */
  rungRest: { flexBasis: 0, minWidth: 0 },
  /* Set as a LABEL — uppercase, tracked out, small — which is what keeps two
     letters legible in a corner and stops them reading as a truncated word. */
  brow: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  /* The position never gives way. It is two characters plus at most two more
     of injury code, and it is the only thing on the strip that is the same
     length on every card. */
  browLead: { flexShrink: 0 },
  /* The club does, in the theoretical case of a long abbreviation. `minWidth:
     0` because without it a flex child refuses to shrink below its content on
     web and the row pushes past the card instead of truncating inside it.
     Right-aligned so it stays anchored to the corner it belongs to. */
  browTrail: {
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'right',
    /* A touch lighter than the position's 800. The club is context and the
       position is identity, and at 8pt weight is the only rank left. */
    fontWeight: '700',
  },
  /* A SUPPLIED block only — the card draws none of its own. Centred, on the
     same axis as the name and the stat line above it; left-aligned it read as
     a caption pinned to one corner of a cell whose every other element is
     centred. Flush to the card's edges, since an inset would only cost the
     caller width. */
  footer: { alignItems: 'center' },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
});
