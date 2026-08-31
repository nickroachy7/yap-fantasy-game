import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

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
import { gradient } from '@/components/ui/gradient';
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
 * THE STAT LINE IS ONE CENTRED LINE, and it says two things:
 *
 *          AJ Dillon
 *        B 17 /50 TO SILVER
 *       ▓▓░  ░░░  ░░░  ░░░
 *
 * WHAT YOU HAVE, then WHAT IT COSTS. The total is the only white thing on the
 * line and the only 800 on it; everything after it — the threshold and the
 * tier it buys — is ONE run of tertiary grey at one size and one weight, from
 * the slash to the last letter. That single split is the whole design. There
 * are three objects on the line and only two things to read.
 *
 * IT WAS TWO LABELLED FIGURES AT OPPOSITE ENDS OF THE PLATE for several
 * revisions, which is what this replaces:
 *
 *     B 17                34
 *     TFP           TO SILVER
 *
 * Four objects in two rows, spread to the edges, each figure paired with the
 * label under it by the edge they shared. It is a defensible table and it was
 * the wrong shape, for two separate reasons that only showed up in use.
 *
 * THE SHAPE OVERRODE THE LABELS. Two figures at opposite ends of a plate, the
 * left one a total, are read as a fraction — whatever the words underneath
 * say. The right-hand figure was the REMAINDER, and on a card at zero the
 * remainder and the threshold are the same number, so a fresh card reading
 * `0` and `50` taught everyone the fraction. Every card above zero then
 * inherited that reading and got it wrong: 17 with 34 owed was read as "17 of
 * 34", against a real target of 50. The fix is not a better label. The line is
 * a fraction now, and prints the threshold (see `threshold`).
 *
 * IT COST A WHOLE LINE OF PICTURE to say one thing. The plate was 52pt of a
 * 102pt card — half the square was nameplate — and the third row existed only
 * to name the two figures above it. One line, one label run, and the plate is
 * 41: the card is square by `artAspect`, so all 11pt go to the silhouette and
 * the cell does not move. That is the cheapest 11pt on the square.
 *
 * THE TARGET IS STILL NAMED IN FULL — "TO SILVER", not "S". A bare letter
 * after a number reads as a quantity of that letter, which is exactly how
 * `1,216 D` read in a revision before last. What it costs is the price run's
 * type size: at `labelSize` a gold card's `599 /600 TO DIAMOND` measures 94pt
 * against 93pt of plate and EVERY gold card draws that line. Half a point
 * down, at `labelSize - 0.5`, it measures 90.3 and the phrase survives at
 * every tier. The alternative that also fit was dropping "TO" — `599 /600
 * DIAMOND` at the full label size — and it was refused because the preposition
 * is how the line is read aloud.
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
  /**
   * What the figure IS. Defaults to the collection's 'career fantasy points'.
   *
   * SPOKEN, NOT PRINTED, since the stat line lost its label row: the plate
   * draws `B 17 /50 TO SILVER` with no unit on it, because a figure on a card
   * in a fantasy collection is not a figure anyone asks the unit of. This
   * still reaches a screen reader through `a11yLabel`, which is the one place
   * the unit cannot be inferred from context.
   */
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
  /**
   * OPTIONAL. A press that is HELD. The card does nothing with it beyond
   * passing it to the `Pressable`, which is the point: a hold means something
   * different on every screen that wants one — on the collection grid it opens
   * multi-select — and none of those meanings belong to a card.
   *
   * A card with only a hold and no tap is still pressable, so both are checked
   * before falling back to the unpressable branch below.
   */
  onLongPress?: () => void;
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
   * A mark laid over the card, low in the PICTURE and just clear of the plate.
   *
   * NOT THE CENTRE OF THE SQUARE, and that was asked for and measured before it
   * was refused. On a compact card the nameplate is 41pt of 102, so the
   * square's centre at y=51 sits ten points BELOW the plate's top edge at y=61
   * and squarely in the name. A badge big enough to read there covers the
   * player's name on every cell in the grid. There is no size that fixes it:
   * the mark would have to be 6pt across to clear the text, at which point it
   * is not a mark. (The one-line stat block bought the picture 11pt back, and
   * the centre still lands in type — it is nearer the edge of the name than it
   * was, not clear of it.)
   *
   * So it goes as low in the picture as it can, which lands about 40% down the
   * card — well below the quarter-way point it sat at when it centred in the
   * art, and the closest to the middle it can get with the name intact.
   *
   * LOW IS ALSO THE RIGHT PLACE FOR THE OTHER REASON. There is no licensed
   * player art yet, but a headshot crop puts the FACE in the upper middle —
   * exactly where a centred badge would land. Down here it sits over the chest
   * and shoulders, where the silhouette already runs under the plate.
   *
   * It is a slot on the card rather than something a caller absolutely
   * positions over the cell, because the cell is not the card — `wrap` may
   * carry a footer under it, and then the cell's geometry is not the square's.
   *
   * The set checklist is the caller: a slot's state — missing, addable, in the
   * set — is a fact about the CARD rather than about the player on it, so it is
   * drawn on top rather than beside.
   *
   * `pointerEvents` is left alone deliberately. An overlay that is only a mark
   * should pass taps through to whatever wraps the card; one that is a button
   * handles its own, and both work because the slot does not impose either.
   */
  overlay?: ReactNode;
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
  onLongPress,
  style,
  fixedWidth = true,
  footer,
  overlay,
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

  /**
   * THE TOTAL, and it is two points under `figureSize` on purpose.
   *
   * `figureSize` was set when the total sat alone on its own row with a label
   * under it, and the note beside it in `theme.ts` calls 12 a floor: anything
   * smaller made the headline number smaller than the player it belonged to.
   * That floor was protecting a headline that had SIZE as its only claim to
   * being one.
   *
   * It has two others now. It is the only white thing on a line where
   * everything else is tertiary grey, and the only 800 among 700s. Weight and
   * ink carry it, which is what frees the two points — and the two points are
   * what let "TO DIAMOND" stay spelled out on the same line (see `priceSize`).
   *
   * The consequence is real and worth naming: at 10 the total no longer
   * out-measures the 11pt name above it. It is no longer the biggest type on
   * the plate; it is still the loudest.
   */
  const totalSize = dims.figureSize - 2;
  /* Tightened from 1.25. The line box was 3pt taller than its 10pt text, and
     all of that showed up as air between the name and the total — the two
     lines are one centred block and were not reading as one. */
  const totalH = Math.round(totalSize * 1.2);

  /**
   * THE PRICE — `/50 TO S` — one run of type, a point ABOVE the label size,
   * ending in the next tier's own initial.
   *
   * ---------------------------------------------------------------------------
   * THE TIER NAME IS WHAT COST THE SIZE, NOT THE PREPOSITION
   * ---------------------------------------------------------------------------
   *
   * Two revisions fought over the word "TO" on the assumption that the phrase
   * was nearly fitting and the preposition was the last straw. Measured in the
   * rendered font it was never close. The stat row is 94pt on a compact card;
   * the tier mark takes 7, the two gaps 4, and a worst-case `599` 21.1, so the
   * run has 61.9pt. Spelled out, `/600 TO DIAMOND` measures 70.1 at 6.5pt — over
   * by eight, on every gold card rather than a rare one, so the card was
   * clipping the whole time. Dropping "TO" bought one half point and left the
   * phrase still the longest thing on the line.
   *
   * The tier NAME was the expensive token. `/600 TO D` measures 46.8 at 8pt
   * against the same 61.9, which is enough headroom to spend on size instead:
   * this now runs a point ABOVE `labelSize` rather than half a point below it,
   * and it is the longest line the card can draw. Diamond is the top tier, so a
   * diamond card has no next rung and prints nothing here.
   *
   * `TO NEXT TIER` was the other candidate and it is the worst of the three at
   * 17 characters — longer than spelling DIAMOND out.
   *
   * ---------------------------------------------------------------------------
   * A BARE LETTER WAS AMBIGUOUS. A LETTER AFTER A PREPOSITION IS NOT
   * ---------------------------------------------------------------------------
   *
   * `1,216 D` shipped once and read as a quantity of D, which is why the tier
   * was spelled out for several revisions afterwards. The fix is the grammar
   * rather than the length: "to D" cannot be a quantity, it can only be a
   * destination. The preposition is doing the work the extra six characters
   * were doing, in two.
   *
   * And the letter is the app's own tier mark, not an abbreviation invented
   * here. `TierMark`'s rule holds — tier is never colour alone, the INITIAL is
   * what carries it, and the accent only makes it faster — so the line ends the
   * way every other tier statement in the app ends. It also gives the row a
   * symmetry it did not have: the tier you are leads it, the tier you are owed
   * closes it.
   */
  const priceSize = dims.labelSize + 1;
  /* Proportional rather than the flat 0.6 the old labels used. At 6.5pt a
     fixed 0.6 is nearly a tenth of the em — open enough to cost 3pt of the
     line's margin for no legibility the tighter setting does not already have,
     and the margin is what the half point above was bought with. */
  const priceTrack = priceSize * 0.06;

  /* Between the three objects on the stat line — the mark, the total, the
     price. Scaled off the TOTAL rather than off `labelSize`, which is what it
     borrowed from the ladder's `railGap` for a revision: those two gaps are
     unrelated and one of them is on the critical path for the line's width.
     2pt at compact, and the point it saves against a rounded-up 3 is a third
     of the margin the price's half point came out of. */
  const lineGap = Math.max(2, Math.round(totalSize * 0.2));

  /* The position label. Set from the LABEL size, one step below the meta type
     it used to be, because the tracking below is what carries it at that size
     and a corner token does not need body weight. */
  const browSize = dims.labelSize + 1;
  const browH = Math.round(browSize * 1.3);

  /* The rail. Scaled off the FRAME rather than the type, because it is a rule
     rather than a word and the frame is the other rule on the card — at 1.5,
     2 and 3 the two read as the same weight of line at all three sizes. */
  const railH = Math.max(3, Math.round(dims.frame * 2));
  const railGap = Math.round(dims.labelSize * 0.45);
  /* Between rungs. Enough that four reads as four; small enough that the row
     still reads as one object rather than as four unrelated marks. */
  const rungGap = Math.max(2, Math.round(dims.frame));

  /* The name, ONE stat line under it, and the ladder under that. Fixed whether
     or not the line needs its full width — and the ladder is reserved on every
     card whatever its tier — so a row of cells has one baseline rather than
     several.

     It was 52pt of a 102pt card while the stat block was two rows. At 41 the
     11pt it gives back goes to the PICTURE, not to the grid: the card is
     square by `artAspect`, so the cell is exactly as tall as it was and the
     silhouette above the plate is 22% taller. */
  const plateH = lineH + totalH + railGap + railH + dims.padding * 2;

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
   * The THRESHOLD for the next tier, not the gap to it — the denominator of
   * `17/50`, and a reversal of what this drew before.
   *
   * It printed the REMAINDER for several revisions, on the argument that `33
   * to go` is a thing you can act on where `17/50` is a coordinate you have to
   * subtract before it means anything. The argument is still true and it was
   * still the wrong number, because of how the pair actually got read: two
   * figures at opposite ends of a plate, the left one a total and the right
   * one unnamed, are read as a fraction whatever the label under them says.
   * On a card at zero the two are indistinguishable — a fresh card owing 50
   * shows `0` and `50`, which is a correct reading of the wrong relationship —
   * and every card above zero then inherits that reading and gets it wrong.
   * AJ Dillon at 17 with 33 owed was being read as "17 of 34".
   *
   * A fraction is what the shape says, so the shape now gets the fraction. The
   * subtraction the remainder saved is real but small, and it is the reader's
   * to do against a target they can also see on the ladder underneath.
   *
   * Null at diamond (nothing above it), null with no copy in hand, and null
   * when the caller supplies no ladder — `SetChecklist` sends
   * `nextTierAt: null` for every member, and a card cannot name a target when
   * nobody has told it where it is going.
   */
  const threshold =
    model.tier === null ||
    model.tier === 'diamond' ||
    model.careerFp === null ||
    model.nextTierAt === null
      ? null
      : Math.round(model.nextTierAt);

  /* The tier letter leading the stat line. Two ranks under the total it
     introduces — it is the sentence's first word and the total is its subject,
     and set level with it the two read as equals. */
  const markSize = totalSize - 2;

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
          * TWO CENTRED LINES ON ONE AXIS: the name, and under it the stat line.    *
          *                                                                          *
          * The stat block ran to both plate edges for as long as it was two         *
          * figures — a total at one end and what it owed at the other — and the     *
          * edges were what paired each figure with the label beneath it. With one   *
          * line and one figure there is nothing to pair and nothing to spread, so   *
          * the line centres under the name and the plate becomes one block on one   *
          * axis rather than a title over a table.                                    *
          *                                                                          *
          * WHAT CENTRING COSTS, since it was refused before for this reason: the    *
          * total no longer starts at the same x down a grid. Left-aligned, the eye  *
          * found it in one place in every cell; centred, it drifts by half the      *
          * difference in line length — about 9pt between a bronze card and a gold   *
          * one. The line is short enough and the name above it centred enough that  *
          * the block reads as deliberate rather than ragged, which is the trade.    *
          *                                                                          *
          * Long names ellipsise: "Christian McCaffrey" measures ~112pt at 11pt bold  *
          * against 93pt of plate, and no arrangement of one line fixes that. It is  *
          * the deliberate trade for every card in a grid having its name on the     *
          * same baseline whatever the name is.                                       *
          * ================================================================ */}
        <View style={[styles.plate, { padding: dims.padding }]}>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.name, { color: c.text, fontSize: dims.nameSize, lineHeight: lineH }]}>
            {model.playerName}
          </Text>

          {/* ---- the stat line: what you have, then what it costs ------ *
            * `B 17 /50 TO SILVER` — three objects, and only two things to read.  *
            *                                                                      *
            * THE PRICE IS ONE RUN, and that is the point of this revision. The    *
            * threshold used to be set as a figure and the tier name as a label,   *
            * in two sizes and two inks, which put four competing objects on the   *
            * line and left the eye to rank them. Set as a single size, weight and *
            * colour end to end it is ONE phrase — a price — against ONE bright    *
            * number that is the card's own. Nothing inside the price is louder    *
            * than the rest of it.                                                  *
            *                                                                      *
            * A ROW, not one text box with inline spans, because `TierMark` is a   *
            * component with its own fixed box — inlining it would mean            *
            * reimplementing the letter here, and the two would drift. The row is  *
            * centred, so the mark's fixed width no longer holds a column; it is   *
            * kept because a letter free to set its own width would jitter the     *
            * line's centre between a `B` and a `D`.                                *
            * ============================================================ */}
          <View style={[styles.statLine, { minHeight: totalH, gap: lineGap }]}>
            {model.tier ? <TierMark tier={model.tier} size={markSize} /> : null}
            <Text
              numberOfLines={1}
              style={[styles.figureText, NUMERIC, { color: c.text, fontSize: totalSize }]}>
              {fmt(model.careerFp)}
            </Text>

            {/* THE INITIAL, IN THE NEXT TIER'S ACCENT — see `priceSize` for why
                the name went and why a letter is safe here when `1,216 D` was
                not. The accessible label spells the tier out in full, because
                a screen reader announcing "D" is the ambiguity this line spent
                three revisions removing. */}
            {threshold !== null && nextTier ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.price,
                  NUMERIC,
                  {
                    color: c.textTertiary,
                    fontSize: priceSize,
                    letterSpacing: priceTrack,
                    /* Optically centred on the digits rather than box-centred.
                       The run is uppercase and has no descenders, so its box
                       centres about half a point high beside figures that do —
                       small, and visible on a line this short. */
                    marginTop: priceSize * 0.12,
                  },
                ]}
                accessibilityLabel={`of ${fmt(threshold)}, to ${getTierTheme(nextTier, scheme).label}`}>
                {`/${fmt(threshold)} TO `}
                <Text
                  style={{
                    color: getTierTheme(nextTier, scheme).colors.accent,
                    fontWeight: '800',
                  }}>
                  {getTierTheme(nextTier, scheme).label.charAt(0)}
                </Text>
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
        {/* ---- the overlay: a mark on the card -------------------------- *
          * Bounded by the ART and pushed to the bottom of it — see the prop for  *
          * why not the square's centre. Last in the card so it sits above the    *
          * scrims and the two corner labels: a mark that says what this slot IS  *
          * outranks the facts about who is on it.                                 *
          * ================================================================ */}
        {overlay ? (
          <View
            /* Bounded by the NAME's top, not the plate's. The plate's upper
               band is scrim over the same picture — the text does not start
               until `dims.padding` into it — so stopping at `plateH` gave away
               5pt for nothing and left the mark 10% of a card higher than it
               needed to be. Measured: 30.9% down the card against 40.7 here.
               The 2 is the only real clearance, and it is the gap between the
               disc and the first letter of the name. */
            style={[
              styles.overlay,
              { bottom: plateH - dims.padding, paddingBottom: 2 },
            ]}
            pointerEvents="box-none">
            {overlay}
          </View>
        ) : null}
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
      {/* `== null`, so an explicit `null` is treated as "no footer" rather than
          as an empty one. It read `=== undefined`, and a caller passing null to
          mean "nothing down there" — the set checklist did — got the reserved
          line and the gap above it anyway, which is exactly the 4pt-of-page
          problem this block was made conditional to avoid. */}
      {footer == null ? null : (
        <View style={[styles.footer, { minHeight: footLine }]}>{footer}</View>
      )}

    </View>
  );

  if (!onPress && !onLongPress) {
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={a11yLabel}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      /* The default is 500ms, which reads as a card that did not respond. 320
         is past the longest ordinary tap — a scroll that starts as a stationary
         finger is the case this must not steal, and a flick is off the cell
         well inside 300 — while landing close enough to the touch to feel like
         the card answering rather than a timer expiring. */
      delayLongPress={320}
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
  /* The art, as a box that centres horizontally and sits its child at the
     BOTTOM — `bottom` and the padding are set inline from the plate's measured
     height, so the mark tracks the plate at every size instead of guessing. */
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
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
    /* See `price`: the total is the one thing on the line that never gives way. */
    flexShrink: 0,
  },
  plate: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  name: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  /* The STAT LINE — the tier letter, the total, and the price — centred under
     the name on the plate's own axis.

     A row, because `TierMark` brings its own box. It used to run to both plate
     edges with `space-between`, which is what paired each of two figures with
     the label under it; there is one figure now and nothing to pair, so the
     line centres and the plate reads as one block. */
  statLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* THE TOTAL NEVER GIVES WAY, the price does, and that ordering is the whole
     of how this line degrades.
   *
   * At the narrowest viewport the app can actually reach — 375pt, since the
   * project targets iOS 16.4 and the smallest device that runs it is an SE2 —
   * the widest line the card can draw is a gold card's `599 /600 TO DIAMOND`
   * at ~88pt against 93pt of plate, so nothing gives way at all. Narrower than
   * that is a browser window below the app's own floor, and there something
   * has to: it must not be the number the card exists to show.
   *
   * `flexShrink: 0` on the total says so; the price carries the 1 and
   * ellipsises into itself, which loses the tier's last letters before it
   * loses a digit. */
  /* Uppercase and tracked out, `Type.micro`'s treatment, because that is what
     holds a 6pt phrase together. Tracking is set at the call site, off the
     size, rather than fixed here — see `priceTrack`. */
  price: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    textTransform: 'uppercase',
    flexShrink: 1,
    minWidth: 0,
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
