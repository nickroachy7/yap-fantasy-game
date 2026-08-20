import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import {
  CardSizes,
  Colors,
  Fonts,
  NUMERIC,
  Radius,
  Spacing,
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
 *   bottom, on    NAME over TOTAL FP, centred: what the card is, and what this
 *   the centre    copy of it has earned.
 *   line
 *
 * THE TIER IS THE FRAME. It spent two passes as a letter in the top-left, and
 * a letter is the wrong instrument for it in a grid: tier is the fact you scan
 * nine cells for and it was the smallest mark on any of them. An edge is read
 * without being looked at, which is what rarity wants and what printed cards
 * have always done with it.
 *
 * THAT IS ONLY SAFE BECAUSE THE LETTER SURVIVED, on the footer line below. The
 * rule `theme.ts` sets and `TierMark` keeps is that tier is never colour alone
 * — bronze and gold are a brown and a yellow, the first pair to collapse in
 * greyscale or under a red-green deficiency. The frame is the fast channel;
 * the letter is the one that actually carries the meaning. The border width
 * rises with the card size (`CardSizes.frame`) so the edge reads the same at
 * 106pt and at 320.
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
 * THE CLUB IS NOT ON THE CARD. It used to hold a bottom corner and it was the
 * weakest thing on the square: three letters that repeat down a grid — half a
 * collection is the same dozen clubs — and that on their own answer nothing
 * you came to the screen to ask.
 *
 * It went to the fixture line below, where it was needed anyway. A matchup is
 * "my club against theirs", so `CAR @ JAX` says both in the width `CAR` alone
 * was taking, and the corners it left are what let the name block have the
 * whole bottom of the card to itself.
 *
 * The two halves degrade independently, which is why this is composed on the
 * card rather than handed in pre-joined: with no fixture loaded the club still
 * stands alone, and with no club the fixture still prints.
 *
 * THE MATCHUP AND THE PROGRESS ARE BELOW THE FRAME, ON THE PAGE.
 *
 * Both are facts with a clock on them: the progress phrase moves every Sunday
 * a card is started, and the fixture is stale by Monday. Everything ON the
 * square is durable — a name, a position, a tier, a career total — so putting
 * the two perishable facts outside the frame is not just a space saving, it is
 * the actual boundary between "what this card is" and "what is happening to it
 * this week". The club is the one fact that reads either way; it follows the
 * fixture because that is the line that gives it something to say.
 *
 * They share ONE line, progress left and fixture right, and that is a grid
 * decision. `InventoryCard` used to hang an injury flag under the card and the
 * note it left behind is the reason this is one line and not two: anything
 * below the frame that only SOME cards have gives a row of nine a ragged
 * bottom edge. One row of fixed height cannot do that, whether or not the
 * fixture half is present.
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
  tier: CardTier;
  careerFp: number;
  nextTierAt: number | null; // null when already diamond
  /**
   * OPTIONAL. `min_career_fp` of the card's CURRENT tier. Retained because
   * callers already have it and `tierProgressLabel` may want it back, though
   * the printed phrase measures from zero — see the note there.
   */
  tierFloorFp?: number;
  /** OPTIONAL. Display name of the next tier, e.g. 'GOLD'. */
  nextTierLabel?: string;
  /**
   * OPTIONAL. This club's next game, already formatted — "vs BUF", "@ ARI",
   * "BYE" — and WITHOUT the club itself, which the card prefixes from
   * `teamAbbreviation` so that either half can be missing. Drawn on the line
   * BELOW the frame, opposite the progress phrase.
   *
   * A STRING, not a game object, and handed in rather than looked up: the card
   * is pure, and the schedule is a session-cached read one screen makes once
   * for every cell it draws (`useUpcomingFixtures`). Omitted is fine and
   * common — the line simply keeps the progress phrase and nothing else.
   */
  matchup?: string | null;
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
}: PlayerCardProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const t = useTierTheme(model.tier);
  const dims = CardSizes[size];
  const compact = size === 'compact';

  /* The one accent on the square is the POSITION's — the same colour the
     lineup row and the directory row put on it, so a WR is one colour
     everywhere in the app. */
  const accent = positionColors(model.positionAbbreviation, scheme).accent;

  const team = model.teamAbbreviation?.toUpperCase() ?? null;
  const weight = injuryWeight(model.injuryStatus);
  const progress = tierProgressLabel(model, { short: compact });

  /* THE CLUB IS PART OF THE FIXTURE, not a fact of its own — see the header.
     "CAR @ JAX" costs the same width the club alone used to take on the card
     and answers a question the club alone could not.

     Both halves degrade independently. No fixture (the schedule has not
     loaded) leaves the club standing alone, which is what the card said
     before; no club leaves the fixture, which is what it said a moment ago. */
  const fixture = [team, model.matchup].filter(Boolean).join(' ') || null;

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

  /* Two lines: the name, and the total under it. Fixed whether or not either
     needs its full width, so a row of cells has one baseline rather than
     several. */
  const plateH = lineH + totalH + dims.padding * 2;

  /* The top corner holds ONE small label now. It used to hold a two-line stat
     stack as well, which is why the scrim over it was tall enough to read as a
     dark band across the top of the card with nothing much in it. */
  const headH = dims.padding + browH;

  /* The two lines below the card. THREE steps above the label size, not one:
     at `labelSize + 1` in tertiary grey this row was 8pt of #7E8289 under a
     card carrying 11pt white, and it read as a caption you had to go looking
     for rather than as half the information on the cell. Bigger type and one
     rank up the text scale is most of the fix; putting each fact on its own
     line is the rest, because at this size they no longer share one. */
  const footSize = dims.labelSize + 3;
  const footLine = Math.round(footSize * 1.3);

  /* Fades toward the scheme's own page colour — see the header. */
  const rgb = scheme === 'dark' ? '0, 0, 0' : '255, 255, 255';

  const a11yLabel =
    `${model.playerName}, ${t.label} tier, ` +
    `${model.positionAbbreviation ?? 'unknown position'}, ` +
    `${model.teamAbbreviation ?? 'no team'}, ` +
    `${fmt(model.careerFp)} career fantasy points` +
    (model.injuryStatus ? `, designated ${model.injuryStatus}` : '') +
    (progress === null ? ', top tier' : `, ${progress}`) +
    (model.matchup ? `, ${model.matchup}` : '');


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
            borderColor: t.colors.frame,
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

        {/* ---- top-left: what he is ------------------------------------ *
          * The position, alone in the corner where the tier letter used to be.  *
          * It has been three places in as many passes and this is the one that  *
          * costs nothing: beside the name it took width off the biggest word on  *
          * the card, above the name it took a whole line off the picture, and    *
          * here it takes a corner that had to be reserved for the scrim anyway.  *
          *                                                                       *
          * The injury designation rides with it. One or two characters, in two   *
          * colours — Out and Questionable are not the same warning and the feed   *
          * emits four times as many of the second.                                *
          * ================================================================ */}
        <View style={[styles.corner, { top: dims.padding, left: dims.padding }]}>
          <Text
            numberOfLines={1}
            style={[styles.brow, { color: accent, fontSize: browSize, lineHeight: browH }]}>
            {model.positionAbbreviation?.toUpperCase() ?? '—'}
            {weight && model.injuryStatus ? (
              <Text style={{ color: weight === 'blocking' ? c.negative : c.warning }}>
                {`  ${injuryCode(model.injuryStatus)}`}
              </Text>
            ) : null}
          </Text>
        </View>

        {/* ---- the nameplate ------------------------------------------- *
          * The name on ONE line with the total under it, both centred on the     *
          * card's axis. Long names ellipsise: "Christian McCaffrey" measures      *
          * ~112pt at 11pt bold against 94pt of plate, and no arrangement of one    *
          * line fixes that. It is the deliberate trade for a block that is two     *
          * lines instead of three, and for every card in a grid having its name    *
          * on the same baseline whatever the name is.                              *
          *                                                                          *
          * The TOTAL sits under the name rather than in a corner because it is      *
          * the one number the card exists to show, and a corner is where you put    *
          * something you want out of the way. Tabular figures, so a column of       *
          * them lines up down the grid.                                             *
          * ================================================================ */}
        <View style={[styles.plate, { padding: dims.padding }]}>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.name, { color: c.text, fontSize: dims.nameSize, lineHeight: lineH }]}>
            {model.playerName}
          </Text>

          <Text numberOfLines={1} style={[styles.total, { lineHeight: totalH }]}>
            <Text
              style={[styles.figureText, NUMERIC, { color: c.text, fontSize: dims.figureSize }]}>
              {fmt(model.careerFp)}
            </Text>
            <Text style={[styles.cornerLabel, { color: c.textTertiary, fontSize: dims.labelSize }]}>
              {'  TFP'}
            </Text>
          </Text>
        </View>
      </View>

      {/* ---- off the card: the tier, and the two facts with a clock ---- *
        * One row of fixed height whether or not the fixture is known, so a     *
        * grid row cannot come out ragged. At diamond the phrase says "Top      *
        * tier" rather than nothing, because a blank line there would read as   *
        * missing data on the best card you own.                                *
        *                                                                        *
        * THE TIER LETTER LEADS IT, and that is what makes a coloured frame      *
        * safe. `theme.ts` sets the rule and `TierMark` keeps it: bronze and     *
        * gold are a brown and a yellow, the first pair to collapse in           *
        * greyscale or under a red-green deficiency, so tier can never be a      *
        * colour alone. The frame is the fast channel and this is the one that   *
        * actually carries the meaning — and it reads as the first word of the   *
        * sentence it begins, "B, 0/200 to Silver", which is exactly what the    *
        * lineup row's third line does with it.                                  *
        * ================================================================ */}
      <View style={[styles.footer, { minHeight: footLine * 2 }]}>
        <View style={styles.progress}>
          <TierMark tier={model.tier} size={footSize} />
          <Text
            numberOfLines={1}
            style={[
              styles.footerText,
              { color: c.textSecondary, fontSize: footSize, lineHeight: footLine },
            ]}>
            {progress ?? 'Top tier'}
          </Text>
        </View>
        {fixture ? (
          <Text
            numberOfLines={1}
            style={[
              styles.footerText,
              { color: c.textTertiary, fontSize: footSize, lineHeight: footLine },
            ]}>
            {fixture}
          </Text>
        ) : null}
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
  corner: { position: 'absolute' },
  cornerLabel: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: 0.6,
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
  /* The TOTAL, under the name and on the same centre line. The figure and its
     unit are inline spans of one text box so the pair centres together — as
     siblings in a row the block would have centred the ROW, which puts the
     figure left of the card's axis by half the width of "TFP". */
  total: { textAlign: 'center' },
  /* Set as a LABEL — uppercase, tracked out, small — which is what keeps two
     letters legible in a corner and stops them reading as a truncated word. */
  brow: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  /* TWO LINES, NOT ONE, and it is width that decided it rather than taste.
     Side by side these two ran ~116pt at the new size against the 103 a
     compact cell has, so one of them was always going to be truncating — and
     the progress phrase, which is the one that gives way, loses the tier it is
     counting toward. Stacked, both are whole.

     `minHeight` reserves the second line whether or not there is a fixture to
     put on it. A cell that is a line shorter than its neighbours is the ragged
     bottom edge this file has been avoiding since the injury flag lived down
     here.

     CENTRED, on the same axis as the name and the total above it. Left-aligned
     it was a caption pinned to one corner of a cell whose every other element
     is centred, which read as two blocks that had been laid out by different
     people. Flush to the card's edges either way — an inset would only cost
     the phrases width. */
  footer: { minHeight: 0, alignItems: 'center' },
  /* The letter and the phrase are a ROW rather than one text box, because
     `TierMark` is a component with its own fixed box and inlining it would
     have meant reimplementing it here. `flexShrink` on the group so the phrase
     is what gives way; the letter never does. */
  progress: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    /* The row sizes to its content so it can centre, and this is what stops it
       sizing PAST the card when the phrase is long. The text inside shrinks;
       the tier letter never does. */
    maxWidth: '100%',
  },
  /* 600, where this was 500. A weight below the card's own type at a size
     below it too is two reasons to overlook the same line. */
  footerText: {
    fontFamily: Fonts.sans,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
});
