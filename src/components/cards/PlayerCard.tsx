import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

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
 * THE TIER NO LONGER TINTS THE CARD, and that is the largest change here.
 *
 * Every surface on it — the card, the art band, the border — was drawn from the
 * tier palette, so a bronze card was a brown object and a diamond one was a
 * teal object. Four differently coloured objects in a three-across grid is a
 * lot of noise for one fact, and it was the wrong fact to spend the whole cell
 * on: tier is a consequence of career FP, which is already the biggest number
 * on the card. The card now sits on the app's own `surface` with the app's own
 * `border`, exactly like every other panel, and the only tier colour left is
 * the LETTER at the head of the progress line.
 *
 * That is not a weakening of the accessibility rule, it is the rule's own
 * argument taken to its conclusion. `TierMark` already says it: bronze and gold
 * are a brown and a yellow, the first pair to collapse in greyscale or under a
 * red-green deficiency, so `B` / `S` / `G` / `D` is what actually carries the
 * meaning and the hue only makes it faster. A tint that cannot be relied on is
 * a tint that was only ever decoration.
 *
 * IT IS THE LINEUP ROW, STACKED — but only the half of it that is about the
 * CARD. The row is read while deciding who plays on Sunday, so it leads with
 * the week: fixture, kickoff, this week's points against a projection. A
 * collection cell is not that. You are looking at what you own, and the two
 * questions it answers are what this copy has earned and how close it is to
 * promoting. So the row's type, order and colours came across; its week did
 * not.
 *
 *   portrait          the reserved photo region, holding a silhouette
 *   name              on its own, because it cannot share a line here
 *   position, club    position in its POSITION accent, club subordinate
 *   progress          `812/2500 Gold`
 *   total             the one number the card exists to show
 *
 * WHAT WAS DROPPED, AND WHY IT WAS THE WEEK'S HALF. The fixture line went, and
 * the start count with it. A matchup is a fact about a club on a Sunday, not
 * about a copy you hold, and it was the one line on the card that went stale
 * between visits. Starts went for a quieter reason: it is the denominator of
 * the total above it, interesting exactly once — on the card profile, where
 * `CardStanding` prints "FP earned over 14 starts" and has the room to say it
 * in words.
 *
 * THE DESIGNATION SURVIVED THE FIXTURE LINE IT LIVED ON, moved up beside the
 * club. On the lineup row it sits with the fixture because there it is a doubt
 * about a game; with no game on the card it attaches to the player instead,
 * which is what the directory row does with it. It costs no height and no width
 * — `WR — SF` leaves half the line free — and dropping it would have quietly
 * removed the only availability signal from a screen that has a filter for it.
 *
 * WHAT WOULD NOT COME ACROSS, MEASURED. The row puts name, position and club on
 * ONE line and gives that line ~245pt. A collection cell has 96pt of content at
 * three-across on a 375pt phone. That run measures 115pt, and the long names it
 * has to hold are worse: "Christian McCaffrey" is 112pt at 11pt bold, so it
 * does not fit even alone. Every FACT from the row fits; none of its line
 * structure does. So the card stacks into five short lines what the row says in
 * three wide ones, and long names truncate — which they already did, and which
 * no amount of rearranging fixes at this width.
 *
 * Drawing it at all is what retired the red flag that used to hang UNDER the
 * card in the grid. `InventoryCard` drew it there because the card had nowhere
 * to put it, and a flag outside the cell gave every row of nine a ragged bottom
 * edge.
 *
 * THE PROGRESS IS A SENTENCE, NOT A BAR. It was a twelve-segment rule along the
 * bottom edge carrying no text, defended on the grounds that a countable
 * boundary survives greyscale. True, and it still answered "am I nearly there"
 * with a fraction you had to estimate. `tierProgressLabel` — the row's own
 * function, shared rather than reimplemented — prints "812/2500 to Gold", which
 * is the same answer exactly, in less height than the bar took.
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
  /**
   * OPTIONAL. The feed's designation — 'Questionable', 'Out', 'IR'.
   *
   * Drawn beside the club as a one-or-two character code. Undefined or null is
   * "nothing reported", which is the common case and draws nothing.
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

  /* The one accent left on the card, and it is the POSITION's rather than the
     tier's — the same colour the lineup row and the directory row put on it, so
     a WR is one colour everywhere in the app. */
  const accent = positionColors(model.positionAbbreviation, scheme).accent;

  const team = model.teamAbbreviation?.toUpperCase() ?? '—';
  const weight = injuryWeight(model.injuryStatus);
  const progress = tierProgressLabel(model, { short: compact });

  const a11yLabel =
    `${model.playerName}, ${t.label} tier, ` +
    `${model.positionAbbreviation ?? 'unknown position'}, ` +
    `${model.teamAbbreviation ?? 'no team'}, ` +
    `${fmt(model.careerFp)} career fantasy points` +
    (model.injuryStatus ? `, designated ${model.injuryStatus}` : '') +
    (progress === null ? ', top tier' : `, ${progress}`);

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
          /* The app's own surface and the app's own hairline. No tier tint —
             see the header. */
          borderColor: c.border,
          backgroundColor: c.surface,
        },
        style,
      ]}>
      {/* ================= PHOTO ======================================== *
        * The region a licensed portrait will occupy, full bleed at the top —  *
        * negative margins cancel the card's padding so the image will meet    *
        * the card's own edges. Its box is driven by `artAspect`, so dropping   *
        * a real <Image> in here changes NOTHING about the surrounding layout.  *
        *                                                                       *
        * It holds the SAME SILHOUETTE the directory row and both profile       *
        * headers hold — see `PlayerSilhouette`, which is shared rather than    *
        * redrawn. It used to be a two-letter monogram, which was the wrong     *
        * placeholder for two reasons: initials down a grid read as a second    *
        * badge column, and a monogram does not look like a thing waiting for a  *
        * photograph, so the region read as decoration rather than as reserved   *
        * space. The figure stands ON the bottom edge, where a head and         *
        * shoulders land in a real headshot crop.                               *
        * ================================================================ */}
      <View
        // Decorative placeholder: keep it out of the accessibility tree.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.photo,
          {
            aspectRatio: dims.artAspect,
            backgroundColor: c.backgroundElement,
            marginTop: -dims.padding,
            marginHorizontal: -dims.padding,
            width: undefined,
          },
        ]}>
        <PlayerSilhouette height={dims.silhouette} color={c.textTertiary} />

        {/* THE TIER RIDES IN THE PHOTO'S TOP-LEFT, which is where trading cards
            have always put rarity and — more to the point — where the eye goes
            first in a grid of nine. On the lineup row this letter leads the
            last line, and that is right for a LIST: you read a row left to
            right and the tier is the first word of the sentence about the card.
            A grid is not read that way. Nine bottom-left corners in 8pt grey is
            somewhere a tier goes to hide.

            The chip is the card's own surface, not a tint — it is a scrim, so
            the letter stays legible the day a real portrait lands under it. */}
        <View style={[styles.tierChip, { backgroundColor: c.surface }]}>
          <TierMark tier={model.tier} />
        </View>
      </View>

      {/* ---- identity, in the lineup row's order ------------------------ *
        * Name, then position and club. Two lines here where the row gets one,  *
        * because 94pt of content cannot hold the 115pt run — see the header.   *
        * ================================================================ */}
      <View style={styles.identity}>
        <Text
          numberOfLines={dims.nameLines}
          ellipsizeMode="tail"
          style={[styles.name, { color: c.text, fontSize: dims.nameSize }]}>
          {model.playerName}
        </Text>

        {/* Position in its accent, club subordinate to it and set as such —
            the row's exact treatment. No club mark and no logo: unlicensed. */}
        <View style={styles.metaLine}>
          <Text
            numberOfLines={1}
            style={[styles.meta, { color: accent, fontSize: dims.labelSize + 2 }]}>
            {model.positionAbbreviation?.toUpperCase() ?? '—'}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.meta, styles.club, { color: c.textTertiary, fontSize: dims.labelSize + 2 }]}>
            {`— ${team}`}
          </Text>
          {/* One or two characters, and it may not shrink: a truncated `Q` is
              nothing. Two colours, because Out and Questionable are not the
              same warning and the feed emits four times as many of the second. */}
          {weight && model.injuryStatus ? (
            <Text
              numberOfLines={1}
              style={[
                styles.designation,
                {
                  color: weight === 'blocking' ? c.negative : c.warning,
                  fontSize: dims.labelSize + 1,
                },
              ]}>
              {injuryCode(model.injuryStatus)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* ---- how close this copy is, then what it has earned ------------- *
        * The distance first and the total last, so the biggest thing on the    *
        * card is also the last thing on it — a grid is scanned down, and a     *
        * figure anchored to the bottom edge of every cell gives that scan a    *
        * line to follow. `TFP` sits on the left as a column heading rather      *
        * than under the number: with the start count gone there is nothing      *
        * else on that row, and a lone right-aligned stack left half the cell    *
        * empty.                                                                 *
        *                                                                        *
        * At diamond the phrase says "Top tier" rather than nothing, because a   *
        * blank line there would read as missing data on the best card you own.  *
        * ================================================================ */}
      <Text
        numberOfLines={1}
        /* One step below the identity above it, and the reason is width rather
           than hierarchy — see `tierProgressLabel`, which measures it. */
        style={[styles.progress, { color: c.textTertiary, fontSize: dims.labelSize + 1 }]}>
        {progress ?? 'Top tier'}
      </Text>

      <View style={styles.earned}>
        <Text
          numberOfLines={1}
          style={[styles.rowLabel, { color: c.textTertiary, fontSize: dims.labelSize }]}>
          TFP
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.figure, NUMERIC, { color: c.text, fontSize: dims.figureSize }]}>
          {fmt(model.careerFp)}
        </Text>
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
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  /* The three identity lines sit tighter to each other than the card's own
     `gap` — they are one paragraph about one player, and spacing them like
     separate blocks was what made the old card read as a stack of rows. */
  identity: { gap: 1 },
  name: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  metaLine: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  meta: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  /* The CLUB may shrink; the position and the designation may not. A clipped
     `— S…` is still recognisably a club, where a clipped `Q` is nothing. */
  club: { flexShrink: 1, minWidth: 0 },
  designation: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
    letterSpacing: 0.4,
    flexShrink: 0,
  },
  earned: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  /* The LABEL shrinks, never the value: a truncated "413" is a wrong number,
     where a truncated label is still a recognisable word. */
  rowLabel: {
    fontFamily: Fonts.sans,
    fontWeight: '700',
    letterSpacing: 0.6,
    flexShrink: 1,
    minWidth: 0,
  },
  figure: {
    fontFamily: Fonts.sans,
    fontWeight: '800',
    flexShrink: 0,
  },
  tierChip: {
    position: 'absolute',
    top: 3,
    left: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 4,
  },
  progress: {
    fontFamily: Fonts.sans,
    fontWeight: '500',
    flexShrink: 1,
    minWidth: 0,
  },
  /* `flex-end`, so the figure STANDS ON the region's bottom edge — which is the
     line the information block starts at. Centred, it floated in the square
     with grey under its shoulders, and a placeholder with air beneath it reads
     as a pictogram of a person rather than as a crop waiting for a photograph.
     `PlayerAvatar` does the same thing for the same reason, and it is only
     possible because the frame is square: a circle's bottom edge is a point. */
  photo: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
});
